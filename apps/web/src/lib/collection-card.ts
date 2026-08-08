import type { CollectionCardProps } from "@/components/collection/collection-card";

/**
 * The category fields a card needs, structurally rather than imported from
 * `catalog.ts`. That module is `server-only` and this one is reached from the
 * client page builder, so it must not name it at all — not even in a type
 * position, which Turbopack still resolves as a module edge.
 */
type CategoryLike = {
  name: string;
  path: string;
  image?: { url: string } | null;
};

/** `/collections/jackets/leather/` -> `jackets/leather`. */
function pathToHandle(path: string): string {
  return path.split("/").filter(Boolean).slice(1).join("/");
}

/**
 * Sanity-shaped collection (page-builder blocks that still curate by hand).
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

/**
 * Map a BigCommerce category into CollectionCard props.
 *
 * `handle` carries every segment below `/collections`, because BigCommerce
 * category paths are multi-segment by default — a nested category's card has
 * to link to `/collections/jackets/leather`, not `/collections/leather`.
 */
export function categoryToCardProps(
  category: CategoryLike
): CollectionCardProps {
  return {
    handle: pathToHandle(category.path),
    title: category.name,
    imageUrl: category.image?.url ?? null,
  };
}
