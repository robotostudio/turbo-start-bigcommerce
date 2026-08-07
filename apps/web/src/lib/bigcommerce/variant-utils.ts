import type { CardVariant } from "@/components/product/product-card";
import { type BigCommerceMoney, toMoney } from "./money";

/** A `Variant` as the card queries it. */
export type BigCommerceVariant = {
  entityId: number;
  isPurchasable?: boolean;
  prices?: { price: BigCommerceMoney } | null;
  /**
   * `aggregated` reads null on stores that hide stock levels, so `isInStock`
   * is the authoritative field here — a null aggregate is unknown stock, never
   * zero stock.
   */
  inventory?: { isInStock?: boolean } | null;
  /** Per-variant image override; see `resolveCardImages`. */
  defaultImage?: { url: string } | null;
  options?: {
    edges: readonly {
      node: {
        displayName: string;
        values: { edges: readonly { node: { label: string } }[] };
      };
    }[];
  } | null;
};

/**
 * Flattens a BigCommerce variant onto the card's canonical variant shape.
 *
 * BigCommerce nests a variant's chosen option values one connection deeper
 * than Shopify's flat `selectedOptions`. A variant holds exactly one value per
 * option — that is what makes it a variant — so the first value is the choice.
 */
export function toCardVariant(variant: BigCommerceVariant): CardVariant {
  return {
    id: String(variant.entityId),
    availableForSale:
      variant.isPurchasable !== false && variant.inventory?.isInStock !== false,
    price: variant.prices
      ? toMoney(variant.prices.price)
      : { amount: "0.00", currencyCode: "" },
    selectedOptions: (variant.options?.edges ?? []).map(({ node }) => ({
      name: node.displayName,
      value: node.values.edges[0]?.node.label ?? "",
    })),
    image: variant.defaultImage ? { url: variant.defaultImage.url } : null,
  };
}
