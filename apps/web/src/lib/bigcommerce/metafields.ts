import "server-only";

import { Logger } from "@workspace/logger";

import { storefrontQuery } from "./client";
import { graphql } from "./graphql";

const logger = new Logger("BigCommerceMetafields");

/** The namespace the seed writes product metafields into. */
export const PRODUCT_METAFIELD_NAMESPACE = "turbo_start";

/** One page covers the namespace; it is ours and the seed writes a handful. */
const METAFIELD_PAGE_SIZE = 50;

const ProductMetafieldsByNamespaceQuery = graphql(`
  query ProductMetafieldsByNamespace(
    $entityId: Int!
    $namespace: String!
    $first: Int!
  ) {
    site {
      product(entityId: $entityId) {
        metafields(namespace: $namespace, first: $first) {
          edges {
            node {
              key
              value
            }
          }
        }
      }
    }
  }
`);

/** A metafield connection's edges, as BigCommerce types them. */
export type MetafieldEdges =
  | readonly { node: { key: string; value: string } }[]
  | null
  | undefined;

/**
 * Turns a metafield connection into a `key → value` map.
 *
 * The connection is already namespace-scoped by the query argument, so nothing
 * here depends on which position a metafield came back in — a key that moves,
 * appears or disappears changes only that key's entry. Blank values are dropped
 * so callers can render just the sections that exist.
 */
export function keyMetafields(edges: MetafieldEdges): Record<string, string> {
  const result: Record<string, string> = {};
  for (const edge of edges ?? []) {
    const value = edge.node.value.trim();
    if (value) result[edge.node.key] = value;
  }
  return result;
}

/**
 * Reads one product's metafields in a namespace.
 *
 * An empty result is ambiguous and cannot be disambiguated at the API: a
 * namespace that holds nothing and a namespace whose metafields were written
 * with a `permission_set` other than `read_and_sf_access` return byte-identical
 * payloads — an empty connection, HTTP 200, no `errors`. Callers get `{}` for
 * both, because a storefront cannot act on the difference; the warning exists so
 * a misconfigured seed is visible in the logs rather than silent.
 */
export async function getProductMetafields(
  entityId: number,
  namespace: string = PRODUCT_METAFIELD_NAMESPACE
): Promise<Record<string, string>> {
  const result = await storefrontQuery(ProductMetafieldsByNamespaceQuery, {
    variables: { entityId, namespace, first: METAFIELD_PAGE_SIZE },
  });
  if (!result.ok) return {};

  const metafields = keyMetafields(result.data.site.product?.metafields.edges);

  if (Object.keys(metafields).length === 0) {
    logger.warn(
      `No storefront-visible metafields in namespace "${namespace}" for product ${entityId} — ` +
        "either the namespace is empty, or its metafields were written with a " +
        'permission_set other than "read_and_sf_access". BigCommerce returns the ' +
        "same empty connection for both."
    );
  }

  return metafields;
}
