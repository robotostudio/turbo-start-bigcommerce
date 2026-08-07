/**
 * BigCommerce seed script — CLI entry point.
 *
 * Usage:
 *   pnpm --filter studio seed:bigcommerce
 *   pnpm --filter studio seed:bigcommerce -- --verbose
 *
 * The catalog is a fixed set, not a batch size: SKUs are the idempotency keys,
 * so "how many" is a property of the data, not a flag.
 */

import {
  CATEGORIES,
  DEEP_CATEGORY_PATH,
  PRODUCTS,
  SKU_PREFIX,
  validateCatalog,
} from "./catalog.js";
import { bc, getStore, log, pool } from "./client.js";
import { upsertCategories, upsertProduct } from "./seed.js";
import type { RunStats } from "./types.js";

/**
 * Products run in parallel; everything within one product stays ordered,
 * because variant creation needs the option ids the option calls return.
 */
const CONCURRENCY = 4;
const PAGE_MAX = 250;

/** Counts seeded rows separately from whatever else lives in the store. */
async function countProducts(): Promise<{ seeded: number; total: number }> {
  let page = 1;
  let seeded = 0;
  let total = 0;

  for (;;) {
    const rows = await bc<Array<{ sku: string }>>(
      "GET",
      `/v3/catalog/products?limit=${PAGE_MAX}&page=${page}&include_fields=sku`
    );

    total += rows.length;
    seeded += rows.filter((r) => r.sku?.startsWith(SKU_PREFIX)).length;

    if (rows.length < PAGE_MAX) return { seeded, total };
    page++;
  }
}

async function main(): Promise<void> {
  const verbose =
    process.argv.includes("--verbose") || process.argv.includes("-v");

  validateCatalog();

  const store = await getStore();
  log.info(
    `Store: ${store.name} — ${store.domain} (${store.hash}) [${store.status}]`
  );

  const stats: RunStats = { created: 0, updated: 0, failed: 0 };

  const categoryIds = await upsertCategories(stats, verbose);

  log.info(`Seeding ${PRODUCTS.length} products…`);
  await pool(PRODUCTS, CONCURRENCY, async (def) => {
    try {
      await upsertProduct(def, categoryIds, stats, verbose);
    } catch (err) {
      stats.failed++;
      log.error(`${def.sku} — ${(err as Error).message}`);
    }
  });

  const { seeded, total } = await countProducts();

  log.info(
    `Done — created:${stats.created} updated:${stats.updated} ` +
      `failed:${stats.failed}`
  );
  log.info(
    `Catalog: ${seeded} seeded products (${total} in store), ` +
      `${CATEGORIES.length} seeded categories, deepest ${DEEP_CATEGORY_PATH}`
  );

  if (stats.failed > 0) process.exit(1);
}

main().catch((err: Error) => {
  log.error(`Fatal: ${err.message}`);
  process.exit(1);
});
