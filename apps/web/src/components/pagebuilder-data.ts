import type { CatalogProduct } from "@/lib/bigcommerce/catalog";
import type { ProductCardProps } from "./product/product-card";

/**
 * Server-resolved catalog data for the page-builder blocks that would otherwise
 * ship a grid of skeletons and fetch their products from the browser.
 *
 * The types live here, apart from the resolver, because both ends need them:
 * the resolver is behind `import "server-only"`, and the blocks that consume
 * the result are `"use client"`. A client component importing the resolver —
 * even for a type — is one careless `import` away from pulling a BigCommerce
 * token into the browser bundle, so the boundary is a separate module rather
 * than a convention.
 *
 * Every seed carries the identity of the request it answers (`queryKey`,
 * `handle`). React Query still owns the data once the page hydrates, and seeded
 * data attached to a key the server did not actually render paints the wrong
 * products for a beat before the refetch corrects it — the same trap
 * `collection-products.tsx` documents. Consumers must compare before they seed.
 */

export type FeaturedProductsSeed = {
  readonly _type: "featuredProducts";
  /**
   * The block's handles joined with commas, exactly as the block builds the
   * second element of its `["featured-products-cards", …]` query key — stega
   * markers and all, since those ride along in the block's own props too.
   * Empty string means the block picked nothing and the server resolved the
   * newest products instead, which is what the client path does as well.
   */
  readonly queryKey: string;
  /** Empty means every handle resolved to nothing; the block renders null. */
  readonly cards: ProductCardProps[];
};

export type LayersShowcaseSeed = {
  readonly _type: "layersShowcase";
  /** The block's `productHandle`, as its `["product", handle]` key spells it. */
  readonly handle: string;
  /** Null means the handle no longer resolves — the same answer the route gives. */
  readonly product: CatalogProduct | null;
};

export type PageBuilderBlockSeed = FeaturedProductsSeed | LayersShowcaseSeed;

/**
 * Pending seed reads keyed by block `_key` — promises, not resolved seeds. The
 * pages start the reads and each product-backed block awaits its own entry
 * behind a Suspense boundary in `pagebuilder.tsx`, so a slow read suspends one
 * block rather than the page. A block absent from the map needs no catalog
 * read; an entry that resolves `null` is a read that failed, and the block
 * falls back to fetching on the client. The promises never reject —
 * `fetchOrFallback` resolves every failure to `null` instead.
 */
export type PageBuilderData = Record<
  string,
  Promise<PageBuilderBlockSeed | null>
>;

/**
 * The shape the resolver needs off a page-builder block, structural rather than
 * the generated union, so home-page and slug-page blocks both pass without the
 * two result types having to agree on anything else.
 */
export type ResolvablePageBuilderBlock = {
  readonly _key: string;
  readonly _type: string;
  readonly productHandles?: (string | null)[] | null;
  readonly productHandle?: string | null;
};
