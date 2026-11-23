import { timingSafeEqual } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { REQUIRED_HOOK_SCOPES } from "@/lib/bigcommerce/hook-health";

const DESTINATION = "https://shop.example.com/api/bigcommerce/webhook";

vi.mock("@workspace/env/server", () => ({
  env: {
    CRON_SECRET: "test-cron-secret",
    BIGCOMMERCE_STORE_HASH: "testhash",
    BIGCOMMERCE_ADMIN_TOKEN: "test-admin-token",
    BIGCOMMERCE_WEBHOOK_DESTINATION: DESTINATION,
    HOOK_HEALTH_ALERT_WEBHOOK_URL: undefined,
  },
}));

// Spied, not replaced: a status code cannot show that the compare is constant
// time, so the right-secret case asserts the gate went through it.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const { GET } = await import("../route");

function call(authorization?: string) {
  const headers = authorization ? { authorization } : undefined;
  return GET(
    new Request("http://localhost/api/bigcommerce/hook-health", { headers })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(timingSafeEqual).mockClear();
});

describe("GET /api/bigcommerce/hook-health", () => {
  it("answers 200 to the right secret", async () => {
    const hooks = REQUIRED_HOOK_SCOPES.map((scope) => ({
      scope,
      destination: DESTINATION,
      is_active: true,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: hooks }))
    );

    const response = await call("Bearer test-cron-secret");

    expect(response.status).toBe(200);
    expect(timingSafeEqual).toHaveBeenCalledOnce();
  });

  // Wrong length is its own case: `timingSafeEqual` throws on a length
  // mismatch, so without the guard it is a 500, not a 401.
  it.each([
    ["a wrong secret of the right length", "Bearer best-cron-secret"],
    ["a wrong-length secret", "Bearer short"],
    ["no secret", undefined],
  ])("answers 401 to %s without calling BigCommerce", async (_, header) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const response = await call(header);

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
