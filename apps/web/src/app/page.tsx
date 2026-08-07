import { sanityFetch } from "@workspace/sanity/live";
import { queryHomePageData } from "@workspace/sanity/query";

import { PageBuilder } from "@/components/pagebuilder";
import { getSEOMetadata } from "@/lib/seo";
import { getFeaturedProducts } from "@/lib/shopify/featured";
import type { FeaturedProduct } from "@/lib/shopify/types";

async function fetchHomePageData() {
  return await sanityFetch({
    query: queryHomePageData,
  });
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

  // Featured Products blocks can't fetch Shopify themselves (they render inside
  // the client PageBuilder), so resolve their products here, keyed by block.
  const featuredBlocks = blocks.filter(
    (b: { _type: string }) => (b._type as string) === "featuredProducts"
  );
  const featuredEntries = await Promise.all(
    featuredBlocks.map(async (block) => {
      const handles = (
        (block as { productHandles?: (string | null)[] }).productHandles ?? []
      ).filter((h): h is string => Boolean(h));
      return [block._key, await getFeaturedProducts(handles)] as const;
    })
  );
  const featuredProductsByKey: Record<string, FeaturedProduct[]> =
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
