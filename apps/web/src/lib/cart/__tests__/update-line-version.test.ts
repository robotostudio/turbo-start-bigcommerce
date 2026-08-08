import { describe, expect, it, vi } from "vitest";

/**
 * The one thing the controller tests cannot see: that the version a tab sends
 * actually reaches BigCommerce's mutation input. Delete `version` from that
 * input and every other cart test still passes while the guard quietly becomes
 * a no-op.
 *
 * The transport is mocked to fail, because the assertion is on what went out,
 * not on what came back.
 */

let sentInput: { version?: number } | undefined;

const storefrontQuery = vi.fn(
  (
    _document: unknown,
    options?: { variables?: { input?: typeof sentInput } }
  ) => {
    sentInput = options?.variables?.input;
    return Promise.resolve({
      ok: false as const,
      kind: "network" as const,
      error: "transport stubbed out",
    });
  }
);

// The action's import graph reaches `server-only`, which throws outside a
// server component, and the env schema, by way of a sibling action in the same
// file that reads the catalog. Neither is what this asserts.
vi.mock("server-only", () => ({}));
vi.mock("@workspace/env/server", () => ({ env: {} }));
vi.mock("@/lib/bigcommerce/client", () => ({ storefrontQuery }));
vi.mock("@/lib/cart/server", () => ({
  getCartId: () => Promise.resolve("cart-1"),
  setCartId: vi.fn(),
  clearCartId: vi.fn(),
}));

const { updateCartLine } = await import("@/app/cart/actions");

describe("updateCartLine version wiring", () => {
  it("puts the caller's version in the mutation input", async () => {
    await updateCartLine("line-1", 3, "190:232", 7);
    expect(sentInput).toMatchObject({ version: 7 });
  });

  it("leaves it out for a cart that reports no version", async () => {
    await updateCartLine("line-1", 3, "190:232", null);
    expect(sentInput?.version).toBeUndefined();
  });
});
