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
  | {
      ok: true;
      data: T;
      /**
       * The customer access token, when BigCommerce issued one on this
       * response. Only `login` does.
       *
       * It arrives as a `SHOP_TOKEN` Set-Cookie rather than in the body.
       * `LoginResult.customerAccessToken` is documented as server-to-server
       * only, and measured against this store it is refused outright: *"Customer
       * access token was requested in the body, but it's only returned for
       * server-to-server requests. For browser requests it's set as an httpOnly
       * cookie instead."* That is with the private token this starter mandates,
       * so the body field is reachable only with a customer-impersonation
       * token — a second, far more powerful credential that can act as any
       * customer by id. Reading the cookie needs no new secret, so it is the
       * cheaper and narrower of the two.
       */
      customerToken?: string;
    }
  | {
      ok: false;
      error: string;
      kind: StorefrontFailureKind;
      /** HTTP status, when a response arrived at all. */
      status?: number;
      /** The raw `errors` array, when the failure was GraphQL-level. */
      errors?: readonly StorefrontGraphQLError[];
    };

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

/** The cookie BigCommerce puts the customer access token in. */
const SHOP_TOKEN_COOKIE = "SHOP_TOKEN=";

/**
 * The customer access token out of the response's Set-Cookie, if there is one.
 *
 * `login` answers with three cookies — `SHOP_TOKEN`, `SHOP_SESSION_TOKEN` and
 * `SHOP_SESSION_ROTATION_TOKEN`. Only the first is the access token the
 * `X-Bc-Customer-Access-Token` header wants; the other two belong to
 * BigCommerce's own hosted storefront session, which this app does not run.
 */
function readShopToken(response: Response): string | undefined {
  const value = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(SHOP_TOKEN_COOKIE))
    ?.split(";")[0]
    ?.slice(SHOP_TOKEN_COOKIE.length);

  return value ? value : undefined;
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
  options?: { variables?: TVariables; customerToken?: string | null }
): Promise<StorefrontQueryResult<TResult>> {
  let response: Response;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.BIGCOMMERCE_STOREFRONT_TOKEN}`,
    "User-Agent": "turbo-start-bigcommerce",
  };

  if (options?.customerToken) {
    headers["X-Bc-Customer-Access-Token"] = options.customerToken;
    // Without this an expired or revoked token is ignored silently and the
    // request answers as an anonymous one. For a cart that means a null cart
    // and a shopper looking at an empty basket, with nothing in the response
    // saying why. Erroring makes a dead session say so.
    headers["X-Bc-Error-On-Invalid-Customer-Access-Token"] = "true";
  }

  try {
    response = await fetch(storefrontUrl, {
      method: "POST",
      headers,
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

  return { ok: true, data: body.data, customerToken: readShopToken(response) };
}
