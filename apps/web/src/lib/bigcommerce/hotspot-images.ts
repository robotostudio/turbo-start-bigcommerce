import "server-only";

import { getFeaturedProducts } from "./featured";

/**
 * Live product images for the hotspot cards in a Portable Text body, keyed by
 * BigCommerce `entityId`.
 *
 * ROB-2614 put images on the same footing as price and stock: read from
 * BigCommerce at request time, with the synced Sanity `store.previewImageUrl`
 * as the fallback when the live read has nothing. The synced value is not dead
 * weight — it is what keeps a card on the page when BigCommerce is unreachable,
 * and any product event refreshes it, since `syncProduct` re-fetches with
 * `include=...,images` and rewrites the whole `store` subtree.
 *
 * It matters more here than the phrase "fresher images" suggests. ROB-2612
 * measured four image mutations through the Admin REST images endpoint and got
 * zero webhook deliveries for all four, so a change made that way never reaches
 * Sanity at all. The live read is the only thing that sees it.
 */
export type HotspotImages = Record<number, string>;

/** The parts of a Portable Text body this needs; everything else spreads past. */
type HotspotBearingBlock = {
  _type?: string | null;
  productHotspots?:
    | ({
        productWithVariant?: {
          product?: { store?: { entityId?: number | null } | null } | null;
        } | null;
      } | null)[]
    | null;
};

function hotspotEntityIds(richText: unknown): number[] {
  if (!Array.isArray(richText)) return [];

  const ids = new Set<number>();
  for (const block of richText as HotspotBearingBlock[]) {
    if (block?._type !== "imageWithProductHotspots") continue;
    for (const spot of block.productHotspots ?? []) {
      const entityId = spot?.productWithVariant?.product?.store?.entityId;
      if (typeof entityId === "number") ids.add(entityId);
    }
  }
  return [...ids];
}

/**
 * One storefront round trip for every hotspot product in the body, or none at
 * all when there are no hotspots — which is every page but a handful.
 *
 * An unreachable BigCommerce, or an id the storefront will not resolve (a
 * product hidden since the sync ran), simply leaves that id out of the map.
 * `getFeaturedProducts` already answers `[]` rather than throwing on a failed
 * query, so the caller's fallback covers both cases with no branch of its own.
 */
export async function getHotspotImages(
  richText: unknown
): Promise<HotspotImages> {
  const entityIds = hotspotEntityIds(richText);
  // Guard the empty case: `getFeaturedProducts([])` means "the editor picked
  // nothing", and answers with the newest products rather than nothing.
  if (entityIds.length === 0) return {};

  const products = await getFeaturedProducts(entityIds);

  const images: HotspotImages = {};
  for (const product of products) {
    const url = product.defaultImage?.url;
    if (url) images[product.entityId] = url;
  }
  return images;
}
