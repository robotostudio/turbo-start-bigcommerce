import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { Mutation, SanityClient } from "@sanity/client";
import { Logger } from "@workspace/logger";

import { createWriteClient } from "./client";

/**
 * Phase two of the seed: point the seeded content at this sandbox's catalog.
 *
 * `apps/studio/seed/reference-dataset.ndjson` ships references to catalog
 * documents it does not contain — the navbar's collections, the homepage's
 * featured products, the blog's hotspot. Those documents come from
 * `pnpm sync:bigcommerce`, under ids BigCommerce mints: a product that is 183
 * on one store is 47 on the next. A committed id is therefore right on exactly
 * one store and dangling everywhere else, and a dangling weak reference renders
 * as nothing at all — a blank navbar with no error to explain it.
 *
 * So the ndjson carries the one thing that is the same on every store: the
 * slug. `bigcommerceProduct-wren-washed-cap` is a placeholder, not an id, and
 * this step swaps it for the real `bigcommerceProduct-{entityId}` by looking
 * the slug up among the synced documents.
 *
 * Run it after the sync, never before:
 *   pnpm --filter @workspace/sanity-sync seed-refs            # dry run
 *   pnpm --filter @workspace/sanity-sync seed-refs -- --write
 */

const logger = new Logger("SeedRefs");

/** The two synced types the seed content references. */
const CATALOG_TYPES = ["bigcommerceProduct", "bigcommerceCategory"] as const;

type CatalogType = (typeof CATALOG_TYPES)[number];

/**
 * `bigcommerceProduct-wren-washed-cap` is a placeholder; `bigcommerceProduct-191`
 * is a real synced id. The digits are the whole difference, and it is what makes
 * a second run a no-op rather than a failure: once a reference has been
 * rewritten it no longer matches, so re-running after a re-seed only touches
 * what the re-seed put back.
 */
const PLACEHOLDER =
  /^(bigcommerceProduct|bigcommerceCategory)-(?!\d+$)([a-z0-9-]+)$/;

export type Placeholder = { type: CatalogType; slug: string };

export function parsePlaceholder(ref: string): Placeholder | null {
  const match = PLACEHOLDER.exec(ref);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return { type: match[1] as CatalogType, slug: match[2] };
}

/** A synced catalog document, as the lookup query returns it. */
export type CatalogDocument = {
  _id: string;
  _type: string;
  slug: string | null;
};

/** A document from the dataset — any shape; only its references matter here. */
export type ContentDocument = { _id: string } & Record<string, unknown>;

export type RemapResult = {
  mutations: Mutation[];
  /** Placeholders with no synced document to point at, as `type:slug`. */
  unresolved: string[];
  resolved: number;
};

/**
 * JSONMatch path to one reference inside a document.
 *
 * Array members are addressed by `_key` rather than by index, because the
 * seeded arrays are editable: an editor who reorders the featured products
 * between the seed and this step would otherwise have the patch land on the
 * wrong entry, silently.
 */
function childPath(parent: string, segment: string): string {
  return parent
    ? `${parent}${segment.startsWith("[") ? "" : "."}${segment}`
    : segment;
}

function collectRefs(
  node: unknown,
  path: string,
  found: { path: string; ref: string }[]
): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      const key =
        item && typeof item === "object" && "_key" in item
          ? `[_key=="${(item as { _key: string })._key}"]`
          : `[${index}]`;
      collectRefs(item, childPath(path, key), found);
    });
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  const record = node as Record<string, unknown>;
  if (typeof record._ref === "string" && parsePlaceholder(record._ref)) {
    found.push({ path: childPath(path, "_ref"), ref: record._ref });
  }

  for (const [field, value] of Object.entries(record)) {
    if (field !== "_ref") {
      collectRefs(value, childPath(path, field), found);
    }
  }
}

/**
 * The mutations that repoint every placeholder reference at this dataset's
 * catalog. Pure: it reads two lists and returns patches, so the failure the
 * seed cannot rehearse — a slug whose document sits at a different id — is
 * testable without a store.
 */
export function remapSeedRefs(
  documents: ContentDocument[],
  catalog: CatalogDocument[]
): RemapResult {
  const bySlug = new Map<string, string>();
  for (const document of catalog) {
    if (document.slug) {
      bySlug.set(`${document._type}:${document.slug}`, document._id);
    }
  }

  const mutations: Mutation[] = [];
  const unresolved = new Set<string>();
  let resolved = 0;

  for (const document of documents) {
    const found: { path: string; ref: string }[] = [];
    for (const [field, value] of Object.entries(document)) {
      if (!field.startsWith("_")) {
        collectRefs(value, field, found);
      }
    }

    const set: Record<string, string> = {};
    for (const { path, ref } of found) {
      const placeholder = parsePlaceholder(ref);
      if (!placeholder) {
        continue;
      }
      const key = `${placeholder.type}:${placeholder.slug}`;
      const target = bySlug.get(key);
      if (target) {
        set[path] = target;
        resolved++;
      } else {
        unresolved.add(key);
      }
    }

    if (Object.keys(set).length > 0) {
      mutations.push({ patch: { id: document._id, set } });
    }
  }

  return { mutations, unresolved: [...unresolved].sort(), resolved };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Drafts included. The seed imports both a published navbar and its draft, and
 * a draft left pointing at a placeholder is what the Studio shows an editor.
 * `_.**` is Sanity's own system space and is not ours to patch.
 */
const CONTENT_QUERY = '*[!(_id in path("_.**"))]';
const CATALOG_QUERY = `*[_type in $types]{_id, _type, "slug": store.slug.current}`;

export async function linkSeedRefs(
  options: { write: boolean },
  client: SanityClient = createWriteClient()
): Promise<RemapResult> {
  const [documents, catalog] = await Promise.all([
    client.fetch<ContentDocument[]>(CONTENT_QUERY),
    client.fetch<CatalogDocument[]>(CATALOG_QUERY, { types: CATALOG_TYPES }),
  ]);

  logger.info(
    `${documents.length} document(s) in the dataset, ${catalog.length} synced catalog document(s).`
  );

  const result = remapSeedRefs(documents, catalog);

  // All or nothing. A run where some slugs resolve and others do not means the
  // sync is incomplete, and writing the resolvable half leaves a dataset that
  // is neither the old state nor the new one — while the log says it wrote.
  // Refusing costs nothing: the step is idempotent, so the operator fixes the
  // sync and runs it again.
  if (result.unresolved.length > 0) {
    return result;
  }

  if (options.write && result.mutations.length > 0) {
    await client.mutate(result.mutations);

    // `patch.set` on a path that resolves to nothing is a no-op, and the API
    // reports it the same way it reports a hit: 200, no error. The only way to
    // know the paths landed is to read the documents back and look.
    const after = remapSeedRefs(
      await client.fetch<ContentDocument[]>(CONTENT_QUERY),
      catalog
    );
    if (after.mutations.length > 0) {
      throw new Error(
        `${after.resolved} reference(s) are still placeholders after the patch — the paths did not resolve.`
      );
    }
  }

  return result;
}

async function main() {
  const { values } = parseArgs({
    options: { write: { type: "boolean", default: false } },
  });

  const result = await linkSeedRefs({ write: values.write });
  const wrote = values.write && result.unresolved.length === 0;

  if (!wrote) {
    logger.info("DRY RUN — the exact mutations that would be issued:");
    for (const mutation of result.mutations) {
      logger.info(JSON.stringify(mutation));
    }
  }

  logger.info(
    `${result.resolved} reference(s) resolved across ${result.mutations.length} document(s).`
  );
  logger.info(wrote ? "Wrote to Sanity." : "Nothing was written.");

  if (result.unresolved.length > 0) {
    for (const key of result.unresolved) {
      logger.error(`No synced document for ${key}`);
    }
    logger.error(
      "Run `pnpm sync:bigcommerce` first — those slugs have no catalog document yet. Nothing was written; this step writes all the references or none of them."
    );
    process.exit(1);
  }
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
