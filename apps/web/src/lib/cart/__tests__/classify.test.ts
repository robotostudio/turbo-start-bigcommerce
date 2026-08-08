import { describe, expect, it } from "vitest";

import type { Cart, CartLine } from "@/lib/cart/types";
import { detectSilentClamps, requestedFromInputs } from "../classify";

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

  it("dedupes against warnings already recorded", () => {
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
