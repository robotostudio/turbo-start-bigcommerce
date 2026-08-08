import { defineConfig } from "@playwright/test";

/**
 * The end-to-end seam.
 *
 * Everything else in this repo is tested as pure functions fed committed
 * fixtures. The specs in `e2e/` are here because each one depends on real
 * BigCommerce state changing between two requests, which is exactly what a
 * fixture cannot express. Nothing belongs here that a unit test can cover —
 * a case added here makes the suite slower without making it stricter.
 *
 * Run it with `pnpm test:e2e`, against a production build:
 *
 *   rm -rf apps/web/.next && pnpm build:web && pnpm test:e2e
 *
 * `next start` serves whatever is already in `.next`, so a stale build is
 * served silently rather than rebuilt. The suite is not wired into the CI
 * workflow: CI seeds env from `.env.example`, whose placeholder credentials
 * reach no store, so every spec here would fail on its first storefront call.
 * It runs headless and takes its store from `apps/web/.env.local`, so any
 * runner holding real credentials can run it.
 */

const PORT = 3002;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  // One worker, no parallelism: these specs share one live store, and a second
  // worker minting checkout URLs against it would be racing this one's cart.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    // Not `pnpm dev`: a dev server compiles on demand and re-reads the catalog
    // per request, so it hides the caching a production build bakes in. `-p`
    // rather than `PORT=`, which the workspace scripts swallow.
    command: "pnpm --filter web exec next start -p 3002",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
