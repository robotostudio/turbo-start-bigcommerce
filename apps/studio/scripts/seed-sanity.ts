/**
 * Sanity content seed.
 *
 * Usage:
 *   pnpm --filter studio seed:sanity
 *
 * Imports the canonical Roboto seed dataset — 47 documents and ~95 images —
 * from turbo-start-sanity, then adds the two singletons our fork has that the
 * upstream export does not: `collectionsIndex` and `promoBanner`.
 *
 * The export is a 23 MB tarball. It is fetched at runtime and cached in the OS
 * temp directory, never inside the repo — this repo's history was rebuilt
 * specifically to drop inherited binaries and must stay that way.
 *
 * Idempotent: every run wipes the content types the seed owns before importing,
 * so the tenth run leaves the same dataset as the first. Commerce types
 * (product, collection, productVariant, colorTheme) are never touched —
 * BigCommerce owns those. Image assets are not deleted either, so the importer
 * can match them by hash and skip re-uploading 95 files on every run.
 */

import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import {
  createClient,
  type IdentifiedSanityDocumentStub,
} from "@sanity/client";
import { Logger } from "@workspace/logger";

const log = new Logger("seed-sanity");

const SEED_URL =
  "https://raw.githubusercontent.com/robotostudio/turbo-start-sanity/main/apps/studio/seed-data.tar.gz";

/** Deliberately outside the repo. Nothing binary may land in git. */
const CACHE_PATH = join(tmpdir(), "turbo-start-sanity-seed-data.tar.gz");

/** `apps/studio` — where the CLI finds sanity.cli.ts and the local binary. */
const STUDIO_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * The types this seed owns. Commerce types are absent on purpose so a seed run
 * can never delete BigCommerce-synced catalogue data.
 */
const SEEDED_TYPES = [
  "author",
  "blog",
  "blogIndex",
  "category",
  "collectionsIndex",
  "faq",
  "footer",
  "homePage",
  "navbar",
  "page",
  "promoBanner",
  "settings",
];

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
  perspective: "published",
});

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1);

/**
 * The download check that matters. gzip is read sequentially, so a truncated or
 * corrupt archive fails here rather than silently "extracting" to nothing.
 */
function isIntactTarball(path: string): boolean {
  try {
    return execFileSync("tar", ["-tzf", path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).includes("data.ndjson");
  } catch {
    return false;
  }
}

async function ensureSeedData(): Promise<string> {
  if (isIntactTarball(CACHE_PATH)) {
    log.info(`Using cached seed data at ${CACHE_PATH}`);
    return CACHE_PATH;
  }

  log.info(`Downloading seed data from ${SEED_URL}`);
  const response = await fetch(SEED_URL);
  if (!(response.ok && response.body)) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const expected = Number(response.headers.get("content-length"));
  const partial = `${CACHE_PATH}.part`;
  let received = 0;
  let lastShown = -1;

  const source = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
  source.on("data", (chunk: Buffer) => {
    received += chunk.length;
    // Every 5%: smooth enough on a terminal, 20 lines in a piped log.
    const percent = expected ? Math.floor((received / expected) * 20) * 5 : 0;
    if (percent !== lastShown) {
      lastShown = percent;
      process.stderr.write(
        `\r  ${percent}% — ${mb(received)} / ${mb(expected)} MB`
      );
    }
  });
  await pipeline(source, createWriteStream(partial));
  process.stderr.write("\n");

  if (expected && received !== expected) {
    await rm(partial, { force: true });
    throw new Error(
      `Download truncated: received ${received} bytes, expected ${expected}`
    );
  }
  if (!isIntactTarball(partial)) {
    await rm(partial, { force: true });
    throw new Error(
      "Downloaded file is not a readable gzipped export — the URL may no longer serve the tarball"
    );
  }

  await rename(partial, CACHE_PATH);
  log.info(`Cached seed data at ${CACHE_PATH}`);
  return CACHE_PATH;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * One delete-by-query rather than a loop: the seeded documents reference each
 * other (blog → author, navbar → page, faqAccordion → faq), and only a single
 * mutation can drop a reference graph without tripping integrity checks. The
 * query matches drafts too, since a draft is just a document with a prefix.
 */
async function wipeSeededContent() {
  const { results } = await client.delete(
    { query: "*[_type in $types]", params: { types: SEEDED_TYPES } },
    { returnDocuments: false }
  );
  log.info(`Removed ${results.length} existing content documents`);
}

/**
 * The Sanity CLI is already a dependency of this workspace and is the supported
 * import path — it streams the ndjson, uploads the images and reuses any asset
 * whose hash already exists. `dotenv` filled this process's env, not the
 * child's, so the token is passed through explicitly as SANITY_AUTH_TOKEN.
 */
function importSeedData(tarball: string) {
  execFileSync(
    "npx",
    ["sanity", "dataset", "import", tarball, dataset, "--replace"],
    {
      cwd: STUDIO_DIR,
      env: { ...process.env, SANITY_AUTH_TOKEN: token },
      stdio: "inherit",
    }
  );
}

// ---------------------------------------------------------------------------
// Top-up
// ---------------------------------------------------------------------------

function url(external: string) {
  return {
    _type: "customUrl",
    type: "external",
    external,
    openInNewTab: false,
  };
}

/**
 * Documents our schema pins as singletons but the upstream export predates.
 * `_id`s match the ones structure.ts opens, so the Studio finds them.
 */
function extraDocuments(
  heroAsset: string | null
): IdentifiedSanityDocumentStub[] {
  return [
    {
      _id: "collectionsIndex",
      _type: "collectionsIndex",
      title: "Collections",
      subtitle:
        "Every collection in the store, grouped the way people shop rather than the way a warehouse files things.",
      heroTitle: "Shop the full range",
      ...(heroAsset && {
        heroImage: {
          _type: "image",
          asset: { _type: "reference", _ref: heroAsset },
          alt: "Products from across the store",
        },
      }),
      buttons: [
        {
          _type: "button",
          _key: "b1",
          text: "Browse collections",
          variant: "default",
          url: url("/collections"),
        },
      ],
      slug: { _type: "slug", current: "/collections" },
    },
    {
      _id: "promoBanner",
      _type: "promoBanner",
      enabled: true,
      text: "Free shipping on orders over $50",
      link: url("/collections"),
    },
  ];
}

async function topUp() {
  // The export has no collections hero, so borrow the largest image it did
  // bring in rather than uploading bytes of our own.
  const heroAsset = await client.fetch<string | null>(
    '*[_type == "sanity.imageAsset"] | order(metadata.dimensions.width desc)[0]._id'
  );

  const transaction = client.transaction();
  const documents = extraDocuments(heroAsset);
  for (const document of documents) {
    transaction.createOrReplace(document);
  }
  await transaction.commit();
  log.info(`Wrote ${documents.length} documents the export does not carry`);

  // The export ships three preview secrets belonging to the upstream Studio.
  // They are scoped to a project that is not ours; the presentation tool mints
  // its own on demand.
  const { results } = await client.delete(
    { query: '*[_type == "sanity.previewUrlSecret"]' },
    { returnDocuments: false }
  );
  if (results.length) {
    log.info(`Dropped ${results.length} imported preview secrets`);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

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
  log.info(`Dataset total: ${types.length} documents`);
}

async function main() {
  log.info(`Seeding ${projectId}/${dataset}`);
  const tarball = await ensureSeedData();
  await wipeSeededContent();
  importSeedData(tarball);
  await topUp();
  await report();
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
