import type { CollectionCardProps } from "@/components/collection/collection-card";
import type { ShopifyCollectionLite } from "@/lib/shopify/types";

/**
 * Sanity-shaped collection (collections index, explore-categories block).
 * Only the fields the card needs.
 */
type SanityCollectionLike = {
  slug?: string | null;
  title?: string | null;
  imageUrl?: string | null;
};

/** Map a Sanity collection document into CollectionCard props. */
export function sanityCollectionToCardProps(
  collection: SanityCollectionLike
): CollectionCardProps {
  return {
    handle: collection.slug ?? "",
    title: collection.title ?? "Untitled",
    imageUrl: collection.imageUrl ?? null,
  };
}

/** Map a Shopify Storefront collection (search overlay) into CollectionCard props. */
export function shopifyCollectionToCardProps(
  collection: ShopifyCollectionLite
): CollectionCardProps {
  return {
    handle: collection.handle,
    title: collection.title,
    imageUrl: collection.image?.url ?? null,
  };
}
