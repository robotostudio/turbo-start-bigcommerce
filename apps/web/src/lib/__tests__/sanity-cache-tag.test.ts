import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `sanityFetch` must put `SANITY_CACHE_TAG` on every read.
 *
 * Worth a test because the failure is silent in both directions: nothing
 * renders differently when the tag is missing, and `/api/revalidate` still
 * answers `200` while `revalidateTag` matches no cache entry. That is how this
 * shipped — next-sanity 12 added the blanket tag itself, 13 stopped, and
 * production served deleted pages for as long as the deployment lived.
 *
 * Lives in `apps/web` because `packages/sanity` has no test runner of its own,
 * the same reason `env-revalidate-gate.test.ts` is here.
 */

/**
 * `next-sanity/live` has to be stubbed: outside a React Server Components
 * build Node picks the package's `default` condition, whose `defineLive`
 * throws on sight. Stubbing it also puts the delegation under a spy, which is
 * the assertion — what the wrapper hands the library, not what it returns.
 *
 * Resolved from `packages/sanity`, not from here. pnpm gives the two packages
 * separate copies of `next-sanity`, so the specifier alone would mock the copy
 * `apps/web` sees and leave the one `live.ts` actually imports untouched.
 */
const liveModuleId = createRequire(
  new URL("../../../../../packages/sanity/src/live.ts", import.meta.url)
).resolve("next-sanity/live");

const liveFetch = vi.fn();

/** Enough env for both `@workspace/env` schemas to validate. Never dialled. */
const ENV = {
  NEXT_PUBLIC_SANITY_PROJECT_ID: "testproject",
  NEXT_PUBLIC_SANITY_DATASET: "production",
  NEXT_PUBLIC_SANITY_API_VERSION: "2025-08-29",
  NEXT_PUBLIC_SANITY_STUDIO_URL: "http://localhost:3333",
  SANITY_PROJECT_ID: "testproject",
  SANITY_DATASET: "production",
  SANITY_API_READ_TOKEN: "test-read-token",
  SANITY_API_WRITE_TOKEN: "test-write-token",
  SANITY_REVALIDATE_SECRET: "test-secret",
  BIGCOMMERCE_STORE_HASH: "testhash",
  BIGCOMMERCE_STOREFRONT_TOKEN: "test-storefront-token",
  BIGCOMMERCE_ADMIN_TOKEN: "test-admin-token",
  BIGCOMMERCE_WEBHOOK_DESTINATION: "https://test.example.com/api/webhook",
  CRON_SECRET: "test-cron-secret",
  BIGCOMMERCE_WEBHOOK_SECRET: "test-webhook-secret",
} as const;

async function importLive() {
  for (const [key, value] of Object.entries(ENV)) {
    vi.stubEnv(key, value);
  }
  // Not `vi.mock`: the module id is computed above, and `vi.mock` is hoisted
  // over the code that computes it.
  vi.doMock(liveModuleId, () => ({
    defineLive: () => ({ sanityFetch: liveFetch, SanityLive: () => null }),
  }));
  return await import("@workspace/sanity/live");
}

beforeEach(() => {
  liveFetch.mockReset();
  liveFetch.mockResolvedValue({ data: null, sourceMap: null, tags: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock(liveModuleId);
  vi.resetModules();
});

describe("sanityFetch", () => {
  it("tags every read with the tag /api/revalidate clears", async () => {
    const { sanityFetch, SANITY_CACHE_TAG } = await importLive();

    await sanityFetch({ query: "*[_type == 'page']" });

    expect(liveFetch).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [SANITY_CACHE_TAG] })
    );
  });

  it("keeps a caller's own tags alongside it", async () => {
    const { sanityFetch, SANITY_CACHE_TAG } = await importLive();

    await sanityFetch({ query: "*[_type == 'page']", tags: ["collections"] });

    expect(liveFetch).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [SANITY_CACHE_TAG, "collections"] })
    );
  });
});
