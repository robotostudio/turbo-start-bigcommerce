/** Shared types for the BigCommerce seed script. */

/** A category in the seeded tree. Keyed on `path` — never on name. */
export interface CategoryDef {
  /** Full storefront path with leading and trailing slashes. */
  path: string;
  name: string;
  description: string;
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
  price?: number;
  /**
   * BigCommerce ignores a product-level `sale_price` once a variant carries
   * its own `price`, so a discounted variant must repeat the sale price here
   * or the storefront reports `salePrice: null`.
   */
  salePrice?: number;
  /** Overrides the product's default image for this variant. */
  imageUrl?: string;
}

export interface ImageDef {
  url: string;
  /**
   * Doubles as the idempotency key — BigCommerce stores it verbatim as the
   * image `description`, so it must be stable across runs.
   */
  alt: string;
}

export interface MetafieldDef {
  namespace: string;
  key: string;
  value: string;
}

export interface ProductDef {
  /** Idempotency key. Must be stable across runs. */
  sku: string;
  name: string;
  description: string;
  price: number;
  salePrice?: number;
  /** BigCommerce's MSRP, the other compare-at signal on the storefront. */
  retailPrice?: number;
  weight: number;
  /** Path of the category this product belongs to. */
  categoryPath: string;
  images: ImageDef[];
  options: OptionDef[];
  variants: VariantDef[];
  metafields: MetafieldDef[];
}

export interface RunStats {
  created: number;
  updated: number;
  failed: number;
}

/** Resolved BigCommerce ids for one product's options and their values. */
export type OptionIndex = Map<
  string,
  { optionId: number; valueIds: Map<string, number> }
>;
