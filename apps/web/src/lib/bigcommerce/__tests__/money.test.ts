import { describe, expect, it } from "vitest";

import { formatMoney, toMoney } from "@/lib/bigcommerce/money";
import { toCardVariant } from "@/lib/bigcommerce/variant-utils";
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

  /**
   * `Intl.NumberFormat(locale, { style: "currency", currency: "" })` throws
   * `RangeError: Invalid currency code`, and the empty code is one this app
   * mints itself — `toCardVariant` falls back to it for a variant BigCommerce
   * returns with no `prices` node. On the PDP that variant is the default one,
   * so the throw took the whole product page down.
   *
   * A dash rather than the bare amount: the amount is `0.00` in every case that
   * can reach this, and a product priced 0.00 reads as free, which is a quieter
   * lie than the crash it replaces.
   */
  it("says the price is unavailable rather than throwing on a missing code", () => {
    expect(formatMoney({ amount: "12.00", currencyCode: "" })).toBe("—");
  });

  it("says the same on a code Intl rejects", () => {
    expect(formatMoney({ amount: "12.00", currencyCode: "POUNDS" })).toBe("—");
  });

  it("does not price a variant with no prices at zero", () => {
    const variant = toCardVariant({ entityId: 1, prices: null });

    expect(formatMoney(variant.price)).toBe("—");
  });
});
