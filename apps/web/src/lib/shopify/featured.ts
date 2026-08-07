import "server-only";

import { storefrontQuery } from "@/lib/shopify/client";
import {
  FEATURED_PRODUCTS_QUERY,
  PRODUCTS_BY_HANDLES_QUERY,
} from "@/lib/shopify/queries";
import type {
  FeaturedProduct,
  FeaturedProductsResponse,
} from "@/lib/shopify/types";

const FALLBACK_COUNT = 4;

/** Best-selling products, used when the editor hasn't picked any. */
async function getBestSellingProducts(
  first = FALLBACK_COUNT
): Promise<FeaturedProduct[]> {
  const result = await storefrontQuery<FeaturedProductsResponse>(
    FEATURED_PRODUCTS_QUERY,
    { variables: { first } }
  );
  if (!result.ok) return [];
  return result.data.products.edges.map((edge) => edge.node);
}

/** Products matching the given handles, reordered to match the input order. */
async function getProductsByHandles(
  handles: string[]
): Promise<FeaturedProduct[]> {
  const query = handles.map((handle) => `handle:${handle}`).join(" OR ");
  const result = await storefrontQuery<FeaturedProductsResponse>(
    PRODUCTS_BY_HANDLES_QUERY,
    { variables: { query, first: handles.length } }
  );
  if (!result.ok) return [];

  // Shopify's `query:` results aren't order-guaranteed, so restore the
  // editor's chosen order and drop any handles that didn't resolve.
  const byHandle = new Map(
    result.data.products.edges.map((edge) => [edge.node.handle, edge.node])
  );
  return handles
    .map((handle) => byHandle.get(handle))
    .filter((product): product is FeaturedProduct => Boolean(product));
}

/**
 * Resolves the products for a Featured Products block. When `handles` are
 * provided (editor selection) they're fetched in order; otherwise it falls
 * back to Shopify best-selling products.
 */
export async function getFeaturedProducts(
  handles?: string[]
): Promise<FeaturedProduct[]> {
  if (handles && handles.length > 0) {
    return getProductsByHandles(handles);
  }
  return getBestSellingProducts();
}
