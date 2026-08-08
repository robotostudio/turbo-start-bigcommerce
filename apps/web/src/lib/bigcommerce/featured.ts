import "server-only";

import type { ResultOf } from "gql.tada";

import { storefrontQuery } from "./client";
import { graphql } from "./graphql";

/** How many fallback products to show when the editor hasn't picked any. */
const FALLBACK_COUNT = 4;

/**
 * The fields a Featured Products card renders. Deliberately narrow: the block
 * shows an image, a name, a link and a price, and every extra field is charged
 * against the per-request complexity budget `client.ts` logs.
 */
const FeaturedProductCardFields = graphql(`
  fragment FeaturedProductCardFields on Product {
    entityId
    name
    path
    defaultImage {
      url(width: 320)
      altText
    }
    prices {
      price {
        value
        currencyCode
      }
      basePrice {
        value
        currencyCode
      }
    }
  }
`);

export type FeaturedProduct = ResultOf<typeof FeaturedProductCardFields>;

const FeaturedProductsByEntityIdQuery = graphql(
  `
  query FeaturedProductsByEntityId($entityIds: [Int!]!, $first: Int!) {
    site {
      products(entityIds: $entityIds, first: $first) {
        edges {
          node {
            ...FeaturedProductCardFields
          }
        }
      }
    }
  }
`,
  [FeaturedProductCardFields]
);

const NewestFeaturedProductsQuery = graphql(
  `
  query NewestFeaturedProducts($first: Int!) {
    site {
      newestProducts(first: $first) {
        edges {
          node {
            ...FeaturedProductCardFields
          }
        }
      }
    }
  }
`,
  [FeaturedProductCardFields]
);

const NewestProductIdsQuery = graphql(`
  query NewestProductIds($first: Int!) {
    site {
      newestProducts(first: $first) {
        edges {
          node {
            entityId
          }
        }
      }
    }
  }
`);

/** BigCommerce connections type `edges` as a nullable list. */
function edgeNodes(
  edges: readonly { node: FeaturedProduct }[] | null | undefined
): FeaturedProduct[] {
  return (edges ?? []).map((edge) => edge.node);
}

/**
 * `site.products(entityIds:)` is a set lookup — BigCommerce returns the matches
 * in its own order and simply omits ids it doesn't recognise. Index the response
 * and walk the editor's list, so the order is theirs and an unresolved id drops
 * out instead of leaving a gap.
 */
function restoreOrder(
  entityIds: readonly number[],
  products: FeaturedProduct[]
): FeaturedProduct[] {
  const byEntityId = new Map(
    products.map((product) => [product.entityId, product])
  );
  return entityIds
    .map((entityId) => byEntityId.get(entityId))
    .filter((product): product is FeaturedProduct => Boolean(product));
}

/** Products matching the given ids, reordered to match the input order. */
async function getProductsByEntityIds(
  entityIds: readonly number[]
): Promise<FeaturedProduct[]> {
  // A duplicate pick shouldn't cost a second slot in the page window.
  const unique = [...new Set(entityIds)];
  const result = await storefrontQuery(FeaturedProductsByEntityIdQuery, {
    variables: { entityIds: unique, first: unique.length },
  });
  if (!result.ok) return [];
  return restoreOrder(entityIds, edgeNodes(result.data.site.products.edges));
}

/**
 * Newest products, used when the editor hasn't picked any.
 *
 * Not `bestSellingProducts`: BigCommerce derives that from order history and
 * answers `[]` on a store that has never taken an order — which is every
 * fresh install of this starter. Newest still has something to show on day
 * one.
 */
async function getNewestProducts(
  first = FALLBACK_COUNT
): Promise<FeaturedProduct[]> {
  const result = await storefrontQuery(NewestFeaturedProductsQuery, {
    variables: { first },
  });
  if (!result.ok) return [];
  return edgeNodes(result.data.site.newestProducts.edges);
}

/**
 * Ids of the most recently added products — the same fallback, for callers
 * that re-read each product in full (the homepage Featured Products block).
 */
export async function getNewestProductIds(first: number): Promise<number[]> {
  const result = await storefrontQuery(NewestProductIdsQuery, {
    variables: { first },
  });
  if (!result.ok) return [];
  return (result.data.site.newestProducts.edges ?? []).map(
    (edge) => edge.node.entityId
  );
}

/**
 * Resolves the products for a Featured Products block. When `entityIds` are
 * provided (editor selection) they're fetched in order; otherwise it falls
 * back to the newest products.
 */
export async function getFeaturedProducts(
  entityIds?: readonly number[]
): Promise<FeaturedProduct[]> {
  if (entityIds && entityIds.length > 0) {
    return getProductsByEntityIds(entityIds);
  }
  return getNewestProducts();
}
