import type { AggregateOffer, Offer, Product, WithContext } from "schema-dts";

import { JsonLdScript } from "@/components/json-ld";
import type { CatalogProduct } from "@/lib/bigcommerce/catalog";
import { nodes } from "@/lib/bigcommerce/catalog";
import { cardRating } from "@/lib/bigcommerce/product-card";
import { getBaseUrl } from "@/utils";

type ProductJsonLdProps = {
  product: CatalogProduct;
  handle: string;
  /** Plain-text body copy; the raw `description` is HTML. */
  description: string;
};

// Prices are considered valid until the end of next year — Google requires
// priceValidUntil for price-drop rich results. Computed from a static base so
// it stays a sensible future date without depending on request time.
const PRICE_VALID_UNTIL = `${new Date().getFullYear() + 1}-12-31`;

type CatalogVariant = NonNullable<
  CatalogProduct["variants"]["edges"]
>[number]["node"];

/** `aggregated` is null on a store that hides stock levels. */
function isAvailable(variant: CatalogVariant): boolean {
  return Boolean(variant.isPurchasable && variant.inventory?.isInStock);
}

function toOffer(
  variant: CatalogVariant,
  url: string,
  fallbackCurrency?: string
): Offer {
  return {
    "@type": "Offer",
    price: String(variant.prices?.price.value ?? 0),
    priceCurrency: variant.prices?.price.currencyCode ?? fallbackCurrency,
    priceValidUntil: PRICE_VALID_UNTIL,
    availability: isAvailable(variant)
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    url,
    sku: variant.sku || undefined,
  };
}

/**
 * Mapping every variant to its own `Offer` emitted as many identical objects as
 * the product had variants, sharing one `url` with nothing to tell them apart —
 * Google reads that as many offers at one address, not a price range.
 */
function buildOffers(
  variants: CatalogVariant[],
  url: string,
  fallbackCurrency?: string,
  truncated = false
): Offer | AggregateOffer | undefined {
  const first = variants[0];
  if (!first) {
    return;
  }
  if (variants.length === 1) {
    return toOffer(first, url, fallbackCurrency);
  }

  const prices = variants.map((variant) => variant.prices?.price.value ?? 0);
  return {
    "@type": "AggregateOffer",
    // Omitted when the read was truncated: the query takes one page of
    // variants, so that page's length is not the offer count. The range still
    // describes what was read — narrow at worst, never a false total.
    ...(truncated ? {} : { offerCount: variants.length }),
    lowPrice: Math.min(...prices).toFixed(2),
    highPrice: Math.max(...prices).toFixed(2),
    priceCurrency: first.prices?.price.currencyCode ?? fallbackCurrency,
    availability: variants.some(isAvailable)
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    url,
  };
}

export function ProductJsonLd({
  product,
  handle,
  description,
}: ProductJsonLdProps) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/products/${handle}`;
  const variants = nodes(product.variants);
  // `defaultImage` is the fallback BigCommerce still reports when the gallery
  // connection comes back empty; without it the whole Product block is dropped.
  const image = nodes(product.images)[0]?.url ?? product.defaultImage?.url;
  // Null for an unrated product, and the field is then omitted entirely.
  // Google rejects an `aggregateRating` with a zero `reviewCount`, so emitting
  // one for a product with no reviews would invalidate the whole block rather
  // than add to it.
  const rating = cardRating(product);

  const jsonLd: WithContext<Product> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description,
    image,
    brand: product.brand
      ? { "@type": "Brand", name: product.brand.name }
      : undefined,
    aggregateRating: rating
      ? {
          "@type": "AggregateRating",
          ratingValue: rating.average,
          reviewCount: rating.count,
        }
      : undefined,
    offers: buildOffers(
      variants,
      url,
      product.prices?.price.currencyCode,
      product.variants.pageInfo?.hasNextPage ?? false
    ),
  };

  return <JsonLdScript data={jsonLd} id={`product-json-ld-${handle}`} />;
}
