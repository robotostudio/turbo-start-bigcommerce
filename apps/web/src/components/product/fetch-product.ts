import "server-only";

import {
  type CatalogProduct,
  type CatalogRoute,
  getProductById,
  getProductByPath,
} from "@/lib/bigcommerce/catalog";

/**
 * A PDP payload that actually carries its options.
 *
 * `site.route(path:).node { ...ProductDetail }` silently drops `productOptions`
 * and `defaultImage` — same selection set, same complexity score, no `errors`
 * key. It is the *named fragment spread directly on the interface field* that
 * does it; `... on Product { ...ProductDetail }` returns both, and so does
 * `site.product(entityId:) { ...ProductDetail }`. Verified live against the
 * seeded store on every product, and it is what the captured fixtures were
 * already disagreeing about.
 *
 * So the path lookup is used for what it is uniquely good at — resolving a
 * merchant-shaped URL and its auto-created 301 — and the payload is re-read by
 * id. Two requests until `ProductByPathQuery` wraps its spread in
 * `... on Product { … }`, at which point this collapses back to one.
 */
export async function getProductDetail(
  segments: string[]
): Promise<CatalogRoute<CatalogProduct>> {
  const route = await getProductByPath(segments);
  if (!route.ok) return { node: null, redirectTo: null };
  if (!route.data.node) return route.data;

  const detail = await getProductById(route.data.node.entityId);

  // A degraded PDP beats a missing one: if the second read fails, render the
  // route's own node rather than 404ing a product that demonstrably exists.
  return {
    node: detail.ok && detail.data ? detail.data : route.data.node,
    redirectTo: route.data.redirectTo,
  };
}

/** Same payload, when the id is already known. */
export async function getProductDetailById(
  entityId: number
): Promise<CatalogProduct | null> {
  const result = await getProductById(entityId);
  return result.ok ? result.data : null;
}
