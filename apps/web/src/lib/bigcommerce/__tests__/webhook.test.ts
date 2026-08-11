import { beforeEach, describe, expect, it } from "vitest";

import {
  claimDelivery,
  releaseDelivery,
  resetDeliveryMemory,
  routeEvent,
  secretMatches,
} from "../webhook";

/**
 * The captured `store/sku/updated` delivery from
 * `docs/research/09-webhook-payloads.md`, byte for byte. Variant 167 was picked
 * for that capture precisely because its `sku_id` (145) and its `id` (167) are
 * different numbers, so a receiver cannot read the right one by accident.
 */
const SKU_UPDATED = {
  producer: "stores/8jbhprizry",
  hash: "14cd73eb75a18497d869470ae6f6e62540be8d9a",
  created_at: 1_786_447_917,
  store_id: "1003502318",
  scope: "store/sku/updated",
  data: { type: "sku", id: 145, sku: { product_id: 180, variant_id: 167 } },
};

/** The captured `store/product/updated` delivery from the same document. */
const PRODUCT_UPDATED = {
  producer: "stores/8jbhprizry",
  hash: "64d346b71e4c02453da81c5d97cec8063a6e7a4d",
  created_at: 1_786_447_828,
  store_id: "1003502318",
  scope: "store/product/updated",
  data: { type: "product", id: 180 },
};

const SKU_ID = 145;
const VARIANT_ID = 167;
const PRODUCT_ID = 180;

describe("routeEvent on store/sku/*", () => {
  /**
   * The regression this file exists for.
   *
   * `data.id` on a sku event is the `sku_id`, not the variant id and not the
   * product id. A receiver that follows the shape of the product payload writes
   * `bigcommerceProductVariant-145` for a variant whose document is
   * `bigcommerceProductVariant-167`. Both numbers are real, so the write
   * succeeds, the document appears, and it joins to nothing — no error, at any
   * layer, ever. Nothing below this function can catch it.
   */
  it("syncs the parent product, never the sku id and never the variant id", () => {
    const route = routeEvent(SKU_UPDATED);

    expect(route).toEqual({ action: "syncProduct", entityId: PRODUCT_ID });

    // Spelled out, because both wrong answers look plausible in a payload that
    // carries all three numbers.
    expect(route).not.toMatchObject({ entityId: SKU_ID });
    expect(route).not.toMatchObject({ entityId: VARIANT_ID });
  });

  it("routes created and deleted to the same place as updated", () => {
    for (const scope of [
      "store/sku/created",
      "store/sku/deleted",
      "store/sku/updated",
    ]) {
      // A deleted variant needs the parent synced too: `syncProduct`
      // soft-deletes the variants Sanity holds that the product no longer lists.
      expect(routeEvent({ ...SKU_UPDATED, scope })).toEqual({
        action: "syncProduct",
        entityId: PRODUCT_ID,
      });
    }
  });

  it("ignores a sku event with no nested sku object rather than falling back to data.id", () => {
    const route = routeEvent({
      ...SKU_UPDATED,
      data: { type: "sku", id: SKU_ID },
    });

    expect(route).toEqual({
      action: "ignore",
      reason: "no usable entity id at data.sku.product_id",
    });
  });
});

describe("routeEvent on the product and category scopes", () => {
  it("reads data.id on the product scopes", () => {
    expect(routeEvent(PRODUCT_UPDATED)).toEqual({
      action: "syncProduct",
      entityId: PRODUCT_ID,
    });
    expect(
      routeEvent({ ...PRODUCT_UPDATED, scope: "store/product/created" })
    ).toEqual({ action: "syncProduct", entityId: PRODUCT_ID });
    expect(
      routeEvent({ ...PRODUCT_UPDATED, scope: "store/product/deleted" })
    ).toEqual({ action: "deleteProduct", entityId: PRODUCT_ID });
  });

  it("reads data.id on the category scopes", () => {
    const data = { type: "category", id: 24 };

    expect(routeEvent({ scope: "store/category/created", data })).toEqual({
      action: "syncCategory",
      entityId: 24,
    });
    expect(routeEvent({ scope: "store/category/updated", data })).toEqual({
      action: "syncCategory",
      entityId: 24,
    });
    expect(routeEvent({ scope: "store/category/deleted", data })).toEqual({
      action: "deleteCategory",
      entityId: 24,
    });
  });
});

describe("routeEvent on anything else", () => {
  /**
   * These all become a 200 at the route. A 4xx counts as a failed delivery
   * against BigCommerce's retry policy, and eleven of them deactivate the hook
   * — over an event the receiver was never going to act on.
   */
  it("ignores a scope that is registered nowhere", () => {
    expect(
      routeEvent({ scope: "store/cart/created", data: { id: 1 } })
    ).toEqual({
      action: "ignore",
      reason: "unregistered scope store/cart/created",
    });
  });

  it("ignores an inventory scope, which this receiver deliberately does not register", () => {
    expect(
      routeEvent({ scope: "store/sku/inventory/updated", data: { id: 1 } })
    ).toMatchObject({ action: "ignore" });
  });

  it.each([
    ["no scope", { data: { id: 180 } }],
    ["null", null],
    ["a non-integer id", { scope: "store/product/updated", data: { id: 1.5 } }],
    ["a string id", { scope: "store/product/updated", data: { id: "180" } }],
    ["a zero id", { scope: "store/product/updated", data: { id: 0 } }],
    ["no data", { scope: "store/product/updated" }],
  ])("ignores a payload with %s", (_label, payload) => {
    expect(routeEvent(payload)).toMatchObject({ action: "ignore" });
  });
});

describe("secretMatches", () => {
  const secret = "b19cbb1bb52e3d1a3fbcbb0e6a92c4a0";

  it("accepts the configured secret", () => {
    expect(secretMatches(secret, secret)).toBe(true);
  });

  it("rejects a wrong secret of the same length", () => {
    const wrong = `${secret.slice(0, -1)}f`;
    expect(wrong).toHaveLength(secret.length);
    expect(secretMatches(wrong, secret)).toBe(false);
  });

  /**
   * `timingSafeEqual` throws on buffers of different lengths. Without the length
   * check in front of it, a short guess produces a 500 — which BigCommerce
   * counts as a failed delivery — instead of a 401.
   */
  it("rejects a wrong-length secret without throwing", () => {
    expect(() => secretMatches("short", secret)).not.toThrow();
    expect(secretMatches("short", secret)).toBe(false);
    expect(secretMatches(`${secret}extra`, secret)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(secretMatches(null, secret)).toBe(false);
    expect(secretMatches(undefined, secret)).toBe(false);
    expect(secretMatches("", secret)).toBe(false);
  });
});

describe("delivery deduplication", () => {
  const hash = SKU_UPDATED.hash;

  beforeEach(() => {
    resetDeliveryMemory();
  });

  it("claims a delivery once and refuses the duplicate", () => {
    expect(claimDelivery(hash)).toBe(true);
    expect(claimDelivery(hash)).toBe(false);
  });

  it("lets a different event through", () => {
    expect(claimDelivery(hash)).toBe(true);
    expect(claimDelivery(PRODUCT_UPDATED.hash)).toBe(true);
  });

  /**
   * The half that keeps the retry ladder working. A failed sync gives the hash
   * back; if it did not, the 60-second retry would land on a warm instance, find
   * the hash claimed, answer 200, and the event would be gone for good — and
   * that ladder is the only repair mechanism this design has.
   */
  it("re-claims after a release", () => {
    expect(claimDelivery(hash)).toBe(true);
    releaseDelivery(hash);
    expect(claimDelivery(hash)).toBe(true);
  });

  it("evicts the oldest claims rather than growing without bound", () => {
    expect(claimDelivery(hash)).toBe(true);
    for (let i = 0; i < 256; i++) {
      claimDelivery(`filler-${i}`);
    }
    expect(claimDelivery(hash)).toBe(true);
  });
});
