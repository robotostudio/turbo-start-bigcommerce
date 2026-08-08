/**
 * The whole seed, in the order it has to run.
 *
 * Usage:
 *   pnpm seed          # prints what it would do to which store and dataset
 *   pnpm seed --yes    # runs it
 *
 * The four steps are the three that already existed plus the one that links
 * them, and the order is load-bearing in both directions: `seed:sanity` deletes
 * every document in the dataset, so a sync before it is thrown away, and
 * `seed:refs` needs the catalog documents the sync writes, so it can only run
 * last. Getting that wrong leaves a homepage that renders but is empty, which
 * is the failure this command exists to stop people rediscovering.
 *
 * `--yes` is not ceremony. `pnpm seed` is four keystrokes away from wiping a
 * dataset that might be someone's production content, and the confirmation is
 * the only thing between the two.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Logger } from "@workspace/logger";

const log = new Logger("seed");

/** `apps/studio/scripts` → repo root. */
const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

const STEPS = [
  {
    label: "catalog into BigCommerce",
    args: ["--filter", "studio", "seed:bigcommerce"],
  },
  {
    label: "content into Sanity (deletes every document first)",
    args: ["--filter", "studio", "seed:sanity"],
  },
  {
    label: "catalog back out of BigCommerce, into Sanity",
    args: ["--filter", "studio", "sync:bigcommerce"],
  },
  {
    label: "point the seeded content at this sandbox's catalog",
    args: ["--filter", "@workspace/sanity-sync", "seed-refs", "--write"],
  },
] as const;

function run(args: readonly string[]): void {
  const result = spawnSync("pnpm", [...args], { cwd: ROOT, stdio: "inherit" });
  const command = `\`pnpm ${args.join(" ")}\``;

  // `status` is null both when the process never started and when a signal
  // killed it, and "exited null" names neither.
  if (result.error) {
    throw new Error(`${command} could not start: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`${command} was killed by ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited ${result.status}`);
  }
}

/**
 * Steps 3 and 4 read `packages/sanity-sync/.env`, not the studio's — that
 * package owns its own credentials on purpose. So the dataset printed above the
 * confirmation is the one steps 1 and 2 use, and two of the four steps could
 * quietly write somewhere else. `--yes` has to mean one target, so the two
 * files are compared before anything runs.
 */
function syncTarget(): { project: string; dataset: string } | null {
  let text: string;
  try {
    text = readFileSync(join(ROOT, "packages", "sanity-sync", ".env"), "utf8");
  } catch {
    return null;
  }
  const read = (key: string) =>
    text.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\n\r]*)"?`, "m"))?.[1] ??
    "";
  return { project: read("SANITY_PROJECT_ID"), dataset: read("SANITY_DATASET") };
}

function main(): void {
  const project = process.env.SANITY_STUDIO_PROJECT_ID ?? "unset";
  const dataset = process.env.SANITY_STUDIO_DATASET ?? "unset";

  log.info(
    `BigCommerce store: ${process.env.BIGCOMMERCE_STORE_HASH ?? "unset"}`
  );
  log.info(`Sanity dataset:    ${project}/${dataset}`);
  for (const [index, step] of STEPS.entries()) {
    log.info(`  ${index + 1}. ${step.label}`);
  }

  const sync = syncTarget();
  if (sync && (sync.project !== project || sync.dataset !== dataset)) {
    log.error(
      `packages/sanity-sync/.env points at ${sync.project}/${sync.dataset}, not ${project}/${dataset}.`
    );
    log.error(
      "Steps 3 and 4 read that file, so the run would write to two different datasets. Make them match."
    );
    process.exit(1);
  }

  if (!process.argv.includes("--yes")) {
    log.error(
      "This rewrites that store and deletes every document in that dataset."
    );
    log.error("Re-run with --yes once the two lines above are the right ones.");
    process.exit(1);
  }

  for (const [index, step] of STEPS.entries()) {
    log.info(`Step ${index + 1}/${STEPS.length} — ${step.label}`);
    run(step.args);
  }

  log.info("Seeded. `pnpm verify` checks it before you run the app.");
}

try {
  main();
} catch (error: unknown) {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
