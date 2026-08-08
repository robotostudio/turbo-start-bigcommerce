/**
 * Sanity content seed.
 *
 * Usage:
 *   pnpm --filter studio seed:sanity
 *
 * Imports `seed/reference-dataset.ndjson` into whatever project and dataset
 * `apps/studio/.env` points at. That file is a copy of the dataset behind
 * the reference storefront, so a seeded clone and the deployed
 * reference render the same page — same hero, same featured products, same FAQ.
 *
 * The seed needs nothing but a write token for your own project. Images are not
 * in the repo: every image reference in the ndjson is a `_sanityAsset` pointing
 * at Sanity's public CDN, which the importer downloads and re-uploads into your
 * project. 155 KB in git instead of 30 MB, and no membership of anyone's org.
 *
 * Refreshing the ndjson is a maintainer job and needs read access to the
 * reference project. See `seed/README.md`.
 *
 * Destructive and idempotent: every run deletes every document in the target
 * dataset — commerce types and image assets included — before importing. A
 * BigCommerce catalogue synced into Sanity does not survive a seed, so run the
 * sync after the seed, never before.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import { createClient } from "@sanity/client";
import { Logger } from "@workspace/logger";

const log = new Logger("seed-sanity");

/** `apps/studio` — where the CLI finds sanity.cli.ts and the local binary. */
const STUDIO_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_FILE = join(STUDIO_DIR, "seed", "reference-dataset.ndjson");

/**
 * Fails loudly rather than half-seeding. Returns `string` so the value stays
 * narrowed inside the functions below, which a top-level guard would not.
 */
function required(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) {
    log.error(`${name} is not set in apps/studio/.env — ${hint}`);
    process.exit(1);
  }
  return value;
}

const projectId = required(
  "SANITY_STUDIO_PROJECT_ID",
  "the seed needs to know which project to write to."
);
const dataset = required(
  "SANITY_STUDIO_DATASET",
  "the seed needs to know which dataset to write to."
);
const token = required(
  "SANITY_API_WRITE_TOKEN",
  "the seed needs an editor token to write to the dataset. Create one at sanity.io/manage → API → Tokens."
);

const client = createClient({
  projectId,
  dataset,
  apiVersion: process.env.SANITY_STUDIO_API_VERSION ?? "2025-05-08",
  token,
  useCdn: false,
  perspective: "raw",
});

/**
 * One delete-by-query rather than a loop: the documents reference each other
 * (blog → author, navbar → page, product → image asset), and only a single
 * mutation can drop a reference graph without tripping integrity checks. Drafts
 * are included — a draft is just a document with a prefix. `_.**` is Sanity's
 * own system space (groups, retention, schema) and is not ours to delete.
 */
async function wipe() {
  const { results } = await client.delete(
    { query: '*[!(_id in path("_.**"))]' },
    { returnDocuments: false }
  );
  log.info(`Deleted ${results.length} existing documents`);
}

/**
 * The Sanity CLI is already a workspace dependency and is the supported import
 * path — it streams the ndjson and resolves every `_sanityAsset` URL into a real
 * asset in the target project. `dotenv` filled this process's env, not the
 * child's, so the token is passed through explicitly.
 */
function importData() {
  execFileSync(
    "npx",
    ["sanity", "dataset", "import", DATA_FILE, dataset, "--replace"],
    {
      cwd: STUDIO_DIR,
      env: { ...process.env, SANITY_AUTH_TOKEN: token },
      stdio: "inherit",
    }
  );
}

async function report() {
  // `_.**` are Sanity's own system documents (groups, retention) — not content.
  const types = await client.fetch<string[]>(
    '*[!(_id in path("drafts.**")) && !(_id in path("_.**"))]._type'
  );
  const counts = new Map<string, number>();
  for (const type of types) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  for (const [type, count] of [...counts].sort()) {
    log.info(`  ${type}: ${count}`);
  }
  log.info(`Dataset total: ${types.length} published documents`);
}

async function main() {
  if (!existsSync(DATA_FILE)) {
    log.error(`Seed data is missing at ${DATA_FILE}`);
    log.error("It is committed to the repo — check out the file and re-run.");
    process.exit(1);
  }

  log.info(`Seeding ${projectId}/${dataset}`);
  await wipe();
  importData();
  await report();
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
