import { sanityFetch } from "@workspace/sanity/live";
import { queryHomePageData } from "@workspace/sanity/query";

import { PageBuilder } from "@/components/pagebuilder";
import { resolvePageBuilderData } from "@/components/pagebuilder-data.server";
import { getSEOMetadata } from "@/lib/seo";

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

  // Resolved across the whole page rather than per group, so the two
  // PageBuilder instances below share one round of catalog reads. The map is
  // keyed by block `_key`, so handing the same one to both is safe — each
  // instance only ever looks up the blocks it renders.
  const blockData = await resolvePageBuilderData(blocks);

  return (
    <main className="flex flex-col">
      {heroBlock.length > 0 && (
        <div className="[&>main]:my-0">
          <PageBuilder
            blockData={blockData}
            id={_id}
            pageBuilder={heroBlock}
            type={_type}
          />
        </div>
      )}

      {remainingBlocks.length > 0 && (
        <PageBuilder
          blockData={blockData}
          id={_id}
          pageBuilder={remainingBlocks}
          type={_type}
        />
      )}
    </main>
  );
}
