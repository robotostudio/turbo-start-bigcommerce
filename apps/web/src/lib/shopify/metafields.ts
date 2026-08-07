import type { ShopifyMetafield } from "./types";

/**
 * Keys of the product metafields requested (in order) by PRODUCT_QUERY.
 * Keep this array in sync with the `identifiers` list in `queries.ts`.
 */
export const PRODUCT_METAFIELD_KEYS = [
  "details",
  "fit_sizing",
  "materials",
  "shipping",
] as const;

export type ProductMetafieldKey = (typeof PRODUCT_METAFIELD_KEYS)[number];

/**
 * Turns the positional `(ShopifyMetafield | null)[]` returned by the Storefront
 * API into a key → value map, keyed by metafield `key`. Missing/empty
 * metafields are omitted so callers can render only the sections that exist.
 */
export function keyMetafields(
  metafields: (ShopifyMetafield | null)[] | undefined
): Partial<Record<ProductMetafieldKey, string>> {
  const result: Partial<Record<ProductMetafieldKey, string>> = {};
  if (!metafields) return result;

  for (const metafield of metafields) {
    if (!metafield?.value) continue;
    const value = metafield.value.trim();
    if (!value) continue;
    result[metafield.key as ProductMetafieldKey] = value;
  }

  return result;
}
