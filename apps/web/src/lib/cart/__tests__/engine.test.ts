import { describe, expect, it } from "vitest";

import {
  applyIntent,
  fold,
  normalizeCart,
  recalcTotals,
  reverseCartLines,
} from "@/lib/cart/engine";
import {
  addIntent,
  removeIntent,
  swapIntent,
  updateIntent,
} from "@/lib/cart/intents";
import type { LineMetadata } from "@/lib/cart/types";
import type { Cart, CartLine, MoneyV2 } from "@/lib/shopify/types";

const usd = (amount: string): MoneyV2 => ({ amount, currencyCode: "USD" });

function makeLine(
  id: string,
  variantId: string,
  quantity: number,
  unitPrice: string
): CartLine {
  return {
    id,
    quantity,
    merchandise: {
      id: variantId,
      title: "Default",
      image: null,
      product: { handle: "product", title: "Product" },
      selectedOptions: [{ name: "Size", value: "M" }],
      price: usd(unitPrice),
    },
    cost: {
      amountPerQuantity: usd(unitPrice),
      totalAmount: usd((Number.parseFloat(unitPrice) * quantity).toFixed(2)),
    },
  };
}

function makeCart(lines: CartLine[]): Cart {
  return {
    id: "gid://shopify/Cart/1",
    checkoutUrl: "https://shop.example/checkout",
    totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
    lines: {
      edges: lines.map((node) => ({ node })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    cost: recalcTotals(lines),
  };
}

function makeMetadata(overrides?: Partial<LineMetadata>): LineMetadata {
  return {
    productTitle: "Product",
    productHandle: "product",
    variantTitle: "Default",
    price: usd("10.00"),
    image: null,
    selectedOptions: [{ name: "Size", value: "M" }],
    ...overrides,
  };
}

describe("fold", () => {
  it("returns null for null base with no add intents", () => {
    expect(fold(null, [])).toBeNull();
    expect(fold(null, [updateIntent("line-1", 3)])).toBeNull();
    expect(fold(null, [removeIntent("line-1")])).toBeNull();
  });

  it("builds a synthetic cart shell for null base with add intents", () => {
    const cart = fold(null, [
      addIntent("variant-1", 2, makeMetadata()),
      addIntent("variant-2", 1, makeMetadata({ price: usd("5.50") })),
    ]);
    expect(cart).not.toBeNull();
    expect(cart?.id).toBe("optimistic-cart");
    expect(cart?.checkoutUrl).toBe("");
    expect(cart?.lines.edges.map((e) => e.node.id)).toEqual([
      "optimistic-variant-1",
      "optimistic-variant-2",
    ]);
    expect(cart?.totalQuantity).toBe(3);
    expect(cart?.cost.subtotalAmount.amount).toBe("25.50");
    expect(cart?.cost.totalAmount.amount).toBe("25.50");
    expect(cart?.cost.totalTaxAmount).toBeNull();
  });

  it("bumps an existing line when adding a variant already in the cart", () => {
    const base = makeCart([makeLine("line-1", "variant-1", 1, "10.00")]);
    const cart = fold(base, [addIntent("variant-1", 2, makeMetadata())]);
    expect(cart?.lines.edges).toHaveLength(1);
    expect(cart?.lines.edges[0]?.node.quantity).toBe(3);
    expect(cart?.lines.edges[0]?.node.cost.totalAmount.amount).toBe("30.00");
    expect(cart?.totalQuantity).toBe(3);
  });

  it("appends a synthetic line for a new variant", () => {
    const base = makeCart([makeLine("line-1", "variant-1", 1, "10.00")]);
    const cart = fold(base, [
      addIntent("variant-2", 1, makeMetadata({ price: usd("4.25") })),
    ]);
    expect(cart?.lines.edges).toHaveLength(2);
    expect(cart?.lines.edges[1]?.node.id).toBe("optimistic-variant-2");
    expect(cart?.cost.subtotalAmount.amount).toBe("14.25");
  });

  it("applies update intents and recomputes totals", () => {
    const base = makeCart([
      makeLine("line-1", "variant-1", 1, "10.00"),
      makeLine("line-2", "variant-2", 2, "3.00"),
    ]);
    const cart = fold(base, [updateIntent("line-1", 5)]);
    expect(cart?.lines.edges[0]?.node.quantity).toBe(5);
    expect(cart?.lines.edges[0]?.node.cost.totalAmount.amount).toBe("50.00");
    expect(cart?.totalQuantity).toBe(7);
    expect(cart?.cost.subtotalAmount.amount).toBe("56.00");
  });

  it("applies remove intents", () => {
    const base = makeCart([
      makeLine("line-1", "variant-1", 1, "10.00"),
      makeLine("line-2", "variant-2", 2, "3.00"),
    ]);
    const cart = fold(base, [removeIntent("line-1")]);
    expect(cart?.lines.edges.map((e) => e.node.id)).toEqual(["line-2"]);
    expect(cart?.totalQuantity).toBe(2);
    expect(cart?.cost.subtotalAmount.amount).toBe("6.00");
  });

  it("removing the last line yields zero totals", () => {
    const base = makeCart([makeLine("line-1", "variant-1", 2, "9.99")]);
    const cart = fold(base, [removeIntent("line-1")]);
    expect(cart?.lines.edges).toHaveLength(0);
    expect(cart?.totalQuantity).toBe(0);
    expect(cart?.cost.subtotalAmount.amount).toBe("0.00");
  });

  it("applies swap intents replacing merchandise and price", () => {
    const base = makeCart([makeLine("line-1", "variant-1", 2, "10.00")]);
    const cart = fold(base, [
      swapIntent("line-1", "variant-9", 2, {
        variantTitle: "Large",
        price: usd("12.00"),
        selectedOptions: [{ name: "Size", value: "L" }],
      }),
    ]);
    const line = cart?.lines.edges[0]?.node;
    expect(line?.merchandise.id).toBe("variant-9");
    expect(line?.merchandise.title).toBe("Large");
    expect(line?.merchandise.selectedOptions).toEqual([
      { name: "Size", value: "L" },
    ]);
    expect(line?.cost.amountPerQuantity.amount).toBe("12.00");
    expect(line?.cost.totalAmount.amount).toBe("24.00");
    expect(cart?.cost.subtotalAmount.amount).toBe("24.00");
  });

  it("swap without metadata keeps existing display fields", () => {
    const base = makeCart([makeLine("line-1", "variant-1", 2, "10.00")]);
    const cart = fold(base, [swapIntent("line-1", "variant-9", 3)]);
    const line = cart?.lines.edges[0]?.node;
    expect(line?.merchandise.id).toBe("variant-9");
    expect(line?.merchandise.title).toBe("Default");
    expect(line?.quantity).toBe(3);
    expect(line?.cost.totalAmount.amount).toBe("30.00");
  });

  it("intents on line ids missing from the base are no-ops (reaper-safe)", () => {
    const base = makeCart([makeLine("line-1", "variant-1", 1, "10.00")]);
    const cart = fold(base, [
      updateIntent("line-gone", 5),
      removeIntent("line-gone"),
      swapIntent("line-gone", "variant-9", 2),
    ]);
    expect(cart).toEqual(base);
  });

  it("folds ordered intent sequences deterministically", () => {
    const base = makeCart([makeLine("line-1", "variant-1", 1, "10.00")]);
    const intents = [
      addIntent("variant-2", 2, makeMetadata({ price: usd("5.00") })),
      updateIntent("line-1", 4),
      addIntent("variant-2", 1, makeMetadata({ price: usd("5.00") })),
      removeIntent("line-1"),
    ];
    const cart = fold(base, intents);
    expect(cart?.lines.edges.map((e) => e.node.id)).toEqual([
      "optimistic-variant-2",
    ]);
    expect(cart?.lines.edges[0]?.node.quantity).toBe(3);
    expect(cart?.totalQuantity).toBe(3);
    expect(cart?.cost.subtotalAmount.amount).toBe("15.00");
    const refolded = fold(base, intents);
    expect(refolded).toEqual(cart);
  });

  it("never mutates the server cart", () => {
    const base = makeCart([makeLine("line-1", "variant-1", 1, "10.00")]);
    const frozen = JSON.parse(JSON.stringify(base)) as Cart;
    fold(base, [
      addIntent("variant-1", 3, makeMetadata()),
      updateIntent("line-1", 2),
      removeIntent("line-1"),
    ]);
    expect(base).toEqual(frozen);
  });
});

describe("applyIntent", () => {
  it("update recomputes line cost from amountPerQuantity", () => {
    const base = makeCart([makeLine("line-1", "variant-1", 1, "3.33")]);
    const cart = applyIntent(base, updateIntent("line-1", 3));
    expect(cart.lines.edges[0]?.node.cost.totalAmount.amount).toBe("9.99");
  });
});

describe("recalcTotals", () => {
  it("sums line totals into subtotal and total, tax null", () => {
    const cost = recalcTotals([
      makeLine("line-1", "variant-1", 3, "0.10"),
      makeLine("line-2", "variant-2", 1, "19.99"),
    ]);
    expect(cost.subtotalAmount.amount).toBe("20.29");
    expect(cost.totalAmount.amount).toBe("20.29");
    expect(cost.totalTaxAmount).toBeNull();
  });

  it("uses fallback currency for empty lines", () => {
    const cost = recalcTotals([], "EUR");
    expect(cost.subtotalAmount).toEqual({
      amount: "0.00",
      currencyCode: "EUR",
    });
  });
});

describe("reverseCartLines / normalizeCart", () => {
  it("reverses line order without mutating the input", () => {
    const base = makeCart([
      makeLine("line-1", "variant-1", 1, "1.00"),
      makeLine("line-2", "variant-2", 1, "2.00"),
    ]);
    const reversed = reverseCartLines(base);
    expect(reversed.lines.edges.map((e) => e.node.id)).toEqual([
      "line-2",
      "line-1",
    ]);
    expect(base.lines.edges.map((e) => e.node.id)).toEqual([
      "line-1",
      "line-2",
    ]);
  });

  it("normalizeCart is reverseCartLines", () => {
    const base = makeCart([
      makeLine("line-1", "variant-1", 1, "1.00"),
      makeLine("line-2", "variant-2", 1, "2.00"),
    ]);
    expect(normalizeCart(base)).toEqual(reverseCartLines(base));
  });
});
