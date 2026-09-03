import "server-only";

import { stegaClean } from "next-sanity";

import { getProductByPath } from "@/lib/bigcommerce/catalog";
import { fetchOrFallback } from "@/lib/build-guard";
import type {
  FeaturedProductsSeed,
  LayersShowcaseSeed,
  PageBuilderBlockSeed,
  PageBuilderData,
  ResolvablePageBuilderBlock,
} from "./pagebuilder-data";
import { featuredCards } from "./product/featured-cards";

/**
 * A handle that reaches us from a stega-enabled fetch carries invisible
 * markers, which BigCommerce would reject as a path. The seed's identity field
 * keeps the raw string — the block builds its query key from the same raw prop,
 * and the two have to match character for character — while only the value we
 * send over the wire is cleaned.
 */
function toPath(handle: string): string {
  return stegaClean(handle);
}

async function resolveFeaturedProducts(
  block: ResolvablePageBuilderBlock
): Promise<FeaturedProductsSeed | null> {
  const handles = (block.productHandles ?? []).filter(
    (handle): handle is string => Boolean(handle)
  );

  const cards = await fetchOrFallback<FeaturedProductsSeed["cards"] | null>(
    `featured products for block ${block._key}`,
    "that block ships skeletons and resolves its products from the browser",
    () => featuredCards(handles.map(toPath)),
    null
  );

  if (!cards) {
    return null;
  }

  return {
    _type: "featuredProducts",
    queryKey: handles.join(","),
    cards,
  };
}

async function resolveLayersShowcase(
  block: ResolvablePageBuilderBlock
): Promise<LayersShowcaseSeed | null> {
  const handle = block.productHandle;
  if (!handle) {
    return null;
  }

  // `undefined` is the failure fallback and `null` a product that no longer
  // resolves, which is a real answer the block knows how to render.
  const product = await fetchOrFallback<
    LayersShowcaseSeed["product"] | undefined
  >(
    `product ${handle} for block ${block._key}`,
    "that block ships skeletons and resolves its product from the browser",
    async () => {
      const result = await getProductByPath([toPath(handle)]);
      return result.ok ? result.data.node : undefined;
    },
    undefined
  );

  if (product === undefined) {
    return null;
  }

  return { _type: "layersShowcase", handle, product };
}

/**
 * Resolves, server-side, the catalog reads the product-backed page-builder
 * blocks need, keyed by block `_key`.
 *
 * Every read is started before any is awaited, so a page with a showcase and
 * two featured rows runs them concurrently and pays for the slowest, not the
 * sum. Only the two block types that read from BigCommerce appear in the map;
 * the rest of the page builder is already server-rendered from Sanity.
 *
 * Awaited here rather than handed to `pagebuilder.tsx` as promises: that
 * component is `"use client"`, and a promise crossing the RSC boundary is not
 * settled when the client side first renders, so `use()` on it suspends and
 * ships the block's skeletons into the shell — see the note on
 * `PageBuilderData`. Resolving first is what keeps the first paint real markup
 * with JavaScript disabled.
 *
 * Every read is wrapped in `fetchOrFallback`, so none of them rejects — a block
 * whose products cannot be reached resolves to `null`, which puts it back on
 * exactly the client-fetch path it used before. A dead storefront token
 * degrades the first paint, it does not blank the page.
 */
export async function pageBuilderSeeds(
  blocks: readonly ResolvablePageBuilderBlock[]
): Promise<PageBuilderData> {
  const entries: [string, Promise<PageBuilderBlockSeed | null>][] = [];
  for (const block of blocks) {
    if (block._type === "featuredProducts") {
      entries.push([block._key, resolveFeaturedProducts(block)]);
    } else if (block._type === "layersShowcase") {
      entries.push([block._key, resolveLayersShowcase(block)]);
    }
  }
  const seeds = await Promise.all(entries.map(([, promise]) => promise));
  return Object.fromEntries(
    entries.map(([key], index) => [key, seeds[index] ?? null])
  );
}
