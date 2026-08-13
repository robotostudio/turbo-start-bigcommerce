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

/** Seed for a `featuredProducts` block. */
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

/** Seed for a `layersShowcase` block. */
export type LayersShowcaseSeed = {
  readonly _type: "layersShowcase";
  /** The block's `productHandle`, as its `["product", handle]` key spells it. */
  readonly handle: string;
  /** Null means the handle no longer resolves — the same answer the route gives. */
  readonly product: CatalogProduct | null;
};

export type PageBuilderBlockSeed = FeaturedProductsSeed | LayersShowcaseSeed;

/**
 * Seeds keyed by block `_key`. A block whose read failed is simply absent, so
 * the lookup returning undefined is the signal to fall back to fetching on the
 * client rather than an error state of its own.
 */
export type PageBuilderData = Record<string, PageBuilderBlockSeed>;

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
