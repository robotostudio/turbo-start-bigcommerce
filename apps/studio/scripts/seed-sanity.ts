/**
 * Sanity content seed.
 *
 * Usage:
 *   pnpm --filter studio seed:sanity
 *
 * Mirrors the reference dataset behind https://turbo-start-shopify-web.vercel.app
 * — project `ztcucp3r`, dataset `production` — into whatever project and dataset
 * `apps/studio/.env` points at. The result is an exact copy: 134 documents and 22
 * images, no merge, no top-ups. Every string the homepage renders comes from the
 * reference, so a local run and the deployed reference render the same page.
 *
 * The export is fetched at runtime with the Sanity CLI and cached in the OS temp
 * directory, never inside the repo — this repo's history was rebuilt specifically
 * to drop inherited binaries and must stay that way. That means the seed needs a
 * CLI login with read access to `ztcucp3r` (`npx sanity login`, Roboto Studio
 * org); without it the export step fails and the seed stops before touching the
 * target dataset.
 *
 * Destructive and idempotent: every run deletes every document in the target
 * dataset — including commerce types and image assets — before importing. A
 * BigCommerce catalogue synced by `pnpm --filter studio sync:bigcommerce` does
 * not survive a seed; re-run the sync afterwards.
 */

import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import { createClient } from "@sanity/client";
import { Logger } from "@workspace/logger";

const log = new Logger("seed-sanity");

/** The dataset that powers turbo-start-shopify-web.vercel.app. */
const REFERENCE_PROJECT_ID = "ztcucp3r";
const REFERENCE_DATASET = "production";

/** Deliberately outside the repo. Nothing binary may land in git. */
const CACHE_PATH = join(
  tmpdir(),
  `${REFERENCE_PROJECT_ID}-${REFERENCE_DATASET}.tar.gz`
);

/** `apps/studio` — where the CLI finds sanity.cli.ts and the local binary. */
const STUDIO_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

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

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

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

/**
 * `sanity.cli.ts` reads the project from the environment and `dotenv` does not
 * override an already-set variable, so an inline override wins and the same CLI
 * config can point at a project that is not ours. Deliberately no
 * SANITY_AUTH_TOKEN: the project token from `.env` is scoped to the *target*
 * project and would 403 here. The export runs as whoever `sanity login` logged
 * in as, which is the only credential that can read the reference.
 */
function ensureExport(): string {
  if (isIntactTarball(CACHE_PATH)) {
    log.info(`Using cached export at ${CACHE_PATH}`);
    return CACHE_PATH;
  }

  log.info(
    `Exporting ${REFERENCE_PROJECT_ID}/${REFERENCE_DATASET} to ${CACHE_PATH}`
  );
  try {
    execFileSync(
      "npx",
      [
        "sanity",
        "dataset",
        "export",
        REFERENCE_DATASET,
        CACHE_PATH,
        "--overwrite",
      ],
      {
        cwd: STUDIO_DIR,
        env: {
          ...process.env,
          SANITY_STUDIO_PROJECT_ID: REFERENCE_PROJECT_ID,
          SANITY_STUDIO_DATASET: REFERENCE_DATASET,
        },
        stdio: "inherit",
      }
    );
  } catch {
    log.error(
      `Could not export the reference dataset ${REFERENCE_PROJECT_ID}/${REFERENCE_DATASET}.`
    );
    log.error(
      "It lives in the Roboto Studio Sanity org and is not public. Run `npx sanity login` as a member of that org, confirm `npx sanity projects list` shows ztcucp3r, then re-run this seed."
    );
    log.error(
      `If you are not in that org, ask someone who is for a tarball from \`sanity dataset export\` and drop it at ${CACHE_PATH} — the seed picks up a cached file from there.`
    );
    process.exit(1);
  }

  return CACHE_PATH;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

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
 * The Sanity CLI is already a dependency of this workspace and is the supported
 * import path — it streams the ndjson and uploads the images. `dotenv` filled
 * this process's env, not the child's, so the token is passed through
 * explicitly as SANITY_AUTH_TOKEN.
 */
function importExport(tarball: string) {
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
  log.info(`Dataset total: ${types.length} published documents`);
}

async function main() {
  log.info(`Seeding ${projectId}/${dataset} from ${REFERENCE_PROJECT_ID}`);
  const tarball = ensureExport();
  await wipe();
  importExport(tarball);
  await report();
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
