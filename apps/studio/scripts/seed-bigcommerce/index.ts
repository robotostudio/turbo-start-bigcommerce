/**
 * BigCommerce seed script — CLI entry point.
 *
 * Writes the catalog frozen in `seed/bigcommerce-catalog.json` into your
 * BigCommerce store: products, variants, prices, images, options and
 * categories, under the slugs the reference storefront links to. The file is
 * read-only here; BigCommerce is rewritten to match it, including deleting
 * anything the file does not have.
 *
 * Usage:
 *   pnpm --filter studio seed:bigcommerce
 *   pnpm --filter studio seed:bigcommerce -- --verbose
 *   pnpm --filter studio seed:bigcommerce -- --batch 8
 *   pnpm --filter studio seed:bigcommerce -- --no-clean
 */

import { parseArgs } from "node:util";

import { loadCatalog, validateCatalog } from "./catalog.js";
import { getStore, log, pool } from "./client.js";
import {
  assignToChannel,
  categoryPath,
  listCategories,
  listProducts,
  productPath,
  pruneCatalog,
  upsertCategories,
  upsertProduct,
} from "./seed.js";
import type { Catalog, RunStats } from "./types.js";

/**
 * Products run in parallel; everything within one product stays ordered,
 * because variant creation needs the option ids the option calls return.
 */
const CONCURRENCY = 4;

/**
 * The three flags, with prune expressed as `--no-clean` rather than `--clean`.
 *
 * Prune is the default because it is what makes a second run converge instead
 * of piling up, and a `--clean` that had to be asked for would make the
 * idempotency contract opt-in. `--no-clean` is for the one case that wants the
 * other behaviour: adding this catalog to a store that already holds products
 * somebody means to keep.
 */
function options(): { verbose: boolean; clean: boolean; batch: number } {
  const { values } = parseArgs({
    options: {
      verbose: { type: "boolean", short: "v", default: false },
      "no-clean": { type: "boolean", default: false },
      batch: { type: "string" },
    },
  });

  const batch = values.batch === undefined ? CONCURRENCY : Number(values.batch);
  if (!Number.isInteger(batch) || batch < 1) {
    throw new Error(`--batch needs a positive whole number, got "${values.batch}"`);
  }

  return { verbose: values.verbose, clean: !values["no-clean"], batch };
}

async function counts(): Promise<{ products: number; categories: number }> {
  const [products, categories] = await Promise.all([
    listProducts(),
    listCategories(),
  ]);
  return { products: products.length, categories: categories.length };
}

/**
 * The slugs are the contract with the storefront, and the one thing that fails
 * silently: BigCommerce answers 200 and quietly appends `-2` when a URL is
 * already taken. Checking them costs two list calls.
 */
async function urlProblems(catalog: Catalog): Promise<string[]> {
  const [products, categories] = await Promise.all([
    listProducts(),
    listCategories(),
  ]);

  const productUrls = new Set(products.map((p) => p.custom_url?.url));
  const categoryUrls = new Set(categories.map((c) => c.url?.path));

  return [
    ...catalog.products
      .filter((p) => !productUrls.has(productPath(p.slug)))
      .map((p) => `product ${productPath(p.slug)} is missing or renamed`),
    ...catalog.categories
      .filter((c) => !categoryUrls.has(categoryPath(c.slug)))
      .map((c) => `category ${categoryPath(c.slug)} is missing or renamed`),
  ];
}

async function main(): Promise<void> {
  const { verbose, clean, batch } = options();

  const store = await getStore();
  log.info(
    `Store: ${store.name} — ${store.domain} (${store.hash}) ` +
      `[${store.status}, ${store.currency}, ${store.weightUnits}]`
  );

  const catalog = loadCatalog(store.weightUnits);
  validateCatalog(catalog);

  const variantCount = catalog.products.reduce(
    (n, p) => n + p.variants.length,
    0
  );
  log.info(
    `Catalog: ${catalog.products.length} products, ${variantCount} variants, ` +
      `${catalog.categories.length} categories`
  );

  const before = await counts();
  log.info(
    `BigCommerce before: ${before.products} products, ${before.categories} categories`
  );

  const stats: RunStats = { created: 0, updated: 0, deleted: 0, failed: 0 };

  if (clean) {
    await pruneCatalog(catalog, stats);
  } else {
    log.info("--no-clean: leaving anything the catalog file does not have.");
  }

  const categoryIds = await upsertCategories(catalog.categories, stats);

  const existing = new Map(
    (await listProducts()).map((p) => [p.custom_url?.url, p.id])
  );

  const seededIds: number[] = [];
  await pool(catalog.products, batch, async (def) => {
    try {
      seededIds.push(
        await upsertProduct(def, categoryIds, existing, stats, verbose)
      );
    } catch (err) {
      stats.failed++;
      log.error(`${def.slug} — ${(err as Error).message}`);
    }
  });

  await assignToChannel(seededIds, store.channelId);

  const after = await counts();
  const problems = await urlProblems(catalog);

  log.info(
    `Done — created:${stats.created} updated:${stats.updated} ` +
      `deleted:${stats.deleted} failed:${stats.failed}`
  );
  log.info(
    `BigCommerce after: ${after.products} products, ${after.categories} categories`
  );

  for (const problem of problems) log.error(`URL check: ${problem}`);

  if (stats.failed > 0 || problems.length > 0) process.exit(1);
}

main().catch((err: Error) => {
  log.error(`Fatal: ${err.message}`);
  process.exit(1);
});
