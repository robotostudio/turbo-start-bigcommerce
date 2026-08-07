import type {
  CardVariant,
  MerchBadge,
  ProductCardProps,
  StockStatus,
} from "@/components/product/product-card";
import { getColorHex } from "./color";
import { formatMoney } from "./money";
import { getCardOptions, getOptionType } from "./options";
import {
  type CardImageFields,
  type CardSourceProduct,
  type Connection,
  LOW_STOCK_THRESHOLD,
} from "./types";

/** Derives the merch badge from Shopify product tags. */
export function badgeFromTags(tags: string[]): MerchBadge | null {
  const lower = tags.map((tag) => tag.toLowerCase());
  if (lower.includes("new")) return "new";
  if (lower.includes("online-exclusive") || lower.includes("exclusive")) {
    return "exclusive";
  }
  return null;
}

/**
 * Second product image for the card hover cross-fade: the first image that
 * differs from the featured image (else the 2nd image), or null.
 */
export function secondaryImageUrl(
  images: Connection<CardImageFields> | undefined,
  featuredUrl: string | null
): string | null {
  const urls = (images?.edges ?? []).map((edge) => edge.node.url);
  return urls.find((url) => url !== featuredUrl) ?? urls[1] ?? null;
}

function money(amount: number, currencyCode: string) {
  return formatMoney({ amount: String(amount), currencyCode });
}

/**
 * Card price figures. `strikePrice` is a real discount and renders struck
 * through; `rangePrice` is only the top of a variant price range and must not,
 * or it reads as a discount that isn't there.
 */
export function cardPricing(
  priceRange: ProductCardProps["priceRange"],
  compareAtPrice: number | null | undefined,
  code: string
): {
  price: string;
  salePercent: number;
  strikePrice: string | null;
  rangePrice: string | null;
} {
  const price = money(priceRange.minVariantPrice, code);
  const showRange = priceRange.minVariantPrice !== priceRange.maxVariantPrice;

  const onSale =
    typeof compareAtPrice === "number" &&
    compareAtPrice > priceRange.minVariantPrice;
  if (!(onSale && compareAtPrice)) {
    return {
      price,
      salePercent: 0,
      strikePrice: null,
      rangePrice: showRange ? money(priceRange.maxVariantPrice, code) : null,
    };
  }

  // A discount takes precedence over the range: showing both reads as noise.
  return {
    price,
    salePercent: Math.round(
      ((compareAtPrice - priceRange.minVariantPrice) / compareAtPrice) * 100
    ),
    strikePrice: money(compareAtPrice, code),
    rangePrice: null,
  };
}

/** The variant's value for the color- or size-typed option, if it has one. */
function optionValue(variant: CardVariant, type: "color" | "size") {
  return variant.selectedOptions.find(
    (option) => getOptionType(option.name) === type
  )?.value;
}

/**
 * Finds the variant matching the card's color and size selection. Matches per
 * option type rather than on bare values, so a color and a size sharing a value
 * string can't cross-match.
 */
export function findCardVariant(
  variants: CardVariant[] | undefined,
  color: string | undefined,
  size: string | undefined
): CardVariant | undefined {
  if (!variants || variants.length === 0) return undefined;
  return variants.find(
    (variant) =>
      (!color || optionValue(variant, "color") === color) &&
      (!size || optionValue(variant, "size") === size)
  );
}

/**
 * Colors using each variant image.
 *
 * Storefront's `ProductVariant.image` "falls back to the product image if no
 * image is available", so a color with no photo of its own silently reports
 * some other color's. An image claimed by more than one color is that fallback
 * rather than a photo of any one color, which is how we tell the two apart.
 */
function colorsByImage(variants: CardVariant[]): Map<string, Set<string>> {
  const colors = new Map<string, Set<string>>();
  for (const variant of variants) {
    const url = variant.image?.url;
    const color = optionValue(variant, "color");
    if (!(url && color)) continue;
    const seen = colors.get(url);
    if (seen) {
      seen.add(color);
    } else {
      colors.set(url, new Set([color]));
    }
  }
  return colors;
}

/** Whether this image belongs to exactly one color — i.e. is not inherited. */
function isSpecificTo(
  colors: Map<string, Set<string>>,
  url: string,
  color: string
) {
  const claimed = colors.get(url);
  return claimed?.size === 1 && claimed.has(color);
}

/**
 * Card images for the current color: that color's variant photo, plus the next
 * gallery image as the hover cross-fade partner (Shopify orders product images
 * in per-color groups). Falls back to the product-level pair whenever the color
 * has no photo of its own — including when it merely inherited the product
 * image, which the Storefront API reports indistinguishably from a real one.
 */
export function resolveCardImages({
  selectedColor,
  variants,
  galleryUrls,
  imageUrl,
  secondaryImageUrl: productSecondary,
}: {
  selectedColor: string | undefined;
  variants: CardVariant[] | undefined;
  galleryUrls: string[] | undefined;
  imageUrl: string | null;
  secondaryImageUrl: string | null | undefined;
}): { primary: string | null; secondary: string | null } {
  const fallback = { primary: imageUrl, secondary: productSecondary ?? null };
  if (!selectedColor || !variants || variants.length === 0) return fallback;

  const colors = colorsByImage(variants);
  const primary = variants
    .map((variant) => variant.image?.url)
    .find((url) => url && isSpecificTo(colors, url, selectedColor));
  if (!primary) return fallback;

  const gallery = galleryUrls ?? [];
  const index = gallery.indexOf(primary);
  // Variant photo outside the fetched gallery window — keep the product hover.
  if (index === -1) return { primary, secondary: fallback.secondary };

  const next = gallery[index + 1] ?? null;
  if (!next) return { primary, secondary: null };

  // If the next image opens another color's group, this color has a single
  // photo — better no cross-fade than fading into the wrong color. An inherited
  // image marks no group, so it stays eligible as the hover partner.
  const claimed = colors.get(next);
  const opensAnotherColor = claimed?.size === 1 && !claimed.has(selectedColor);
  return { primary, secondary: opensAnotherColor ? null : next };
}

/**
 * Stock badge for a card. Prefers the product-level fields the featured/card
 * queries select, falling back to the first variant's inventory.
 */
function cardStockStatus(product: CardSourceProduct): StockStatus {
  if (product.availableForSale === false) return "out";
  if (product.totalInventory !== undefined) {
    if (
      product.totalInventory !== null &&
      product.totalInventory > 0 &&
      product.totalInventory <= LOW_STOCK_THRESHOLD
    ) {
      return "low";
    }
    return null;
  }

  const variant = product.variants.edges[0]?.node;
  if (!variant?.availableForSale) return "out";
  if (
    variant.quantityAvailable !== null &&
    variant.quantityAvailable > 0 &&
    variant.quantityAvailable <= LOW_STOCK_THRESHOLD
  ) {
    return "low";
  }
  return null;
}

/** Maps a Storefront collection product to canonical ProductCard props. */
export function collectionProductToCardProps(
  product: CardSourceProduct
): ProductCardProps {
  const compareAt = product.compareAtPriceRange?.minVariantPrice.amount;
  const {
    colors: colorNames,
    sizes,
    colorOptionName,
  } = getCardOptions(product.options ?? []);
  const colors = colorNames.map((name) => ({ name, hex: getColorHex(name) }));
  const galleryUrls = (product.images?.edges ?? []).map(
    (edge) => edge.node.url
  );

  return {
    slug: product.handle,
    title: product.title,
    vendor: product.vendor,
    imageUrl: product.featuredImage?.url ?? null,
    secondaryImageUrl: secondaryImageUrl(
      product.images,
      product.featuredImage?.url ?? null
    ),
    currencyCode: product.priceRange.minVariantPrice.currencyCode,
    priceRange: {
      minVariantPrice: Number(product.priceRange.minVariantPrice.amount),
      maxVariantPrice: Number(product.priceRange.maxVariantPrice.amount),
    },
    compareAtPrice: compareAt ? Number(compareAt) : null,
    stockStatus: cardStockStatus(product),
    badge: badgeFromTags(product.tags ?? []),
    variantName: colorNames[0] ?? null,
    colors,
    selectedColor: colorNames[0],
    colorOptionName,
    sizes,
    selectedSize: sizes[0],
    variants: (product.variants?.edges ?? []).map((edge) => edge.node),
    galleryUrls,
  };
}
