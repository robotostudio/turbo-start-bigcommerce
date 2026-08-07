import { client } from "@workspace/sanity/client";
import { sanityFetch } from "@workspace/sanity/live";
import { queryBlogPaths, queryBlogSlugPageData } from "@workspace/sanity/query";
import { notFound } from "next/navigation";

import { BlogAuthor } from "@/components/blog-card";
import { BlogShare } from "@/components/blog-share";
import { RichText } from "@/components/elements/rich-text";
import { TableOfContent } from "@/components/elements/table-of-content";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/json-ld";
import { fetchOrFallback } from "@/lib/build-guard";
import { getSEOMetadata } from "@/lib/seo";
import { getBaseUrl } from "@/utils";

function formatBlogDate(date: string | null | undefined) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function fetchBlogSlugPageData(slug: string) {
  return await sanityFetch({
    query: queryBlogSlugPageData,
    params: { slug: `/blog/${slug}` },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data } = await fetchBlogSlugPageData(slug);
  return getSEOMetadata(
    data
      ? {
          title: data?.title ?? data?.seoTitle ?? "",
          description: data?.description ?? data?.seoDescription ?? "",
          slug: data?.slug,
          contentId: data?._id,
          contentType: data?._type,
          pageType: "article",
        }
      : {}
  );
}

export async function generateStaticParams() {
  const slugs = await fetchOrFallback(
    "Sanity blog paths",
    "blog posts render on demand instead of being prerendered",
    () => client.fetch(queryBlogPaths),
    []
  );

  const paths: { slug: string }[] = [];
  for (const slug of slugs) {
    const [, , path] = slug.split("/");
    if (path) paths.push({ slug: path });
  }
  return paths;
}

export const dynamicParams = true;

export default async function BlogSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data } = await fetchBlogSlugPageData(slug);
  if (!data) return notFound();

  const {
    title,
    richText,
    authors,
    publishedAt,
    _updatedAt,
    slug: dataSlug,
  } = data ?? {};

  const baseUrl = getBaseUrl();
  const shareUrl = `${baseUrl}${dataSlug ?? `/blog/${slug}`}`;
  const publishedDate = formatBlogDate(publishedAt);
  const updatedDate = formatBlogDate(_updatedAt);

  return (
    <div className=" site-container px-4 py-16 md:px-8">
      <ArticleJsonLd article={data} />
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: baseUrl },
          { name: "Blog", url: `${baseUrl}/blog` },
          { name: title ?? "" },
        ]}
      />

      {/* Article header — left aligned */}
      <header className="pb-18 flex flex-col gap-6">
        <h1 className="max-w-4xl font-medium text-4xl leading-tight tracking-tight md:text-5xl lg:text-6xl">
          {title}
        </h1>
        <div className="flex flex-col gap-4">
          {(publishedDate || updatedDate) && (
            <div className="flex flex-col gap-0.5 text-sm">
              {publishedDate && (
                <p>
                  <span className="text-muted-foreground">Published At:</span>{" "}
                  <time dateTime={publishedAt ?? undefined}>
                    {publishedDate}
                  </time>
                </p>
              )}
              {updatedDate && (
                <p>
                  <span className="text-muted-foreground">
                    Last Updated At:
                  </span>{" "}
                  <time dateTime={_updatedAt ?? undefined}>{updatedDate}</time>
                </p>
              )}
            </div>
          )}
          <BlogAuthor author={authors} />
        </div>
      </header>

      {/* Two-column: article body + sticky sidebar (TOC + share) */}
      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
        <main className="min-w-0">
          <RichText richText={richText} />
        </main>

        <aside className="hidden self-start lg:sticky lg:top-24 lg:block">
          <div className="bg-grid-dots p-4 text-muted-foreground">
            <div className="flex flex-col gap-12 bg-card p-4 text-foreground">
              <TableOfContent richText={richText ?? []} />
              <BlogShare title={title ?? ""} url={shareUrl} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
