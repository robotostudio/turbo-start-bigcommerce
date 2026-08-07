import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { Mutation, SanityClient } from "@sanity/client";
import { Logger } from "@workspace/logger";

import {
  type BigCommerceCredentials,
  createWriteClient,
  readBigCommerceCredentials,
} from "./client.js";
import {
  type RestCategory,
  type RestProduct,
  type SyncedDocument,
  softDeleteMutations,
  toCategoryDocument,
  toProductDocument,
  toVariantDocument,
  upsertMutations,
} from "./upsert.js";

/**
 * The reconcile sweep. This is the primary sync mechanism, not a fallback.
 *
 * BigCommerce has no CRUD webhooks for variants and none for brands, and most
 * product image changes — including changing the thumbnail — fire no update
 * event at all. Webhook payloads are id-only, unordered, and can duplicate. A
 * webhook-only sync is therefore structurally incomplete; webhooks are at best
 * a latency optimisation layered on top of this sweep.
 *
 * Nothing invokes this. Run it by hand:
 *   pnpm --filter @workspace/sanity-sync reconcile              # dry run
 *   pnpm --filter @workspace/sanity-sync reconcile -- --write   # for real
 */

const logger = new Logger("Reconcile");

const ADMIN_API = "https://api.bigcommerce.com/stores";

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

/** Options are needed for the product document; variants and images ride along free. */
const PRODUCT_INCLUDE = "variants,options,images";

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

    const url = `${ADMIN_API}/${credentials.storeHash}/v3/catalog/${resource}?${params}`;
    const response = await fetch(url, {
      headers: {
        "X-Auth-Token": credentials.adminToken,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `GET /v3/catalog/${resource} failed: ${response.status} ${response.statusText}`
      );
    }

    const body = (await response.json()) as {
      data: T[];
      meta: { pagination: Pagination };
    };

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
      collect(sweep, toProductDocument(product));
      products += 1;

      for (const variant of product.variants ?? []) {
        collect(sweep, toVariantDocument(variant));
        variants += 1;
      }
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
  // parameter(s)". Categories are always swept whole, which is cheap: 11 rows
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

  let softDeleted = 0;
  for (const id of live) {
    if (!sweep.seen.has(id)) {
      sweep.mutations.push(...softDeleteMutations(id));
      softDeleted += 1;
    }
  }

  logger.info(
    `Soft-delete pass: ${live.length} live synced document(s) in Sanity, ${softDeleted} no longer in the catalog`
  );
  return softDeleted;
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
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      write: { type: "boolean", default: false },
      since: { type: "string" },
    },
  });

  const result = await reconcile({ since: values.since, write: values.write });

  if (!values.write) {
    logger.info("DRY RUN — the exact mutations that would be issued:");
    for (const mutation of result.mutations) {
      logger.info(JSON.stringify(mutation));
    }
  }

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
  main().catch((error: unknown) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
