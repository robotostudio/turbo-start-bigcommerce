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

type ResolvedSeed = { key: string; seed: PageBuilderBlockSeed };

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
): Promise<ResolvedSeed | null> {
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
    key: block._key,
    seed: {
      _type: "featuredProducts",
      queryKey: handles.join(","),
      cards,
    },
  };
}

async function resolveLayersShowcase(
  block: ResolvablePageBuilderBlock
): Promise<ResolvedSeed | null> {
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

  return {
    key: block._key,
    seed: { _type: "layersShowcase", handle, product },
  };
}

/**
 * Resolves, server-side, the catalog data the product-backed page-builder
 * blocks need, so their first paint is real markup rather than a skeleton the
 * browser has to fill in. Without this the home page renders nothing but a
 * heading with JavaScript disabled.
 *
 * Only the two block types that read from BigCommerce cost a request; the rest
 * of the page builder is already server-rendered from Sanity. The reads run
 * together rather than in sequence, so a page with a showcase and two featured
 * rows waits for the slowest of them instead of the sum.
 *
 * Every read is wrapped in `fetchOrFallback`: a block whose products cannot be
 * reached is left out of the map entirely, which puts it back on exactly the
 * client-fetch path it used before. A dead storefront token degrades the first
 * paint, it does not blank the page.
 */
export async function resolvePageBuilderData(
  blocks: readonly ResolvablePageBuilderBlock[]
): Promise<PageBuilderData> {
  const pending = blocks.flatMap((block) => {
    if (block._type === "featuredProducts") {
      return [resolveFeaturedProducts(block)];
    }
    if (block._type === "layersShowcase") {
      return [resolveLayersShowcase(block)];
    }
    return [];
  });

  if (pending.length === 0) {
    return {};
  }

  const resolved = await Promise.all(pending);

  return Object.fromEntries(
    resolved.flatMap((entry) => (entry ? [[entry.key, entry.seed]] : []))
  );
}
