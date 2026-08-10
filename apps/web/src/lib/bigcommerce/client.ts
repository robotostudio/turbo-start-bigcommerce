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

/**
 * A GraphQL error as BigCommerce reports it. `path` is the signal that
 * separates a cart failure from a non-cart one, so it is surfaced raw rather
 * than folded into the joined message.
 */
export type StorefrontGraphQLError = {
  message: string;
  /** Mutation root first, e.g. `["cart", "createCart"]`. Absent on a 400. */
  path?: readonly (string | number)[];
  locations?: readonly { line: number; column: number }[];
};

export type StorefrontQueryResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      kind: StorefrontFailureKind;
      /** HTTP status, when a response arrived at all. */
      status?: number;
      /** The raw `errors` array, when the failure was GraphQL-level. */
      errors?: readonly StorefrontGraphQLError[];
    };

/**
 * True when BigCommerce refused to serve the request, rather than answering
 * that there is nothing there — the storefront being unreachable, rate
 * limited, down, or rejecting the request for costing more than the
 * per-request complexity budget.
 *
 * Deliberately narrow, the same way `isUnreachable` in
 * `packages/sanity/src/live.ts` is: a caller that degrades to a visible
 * "unavailable" state on *any* failure would hide a malformed query, which is
 * a bug in this repo and arrives as the same HTTP 400 an over-complex one
 * does. The complexity rejection is matched on its message because that is
 * all BigCommerce sends — no `extensions`, no `path`, no complexity header:
 *
 *   400 {"errors":[{"message":"The query is too complex as it has a
 *   complexity score of 34314 out of 10000. Please remove some elements and
 *   try again"}]}
 */
export function isStorefrontUnavailable(failure: {
  kind: StorefrontFailureKind;
  status?: number;
  errors?: readonly StorefrontGraphQLError[];
}): boolean {
  if (failure.kind === "network") {
    return true;
  }

  if (failure.status !== undefined && isTransient(failure.status)) {
    return true;
  }

  return (failure.errors ?? []).some((error) =>
    /complexity score of/i.test(error.message)
  );
}

type GraphQLBody<T> = {
  data?: T | null;
  errors?: {
    message?: string;
    path?: readonly (string | number)[];
    locations?: readonly { line: number; column: number }[];
  }[];
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
 * Typed Storefront API request. Returns the discriminated union every call
 * site already handles, under the export name they already import — the
 * commerce flip swapped only the import path.
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
      status: response.status,
    };
  }

  // BigCommerce answers 200 with a populated `errors` array for GraphQL-level
  // failures, so this is checked before the HTTP status.
  const errors: StorefrontGraphQLError[] = (body.errors ?? []).flatMap(
    (graphQLError) =>
      graphQLError.message
        ? [{ ...graphQLError, message: graphQLError.message }]
        : []
  );

  if (errors.length > 0) {
    const error = errors.map((graphQLError) => graphQLError.message).join("; ");
    logger.error(`Storefront API error: ${error}`);
    return {
      ok: false,
      error,
      kind: "graphql",
      status: response.status,
      errors,
    };
  }

  if (!response.ok) {
    const error =
      `Storefront API returned ${response.status} ${response.statusText}`.trim();
    logger.error(error);
    return {
      ok: false,
      error,
      kind: isTransient(response.status) ? "network" : "graphql",
      status: response.status,
    };
  }

  if (!body.data) {
    return {
      ok: false,
      error: "No data returned from Storefront API",
      kind: "unknown",
      status: response.status,
    };
  }

  return { ok: true, data: body.data };
}
