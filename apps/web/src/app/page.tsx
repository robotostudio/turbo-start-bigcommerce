import { sanityFetch } from "@workspace/sanity/live";
import { queryHomePageData } from "@workspace/sanity/query";

import { PageBuilder } from "@/components/pagebuilder";
import {
  getProductDetail,
  getProductDetailById,
} from "@/components/product/fetch-product";
import type { ProductCardProps } from "@/components/product/product-card";
import { getNewestProductIds } from "@/lib/bigcommerce/featured";
import { productToCardProps } from "@/lib/bigcommerce/product-card";
import { getSEOMetadata } from "@/lib/seo";

async function fetchHomePageData() {
  return await sanityFetch({
    query: queryHomePageData,
  });
}

/**
 * Featured Products blocks read live prices out of BigCommerce, and that read is
 * a POST — which Next never serves from the fetch cache — so without this the
 * home page ships its build-time prices forever. Matched to the category pages;
 * the same cards render on both.
 */
export const revalidate = 300;

/** How many products a Featured Products block falls back to. */
const FEATURED_FALLBACK_COUNT = 4;

/**
 * Cards for one Featured Products block.
 *
 * The full `ProductDetail` read, not the lean card fragment, because these
 * cards carry swatches, sizes, badges and a hover add-to-cart — all of which
 * live on options, variants and metafields. One request per product; the block
 * shows four.
 *
 * ponytail: a handle-keyed batch read would make the picked case one request
 * instead of four. `site.products` takes entityIds only, so that needs Sanity
 * to carry the BigCommerce id — which is exactly what the schema swap adds.
 */
async function featuredCards(handles: string[]): Promise<ProductCardProps[]> {
  const products = await (handles.length > 0
    ? Promise.all(
        handles.map((handle) =>
          getProductDetail([handle]).then((route) => route.node)
        )
      )
    : getNewestProductIds(FEATURED_FALLBACK_COUNT).then((ids) =>
        Promise.all(ids.map(getProductDetailById))
      ));

  return products.flatMap((product) =>
    product ? [productToCardProps(product)] : []
  );
}

export async function generateMetadata() {
  const { data: homePageData } = await fetchHomePageData();
  return getSEOMetadata(
    homePageData
      ? {
          title: homePageData?.title ?? homePageData?.seoTitle ?? "",
          description:
            homePageData?.description ?? homePageData?.seoDescription ?? "",
          slug: homePageData?.slug,
          contentId: homePageData?._id,
          contentType: homePageData?._type,
        }
      : {}
  );
}

export default async function Page() {
  const { data: homePageData } = await fetchHomePageData();

  if (!homePageData) {
    return <div>No home page data</div>;
  }

  const { _id, _type, pageBuilder } = homePageData ?? {};
  const blocks = pageBuilder ?? [];

  const heroBlock = blocks.filter(
    (b: { _type: string }) => (b._type as string) === "hero"
  );
  const remainingBlocks = blocks.filter(
    (b: { _type: string }) => (b._type as string) !== "hero"
  );

  // Featured Products blocks can't read the catalog themselves (they render
  // inside the client PageBuilder), so resolve their cards here, keyed by block.
  const featuredBlocks = blocks.filter(
    (b: { _type: string }) => (b._type as string) === "featuredProducts"
  );
  const featuredEntries = await Promise.all(
    featuredBlocks.map(async (block) => {
      const handles = (
        (block as { productHandles?: (string | null)[] }).productHandles ?? []
      ).filter((h): h is string => Boolean(h));
      return [block._key, await featuredCards(handles)] as const;
    })
  );
  const featuredProductsByKey: Record<string, ProductCardProps[]> =
    Object.fromEntries(featuredEntries);

  return (
    <main className="flex flex-col">
      {heroBlock.length > 0 && (
        <div className="[&>main]:my-0">
          <PageBuilder id={_id} pageBuilder={heroBlock} type={_type} />
        </div>
      )}

      {remainingBlocks.length > 0 && (
        <PageBuilder
          featuredProductsByKey={featuredProductsByKey}
          id={_id}
          pageBuilder={remainingBlocks}
          type={_type}
        />
      )}
    </main>
  );
}
