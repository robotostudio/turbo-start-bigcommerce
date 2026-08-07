import { describe, expect, it } from "vitest";

import type { CardVariant } from "@/components/product/product-card";
import {
  cardPricing,
  findCardVariant,
  productToCardProps,
  resolveCardImages,
} from "@/lib/bigcommerce/product-card";
import { getCardOptions } from "@/lib/bigcommerce/options";
import { toCardVariant } from "@/lib/bigcommerce/variant-utils";
import byId from "../__fixtures__/product-by-id.json";
import byPath from "../__fixtures__/product-by-path.json";
import variantsAndOptions from "../__fixtures__/product-variants-and-options.json";
import imageOverride from "../__fixtures__/product-variant-image-override.json";

// Aster Denim Coach Jacket: Size x Color over two colourways, every variant
// carrying its own image override. Read from the capture, never rewritten.
const ASTER = imageOverride.response.data.site.multiColour;
const WREN = imageOverride.response.data.site.singleVariant;

const GALLERY = ASTER.images.edges.map((edge) => edge.node);
const VARIANTS = ASTER.variants.edges.map((edge) => toCardVariant(edge.node));
const COLORS = ["Indigo Rinse", "Warm Stone"];

const INDIGO = GALLERY.filter((image) =>
  image.altText.endsWith("Indigo Rinse")
);
const WARM = GALLERY.filter((image) => image.altText.endsWith("Warm Stone"));

/** The override the card shows for a colourway: its first variant's image. */
const overrideFor = (color: string) =>
  findCardVariant(VARIANTS, color, undefined)?.image?.url;

const HERO = ASTER.defaultImage.url;
const HERO_SECOND = INDIGO[1]?.url ?? null;

const base = {
  colors: COLORS,
  variants: VARIANTS,
  gallery: GALLERY,
  imageUrl: HERO,
  secondaryImageUrl: HERO_SECOND,
};

describe("BigCommerce image model", () => {
  it("never lists a variant's override among the product's own images", () => {
    // The premise the fork's 76-line heuristic was built on — find the variant
    // photo in the product image list — cannot hold here.
    const productUrls = new Set(GALLERY.map((image) => image.url));
    const overrides = ASTER.variants.edges.map(
      (edge) => edge.node.defaultImage.url
    );
    expect(overrides).toHaveLength(10);
    for (const url of overrides) {
      expect(url).toContain("/attribute_rule_images/");
      expect(productUrls.has(url)).toBe(false);
    }
  });

  it("overrides on a single-variant, single-option product too", () => {
    const [only] = WREN.variants.edges;
    const productUrls = WREN.images.edges.map((edge) => edge.node.url);
    expect(only?.node.defaultImage.url).toContain("/attribute_rule_images/");
    expect(productUrls).not.toContain(only?.node.defaultImage.url);
  });
});

describe("resolveCardImages", () => {
  it("swaps to the selected color's variant photo", () => {
    expect(resolveCardImages({ ...base, selectedColor: "Warm Stone" })).toEqual(
      {
        primary: overrideFor("Warm Stone"),
        secondary: WARM[1]?.url,
      }
    );
  });

  it("uses the next gallery image as the hover partner", () => {
    // The override stands in for the colourway's first photo, so the
    // cross-fade partner is that group's second.
    expect(
      resolveCardImages({ ...base, selectedColor: "Indigo Rinse" })
    ).toEqual({
      primary: overrideFor("Indigo Rinse"),
      secondary: INDIGO[1]?.url,
    });
  });

  it("does not cross-fade into the next color when a color has one photo", () => {
    const gallery = [INDIGO[0], ...WARM].filter((image) => image !== undefined);
    const result = resolveCardImages({
      ...base,
      selectedColor: "Indigo Rinse",
      gallery,
    });
    expect(result).toEqual({
      primary: overrideFor("Indigo Rinse"),
      secondary: null,
    });
  });

  it("has no hover partner for the last image in the gallery", () => {
    const gallery = [...INDIGO, WARM[0]].filter((image) => image !== undefined);
    const result = resolveCardImages({
      ...base,
      selectedColor: "Warm Stone",
      gallery,
    });
    expect(result).toEqual({
      primary: overrideFor("Warm Stone"),
      secondary: null,
    });
  });

  it("keeps the product-level hover when the photo is outside the gallery window", () => {
    // `images(first:)` truncated before Warm Stone's group.
    const result = resolveCardImages({
      ...base,
      selectedColor: "Warm Stone",
      gallery: INDIGO,
    });
    expect(result).toEqual({
      primary: overrideFor("Warm Stone"),
      secondary: HERO_SECOND,
    });
  });

  it("falls back to the product images when the color has no photo", () => {
    const result = resolveCardImages({
      ...base,
      selectedColor: "Warm Stone",
      gallery: INDIGO,
      variants: VARIANTS.map((variant) => ({ ...variant, image: null })),
    });
    expect(result).toEqual({ primary: HERO, secondary: HERO_SECOND });
  });

  it("falls back when no color is selected", () => {
    expect(resolveCardImages({ ...base, selectedColor: undefined })).toEqual({
      primary: HERO,
      secondary: HERO_SECOND,
    });
  });

  it("falls back when the product has no variants", () => {
    expect(
      resolveCardImages({ ...base, selectedColor: "Warm Stone", variants: [] })
    ).toEqual({ primary: HERO, secondary: HERO_SECOND });
  });

  it("normalises a missing secondary to null", () => {
    const result = resolveCardImages({
      ...base,
      selectedColor: undefined,
      secondaryImageUrl: undefined,
    });
    expect(result).toEqual({ primary: HERO, secondary: null });
  });

  it("ignores a size whose value collides with the selected color", () => {
    // A size literally named "Warm Stone" must not be read as the colour.
    const collider: CardVariant = {
      id: "collide",
      availableForSale: true,
      price: { amount: "133.00", currencyCode: "GBP" },
      selectedOptions: [
        { name: "Size", value: "Warm Stone" },
        { name: "Color", value: "Indigo Rinse" },
      ],
      image: { url: "wrong.png" },
    };
    const result = resolveCardImages({
      ...base,
      selectedColor: "Warm Stone",
      variants: [collider, ...VARIANTS],
    });
    expect(result.primary).toBe(overrideFor("Warm Stone"));
  });

  it("does not hand a longer colourway's photos to a shorter label", () => {
    // "Indigo" is a substring of "Indigo Rinse"; a bare `includes` would give
    // the Indigo Rinse group to an Indigo swatch.
    const result = resolveCardImages({
      ...base,
      colors: [...COLORS, "Indigo"],
      selectedColor: "Indigo",
      variants: [
        {
          ...VARIANTS[0],
          id: "indigo",
          availableForSale: true,
          price: { amount: "133.00", currencyCode: "GBP" },
          selectedOptions: [{ name: "Color", value: "Indigo" }],
          image: null,
        },
      ],
    });
    expect(result).toEqual({ primary: HERO, secondary: HERO_SECOND });
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
    expect(findCardVariant(VARIANTS, "Warm Stone", "M")?.id).toBe("189");
  });

  it("matches per option type, not on bare values", () => {
    const collider: CardVariant = {
      id: "collide",
      availableForSale: true,
      price: { amount: "133.00", currencyCode: "GBP" },
      selectedOptions: [
        { name: "Size", value: "Warm Stone" },
        { name: "Color", value: "M" },
      ],
    };
    // A value-only match would have returned `collide` here.
    expect(
      findCardVariant([collider, ...VARIANTS], "Warm Stone", "M")?.id
    ).toBe("189");
  });

  it("ignores an unset selection", () => {
    expect(findCardVariant(VARIANTS, "Warm Stone", undefined)?.id).toBe("186");
  });

  it("returns undefined for an unknown combination", () => {
    expect(findCardVariant(VARIANTS, "Warm Stone", "XXL")).toBeUndefined();
  });

  it("returns undefined when there are no variants", () => {
    expect(findCardVariant([], "Warm Stone", "M")).toBeUndefined();
    expect(findCardVariant(undefined, "Warm Stone", "M")).toBeUndefined();
  });
});

describe("productToCardProps", () => {
  const card = productToCardProps(byId.response.data.site.product);

  it("derives the compare-at price, swatches and badge from one fetch", () => {
    expect(card.priceRange).toEqual({
      minVariantPrice: 396,
      maxVariantPrice: 396,
    });
    expect(card.compareAtPrice).toBe(495);
    expect(card.currencyCode).toBe("GBP");
    expect(card.colors).toEqual([{ name: "Black", hex: "#000000" }]);
    expect(card.colorOptionName).toBe("Color");
    expect(card.sizes).toEqual(["XS", "S", "M", "L", "XL"]);
    // The `tags` metafield off the same payload carries "new".
    expect(card.badge).toBe("new");
  });

  it("links by slug, not by the full BigCommerce path", () => {
    expect(byId.response.data.site.product.path).toBe(
      "/products/rye-leather-moto-jacket/"
    );
    expect(card.slug).toBe("rye-leather-moto-jacket");
  });

  it("stringifies variant money once, into the internal shape", () => {
    expect(card.variants?.[0]?.price).toEqual({
      amount: "396.00",
      currencyCode: "GBP",
    });
  });

  it("takes the flagged image when the product reports no default", () => {
    // product-by-path returns defaultImage: null for a product whose gallery
    // still flags one as the default.
    const node = byPath.response.data.site.route.node;
    expect(node.defaultImage).toBeNull();
    expect(node.images.edges[0]?.node.isDefault).toBe(true);
    expect(productToCardProps(node).imageUrl).toBe(
      node.images.edges[0]?.node.url
    );
  });

  it("reads stock from the variants when the product defers to them", () => {
    // product-by-path reports isInStock:false for the same product whose five
    // variants are all in stock; hasVariantInventory says which one counts.
    const node = byPath.response.data.site.route.node;
    expect(node.inventory.isInStock).toBe(false);
    expect(node.inventory.hasVariantInventory).toBe(true);
    expect(productToCardProps(node).stockStatus).toBeNull();
  });

  it("does not read a null stock aggregate as a low-stock warning", () => {
    expect(byId.response.data.site.product.inventory.aggregated).toBeNull();
    expect(card.stockStatus).toBeNull();
  });

  it("has no vendor when the product carries no brand", () => {
    expect(card.vendor).toBeNull();
  });
});

describe("getCardOptions", () => {
  it("takes the swatch hex straight off the option value", () => {
    const product = variantsAndOptions.response.data.site.product;
    const { colors, sizes } = getCardOptions(
      product.productOptions.edges.map((edge) => edge.node)
    );
    expect(colors).toEqual([
      { name: "Indigo Rinse", hex: "#2C3E5D" },
      { name: "Warm Stone", hex: "#8CA6C4" },
    ]);
    expect(sizes).toHaveLength(5);
    expect(product.variants.edges).toHaveLength(10);
  });
});
