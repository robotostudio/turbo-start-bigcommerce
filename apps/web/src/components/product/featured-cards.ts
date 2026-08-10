import "server-only";

import { Logger } from "@workspace/logger";

import { getProductDetail, getProductDetailById } from "./fetch-product";
import type { ProductCardProps } from "./product-card";

import { getNewestProductIds } from "@/lib/bigcommerce/featured";
import { productToCardProps } from "@/lib/bigcommerce/product-card";

/** How many products a Featured Products block falls back to. */
const FEATURED_FALLBACK_COUNT = 4;

const logger = new Logger("FeaturedCards");

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
  const picked = handles.length > 0;

  const products = await (picked
    ? Promise.all(
        handles.map((handle) =>
          getProductDetail([handle]).then((route) => route.node)
        )
      )
    : getNewestProductIds(FEATURED_FALLBACK_COUNT).then((ids) =>
        Promise.all(ids.map(getProductDetailById))
      ));

  if (picked) warnOnUnresolved(handles, products);

  // A handle that no longer resolves drops out here rather than rendering a
  // card that links to a 404 — which is exactly what a hidden product did.
  return products.flatMap((product) =>
    product ? [productToCardProps(product)] : []
  );
}

/**
 * The one signal a dropped handle gets.
 *
 * The drop itself is deliberate, but nothing used to say it happened: a block
 * configured with four products rendering three looks exactly like a block
 * configured with three, and a block where every handle is wrong renders an
 * empty row that is indistinguishable from a block that was never filled in.
 * That second case is the expensive one — an empty row reads the same before
 * and after whatever change you are testing, so the silence defeats the check
 * you would use to catch it.
 *
 * Server-side only, so this lands in the server log rather than the browser.
 * Editors do not see it; a Studio-side rule would mean the Studio resolving
 * handles against BigCommerce, which it deliberately never does.
 *
 * Index alignment comes from `Promise.all` preserving input order — a future
 * batch read that returns matches only would break the pairing silently.
 */
function warnOnUnresolved(
  handles: string[],
  products: readonly unknown[]
): void {
  const unresolved = handles.filter((_handle, index) => !products[index]);
  if (unresolved.length === 0) return;

  logger.warning(
    `${unresolved.length} of ${handles.length} picked handles resolved to nothing and were dropped from the row: ${unresolved.join(", ")}. The product may be hidden or deleted in BigCommerce, the read may have failed, or the handle may carry a route prefix — the resolver wants a bare slug ("wren-washed-cap", not "products/wren-washed-cap").`
  );
}
