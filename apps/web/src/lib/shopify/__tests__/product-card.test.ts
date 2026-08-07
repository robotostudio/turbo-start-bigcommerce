import { describe, expect, it } from "vitest";

import type { CardVariant } from "@/components/product/product-card";
import {
  cardPricing,
  findCardVariant,
  resolveCardImages,
} from "@/lib/shopify/product-card";

const price = { amount: "10.00", currencyCode: "GBP" };

const img = (url: string) => ({ url });

/** Builds a variant from "Color/Size" plus an optional variant photo. */
function variant(
  color: string,
  size: string,
  imageUrl?: string,
  overrides: Partial<CardVariant> = {}
): CardVariant {
  return {
    id: `${color}-${size}`,
    availableForSale: true,
    price,
    selectedOptions: [
      { name: "Color", value: color },
      { name: "Size", value: size },
    ],
    image: imageUrl ? img(imageUrl) : null,
    ...overrides,
  };
}

// Two colors, two photos each — the layout resolveCardImages is built around.
const NAVY_A = "navy-a.jpg";
const NAVY_B = "navy-b.jpg";
const SAND_A = "sand-a.jpg";
const SAND_B = "sand-b.jpg";
const GALLERY = [NAVY_A, NAVY_B, SAND_A, SAND_B];
const VARIANTS = [
  variant("Navy", "S", NAVY_A),
  variant("Navy", "M", NAVY_A),
  variant("Sand", "S", SAND_A),
  variant("Sand", "M", SAND_A),
];

const base = {
  variants: VARIANTS,
  galleryUrls: GALLERY,
  imageUrl: NAVY_A,
  secondaryImageUrl: NAVY_B,
};

describe("resolveCardImages", () => {
  it("swaps to the selected color's variant photo", () => {
    expect(resolveCardImages({ ...base, selectedColor: "Sand" })).toEqual({
      primary: SAND_A,
      secondary: SAND_B,
    });
  });

  it("uses the next gallery image as the hover partner", () => {
    expect(resolveCardImages({ ...base, selectedColor: "Navy" })).toEqual({
      primary: NAVY_A,
      secondary: NAVY_B,
    });
  });

  it("does not cross-fade into the next color when a color has one photo", () => {
    // Navy has a single photo, so the next gallery entry opens Sand's group.
    const gallery = [NAVY_A, SAND_A, SAND_B];
    const result = resolveCardImages({
      selectedColor: "Navy",
      variants: [variant("Navy", "S", NAVY_A), variant("Sand", "S", SAND_A)],
      galleryUrls: gallery,
      imageUrl: NAVY_A,
      secondaryImageUrl: SAND_A,
    });
    expect(result).toEqual({ primary: NAVY_A, secondary: null });
  });

  it("has no hover partner for the last image in the gallery", () => {
    const result = resolveCardImages({
      ...base,
      selectedColor: "Sand",
      galleryUrls: [NAVY_A, NAVY_B, SAND_A],
    });
    expect(result).toEqual({ primary: SAND_A, secondary: null });
  });

  it("keeps the product-level hover when the photo is outside the gallery window", () => {
    const result = resolveCardImages({
      ...base,
      selectedColor: "Sand",
      galleryUrls: [NAVY_A, NAVY_B],
    });
    expect(result).toEqual({ primary: SAND_A, secondary: NAVY_B });
  });

  it("falls back to the product images when the color has no photo", () => {
    const result = resolveCardImages({
      ...base,
      selectedColor: "Sand",
      variants: [variant("Navy", "S", NAVY_A), variant("Sand", "S")],
    });
    expect(result).toEqual({ primary: NAVY_A, secondary: NAVY_B });
  });

  it("falls back when no color is selected", () => {
    expect(resolveCardImages({ ...base, selectedColor: undefined })).toEqual({
      primary: NAVY_A,
      secondary: NAVY_B,
    });
  });

  it("falls back when the product has no variants", () => {
    expect(
      resolveCardImages({ ...base, selectedColor: "Sand", variants: [] })
    ).toEqual({ primary: NAVY_A, secondary: NAVY_B });
  });

  it("normalises a missing secondary to null", () => {
    const result = resolveCardImages({
      ...base,
      selectedColor: undefined,
      secondaryImageUrl: undefined,
    });
    expect(result).toEqual({ primary: NAVY_A, secondary: null });
  });

  // Storefront's ProductVariant.image "falls back to the product image if no
  // image is available", so a color with no photo reports one anyway. An image
  // claimed by two colors is that fallback, not a photo of either.
  describe("inherited product images", () => {
    const HERO = "product-hero.jpg";

    it("ignores an image claimed by more than one color", () => {
      const result = resolveCardImages({
        selectedColor: "Sand",
        variants: [variant("Navy", "S", HERO), variant("Sand", "S", HERO)],
        galleryUrls: [HERO, "gallery-02.jpg"],
        imageUrl: HERO,
        secondaryImageUrl: "product-secondary.jpg",
      });
      // Without detection this would walk the gallery to "gallery-02.jpg".
      expect(result).toEqual({
        primary: HERO,
        secondary: "product-secondary.jpg",
      });
    });

    it("falls back for every color once an image is shared", () => {
      // Navy really does own NAVY_A, but Sand inheriting it makes the two
      // indistinguishable — falling back is the safe read.
      const variants = [
        variant("Navy", "S", NAVY_A),
        variant("Sand", "S", NAVY_A),
      ];
      for (const color of ["Navy", "Sand"]) {
        expect(
          resolveCardImages({ ...base, selectedColor: color, variants })
        ).toEqual({ primary: NAVY_A, secondary: NAVY_B });
      }
    });

    it("still resolves a single-color product", () => {
      // One color claiming the image is indistinguishable from inheritance, but
      // the resulting photo is the same either way.
      const result = resolveCardImages({
        selectedColor: "Navy",
        variants: [variant("Navy", "S", NAVY_A), variant("Navy", "M", NAVY_A)],
        galleryUrls: GALLERY,
        imageUrl: NAVY_A,
        secondaryImageUrl: NAVY_B,
      });
      expect(result).toEqual({ primary: NAVY_A, secondary: NAVY_B });
    });

    it("treats an inherited next image as a hover partner, not a boundary", () => {
      // HERO is claimed by both colors, so it opens no color group and stays
      // eligible as Navy's cross-fade partner.
      const result = resolveCardImages({
        selectedColor: "Navy",
        variants: [
          variant("Navy", "S", NAVY_A),
          variant("Navy", "M", HERO),
          variant("Sand", "S", HERO),
        ],
        galleryUrls: [NAVY_A, HERO],
        imageUrl: NAVY_A,
        secondaryImageUrl: HERO,
      });
      expect(result).toEqual({ primary: NAVY_A, secondary: HERO });
    });
  });

  it("ignores a size whose value collides with the selected color", () => {
    // A size literally named "Sand" must not be mistaken for the color.
    const odd: CardVariant = {
      id: "collide",
      availableForSale: true,
      price,
      selectedOptions: [
        { name: "Color", value: "Navy" },
        { name: "Size", value: "Sand" },
      ],
      image: img("wrong.jpg"),
    };
    const result = resolveCardImages({
      ...base,
      selectedColor: "Sand",
      variants: [odd, variant("Sand", "S", SAND_A)],
    });
    expect(result.primary).toBe(SAND_A);
  });
});

describe("cardPricing", () => {
  const flat = { minVariantPrice: 50, maxVariantPrice: 50 };
  const ranged = { minVariantPrice: 50, maxVariantPrice: 80 };

  it("shows a price range without a strikethrough", () => {
    // The range max is not a discount; striking it through invents one.
    const result = cardPricing(ranged, null, "GBP");
    expect(result.rangePrice).toBe("£80.00");
    expect(result.strikePrice).toBeNull();
    expect(result.salePercent).toBe(0);
  });

  it("strikes through a genuine compare-at price", () => {
    const result = cardPricing(flat, 100, "GBP");
    expect(result.strikePrice).toBe("£100.00");
    expect(result.rangePrice).toBeNull();
    expect(result.salePercent).toBe(50);
  });

  it("prefers the discount over the range when both apply", () => {
    const result = cardPricing(ranged, 100, "GBP");
    expect(result.strikePrice).toBe("£100.00");
    expect(result.rangePrice).toBeNull();
  });

  it("ignores a compare-at price at or below the current price", () => {
    for (const compareAt of [50, 40]) {
      const result = cardPricing(flat, compareAt, "GBP");
      expect(result.strikePrice).toBeNull();
      expect(result.salePercent).toBe(0);
    }
  });

  it("shows neither figure for a flat, undiscounted price", () => {
    const result = cardPricing(flat, null, "GBP");
    expect(result.price).toBe("£50.00");
    expect(result.strikePrice).toBeNull();
    expect(result.rangePrice).toBeNull();
  });
});

describe("findCardVariant", () => {
  it("matches on both color and size", () => {
    expect(findCardVariant(VARIANTS, "Sand", "M")?.id).toBe("Sand-M");
  });

  it("matches per option type, not on bare values", () => {
    const odd: CardVariant = {
      id: "collide",
      availableForSale: true,
      price,
      selectedOptions: [
        { name: "Color", value: "M" },
        { name: "Size", value: "Navy" },
      ],
    };
    // The old value-only match would have returned `collide` here.
    expect(findCardVariant([odd, ...VARIANTS], "Navy", "M")?.id).toBe("Navy-M");
  });

  it("ignores an unset selection", () => {
    expect(findCardVariant(VARIANTS, "Sand", undefined)?.id).toBe("Sand-S");
  });

  it("returns undefined for an unknown combination", () => {
    expect(findCardVariant(VARIANTS, "Sand", "XL")).toBeUndefined();
  });

  it("returns undefined when there are no variants", () => {
    expect(findCardVariant([], "Sand", "M")).toBeUndefined();
    expect(findCardVariant(undefined, "Sand", "M")).toBeUndefined();
  });
});
