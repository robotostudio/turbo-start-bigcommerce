import { describe, expect, it } from "vitest";

import * as pdpCopy from "@/components/product/variant-utils";
import { toCardVariant } from "@/lib/bigcommerce/variant-utils";
import * as cartCopy from "@/lib/cart/variant-match";
import fixture from "../__fixtures__/product-variants-and-options.json";

// Both matcher copies run through the same cases before they are merged.
// biome-ignore lint/suspicious/noExplicitAny: pinning two copies typed differently
const COPIES: [string, any][] = [
  ["pdp", pdpCopy],
  ["cart", cartCopy],
];

// Aster Denim Coach Jacket: Size x Color, 10 variants, all £133.
const PRODUCT = fixture.response.data.site.product;
const VARIANTS = PRODUCT.variants.edges.map((edge) => toCardVariant(edge.node));

describe("variant mapper", () => {
  it("flattens a variant's options, price and stock", () => {
    expect(VARIANTS[0]).toMatchObject({
      id: "170",
      availableForSale: true,
      price: { amount: "133.00", currencyCode: "GBP" },
      selectedOptions: [
        { name: "Size", value: "XS" },
        { name: "Color", value: "Indigo Rinse" },
      ],
    });
  });

  it("is not for sale when unpurchasable or out of stock", () => {
    expect(
      toCardVariant({ entityId: 1, isPurchasable: false }).availableForSale
    ).toBe(false);
    expect(
      toCardVariant({ entityId: 1, inventory: { isInStock: false } })
        .availableForSale
    ).toBe(false);
  });

  it("treats unknown stock as for sale", () => {
    expect(
      toCardVariant({ entityId: 1, inventory: null }).availableForSale
    ).toBe(true);
  });

  it("falls back to a zero price when BigCommerce sends none", () => {
    expect(toCardVariant({ entityId: 1, prices: null }).price).toEqual({
      amount: "0.00",
      currencyCode: "",
    });
  });
});

describe.each(COPIES)("findVariantByOptions (%s copy)", (_, copy) => {
  it("matches on option name and value", () => {
    expect(
      copy.findVariantByOptions(VARIANTS, { Size: "M", Color: "Warm Stone" })
        ?.id
    ).toBe("189");
  });

  it("ignores an option the shopper has not chosen", () => {
    expect(
      copy.findVariantByOptions(VARIANTS, { Size: "", Color: "Warm Stone" })?.id
    ).toBe("186");
  });

  it("returns null for an empty selection", () => {
    expect(copy.findVariantByOptions(VARIANTS, {})).toBeNull();
    expect(copy.findVariantByOptions(VARIANTS, { Size: "" })).toBeNull();
  });

  it("returns null for an unknown combination", () => {
    expect(
      copy.findVariantByOptions(VARIANTS, { Size: "XXL", Color: "Warm Stone" })
    ).toBeNull();
  });

  it("matches option names exactly", () => {
    expect(
      copy.findVariantByOptions(VARIANTS, { color: "Warm Stone" })
    ).toBeNull();
  });
});

describe.each(COPIES)("getOptionAvailability (%s copy)", (_, copy) => {
  // S / Warm Stone sold out.
  const soldOut = VARIANTS.map((variant) =>
    variant.id === "188" ? { ...variant, availableForSale: false } : variant
  );

  it("greys out a value only under the selection it is sold out in", () => {
    expect(
      copy.getOptionAvailability(soldOut, "Size", { Color: "Warm Stone" })
    ).toEqual({ XS: true, S: false, M: true, L: true, XL: true });
    expect(
      copy.getOptionAvailability(soldOut, "Size", { Color: "Indigo Rinse" })
    ).toEqual({ XS: true, S: true, M: true, L: true, XL: true });
  });

  it("ignores the option's own current value", () => {
    expect(
      copy.getOptionAvailability(soldOut, "Color", {
        Size: "S",
        Color: "Warm Stone",
      })
    ).toEqual({ "Indigo Rinse": true, "Warm Stone": false });
  });

  it("is available if any matching variant is, whatever the order", () => {
    expect(copy.getOptionAvailability(soldOut, "Color", {})).toEqual({
      "Indigo Rinse": true,
      "Warm Stone": true,
    });
  });
});
