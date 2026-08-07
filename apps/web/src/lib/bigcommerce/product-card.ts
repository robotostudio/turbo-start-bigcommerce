import type {
  CardVariant,
  MerchBadge,
  ProductCardProps,
  StockStatus,
} from "@/components/product/product-card";
import { type BigCommerceMoney, formatMoney, toMoney } from "./money";
import {
  type BigCommerceProductOption,
  getCardOptions,
  getOptionType,
} from "./options";
import { type BigCommerceVariant, toCardVariant } from "./variant-utils";

/** Units left at which the card starts warning. */
const LOW_STOCK_THRESHOLD = 5;

/** An `Image` as the card queries it. */
export type BigCommerceCardImage = {
  url: string;
  /** Names the colourway; the only in-band link from a photo to a swatch. */
  altText?: string | null;
  isDefault?: boolean;
};

/** The BigCommerce `Product` fields the card maps. */
export type BigCommerceCardProduct = {
  entityId: number;
  name: string;
  path: string;
  brand?: { name: string } | null;
  prices?: {
    price: BigCommerceMoney;
    basePrice?: BigCommerceMoney | null;
    salePrice?: BigCommerceMoney | null;
    retailPrice?: BigCommerceMoney | null;
    priceRange?: { min: BigCommerceMoney; max: BigCommerceMoney } | null;
  } | null;
  inventory?: {
    isInStock?: boolean;
    hasVariantInventory?: boolean;
    aggregated?: { availableToSell: number } | null;
  } | null;
  defaultImage?: BigCommerceCardImage | null;
  images?: { edges: readonly { node: BigCommerceCardImage }[] } | null;
  productOptions?: {
    edges: readonly { node: BigCommerceProductOption }[];
  } | null;
  variants?: { edges: readonly { node: BigCommerceVariant }[] } | null;
  metafields?: {
    edges: readonly { node: { key: string; value: string } }[];
  } | null;
};

/**
 * Card props plus the gallery `resolveCardImages` groups on. BigCommerce needs
 * each photo's alt text, not just its URL, so this carries the richer list
 * until the card component's own `galleryUrls` prop is switched over.
 */
export type BigCommerceCardProps = ProductCardProps & {
  gallery: BigCommerceCardImage[];
};

/** Derives the merch badge from the product's tags. */
export function badgeFromTags(tags: string[]): MerchBadge | null {
  const lower = tags.map((tag) => tag.toLowerCase());
  if (lower.includes("new")) return "new";
  if (lower.includes("online-exclusive") || lower.includes("exclusive")) {
    return "exclusive";
  }
  return null;
}

/**
 * Tags for the badge. BigCommerce has no first-class tag field, so the catalog
 * carries them as a comma-separated `tags` metafield in the `turbo_start`
 * namespace — read from the same product fetch the prices and swatches
 * arrive in.
 *
 * Read inline rather than through `metafields.ts`'s `keyMetafields`: that
 * module is `server-only`, and the card's helpers are called from the "use
 * client" card component.
 */
export function productTags(
  metafields: BigCommerceCardProduct["metafields"]
): string[] {
  const raw = (metafields?.edges ?? []).find(({ node }) => node.key === "tags")
    ?.node.value;
  return (raw ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** BigCommerce `path` is a full route ("/products/x/"); the card links by slug. */
export function slugFromPath(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "";
}

/**
 * The was-price, or null when there is not one.
 *
 * BigCommerce sets `salePrice` when a product is marked down and leaves
 * `basePrice` at the pre-markdown figure, so `basePrice` is the strikethrough.
 * `retailPrice` is a standing MSRP and stands in when there is no markdown.
 * Either only counts when it is genuinely above the price being charged.
 */
export function compareAtPrice(
  prices: BigCommerceCardProduct["prices"]
): number | null {
  if (!prices) return null;
  const was = prices.salePrice
    ? prices.basePrice?.value
    : prices.retailPrice?.value;
  return typeof was === "number" && was > prices.price.value ? was : null;
}

/**
 * Second product image for the card hover cross-fade: the first image that
 * differs from the featured image (else the 2nd image), or null.
 */
export function secondaryImageUrl(
  gallery: readonly BigCommerceCardImage[],
  featuredUrl: string | null
): string | null {
  const urls = gallery.map((image) => image.url);
  return urls.find((url) => url !== featuredUrl) ?? urls[1] ?? null;
}

function money(amount: number, currencyCode: string) {
  return formatMoney(toMoney({ value: amount, currencyCode }));
}

/**
 * Card price figures. `strikePrice` is a real discount and renders struck
 * through; `rangePrice` is only the top of a variant price range and must not,
 * or it reads as a discount that isn't there.
 */
export function cardPricing(
  priceRange: ProductCardProps["priceRange"],
  compareAt: number | null | undefined,
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
    typeof compareAt === "number" && compareAt > priceRange.minVariantPrice;
  if (!(onSale && compareAt)) {
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
      ((compareAt - priceRange.minVariantPrice) / compareAt) * 100
    ),
    strikePrice: money(compareAt, code),
    rangePrice: null,
  };
}

/** The variant's value for the colour- or size-typed option, if it has one. */
function optionValue(variant: CardVariant, type: "color" | "size") {
  return variant.selectedOptions.find(
    (option) => getOptionType(option.name) === type
  )?.value;
}

/**
 * Finds the variant matching the card's colour and size selection. Matches per
 * option type rather than on bare values, so a colour and a size sharing a
 * value string can't cross-match.
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
 * The product photos belonging to one colourway.
 *
 * The longest matching label wins, so a product carrying both "Indigo" and
 * "Indigo Rinse" does not hand "Indigo Rinse" photos to the "Indigo" swatch.
 */
function colorGallery(
  gallery: readonly BigCommerceCardImage[],
  color: string,
  colors: readonly string[]
): BigCommerceCardImage[] {
  const ranked = [...colors].sort((a, b) => b.length - a.length);
  return gallery.filter((image) => {
    const alt = image.altText?.toLowerCase() ?? "";
    return ranked.find((label) => alt.includes(label.toLowerCase())) === color;
  });
}

/**
 * Card images for the selected colour.
 *
 * BigCommerce keeps variant photos in a namespace of their own —
 * `attribute_rule_images/`, which never appears in the product's `images`
 * connection — so a variant's `defaultImage` is an unambiguous override. There
 * is no Shopify-style silent fallback to the product image to unpick, and no
 * gallery position to look the photo up at. Both halves of the fork's
 * heuristic are therefore gone rather than translated: the URL match it was
 * built on can never succeed here.
 *
 * The hover partner still comes from the gallery. BigCommerce groups a
 * product's own photos per colourway and names the colour in each image's
 * `altText`; the override stands in for that group's first photo, so the
 * cross-fade partner is its second.
 *
 * ponytail: alt-text grouping is a heuristic — merchants author that text. It
 * can only ever supply `secondary` (and `primary` when there is no override at
 * all), so a miss degrades to the product-level pair instead of showing
 * another colour's photo, which is the failure the Shopify version had to
 * work so hard to avoid. Upgrade path if merchants leave alt text blank: a
 * colour-to-image metafield, read from the same fetch.
 */
export function resolveCardImages({
  selectedColor,
  colors = [],
  variants,
  gallery,
  imageUrl,
  secondaryImageUrl: productSecondary,
}: {
  selectedColor: string | undefined;
  /** Every colour label on the product, for the longest-match grouping. */
  colors?: readonly string[];
  variants: CardVariant[] | undefined;
  gallery: readonly BigCommerceCardImage[] | undefined;
  imageUrl: string | null;
  secondaryImageUrl?: string | null;
}): { primary: string | null; secondary: string | null } {
  const fallback = { primary: imageUrl, secondary: productSecondary ?? null };
  if (!selectedColor || !variants || variants.length === 0) return fallback;

  const override =
    findCardVariant(variants, selectedColor, undefined)?.image?.url ?? null;
  const group = colorGallery(gallery ?? [], selectedColor, [
    ...colors,
    selectedColor,
  ]);
  if (!(override || group.length > 0)) return fallback;

  return {
    primary: override ?? group[0]?.url ?? imageUrl,
    // No group at all means the colour's photos fell outside the fetched
    // window — keep the product hover. A group of one means the colour really
    // has a single photo, and no cross-fade beats fading into another colour.
    secondary:
      group[1]?.url ?? (group.length === 0 ? fallback.secondary : null),
  };
}

/**
 * Stock badge for a card.
 *
 * `hasVariantInventory` is BigCommerce's own marker that the product-level
 * roll-up is not authoritative — product 189 reports `isInStock: false` while
 * all five of its variants are in stock — so the variants decide whenever it
 * is set. A null `aggregated` is a store that hides stock levels: unknown
 * stock, never zero, and never the low-stock warning.
 */
function cardStockStatus(
  product: BigCommerceCardProduct,
  variants: CardVariant[]
): StockStatus {
  const inStock =
    product.inventory?.hasVariantInventory && variants.length > 0
      ? variants.some((variant) => variant.availableForSale)
      : product.inventory?.isInStock !== false;
  if (!inStock) return "out";

  const left = product.inventory?.aggregated?.availableToSell;
  return typeof left === "number" && left > 0 && left <= LOW_STOCK_THRESHOLD
    ? "low"
    : null;
}

/**
 * Maps a BigCommerce product to canonical ProductCard props.
 *
 * Everything the card renders — the compare-at price, the colour swatches with
 * their hexes and the badge — comes off this one payload, which is what lets
 * the Open Graph card render from a single fetch.
 */
export function productToCardProps(
  product: BigCommerceCardProduct
): BigCommerceCardProps {
  const gallery = (product.images?.edges ?? []).map((edge) => edge.node);
  // `defaultImage` reads null on some captures even where `images` flags one as
  // the default (product-by-path.json), so the flag is the second read.
  const imageUrl =
    product.defaultImage?.url ??
    gallery.find((image) => image.isDefault)?.url ??
    gallery[0]?.url ??
    null;

  const { colors, sizes, colorOptionName } = getCardOptions(
    (product.productOptions?.edges ?? []).map((edge) => edge.node)
  );
  const variants = (product.variants?.edges ?? []).map((edge) =>
    toCardVariant(edge.node)
  );

  const prices = product.prices;
  const price = prices?.price.value ?? 0;

  return {
    slug: slugFromPath(product.path),
    title: product.name,
    vendor: product.brand?.name ?? null,
    imageUrl,
    secondaryImageUrl: secondaryImageUrl(gallery, imageUrl),
    currencyCode: prices?.price.currencyCode,
    priceRange: {
      minVariantPrice: prices?.priceRange?.min.value ?? price,
      maxVariantPrice: prices?.priceRange?.max.value ?? price,
    },
    compareAtPrice: compareAtPrice(prices),
    stockStatus: cardStockStatus(product, variants),
    badge: badgeFromTags(productTags(product.metafields)),
    variantName: colors[0]?.name ?? null,
    colors,
    selectedColor: colors[0]?.name,
    colorOptionName,
    sizes,
    selectedSize: sizes[0],
    variants,
    gallery,
  };
}
