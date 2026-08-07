import "server-only";

import type { ResultOf } from "gql.tada";

import { storefrontQuery } from "./client";
import { graphql } from "./graphql";

/** How many best sellers to show when the editor hasn't picked any. */
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

const BestSellingFeaturedProductsQuery = graphql(
  `
  query BestSellingFeaturedProducts($first: Int!) {
    site {
      bestSellingProducts(first: $first) {
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

/** Best-selling products, used when the editor hasn't picked any. */
async function getBestSellingProducts(
  first = FALLBACK_COUNT
): Promise<FeaturedProduct[]> {
  const result = await storefrontQuery(BestSellingFeaturedProductsQuery, {
    variables: { first },
  });
  if (!result.ok) return [];
  return edgeNodes(result.data.site.bestSellingProducts.edges);
}

/**
 * Resolves the products for a Featured Products block. When `entityIds` are
 * provided (editor selection) they're fetched in order; otherwise it falls back
 * to BigCommerce best sellers.
 */
export async function getFeaturedProducts(
  entityIds?: readonly number[]
): Promise<FeaturedProduct[]> {
  if (entityIds && entityIds.length > 0) {
    return getProductsByEntityIds(entityIds);
  }
  return getBestSellingProducts();
}
