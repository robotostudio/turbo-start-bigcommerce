import path from "node:path";
import { Logger } from "@workspace/logger";
import "dotenv/config";
import { defineCliConfig } from "sanity/cli";
import tsconfigPaths from "vite-plugin-tsconfig-paths";

const logger = new Logger("SanityCLI");

const projectId = process.env.SANITY_STUDIO_PROJECT_ID ?? "";
const dataset = process.env.SANITY_STUDIO_DATASET ?? "production";

if (!projectId) {
  logger.warn(
    "Missing or invalid SANITY_STUDIO_PROJECT_ID - some features may not work"
  );
}
if (!dataset) {
  logger.warn(
    "Missing or invalid SANITY_STUDIO_DATASET - some features may not work"
  );
}

/**
 * The `<host>.sanity.studio` subdomain `sanity deploy` publishes to.
 *
 * `SANITY_STUDIO_PRODUCTION_HOSTNAME` names it; without one we derive
 * `studio-<projectId>`, which is where this studio already lives. The prefix
 * is not decoration: Sanity validates the host against
 * `^[a-z][a-z0-9-]*[a-z0-9]$`, and a project id may start with a digit, so a
 * bare id is rejected with `"appHost" must match pattern` — an error that says
 * nothing about the variable it is missing. Every deploy on a machine without
 * that variable failed on it.
 *
 * `HOST_NAME` (the branch, in CI) prefixes whichever of the two we end up
 * with, so a branch deploy that forgot the variable gets its own studio
 * instead of publishing over production.
 */
function getStudioHost(): string | undefined {
  const base = process.env.SANITY_STUDIO_PRODUCTION_HOSTNAME || defaultHost();
  if (!base) {
    return undefined;
  }

  const host = process.env.HOST_NAME;
  return host && host !== "main" ? `${host}-${base}` : base;
}

function defaultHost(): string | undefined {
  // No fallback without a project id on purpose. A studio host belonging to
  // someone else's project would let a half-configured env deploy over live
  // content. Undefined makes the caller skip the deploy target instead.
  return projectId ? `studio-${projectId}` : undefined;
}

const studioHost = getStudioHost();

if (studioHost) {
  logger.info(`Sanity Studio Host: https://${studioHost}.sanity.studio`);
}

export default defineCliConfig({
  api: {
    projectId,
    dataset,
  },
  studioHost,
  deployment: {
    autoUpdates: false,
  },
  vite: {
    plugins: [tsconfigPaths()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  },
});
