import { describe, expect, it } from "vitest";

import type { Cart, CartLine } from "@/lib/shopify/types";
import {
  classifyTransportError,
  classifyUserErrors,
  detectSilentClamps,
  mapShopifyWarning,
  requestedFromInputs,
} from "../classify";

function line(id: string, merchandiseId: string, quantity: number): CartLine {
  return {
    id,
    quantity,
    merchandise: {
      id: merchandiseId,
      title: "Variant",
      image: null,
      product: { handle: "product", title: "Product" },
      selectedOptions: [],
      price: { amount: "10.00", currencyCode: "USD" },
    },
    cost: {
      amountPerQuantity: { amount: "10.00", currencyCode: "USD" },
      totalAmount: {
        amount: (10 * quantity).toFixed(2),
        currencyCode: "USD",
      },
    },
  };
}

function cartWith(...lines: CartLine[]): Cart {
  return {
    id: "cart-1",
    checkoutUrl: "https://shop.example/checkout",
    totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
    lines: {
      edges: lines.map((node) => ({ node })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    cost: {
      totalAmount: { amount: "0.00", currencyCode: "USD" },
      subtotalAmount: { amount: "0.00", currencyCode: "USD" },
      totalTaxAmount: null,
    },
  };
}

describe("classifyTransportError", () => {
  it("maps network kind to NETWORK", () => {
    expect(classifyTransportError("fetch failed", "network").code).toBe(
      "NETWORK"
    );
  });

  it("detects cart-gone prose regardless of kind", () => {
    expect(
      classifyTransportError("The cart does not exist", "graphql").code
    ).toBe("CART_NOT_FOUND");
    expect(
      classifyTransportError("Cart could not be found", "unknown").code
    ).toBe("CART_NOT_FOUND");
  });

  it("falls back to UNKNOWN", () => {
    expect(classifyTransportError("boom", "graphql").code).toBe("UNKNOWN");
  });
});

describe("classifyUserErrors", () => {
  it("returns null for empty errors", () => {
    expect(classifyUserErrors([])).toBeNull();
  });

  it("maps completed-cart prose to CART_COMPLETED", () => {
    expect(
      classifyUserErrors([
        { field: null, code: null, message: "Cart has already been completed" },
      ])?.code
    ).toBe("CART_COMPLETED");
  });

  it("maps variant-unavailable codes", () => {
    expect(
      classifyUserErrors([
        { field: null, code: "MERCHANDISE_NOT_FOUND", message: "Gone" },
      ])?.code
    ).toBe("VARIANT_UNAVAILABLE");
  });

  it("falls back to SHOPIFY_USER_ERROR", () => {
    expect(
      classifyUserErrors([
        { field: null, code: "SOMETHING_ELSE", message: "Nope" },
      ])?.code
    ).toBe("SHOPIFY_USER_ERROR");
  });
});

describe("mapShopifyWarning", () => {
  it("maps stock warnings to QUANTITY_CLAMPED with line target", () => {
    expect(
      mapShopifyWarning({
        code: "MERCHANDISE_NOT_ENOUGH_STOCK",
        target: "line-1",
        message: "Not enough stock",
      })
    ).toEqual({
      code: "QUANTITY_CLAMPED",
      lineId: "line-1",
      message: "Not enough stock",
    });
  });

  it("maps unknown codes to OTHER", () => {
    expect(
      mapShopifyWarning({ code: "WEIRD", target: null, message: "m" }).code
    ).toBe("OTHER");
  });
});

describe("detectSilentClamps", () => {
  it("exact update: flags any quantity mismatch", () => {
    const cart = cartWith(line("line-1", "variant-1", 3));
    const warnings = detectSilentClamps(
      cart,
      [{ key: "lineId", id: "line-1", quantity: 8, exact: true }],
      []
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe("QUANTITY_CLAMPED");
  });

  it("add without expected total misses a merge clamp (delta lower bound)", () => {
    const cart = cartWith(line("line-1", "variant-1", 6));
    const warnings = detectSilentClamps(
      cart,
      requestedFromInputs([{ merchandiseId: "variant-1", quantity: 3 }]),
      []
    );
    expect(warnings).toHaveLength(0);
  });

  it("add with expected total catches a merge clamp", () => {
    const cart = cartWith(line("line-1", "variant-1", 6));
    const warnings = detectSilentClamps(
      cart,
      requestedFromInputs(
        [{ merchandiseId: "variant-1", quantity: 3 }],
        [{ merchandiseId: "variant-1", quantity: 8 }]
      ),
      []
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "QUANTITY_CLAMPED",
      lineId: "line-1",
    });
  });

  it("no false positive when expected total matches", () => {
    const cart = cartWith(line("line-1", "variant-1", 8));
    const warnings = detectSilentClamps(
      cart,
      requestedFromInputs(
        [{ merchandiseId: "variant-1", quantity: 3 }],
        [{ merchandiseId: "variant-1", quantity: 8 }]
      ),
      []
    );
    expect(warnings).toHaveLength(0);
  });

  it("flags a dropped line", () => {
    const cart = cartWith();
    const warnings = detectSilentClamps(
      cart,
      requestedFromInputs([{ merchandiseId: "variant-1", quantity: 1 }]),
      []
    );
    expect(warnings[0]?.code).toBe("LINE_DROPPED");
  });

  it("dedupes against warnings Shopify already emitted", () => {
    const cart = cartWith(line("line-1", "variant-1", 2));
    const warnings = detectSilentClamps(
      cart,
      [{ key: "lineId", id: "line-1", quantity: 5, exact: true }],
      [{ code: "QUANTITY_CLAMPED", lineId: "line-1", message: "clamped" }]
    );
    expect(warnings).toHaveLength(0);
  });

  it("ignores invalid expected totals", () => {
    const cart = cartWith(line("line-1", "variant-1", 6));
    const warnings = detectSilentClamps(
      cart,
      requestedFromInputs(
        [{ merchandiseId: "variant-1", quantity: 3 }],
        [{ merchandiseId: "variant-1", quantity: Number.NaN }]
      ),
      []
    );
    expect(warnings).toHaveLength(0);
  });
});
