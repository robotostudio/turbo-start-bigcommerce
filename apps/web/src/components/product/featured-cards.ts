import "server-only";

import { getProductDetail, getProductDetailById } from "./fetch-product";
import type { ProductCardProps } from "./product-card";

import { getNewestProductIds } from "@/lib/bigcommerce/featured";
import { productToCardProps } from "@/lib/bigcommerce/product-card";

/** How many products a Featured Products block falls back to. */
const FEATURED_FALLBACK_COUNT = 4;

/**
 * Cards for one Featured Products block.
 *
 * Lives here rather than in the page because two callers need it: the home page
 * resolves it server-side for the first paint, and `/api/featured-products/cards`
 * re-resolves it on the client so a prerendered row cannot outlive the catalog
 * it describes.
 *
 * The full `ProductDetail` read, not the lean card fragment, because these
 * cards carry swatches, sizes, badges and a hover add-to-cart — all of which
 * live on options, variants and metafields. One request per product; the block
 * shows four.
 *
 * ponytail: a handle-keyed batch read would make the picked case one request
 * instead of four. `site.products` takes entityIds only, so that needs Sanity
 * to carry the BigCommerce id — which is exactly what the schema swap adds.
 */
export async function featuredCards(
  handles: string[]
): Promise<ProductCardProps[]> {
  const products = await (handles.length > 0
    ? Promise.all(
        handles.map((handle) =>
          getProductDetail([handle]).then((route) => route.node)
        )
      )
    : getNewestProductIds(FEATURED_FALLBACK_COUNT).then((ids) =>
        Promise.all(ids.map(getProductDetailById))
      ));

  // A handle that no longer resolves drops out here rather than rendering a
  // card that links to a 404 — which is exactly what a hidden product did.
  return products.flatMap((product) =>
    product ? [productToCardProps(product)] : []
  );
}
