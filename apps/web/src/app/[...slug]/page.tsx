import { client } from "@workspace/sanity/client";
import { sanityFetch } from "@workspace/sanity/live";
import { querySlugPageData, querySlugPagePaths } from "@workspace/sanity/query";
import { notFound } from "next/navigation";

import { BreadcrumbJsonLd } from "@/components/json-ld";
import { PageBuilder } from "@/components/pagebuilder";
import { resolvePageBuilderData } from "@/components/pagebuilder-data.server";
import { fetchOrFallback } from "@/lib/build-guard";
import { getSEOMetadata } from "@/lib/seo";
import { capitalize, getBaseUrl } from "@/utils";

async function fetchSlugPageData(slug: string, stega = true) {
  return await sanityFetch({
    query: querySlugPageData,
    params: { slug: `/${slug}` },
    stega,
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const slugString = slug.join("/");
  const { data: pageData } = await fetchSlugPageData(slugString, false);
  return getSEOMetadata(
    pageData
      ? {
          title: pageData?.title ?? pageData?.seoTitle ?? "",
          description: pageData?.description ?? pageData?.seoDescription ?? "",
          slug: pageData?.slug,
          contentId: pageData?._id,
          contentType: pageData?._type,
          // The Studio's "hide from search engines" toggle. It rides through on
          // the query's bare `...` spread, so forgetting it here is silent —
          // the editor ticks the box and the page still ships `index, follow`.
          seoNoIndex: pageData?.seoNoIndex ?? false,
        }
      : {}
  );
}

export async function generateStaticParams() {
  const slugs = await fetchOrFallback(
    "Sanity page paths",
    "these pages render on demand instead of being prerendered",
    () => client.fetch(querySlugPagePaths),
    []
  );
  return slugs
    .map((slug) => ({ slug: slug.split("/").filter(Boolean) }))
    .filter((path) => path.slug.length > 0);
}

// Allow dynamic params for paths not generated at build time
export const dynamicParams = true;

export default async function SlugPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const slugString = slug.join("/");
  const { data: pageData } = await fetchSlugPageData(slugString);

  if (!pageData) {
    return notFound();
  }

  const { title, pageBuilder, _id, _type } = pageData ?? {};

  const baseUrl = getBaseUrl();
  // Home → one crumb per URL segment; the last (current) page uses the page
  // title and omits its url per schema.org guidance.
  const breadcrumbItems = [
    { name: "Home", url: baseUrl },
    ...slug.map((segment, index) => {
      const isLast = index === slug.length - 1;
      const name = isLast
        ? (title ?? capitalize(segment.replace(/-/g, " ")))
        : capitalize(segment.replace(/-/g, " "));
      return isLast
        ? { name }
        : { name, url: `${baseUrl}/${slug.slice(0, index + 1).join("/")}` };
    }),
  ];

  const breadcrumb = <BreadcrumbJsonLd items={breadcrumbItems} />;

  const blockData = Array.isArray(pageBuilder)
    ? await resolvePageBuilderData(pageBuilder)
    : {};

  return !Array.isArray(pageBuilder) || pageBuilder?.length === 0 ? (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-4 text-center">
      {breadcrumb}
      <h1 className="mb-4 font-semibold text-2xl capitalize">{title}</h1>
      <p className="mb-6 text-muted-foreground">
        This page has no content blocks yet.
      </p>
    </div>
  ) : (
    <>
      {breadcrumb}
      <PageBuilder
        blockData={blockData}
        id={_id}
        pageBuilder={pageBuilder}
        type={_type}
      />
    </>
  );
}
