import type { Offer, Product, WithContext } from "schema-dts";

import { JsonLdScript } from "@/components/json-ld";
import type { ShopifyProduct } from "@/lib/shopify/types";
import { getBaseUrl } from "@/utils";

type ProductJsonLdProps = {
  product: ShopifyProduct;
  handle: string;
};

// Prices are considered valid until the end of next year — Google requires
// priceValidUntil for price-drop rich results. Computed from a static base so
// it stays a sensible future date without depending on request time.
const PRICE_VALID_UNTIL = `${new Date().getFullYear() + 1}-12-31`;

export function ProductJsonLd({ product, handle }: ProductJsonLdProps) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/products/${handle}`;
  const variants = product.variants.edges.map((e) => e.node);
  const firstImage = product.images.edges[0]?.node;

  const jsonLd: WithContext<Product> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: firstImage?.url,
    brand: product.vendor
      ? { "@type": "Brand", name: product.vendor }
      : undefined,
    offers: variants.map(
      (v): Offer => ({
        "@type": "Offer",
        price: v.price.amount,
        priceCurrency: v.price.currencyCode,
        priceValidUntil: PRICE_VALID_UNTIL,
        availability: v.availableForSale
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        url,
        sku: v.sku ?? undefined,
      })
    ),
  };

  return <JsonLdScript data={jsonLd} id={`product-json-ld-${handle}`} />;
}
