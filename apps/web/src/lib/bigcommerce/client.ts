import "server-only";

import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import type { TadaDocumentNode } from "gql.tada";
import { print } from "graphql";

/**
 * BigCommerce GraphQL Storefront API client.
 *
 * The design follows BigCommerce Catalyst's `@bigcommerce/catalyst-client`
 * (MIT, Copyright (c) 2023 BigCommerce), reimplemented rather than vendored.
 * That package omits the SPDX `license` field in both its npm tarball and its
 * source, so a vendored copy inherits no machine-readable licence; and the
 * parts this starter needs are one `fetch` plus three headers. Catalyst's
 * error policies, trusted-proxy secret, sitemap helper and channel-resolution
 * hooks are all dropped.
 */

const logger = new Logger("BigCommerceClient");

/** BigCommerce rejects any single request scoring above this. */
const COMPLEXITY_LIMIT = 10_000;

/** Warn once a query is within this fraction of the limit. */
const COMPLEXITY_WARN_RATIO = 0.8;

const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;

/**
 * POST target. Both the channel-suffixed and unsuffixed hosts resolve for
 * channel 1, but the suffixed form is the one BigCommerce documents and the
 * only one that works for additional channels. `BIGCOMMERCE_API_URL` overrides
 * it; the channel id is never hardcoded.
 */
export const storefrontUrl =
  env.BIGCOMMERCE_API_URL ??
  `https://store-${env.BIGCOMMERCE_STORE_HASH}-${env.BIGCOMMERCE_CHANNEL_ID}.mybigcommerce.com/graphql`;

export type StorefrontFailureKind = "network" | "graphql" | "unknown";

export type StorefrontQueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: StorefrontFailureKind };

type GraphQLBody<T> = {
  data?: T | null;
  errors?: { message?: string }[];
};

/** 5xx and rate limiting are worth retrying; every other status is not. */
function isTransient(status: number): boolean {
  return status >= SERVER_ERROR || status === TOO_MANY_REQUESTS;
}

/**
 * BigCommerce scores every request against a per-request budget and returns
 * the score in `x-bc-graphql-complexity`. Logging it on every request makes a
 * query that is creeping toward the limit visible before it starts failing.
 */
function logComplexity(headers: Headers, status: number): void {
  const raw = headers.get("x-bc-graphql-complexity");
  const complexity = raw === null ? Number.NaN : Number(raw);

  if (Number.isNaN(complexity)) {
    logger.info(`status=${status} complexity=unreported`);
    return;
  }

  const line = `status=${status} complexity=${complexity}/${COMPLEXITY_LIMIT}`;

  if (complexity >= COMPLEXITY_LIMIT * COMPLEXITY_WARN_RATIO) {
    logger.warn(`${line} (approaching the per-request limit)`);
    return;
  }

  logger.info(line);
}

/**
 * Typed Storefront API request. Returns the same discriminated union as
 * `lib/shopify/client.ts` under the same export name, so swapping the import
 * path is the whole migration for any call site that already handles it.
 *
 * Pass a `graphql()` document and both types are inferred from the schema.
 * `TVariables` is defaulted rather than required so that the existing
 * `storefrontQuery<Response>(QUERY, { variables })` form, a plain string with
 * one explicit type argument, keeps compiling untouched.
 */
export async function storefrontQuery<
  TResult,
  TVariables = Record<string, unknown>,
>(
  document: TadaDocumentNode<TResult, TVariables> | string,
  options?: { variables?: TVariables }
): Promise<StorefrontQueryResult<TResult>> {
  let response: Response;

  try {
    response = await fetch(storefrontUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.BIGCOMMERCE_STOREFRONT_TOKEN}`,
        "User-Agent": "turbo-start-bigcommerce",
      },
      body: JSON.stringify({
        query: typeof document === "string" ? document : print(document),
        variables: options?.variables,
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    logger.error(`Storefront API request failed: ${message}`);
    return { ok: false, error: message, kind: "network" };
  }

  logComplexity(response.headers, response.status);

  let body: GraphQLBody<TResult>;

  try {
    body = (await response.json()) as GraphQLBody<TResult>;
  } catch {
    const message = `Storefront API returned ${response.status} with a non-JSON body`;
    logger.error(message);
    return {
      ok: false,
      error: message,
      kind: isTransient(response.status) ? "network" : "unknown",
    };
  }

  // BigCommerce answers 200 with a populated `errors` array for GraphQL-level
  // failures, so this is checked before the HTTP status.
  const messages = (body.errors ?? [])
    .map((graphQLError) => graphQLError.message)
    .filter((message): message is string => Boolean(message));

  if (messages.length > 0) {
    const error = messages.join("; ");
    logger.error(`Storefront API error: ${error}`);
    return { ok: false, error, kind: "graphql" };
  }

  if (!response.ok) {
    const error =
      `Storefront API returned ${response.status} ${response.statusText}`.trim();
    logger.error(error);
    return {
      ok: false,
      error,
      kind: isTransient(response.status) ? "network" : "graphql",
    };
  }

  if (!body.data) {
    return {
      ok: false,
      error: "No data returned from Storefront API",
      kind: "unknown",
    };
  }

  return { ok: true, data: body.data };
}
