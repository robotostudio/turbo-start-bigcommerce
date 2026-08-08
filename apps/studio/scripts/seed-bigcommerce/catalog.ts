/**
 * Reads the frozen catalog the seed writes to BigCommerce.
 *
 * `seed/bigcommerce-catalog.json` is committed, so the seed needs nothing but
 * BigCommerce credentials for your own store. It used to read the reference
 * store this starter was ported from, over that platform's Admin API — which
 * meant a BigCommerce seed nobody could run without credentials for a store
 * they will never have.
 *
 * Same trade as `seed/reference-dataset.ndjson`: the definitions are in git,
 * the photography is not. Every image is a URL on the reference store's public
 * CDN, and BigCommerce downloads each one into your store on the way through.
 *
 * See `seed/README.md` for how to regenerate the file.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Catalog } from "./types.js";

/** `apps/studio` — two levels up from `scripts/seed-bigcommerce/`. */
const STUDIO_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DATA_FILE = join(STUDIO_DIR, "seed", "bigcommerce-catalog.json");

/** Grams in one unit of each weight unit BigCommerce stores can be set to. */
const GRAMS_PER_UNIT: Record<string, number> = {
  grams: 1,
  kilograms: 1000,
  ounces: 28.349_523_125,
  pounds: 453.592_37,
};

/**
 * Loads the catalog, converting the frozen gram weights into `storeUnits`.
 *
 * Weights are stored in grams rather than in the reference store's own unit
 * precisely so that a fork whose store is set to kilograms does not end up
 * with products 1000× too heavy.
 */
export function loadCatalog(storeUnits: string): Catalog {
  const catalog = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Catalog;
  const perUnit = GRAMS_PER_UNIT[storeUnits.toLowerCase()] ?? 1;

  for (const product of catalog.products) {
    product.weight = Number((product.weight / perUnit).toFixed(2));
  }

  return catalog;
}

/**
 * Asserts what the writer assumes, before the first BigCommerce call. The file
 * is committed and hand-editable — swapping in your own products is the point
 * — and breaking one of these would otherwise land as a half-written store:
 * some products created, then a throw partway through.
 */
export function validateCatalog({ categories, products }: Catalog): void {
  if (products.length === 0) throw new Error("The catalog has no products");

  const slugs = new Set(categories.map((c) => c.slug));
  const skus = new Set<string>();

  for (const product of products) {
    for (const slug of product.categorySlugs) {
      if (!slugs.has(slug)) {
        throw new Error(`${product.slug}: unknown category ${slug}`);
      }
    }

    for (const variant of product.variants) {
      if (!variant.sku) {
        throw new Error(`${product.slug}: a variant has no SKU to key on`);
      }
      if (skus.has(variant.sku)) {
        throw new Error(`Duplicate variant SKU: ${variant.sku}`);
      }
      skus.add(variant.sku);

      variant.optionLabels.forEach((label, i) => {
        if (!product.options[i]?.values.some((v) => v.label === label)) {
          throw new Error(
            `${variant.sku}: "${label}" is not a value of option ${i}`
          );
        }
      });
    }
  }
}
