import type { Offer, Product, WithContext } from "schema-dts";

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

export function ProductJsonLd({
  product,
  handle,
  description,
}: ProductJsonLdProps) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/products/${handle}`;
  const variants = nodes(product.variants);
  const firstImage = nodes(product.images)[0];
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
    image: firstImage?.url,
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
    offers: variants.map(
      (variant): Offer => ({
        "@type": "Offer",
        price: String(variant.prices?.price.value ?? 0),
        priceCurrency:
          variant.prices?.price.currencyCode ??
          product.prices?.price.currencyCode,
        priceValidUntil: PRICE_VALID_UNTIL,
        // `aggregated` is null on a store that hides stock levels, so
        // `isInStock` is the only authoritative signal here.
        availability:
          variant.isPurchasable && variant.inventory?.isInStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        url,
        sku: variant.sku || undefined,
      })
    ),
  };

  return <JsonLdScript data={jsonLd} id={`product-json-ld-${handle}`} />;
}
