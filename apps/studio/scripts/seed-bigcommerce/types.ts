/** Shared types for the BigCommerce seed script. */

/** One category in the frozen catalog. */
export interface CategoryDef {
  /** Becomes `/collections/{slug}/` and is the idempotency key. */
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
   * `image_file`, which makes it the only stable key: the alt text repeats
   * across every shot of one colourway.
   */
  key: string;
}

export interface MetafieldDef {
  namespace: string;
  key: string;
  value: string;
}

export interface ProductDef {
  /** Becomes `/products/{slug}/` and is the idempotency key. */
  slug: string;
  name: string;
  description: string;
  /** The was-price where the product is reduced, otherwise the live price. */
  price: number;
  /** Set only where the product is reduced. Absent means full price. */
  salePrice?: number;
  /** In the store's own weight unit. The file holds grams; `loadCatalog` converts. */
  weight: number;
  /** Slugs of the categories this product belongs to. */
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
