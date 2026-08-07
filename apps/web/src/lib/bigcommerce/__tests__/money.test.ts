import { describe, expect, it } from "vitest";

import { formatMoney, toMoney } from "@/lib/bigcommerce/money";
import byId from "../__fixtures__/product-by-id.json";

const { price, basePrice } = byId.response.data.site.product.prices;

describe("toMoney", () => {
  it("turns BigCommerce's numeric money into the internal string shape", () => {
    expect(toMoney(price)).toEqual({ amount: "396.00", currencyCode: "GBP" });
    expect(toMoney(basePrice)).toEqual({
      amount: "495.00",
      currencyCode: "GBP",
    });
  });

  it("pads to two decimals rather than leaving a bare float", () => {
    expect(toMoney({ value: 110.6, currencyCode: "GBP" }).amount).toBe(
      "110.60"
    );
  });
});

describe("formatMoney", () => {
  it("formats the internal shape as currency", () => {
    expect(formatMoney(toMoney(basePrice))).toBe("£495.00");
  });
});
