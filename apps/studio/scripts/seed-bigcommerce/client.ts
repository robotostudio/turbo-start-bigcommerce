/**
 * BigCommerce REST Management API client.
 *
 * Credentials are the store-level Admin API token in `apps/studio/.env` —
 * deliberately *not* the storefront token the web app uses. The seed writes
 * catalog; the storefront token cannot, and must never be handed write scope
 * just to make a seed work.
 */

import "dotenv/config";
import { Logger } from "@workspace/logger";

export const log = new Logger("seed-bigcommerce");

const API_ROOT = "https://api.bigcommerce.com/stores";
const MAX_RETRIES = 4;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;
const DEFAULT_BACKOFF_MS = 2000;

/** An API call that came back non-2xx. `status` lets callers branch on 404. */
export class BigCommerceError extends Error {
  readonly status: number;

  constructor(status: number, method: string, path: string, body: string) {
    super(`${method} ${path} — HTTP ${status}: ${body.slice(0, 400)}`);
    this.name = "BigCommerceError";
    this.status = status;
  }
}

let cached: { hash: string; token: string } | null = null;

/** Reads credentials from the environment. Exits loudly if either is absent. */
function credentials(): { hash: string; token: string } {
  if (cached) return cached;

  const hash = process.env.BIGCOMMERCE_STORE_HASH;
  const token = process.env.BIGCOMMERCE_ADMIN_TOKEN;

  if (!hash || !token) {
    log.error(
      "BIGCOMMERCE_STORE_HASH and BIGCOMMERCE_ADMIN_TOKEN must both be set " +
        "in apps/studio/.env. These are Admin API credentials — separate " +
        "from BIGCOMMERCE_STOREFRONT_TOKEN in apps/web/.env.local, which " +
        "cannot write catalog. Refusing to run against an unknown store."
    );
    process.exit(1);
  }

  cached = { hash, token };
  return cached;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Milliseconds to wait before retrying, or null when the response is final.
 * BigCommerce reports its own rate-limit window; exponential backoff is only
 * the fallback for 5xx, which carries no such header.
 */
function retryDelay(res: Response, attempt: number): number | null {
  const retryable =
    res.status === TOO_MANY_REQUESTS || res.status >= SERVER_ERROR;
  if (!retryable || attempt >= MAX_RETRIES) return null;

  const reset = Number(res.headers.get("X-Rate-Limit-Time-Reset-Ms"));
  return Number.isFinite(reset) && reset > 0
    ? reset
    : DEFAULT_BACKOFF_MS * 2 ** attempt;
}

/**
 * Calls the Management API and unwraps the v3 `{ data }` envelope.
 * `path` is store-relative, e.g. `/v3/catalog/products`.
 */
export async function bc<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const { hash, token } = credentials();
  const url = `${API_ROOT}/${hash}${path}`;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        "X-Auth-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const wait = retryDelay(res, attempt);
    if (wait !== null) {
      log.warn(`HTTP ${res.status} on ${path} — retrying in ${wait}ms`);
      await sleep(wait);
      continue;
    }

    if (!res.ok) {
      throw new BigCommerceError(res.status, method, path, await res.text());
    }

    if (res.status === 204) return undefined as T;

    const json = (await res.json()) as { data?: T };
    return (json.data ?? json) as T;
  }
}

/** Runs `fn` over `items`, at most `limit` at a time. */
export async function pool<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i] as T, i);
      }
    }
  );
  await Promise.all(workers);
}

/** Fetches the store record — the guard that proves which store we hit. */
export async function getStore(): Promise<{
  name: string;
  domain: string;
  status: string;
  hash: string;
}> {
  const store = await bc<{
    name: string;
    domain: string;
    status: string;
  }>("GET", "/v2/store");

  return { ...store, hash: credentials().hash };
}
