import { describe, expect, it } from "vitest";

import {
  fromMerchandiseId,
  toInternalCart,
  toMerchandiseId,
} from "@/lib/bigcommerce/cart";
import { applyIntent, fold, recalcTotals } from "@/lib/cart/engine";
import {
  addIntent,
  removeIntent,
  swapIntent,
  updateIntent,
} from "@/lib/cart/intents";
import type { LineMetadata } from "@/lib/cart/types";
import createMutation from "../__fixtures__/cart-create-mutation.json";
import digital from "../__fixtures__/cart-digital.json";
import mixed from "../__fixtures__/cart-mixed.json";
import physical from "../__fixtures__/cart-physical.json";

const CAP = "191:235";
const GUIDE = "193:237";

function makeMetadata(overrides?: Partial<LineMetadata>): LineMetadata {
  return {
    productTitle: "Product",
    productHandle: "product",
    variantTitle: "Default",
    price: { amount: "42.00", currencyCode: "GBP" },
    image: null,
    selectedOptions: [],
    ...overrides,
  };
}

describe("toInternalCart", () => {
  it("merges physical and digital items into one line list", () => {
    const cart = toInternalCart(mixed.response.data.site.cart);
    expect(cart.lines.edges.map((e) => e.node.merchandise.id)).toEqual([
      CAP,
      GUIDE,
    ]);
    expect(cart.totalQuantity).toBe(3);
  });

  it("normalises a physical-only cart", () => {
    const cart = toInternalCart(physical.response.data.site.cart);
    expect(cart.lines.edges).toHaveLength(1);
    expect(cart.id).toBe("6be6e5fb-a98b-418b-9295-b1fec263d0d3");
    expect(cart.cost.subtotalAmount).toEqual({
      amount: "84.00",
      currencyCode: "GBP",
    });
    expect(cart.cost.totalTaxAmount).toBeNull();
  });

  it("normalises a digital-only cart, whose items lack physical-only fields", () => {
    const cart = toInternalCart(digital.response.data.site.cart);
    expect(cart.lines.edges).toHaveLength(1);
    expect(cart.lines.edges[0]?.node.merchandise.id).toBe(GUIDE);
  });

  it("reads the write envelope's cart identically to the read path", () => {
    expect(
      toInternalCart(createMutation.response.data.cart.createCart.cart)
    ).toEqual(toInternalCart(physical.response.data.site.cart));
  });

  it("maps a line onto the internal shape", () => {
    const line = toInternalCart(mixed.response.data.site.cart).lines.edges[0]
      ?.node;
    expect(line?.id).toBe("8ec971bd-a046-4fcd-a524-eecebe7ae1a7");
    expect(line?.quantity).toBe(2);
    expect(line?.merchandise.title).toBe("One Size / Washed Black");
    expect(line?.merchandise.product).toEqual({
      handle: "wren-washed-cap",
      title: "Wren Washed Cap",
    });
    expect(line?.merchandise.selectedOptions).toEqual([
      { name: "Size", value: "One Size" },
      { name: "Color", value: "Washed Black" },
    ]);
    expect(line?.merchandise.price).toEqual({
      amount: "42.00",
      currencyCode: "GBP",
    });
    expect(line?.cost.totalAmount).toEqual({
      amount: "84.00",
      currencyCode: "GBP",
    });
  });

  it("derives a bare handle from either product path shape", () => {
    const handles = toInternalCart(
      mixed.response.data.site.cart
    ).lines.edges.map((e) => e.node.merchandise.product.handle);
    expect(handles).toEqual([
      "wren-washed-cap",
      "turbo-start-care-guide-digital",
    ]);
  });

  it("falls back to a bare product id when the item has no variant", () => {
    expect(toMerchandiseId({ productEntityId: 193 })).toBe("193");
    expect(
      toMerchandiseId({ productEntityId: 193, variantEntityId: 237 })
    ).toBe(GUIDE);
  });

  it("fromMerchandiseId round-trips both id shapes and rejects junk", () => {
    expect(fromMerchandiseId(GUIDE)).toEqual({
      productEntityId: 193,
      variantEntityId: 237,
    });
    expect(fromMerchandiseId("193")).toEqual({ productEntityId: 193 });
    expect(fromMerchandiseId("")).toBeNull();
    expect(fromMerchandiseId("abc")).toBeNull();
    expect(fromMerchandiseId("193:abc")).toBeNull();
    expect(fromMerchandiseId("193:237:1")).toBeNull();
    expect(fromMerchandiseId("gid://shopify/ProductVariant/42")).toBeNull();
  });

  it("recalcTotals agrees with the totals BigCommerce reported", () => {
    const cart = toInternalCart(mixed.response.data.site.cart);
    expect(
      recalcTotals(cart.lines.edges.map((e) => e.node)).totalAmount
    ).toEqual(cart.cost.totalAmount);
  });
});

describe("the cart engine running on a normalised BigCommerce cart", () => {
  const base = toInternalCart(mixed.response.data.site.cart);

  it("bumps the matching line instead of appending a synthetic one", () => {
    const cart = fold(base, [addIntent(CAP, 1, makeMetadata())]);
    expect(cart?.lines.edges).toHaveLength(2);
    expect(cart?.lines.edges[0]?.node.quantity).toBe(3);
    expect(cart?.lines.edges[0]?.node.cost.totalAmount.amount).toBe("126.00");
    expect(cart?.totalQuantity).toBe(4);
    expect(cart?.cost.subtotalAmount.amount).toBe("138.00");
  });

  it("appends a synthetic line for a merchandise id not in the cart", () => {
    const cart = fold(base, [addIntent("191:236", 1, makeMetadata())]);
    expect(cart?.lines.edges).toHaveLength(3);
    expect(cart?.lines.edges[2]?.node.id).toBe("optimistic-191:236");
  });

  it("updates and removes by the BigCommerce line-item uuid", () => {
    const lineId = "4898356e-b3b0-4a28-af65-41aa4682ead9";
    expect(applyIntent(base, updateIntent(lineId, 4)).totalQuantity).toBe(6);
    const removed = fold(base, [removeIntent(lineId)]);
    expect(removed?.lines.edges.map((e) => e.node.merchandise.id)).toEqual([
      CAP,
    ]);
    expect(removed?.cost.subtotalAmount.amount).toBe("84.00");
  });

  it("swaps in a merchandise id supplied by the caller", () => {
    const cart = fold(base, [
      swapIntent("8ec971bd-a046-4fcd-a524-eecebe7ae1a7", "191:236", 2),
    ]);
    expect(cart?.lines.edges[0]?.node.merchandise.id).toBe("191:236");
    expect(cart?.lines.edges[0]?.node.cost.totalAmount.amount).toBe("84.00");
  });

  it("folds a sequence without mutating the normalised cart", () => {
    const frozen = structuredClone(base);
    fold(base, [
      addIntent(CAP, 2, makeMetadata()),
      updateIntent("8ec971bd-a046-4fcd-a524-eecebe7ae1a7", 1),
      removeIntent("4898356e-b3b0-4a28-af65-41aa4682ead9"),
    ]);
    expect(base).toEqual(frozen);
  });
});
