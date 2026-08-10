import "server-only";

import { Logger } from "@workspace/logger";
import { cache } from "react";

import {
  type CatalogProduct,
  type CatalogRoute,
  getProductById,
  getProductByPath,
} from "@/lib/bigcommerce/catalog";
import { isStorefrontUnavailable } from "@/lib/bigcommerce/client";

const logger = new Logger("ProductDetail");

/**
 * A resolved PDP payload, plus the one thing `CatalogRoute` cannot express: the
 * difference between "BigCommerce says this product does not exist" and
 * "BigCommerce would not serve it".
 *
 * Both arrive as `node: null`, and they call for opposite renders — a 404 for
 * the first, a visible failure for the second. Callers that only decorate a
 * page (a featured block) can keep ignoring the flag and drop the card; the PDP
 * itself branches on it.
 */
export type ProductDetailRoute = CatalogRoute<CatalogProduct> & {
  /** True when the storefront refused the read, rather than resolving to nothing. */
  unavailable: boolean;
};

/** One warning per product per process; an outage fails every read at once. */
const warnedPaths = new Set<string>();

function warnOnce(handle: string, cause: string) {
  if (warnedPaths.has(handle)) {
    return;
  }
  warnedPaths.add(handle);
  logger.warn(
    `Storefront unavailable, rendering the unavailable state for /products/${handle}. Cause: ${cause}`
  );
}

/**
 * One catalog read per product per request.
 *
 * `generateMetadata` and the page body both need the same product, and Next
 * runs them as separate calls — without `cache` that is two identical requests
 * against the same complexity budget. Keyed on the joined handle rather than
 * the segment array, because `cache` compares arguments by identity and each
 * call site awaits its own `params`.
 */
const readProductRoute = cache((handle: string) =>
  getProductByPath(handle.split("/"))
);

/**
 * A PDP payload by storefront path.
 *
 * `site.route(path:)` used to be read for the route and the product re-read by
 * id, because a *bare* named-fragment spread on the route's interface field
 * silently drops `productOptions` and `defaultImage` — same selection set, same
 * complexity score, no `errors` key. `ProductByPathQuery` now wraps its spread
 * in `... on Product { … }`, which returns the whole fragment, so the second
 * read is gone: the two payloads were verified byte-identical across all 12
 * seeded products, and dropping it takes 3443 complexity and one round trip off
 * every PDP render.
 *
 * A refused read degrades to `unavailable` and warns; anything else keeps
 * throwing, because a malformed query is a bug in this repo and rendering a
 * polite "temporarily unavailable" over it would hide it forever. Same split as
 * `sanityFetch` in `packages/sanity/src/live.ts`.
 */
export async function getProductDetail(
  segments: string[]
): Promise<ProductDetailRoute> {
  const handle = segments.join("/");
  const route = await readProductRoute(handle);

  if (!route.ok) {
    if (!isStorefrontUnavailable(route)) {
      throw new Error(
        `Storefront read failed for /products/${handle}: ${route.error}`
      );
    }
    warnOnce(handle, route.error);
    return { node: null, redirectTo: null, unavailable: true };
  }

  return { ...route.data, unavailable: false };
}

/** Same payload, when the id is already known. */
export async function getProductDetailById(
  entityId: number
): Promise<CatalogProduct | null> {
  const result = await getProductById(entityId);
  return result.ok ? result.data : null;
}
