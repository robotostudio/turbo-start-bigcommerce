import { describe, expect, it } from "vitest";

import { fromMerchandiseId } from "@/lib/bigcommerce/cart";
import {
  colorGallery,
  findVariantByOptions,
  getOptionAvailability,
  productVariants,
  resolveSelection,
  toProductOptions,
  toProductVariant,
  variantGalleryImage,
} from "@/lib/bigcommerce/product-model";
import imageOverride from "../__fixtures__/product-variant-image-override.json";
import fixture from "../__fixtures__/product-variants-and-options.json";

// Aster Denim Coach Jacket: Size x Color, 10 variants, all £133.
const PRODUCT = fixture.response.data.site.product;
const VARIANTS = productVariants(PRODUCT);
const OPTIONS = toProductOptions(
  (PRODUCT.productOptions.edges ?? []).map((edge) => edge.node)
);

describe("toProductVariant", () => {
  it("flattens a variant's options, price and stock", () => {
    expect(VARIANTS[0]).toMatchObject({
      id: "170",
      title: "XS / Indigo Rinse",
      availableForSale: true,
      price: { amount: "133.00", currencyCode: "GBP" },
      selectedOptions: [
        { name: "Size", value: "XS" },
        { name: "Color", value: "Indigo Rinse" },
      ],
    });
  });

  it("builds the cart id from the product and the variant", () => {
    expect(VARIANTS[0]?.merchandiseId).toBe("183:170");
    expect(fromMerchandiseId(VARIANTS[0]?.merchandiseId ?? "")).toEqual({
      productEntityId: 183,
      variantEntityId: 170,
    });
  });

  it("carries the variant's own photo", () => {
    expect(
      toProductVariant(1, { entityId: 2, defaultImage: { url: "x.png" } }).image
    ).toEqual({ url: "x.png" });
    expect(toProductVariant(1, { entityId: 2 }).image).toBeNull();
  });

  it("is not for sale when unpurchasable or out of stock", () => {
    expect(
      toProductVariant(1, { entityId: 2, isPurchasable: false })
        .availableForSale
    ).toBe(false);
    expect(
      toProductVariant(1, { entityId: 2, inventory: { isInStock: false } })
        .availableForSale
    ).toBe(false);
  });

  it("treats unknown stock as for sale", () => {
    expect(
      toProductVariant(1, { entityId: 2, inventory: null }).availableForSale
    ).toBe(true);
  });

  it("falls back to a zero price when BigCommerce sends none", () => {
    expect(toProductVariant(1, { entityId: 2, prices: null }).price).toEqual({
      amount: "0.00",
      currencyCode: "",
    });
  });
});

describe("toProductOptions", () => {
  it("maps values with their swatch hex", () => {
    expect(OPTIONS.map((option) => option.name)).toEqual(["Size", "Color"]);
    expect(OPTIONS[0]?.values[0]).toEqual({ value: "XS", hex: null });
    expect(OPTIONS[1]?.values[0]).toEqual({
      value: "Indigo Rinse",
      hex: "#2C3E5D",
    });
  });

  it("drops an option with nothing to choose from", () => {
    // A text or date option has no `values`: no selector can render it and no
    // variant is keyed on it.
    expect(
      toProductOptions([{ entityId: 9, displayName: "Engraving" }])
    ).toEqual([]);
  });
});

describe("findVariantByOptions", () => {
  it("matches on option name and value", () => {
    expect(
      findVariantByOptions(VARIANTS, { Size: "M", Color: "Warm Stone" })?.id
    ).toBe("189");
  });

  it("ignores an option the shopper has not chosen", () => {
    expect(
      findVariantByOptions(VARIANTS, { Size: "", Color: "Warm Stone" })?.id
    ).toBe("186");
  });

  it("returns null for an empty selection", () => {
    expect(findVariantByOptions(VARIANTS, {})).toBeNull();
    expect(findVariantByOptions(VARIANTS, { Size: "" })).toBeNull();
  });

  it("returns null for an unknown combination", () => {
    expect(
      findVariantByOptions(VARIANTS, { Size: "XXL", Color: "Warm Stone" })
    ).toBeNull();
  });

  it("matches option names exactly", () => {
    expect(findVariantByOptions(VARIANTS, { color: "Warm Stone" })).toBeNull();
  });
});

describe("getOptionAvailability", () => {
  // S / Warm Stone sold out.
  const soldOut = VARIANTS.map((variant) =>
    variant.id === "188" ? { ...variant, availableForSale: false } : variant
  );

  it("greys out a value only under the selection it is sold out in", () => {
    expect(
      getOptionAvailability(soldOut, "Size", { Color: "Warm Stone" })
    ).toEqual({ XS: true, S: false, M: true, L: true, XL: true });
    expect(
      getOptionAvailability(soldOut, "Size", { Color: "Indigo Rinse" })
    ).toEqual({ XS: true, S: true, M: true, L: true, XL: true });
  });

  it("ignores the option's own current value", () => {
    expect(
      getOptionAvailability(soldOut, "Color", {
        Size: "S",
        Color: "Warm Stone",
      })
    ).toEqual({ "Indigo Rinse": true, "Warm Stone": false });
  });

  it("is available if any matching variant is, whatever the order", () => {
    expect(getOptionAvailability(soldOut, "Color", {})).toEqual({
      "Indigo Rinse": true,
      "Warm Stone": true,
    });
  });
});

describe("variantGalleryImage", () => {
  // The capture carries the gallery's alt text and each variant's override,
  // which lives under `attribute_rule_images/` and is never in the gallery.
  const ASTER = imageOverride.response.data.site.multiColour;
  const GALLERY = ASTER.images.edges.map((edge) => edge.node);
  const variants = productVariants(ASTER);
  const warm = findVariantByOptions(variants, { Color: "Warm Stone" });

  it("points at the chosen colour's first photo in the gallery", () => {
    const firstWarm = GALLERY.find((image) =>
      image.altText.endsWith("Warm Stone")
    );
    expect(warm && variantGalleryImage(warm, OPTIONS, GALLERY)).toBe(
      firstWarm?.url
    );
  });

  it("never points at a URL the gallery does not hold", () => {
    const urls = GALLERY.map((image) => image.url);
    for (const variant of variants) {
      const url = variantGalleryImage(variant, OPTIONS, GALLERY);
      expect(url === undefined || urls.includes(url)).toBe(true);
    }
  });

  it("returns undefined for a product without a colour option", () => {
    expect(
      warm &&
        variantGalleryImage(
          warm,
          OPTIONS.filter((option) => option.name !== "Color"),
          GALLERY
        )
    ).toBeUndefined();
  });
});

describe("colorGallery", () => {
  const gallery = [
    { url: "tan", altText: "Tailored Blazer in Tan" },
    { url: "fit", altText: "Standard fit" },
    { url: "red", altText: "Blazer in RED" },
  ];

  it("matches a colour as a whole word, ignoring case", () => {
    // "Red" sits inside "Tailored", "Tan" inside "Standard".
    expect(colorGallery(gallery, "Red", ["Red", "Tan"])).toEqual([gallery[2]]);
    expect(colorGallery(gallery, "Tan", ["Red", "Tan"])).toEqual([gallery[0]]);
  });

  it("reads a colour name with regex characters literally", () => {
    const plus = [{ url: "x", altText: "Shirt in Blue+ (Navy)" }];
    expect(colorGallery(plus, "Blue+ (Navy)", ["Blue+ (Navy)"])).toEqual(plus);
  });
});

describe("resolveSelection", () => {
  const params = (query: string) => new URLSearchParams(query);

  it("lands a bare URL on the default variant", () => {
    expect(resolveSelection(OPTIONS, VARIANTS, params(""))).toEqual({
      complete: true,
      selections: { Size: "XS", Color: "Indigo Rinse" },
      variant: VARIANTS[0],
    });
  });

  it("takes an option missing from the URL from the default variant", () => {
    const { variant, selections } = resolveSelection(
      OPTIONS,
      VARIANTS,
      params("Color=Warm+Stone")
    );
    expect(variant?.id).toBe("186");
    expect(selections).toEqual({ Size: "XS", Color: "Warm Stone" });
  });

  it("falls back to the first buyable variant in the URL's colour", () => {
    // Warm Stone has no XS, and S is sold out.
    const variants = VARIANTS.filter((variant) => variant.id !== "186").map(
      (variant) =>
        variant.id === "188" ? { ...variant, availableForSale: false } : variant
    );
    const { complete, variant, selections } = resolveSelection(
      OPTIONS,
      variants,
      params("Color=Warm+Stone")
    );
    expect(variant?.id).toBe("189");
    expect(selections).toEqual({ Size: "M", Color: "Warm Stone" });
    expect(complete).toBe(true);
  });

  it("is incomplete when the URL names a combination that doesn't exist", () => {
    const variants = VARIANTS.filter((variant) => variant.id !== "186");
    expect(
      resolveSelection(OPTIONS, variants, params("Color=Warm+Stone&Size=XS"))
        .complete
    ).toBe(false);
  });

  it("is incomplete while a multi-value option has no value", () => {
    // No variant carries Fit, so nothing can default it.
    const fit = {
      id: "fit",
      name: "Fit",
      values: [
        { value: "Regular", hex: null },
        { value: "Slim", hex: null },
      ],
    };
    const { complete, selections } = resolveSelection(
      [...OPTIONS, fit],
      VARIANTS,
      params("")
    );
    expect(selections.Fit).toBe("");
    expect(complete).toBe(false);
  });
});
