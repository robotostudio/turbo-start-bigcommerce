import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `SANITY_REVALIDATE_SECRET` is required, and stays required.
 *
 * Worth a test rather than trusting the schema to be read, because the thing it
 * prevents is invisible: without the secret, `sanityFetch`'s `revalidate: false`
 * cache is never invalidated, so a green build ships editorial content that can
 * never refresh. Nothing else in the suite notices the field being loosened back
 * to `.optional()` — and it was optional until someone went looking for why a
 * publish never appeared.
 *
 * Lives in `apps/web` because `packages/env` has no test runner of its own and
 * giving it one to hold three assertions is not worth the config.
 */

/**
 * The other required vars, so a case varies only what it is about. Hardcoded
 * rather than inherited from the developer's `.env.local`, which would make the
 * result depend on whose machine ran it.
 */
const OTHER_REQUIRED_ENV = {
  SANITY_API_READ_TOKEN: "test-read-token",
  SANITY_API_WRITE_TOKEN: "test-write-token",
  BIGCOMMERCE_STORE_HASH: "testhash",
  BIGCOMMERCE_STOREFRONT_TOKEN: "test-storefront-token",
  BIGCOMMERCE_ADMIN_TOKEN: "test-admin-token",
  BIGCOMMERCE_WEBHOOK_DESTINATION: "https://test.example.com/api/webhook",
  CRON_SECRET: "test-cron-secret",
} as const;

const CASE_ENV = ["SANITY_REVALIDATE_SECRET", "SKIP_ENV_VALIDATION"] as const;

/**
 * `env` is a module-level singleton evaluated on import, so each case needs the
 * module graph reset before it — one import cannot exercise two states.
 */
async function importEnv(overrides: Partial<Record<string, string>>) {
  vi.resetModules();

  for (const key of CASE_ENV) {
    vi.stubEnv(key, undefined);
  }
  for (const [key, value] of Object.entries({
    ...OTHER_REQUIRED_ENV,
    ...overrides,
  })) {
    vi.stubEnv(key, value);
  }

  return await import("@workspace/env/server");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("SANITY_REVALIDATE_SECRET", () => {
  it("fails validation when it is absent", async () => {
    await expect(importEnv({})).rejects.toThrow();
  });

  it("fails validation when it is an empty string", async () => {
    // `emptyStringAsUndefined` means `KEY=` is absent rather than a value, so a
    // blank line in a `.env` file is caught the same as a missing one.
    await expect(importEnv({ SANITY_REVALIDATE_SECRET: "" })).rejects.toThrow();
  });

  it("passes when it is set", async () => {
    const { env } = await importEnv({
      SANITY_REVALIDATE_SECRET: "a-secret",
    });

    expect(env.SANITY_REVALIDATE_SECRET).toBe("a-secret");
  });

  it("is bypassed by SKIP_ENV_VALIDATION, like every other required var", async () => {
    // Documented as the global bypass, and the only way a running process can
    // reach the revalidate route without a secret. Signature verification then
    // rejects every webhook, which is the safe direction to fail.
    const { env } = await importEnv({ SKIP_ENV_VALIDATION: "1" });

    expect(env.SANITY_REVALIDATE_SECRET).toBeUndefined();
  });
});
