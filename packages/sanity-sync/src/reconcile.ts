import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { Mutation, SanityClient } from "@sanity/client";
import { initLogging, Logger } from "@workspace/logger";

import {
  type BigCommerceCredentials,
  catalogGet,
  createWriteClient,
  PRODUCT_INCLUDE,
  readBigCommerceCredentials,
} from "./client";
import {
  deleteCategory,
  deleteProduct,
  type SyncResult,
  syncCategory,
  syncProduct,
} from "./sync";
import {
  productDocuments,
  type RestCategory,
  type RestProduct,
  staleMutations,
  type SyncedDocument,
  toCategoryDocument,
  upsertMutations,
} from "./upsert";

/**
 * The reconcile sweep, and the CLI over both it and the single-entity core in
 * `src/sync.ts`.
 *
 * This is the backfill, not the sync. `apps/web/src/app/api/bigcommerce/webhook/route.ts`
 * keeps Sanity current; run this once to seed a dataset, or by hand to repair
 * one after an outage. ROB-2608 ruled out putting it on a cron.
 *
 * An earlier version of this comment argued the opposite — that a webhook-only
 * sync was structurally incomplete because variants had no CRUD webhooks. That
 * was wrong. `store/sku/created|updated|deleted` all fire, and a variant edit
 * fires one of them and no product event at all, measured in
 * `docs/research/09-webhook-payloads.md`.
 *
 * What webhooks genuinely cannot see is images. A change through
 * `/v3/catalog/products/{id}/images` fires nothing on any scope, and neither
 * does the control panel, which writes the same sub-resource. The storefront
 * reads images live from BigCommerce for that reason. Brands are also
 * webhook-less, which costs nothing while only `brandId` reaches Sanity.
 *
 * Nothing invokes this. Run it by hand, and note there is no `--` before the
 * flags — pnpm forwards it and the CLI rejects it as a positional:
 *   pnpm --filter @workspace/sanity-sync reconcile                 # dry run
 *   pnpm --filter @workspace/sanity-sync reconcile --write         # for real
 *   pnpm --filter @workspace/sanity-sync reconcile --product 183   # one entity
 */

const logger = new Logger("Reconcile");

/**
 * Admin REST caps a catalog page at 50 — but silently drops it to 10 the moment
 * `options` or `modifiers` are included. Verified on store 8jbhprizry:
 * `?limit=50&include=variants,options,images` comes back `per_page: 10`.
 *
 * The sweep both requests the correct size up front and drives its loop off the
 * `total_pages` the server reports, so a silent re-cap can never truncate the
 * result — it only costs extra round trips.
 */
const PAGE_SIZE = 50;
const PAGE_SIZE_WITH_OPTIONS = 10;

function pageSizeFor(include: string | undefined): number {
  const parts = include?.split(",") ?? [];
  return parts.includes("options") || parts.includes("modifiers")
    ? PAGE_SIZE_WITH_OPTIONS
    : PAGE_SIZE;
}

type Pagination = { current_page: number; total_pages: number; total: number };

/**
 * Pages a v3 catalog resource. `date_modified:min` is a real filter — verified
 * against the sandbox, where a future timestamp returns `total: 0` — and its
 * colon survives `URLSearchParams` percent-encoding.
 */
async function* paginate<T>(
  resource: string,
  credentials: BigCommerceCredentials,
  options: { since?: string; include?: string } = {}
): AsyncGenerator<T[]> {
  const limit = pageSizeFor(options.include);
  let page = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
    });
    if (options.include) {
      params.set("include", options.include);
    }
    if (options.since) {
      params.set("date_modified:min", options.since);
    }

    const body = await catalogGet<{
      data: T[];
      meta: { pagination: Pagination };
    }>(`${resource}?${params}`, credentials);

    // 404 is a real answer for a single entity, never for a list resource.
    if (!body) {
      throw new Error(`GET /v3/catalog/${resource} answered 404`);
    }

    // Trust the server's pagination, not the requested limit — that is what
    // makes the silent page-size drop a non-event.
    totalPages = body.meta.pagination.total_pages;
    if (page === 1) {
      logger.info(
        `${resource}: ${body.meta.pagination.total} total, ${body.meta.pagination.total_pages} page(s) of ${body.data.length} (requested limit ${limit})`
      );
    }

    yield body.data;
    page += 1;
  } while (page <= totalPages);
}

export type ReconcileOptions = {
  /** ISO timestamp. Omit for a full sweep, which is the only mode that can soft-delete. */
  since?: string;
  /** Issue the mutations. Default is a dry run. */
  write?: boolean;
};

export type ReconcileResult = {
  mutations: Mutation[];
  products: number;
  variants: number;
  categories: number;
  softDeleted: number;
};

/** Accumulates upserts and records which ids the catalog still holds. */
type Sweep = {
  mutations: Mutation[];
  seen: Set<string>;
};

function collect(sweep: Sweep, document: SyncedDocument): void {
  sweep.seen.add(document._id);
  sweep.mutations.push(...upsertMutations(document));
}

async function sweepProducts(
  sweep: Sweep,
  credentials: BigCommerceCredentials,
  since: string | undefined
): Promise<{ products: number; variants: number }> {
  let products = 0;
  let variants = 0;

  for await (const page of paginate<RestProduct>("products", credentials, {
    since,
    include: PRODUCT_INCLUDE,
  })) {
    for (const product of page) {
      // Same product -> documents path the single-entity sync uses. Two of
      // these would drift, and a variant only one of them writes is a document
      // an editor can reference and never see updated.
      for (const document of productDocuments(product)) {
        collect(sweep, document);
      }
      products += 1;
      variants += (product.variants ?? []).length;
    }
  }

  return { products, variants };
}

async function sweepCategories(
  sweep: Sweep,
  credentials: BigCommerceCredentials
): Promise<number> {
  let categories = 0;

  // No `since` here on purpose. `/v3/catalog/categories` has no date filter —
  // it answers 422 "The filter(s): date_modified:min are not valid filter
  // parameter(s)". Categories are always swept whole, which is cheap: 10 rows
  // in one page on the sandbox, and a real catalog rarely runs to thousands.
  for await (const page of paginate<RestCategory>("categories", credentials)) {
    for (const category of page) {
      collect(sweep, toCategoryDocument(category));
      categories += 1;
    }
  }

  return categories;
}

/**
 * Flags every synced document Sanity still holds that the catalog no longer
 * returns. Only a full sweep may call this: an incremental sweep sees only what
 * changed, so every unmodified entity would look deleted.
 */
async function sweepDeletes(
  sweep: Sweep,
  client: SanityClient
): Promise<number> {
  const live = await client.fetch<string[]>(
    "*[_type in $types && store.isDeleted != true]._id",
    {
      types: [
        "bigcommerceProduct",
        "bigcommerceProductVariant",
        "bigcommerceCategory",
      ],
    }
  );

  const stale = staleMutations(live, sweep.seen);
  sweep.mutations.push(...stale);

  logger.info(
    `Soft-delete pass: ${live.length} live synced document(s) in Sanity, ${stale.length} no longer in the catalog`
  );
  return stale.length;
}

export async function reconcile(
  options: ReconcileOptions = {}
): Promise<ReconcileResult> {
  const credentials = readBigCommerceCredentials();
  const client = createWriteClient();
  const sweep: Sweep = { mutations: [], seen: new Set() };

  const { products, variants } = await sweepProducts(
    sweep,
    credentials,
    options.since
  );
  const categories = await sweepCategories(sweep, credentials);

  let softDeleted = 0;
  if (options.since) {
    logger.info("Incremental sweep — skipping the soft-delete pass.");
  } else {
    softDeleted = await sweepDeletes(sweep, client);
  }

  if (options.write) {
    await client.mutate(sweep.mutations);
    logger.info(`Committed ${sweep.mutations.length} mutation(s).`);
  }

  return {
    mutations: sweep.mutations,
    products,
    variants,
    categories,
    softDeleted,
  };
}

// ---------------------------------------------------------------------------
// CLI — a shell over `reconcile()` and the four functions in `src/sync.ts`
// ---------------------------------------------------------------------------

/** `parseArgs` hands back strings, and `/v3/catalog/products/NaN` is a 404 that reads as a delete. */
function entityIdFrom(raw: string, flag: string): number {
  const entityId = Number(raw);
  if (!Number.isInteger(entityId) || entityId <= 0) {
    throw new Error(`--${flag} needs a BigCommerce entity id, got "${raw}"`);
  }
  return entityId;
}

function printMutations(mutations: Mutation[], write: boolean): void {
  if (write) {
    return;
  }
  logger.info("DRY RUN — the exact mutations that would be issued:");
  for (const mutation of mutations) {
    logger.info(JSON.stringify(mutation));
  }
}

/**
 * The single-entity path, which is what a webhook delivery does. Reproducing a
 * delivery from a terminal is the whole point of it existing before the route
 * does.
 */
async function runOne(values: {
  write: boolean;
  delete: boolean;
  product?: string;
  category?: string;
}): Promise<SyncResult> {
  const write = values.write;

  if (values.product) {
    const entityId = entityIdFrom(values.product, "product");
    return values.delete
      ? deleteProduct(entityId, { write })
      : syncProduct(entityId, { write });
  }

  if (values.category) {
    const entityId = entityIdFrom(values.category, "category");
    return values.delete
      ? deleteCategory(entityId, { write })
      : syncCategory(entityId, { write });
  }

  throw new Error("Pass --product <id> or --category <id>.");
}

async function main() {
  const { values } = parseArgs({
    options: {
      write: { type: "boolean", default: false },
      since: { type: "string" },
      product: { type: "string" },
      category: { type: "string" },
      delete: { type: "boolean", default: false },
    },
  });

  if (values.product && values.category) {
    throw new Error("Pass --product or --category, not both.");
  }

  if (values.product || values.category) {
    const result = await runOne(values);
    printMutations(result.mutations, values.write);
    logger.info(
      `${result.entity} ${result.entityId}: ${result.action} — ${result.documentIds.length} document(s), ${result.mutations.length} mutation(s)`
    );
    logger.info(
      result.written ? "Wrote to Sanity." : "Nothing was written to Sanity."
    );
    return;
  }

  const result = await reconcile({ since: values.since, write: values.write });
  printMutations(result.mutations, values.write);

  logger.info(
    `${result.products} product(s), ${result.variants} variant(s), ${result.categories} categor(y|ies), ${result.softDeleted} soft-delete(s) → ${result.mutations.length} mutation(s)`
  );
  logger.info(
    values.write ? "Wrote to Sanity." : "Dry run — nothing was written."
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  // Pretty on a terminal, JSON when redirected. Inside the guard, not at
  // module load: this file is imported as a library too, and a stray
  // initLogger would reset whatever the importing app configured.
  initLogging();

  main().catch((error: unknown) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
