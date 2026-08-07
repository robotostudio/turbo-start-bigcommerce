/** Shared types for the BigCommerce seed script. */

/** One Shopify collection, mirrored as a BigCommerce category. */
export interface CategoryDef {
  /** Shopify handle. Becomes `/collections/{slug}/` and is the idempotency key. */
  slug: string;
  name: string;
  description: string;
  imageUrl?: string;
  sortOrder: number;
}

export interface OptionValueDef {
  label: string;
  /** Hex colour. Required for `swatch`, ignored otherwise. */
  hex?: string;
}

export interface OptionDef {
  name: string;
  type: "swatch" | "rectangles";
  values: OptionValueDef[];
}

export interface VariantDef {
  sku: string;
  /** One label per entry in the product's `options`, in the same order. */
  optionLabels: string[];
  price: number;
  /**
   * BigCommerce ignores a product-level `sale_price` once a variant carries
   * its own `price`, so a discounted variant must repeat the sale price here
   * or the storefront reports `salePrice: null`.
   */
  salePrice?: number;
  inventory: number;
  /** Overrides the product's default image for this variant. */
  imageUrl?: string;
}

export interface ImageDef {
  url: string;
  alt: string;
  /**
   * Source filename without extension. BigCommerce keeps it inside the stored
   * `image_file`, which makes it the only stable key: Shopify repeats the same
   * alt text across every shot of one colourway.
   */
  key: string;
}

export interface MetafieldDef {
  namespace: string;
  key: string;
  value: string;
}

export interface ProductDef {
  /** Shopify handle. Becomes `/products/{slug}/` and is the idempotency key. */
  slug: string;
  name: string;
  description: string;
  /** Shopify's compare-at price when there is one, otherwise its price. */
  price: number;
  /** Set only when Shopify has a compare-at price, i.e. the product is reduced. */
  salePrice?: number;
  /** In the store's own weight unit, converted from Shopify's. */
  weight: number;
  /** Handles of the Shopify collections this product belongs to. */
  categorySlugs: string[];
  images: ImageDef[];
  options: OptionDef[];
  variants: VariantDef[];
  metafields: MetafieldDef[];
}

export interface Catalog {
  categories: CategoryDef[];
  products: ProductDef[];
}

export interface RunStats {
  created: number;
  updated: number;
  deleted: number;
  failed: number;
}

/** Resolved BigCommerce ids for one product's options and their values. */
export type OptionIndex = Map<
  string,
  { optionId: number; valueIds: Map<string, number> }
>;
