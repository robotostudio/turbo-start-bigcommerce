import "server-only";

import { createStorefrontApiClient } from "@shopify/storefront-api-client";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";

const logger = new Logger("ShopifyClient");

export const storefront = createStorefrontApiClient({
  storeDomain: `https://${env.SHOPIFY_STORE_DOMAIN}`,
  apiVersion: env.SHOPIFY_API_VERSION,
  publicAccessToken: env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
});

export type StorefrontFailureKind = "network" | "graphql" | "unknown";

export type StorefrontQueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: StorefrontFailureKind };

type ResponseErrors = {
  networkStatusCode?: number;
  message?: string;
  graphQLErrors?: unknown[];
};

function classifyResponseErrors(errors: ResponseErrors): {
  message: string;
  kind: StorefrontFailureKind;
} {
  const gqlMessages = (errors.graphQLErrors ?? [])
    .map((gqlError) => (gqlError as { message?: string }).message)
    .filter((message): message is string => Boolean(message));
  const message =
    gqlMessages.join("; ") || errors.message || "Unknown Storefront API error";
  if (gqlMessages.length > 0) {
    return { message, kind: "graphql" };
  }
  const status = errors.networkStatusCode;
  const isNetwork = status !== undefined && (status >= 500 || status === 429);
  return { message, kind: isNetwork ? "network" : "graphql" };
}

/** Typed Storefront API request. Returns discriminated union. */
export async function storefrontQuery<T>(
  query: string,
  options?: { variables?: Record<string, unknown> }
): Promise<StorefrontQueryResult<T>> {
  try {
    const { data, errors } = await storefront.request<T>(query, {
      variables: options?.variables,
    });

    if (errors) {
      const { message, kind } = classifyResponseErrors(errors);
      logger.error(`Storefront API error: ${message}`);
      return { ok: false, error: message, kind };
    }

    if (!data) {
      return {
        ok: false,
        error: "No data returned from Storefront API",
        kind: "unknown",
      };
    }

    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    // @shopify/storefront-api-client attaches graphQLErrors to thrown errors
    const gqlErrors = (error as { graphQLErrors?: unknown[] }).graphQLErrors;
    if (gqlErrors) {
      logger.error(
        `Storefront API GraphQL errors: ${JSON.stringify(gqlErrors)}`
      );
    }
    logger.error(`Storefront API request failed: ${message}`);
    return {
      ok: false,
      error: message,
      kind: gqlErrors ? "graphql" : "network",
    };
  }
}
