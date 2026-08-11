import { describe, expect, it } from "vitest";

import {
  type BigCommerceHook,
  diffHooks,
  REQUIRED_HOOK_SCOPES,
} from "@/lib/bigcommerce/hook-health";

/**
 * The whole point of the hook-health check is that a dead hook looks like a
 * quiet one. If this comparison stops flagging a missing or switched-off hook,
 * nothing else in the system says a word — the receiver is never called, so it
 * cannot log, and the storefront keeps serving the last synced state.
 */

const DESTINATION = "https://shop.example.com/api/bigcommerce/webhook";

function hooksFor(
  scopes: readonly string[],
  overrides: Partial<BigCommerceHook> = {}
): BigCommerceHook[] {
  return scopes.map((scope) => ({
    scope,
    destination: DESTINATION,
    is_active: true,
    ...overrides,
  }));
}

describe("diffHooks", () => {
  it("passes a full, active hook set", () => {
    expect(diffHooks(hooksFor(REQUIRED_HOOK_SCOPES), DESTINATION)).toEqual({
      missing: [],
      inactive: [],
      healthy: true,
    });
  });

  it("reports a scope nobody registered as missing", () => {
    const withoutSkuUpdated = REQUIRED_HOOK_SCOPES.filter(
      (scope) => scope !== "store/sku/updated"
    );

    const health = diffHooks(hooksFor(withoutSkuUpdated), DESTINATION);

    expect(health.missing).toEqual(["store/sku/updated"]);
    expect(health.healthy).toBe(false);
  });

  it("reports a hook BigCommerce switched off as inactive", () => {
    const hooks = hooksFor(REQUIRED_HOOK_SCOPES).map((hook) =>
      hook.scope === "store/product/updated"
        ? { ...hook, is_active: false }
        : hook
    );

    const health = diffHooks(hooks, DESTINATION);

    expect(health.inactive).toEqual(["store/product/updated"]);
    expect(health.missing).toEqual([]);
    expect(health.healthy).toBe(false);
  });

  // The token used to poll only sees hooks owned by its own API account, so an
  // empty list is a real answer, and it is not a healthy one.
  it("reads an empty list as every scope missing", () => {
    const health = diffHooks([], DESTINATION);

    expect(health.missing).toEqual([...REQUIRED_HOOK_SCOPES]);
    expect(health.healthy).toBe(false);
  });

  // Local development registers the same nine scopes against a tunnel on the
  // same store. Those must not stand in for production's.
  it("does not count a hook pointing somewhere else", () => {
    const tunnel = hooksFor(REQUIRED_HOOK_SCOPES, {
      destination:
        "https://some-tunnel.trycloudflare.com/api/bigcommerce/webhook",
    });

    const health = diffHooks(tunnel, DESTINATION);

    expect(health.missing).toEqual([...REQUIRED_HOOK_SCOPES]);
    expect(health.healthy).toBe(false);
  });

  it("treats a trailing slash as the same destination", () => {
    const health = diffHooks(hooksFor(REQUIRED_HOOK_SCOPES), `${DESTINATION}/`);

    expect(health.healthy).toBe(true);
  });
});
