import { sanityFetch } from "@workspace/sanity/live";
import {
  queryBlogCategories,
  queryBlogIndexPageBlogs,
  queryBlogIndexPageBlogsCount,
  queryBlogIndexPageData,
} from "@workspace/sanity/query";
import { notFound } from "next/navigation";

import { BlogHeader } from "@/components/blog-card";
import { BlogPageContent } from "@/components/blog-page-content";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { PageBuilderJsonLd } from "@/components/page-builder-json-ld";
import { PageBuilder } from "@/components/pagebuilder";
import { pageBuilderSeeds } from "@/components/pagebuilder-data.server";
import { seoFromDocument } from "@/lib/seo";
import {
  calculatePaginationMetadata,
  getBaseUrl,
  getBlogPaginationStartEnd,
  handleErrors,
} from "@/utils";

async function fetchBlogIndexPageData() {
  const res = await sanityFetch({ query: queryBlogIndexPageData });
  return res.data;
}

async function fetchBlogIndexPageBlogs(
  start: number,
  end: number,
  category: string
) {
  const res = await sanityFetch({
    query: queryBlogIndexPageBlogs,
    params: { start, end, category },
  });
  return res.data;
}

async function fetchBlogIndexPageBlogsCount(category: string) {
  const res = await sanityFetch({
    query: queryBlogIndexPageBlogsCount,
    params: { category },
  });
  return res.data;
}

async function fetchBlogCategories() {
  const res = await sanityFetch({ query: queryBlogCategories });
  return res.data;
}

type BlogPageProps = {
  searchParams: Promise<{
    page?: string;
    category?: string;
  }>;
};

/**
 * `Number(page)` alone accepted `1.5`, `-3`, `1e3` and `Infinity`, all of which
 * reached the slice arithmetic and rendered an empty list at HTTP 200 — a soft
 * 404 a crawler reads as a real page.
 */
function parsePageParam(raw: string | undefined): number | null {
  if (raw === undefined) {
    return 1;
  }
  if (!/^[1-9][0-9]*$/.test(raw)) {
    return null;
  }
  return Number(raw);
}

export async function generateMetadata({ searchParams }: BlogPageProps) {
  const { page } = await searchParams;
  const { data: result } = await sanityFetch({
    query: queryBlogIndexPageData,
    stega: false,
  });
  // Self-referencing: page 3 canonicalising to page 1 claims the posts only
  // listed on page 3 belong to a URL that does not show them. An `alternates`
  // override, not the `slug`, which also feeds the `.md` twin — that stays
  // `/blog.md`.
  const currentPage = parsePageParam(page);
  const meta = await seoFromDocument(result, { slug: "/blog" });
  if (!currentPage || currentPage === 1) {
    return meta;
  }
  return {
    ...meta,
    alternates: {
      ...meta.alternates,
      canonical: `${getBaseUrl()}/blog?page=${currentPage}`,
    },
  };
}

export default async function BlogIndexPage({ searchParams }: BlogPageProps) {
  const { page, category } = await searchParams;
  const currentPage = parsePageParam(page);
  if (currentPage === null) {
    notFound();
  }
  const activeCategory = category ?? "";

  // Fetch page data, categories, and total count in parallel
  const [
    [indexPageData, errIndexPageData],
    [categories, errCategories],
    [totalCount, errTotalCount],
  ] = await Promise.all([
    handleErrors(fetchBlogIndexPageData()),
    handleErrors(fetchBlogCategories()),
    handleErrors(fetchBlogIndexPageBlogsCount(activeCategory)),
  ]);

  if (errIndexPageData || !indexPageData) {
    notFound();
  }

  // The blog index carries the same `pageBuilderField` as the home page, so it
  // can hold the product-backed blocks too. The reads start once here, and the
  // map goes to every PageBuilder below — including the two error paths — with
  // each block unwrapping its own entry behind Suspense.
  //
  // They are resolved before the render, not handed down pending: the page
  // builder is a client component, and an unsettled promise crossing that
  // boundary makes the product blocks ship skeletons with their real markup
  // hidden behind a JavaScript-only swap. See `pageBuilderSeeds`.
  const blockData = await pageBuilderSeeds(indexPageData.pageBuilder ?? []);

  if (errTotalCount || totalCount === null || totalCount === undefined) {
    return (
      <main className="site-container my-16">
        <BlogHeader title={indexPageData.title} />
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            Unable to load blog posts at the moment.
          </p>
        </div>
        <PageBuilderJsonLd pageBuilder={indexPageData.pageBuilder} />
        <PageBuilder
          blockData={blockData}
          id={indexPageData._id}
          pageBuilder={indexPageData.pageBuilder}
          type={indexPageData._type}
        />
      </main>
    );
  }

  // Featured posts only apply on the unfiltered, first-page view.
  const featuredBlogsCount =
    indexPageData.displayFeaturedBlogs && !activeCategory
      ? Number(indexPageData.featuredBlogsCount) || 0
      : 0;

  const paginationMetadata = calculatePaginationMetadata(
    totalCount,
    currentPage
  );

  // Page 1 stays 200 on an empty blog; past the last page is not a page.
  if (currentPage > 1 && currentPage > paginationMetadata.totalPages) {
    notFound();
  }

  const { start, end } = getBlogPaginationStartEnd(currentPage);
  const blogStart = currentPage === 1 ? 0 : start + featuredBlogsCount;
  const blogEnd =
    currentPage === 1 ? end + featuredBlogsCount : end + featuredBlogsCount;

  const [blogs, errBlogs] = await handleErrors(
    fetchBlogIndexPageBlogs(blogStart, blogEnd, activeCategory)
  );

  if (errBlogs || !blogs) {
    return (
      <main className="site-container my-16">
        <BlogHeader title={indexPageData.title} />
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            No blog posts available at the moment.
          </p>
        </div>
        <PageBuilderJsonLd pageBuilder={indexPageData.pageBuilder} />
        <PageBuilder
          blockData={blockData}
          id={indexPageData._id}
          pageBuilder={indexPageData.pageBuilder}
          type={indexPageData._type}
        />
      </main>
    );
  }

  const baseUrl = getBaseUrl();

  return (
    <>
      <BreadcrumbJsonLd
        items={[{ name: "Home", url: baseUrl }, { name: "Blog" }]}
      />
      <PageBuilderJsonLd pageBuilder={indexPageData.pageBuilder} />
      <BlogPageContent
        activeCategory={activeCategory}
        blockData={blockData}
        blogs={blogs}
        categories={errCategories ? [] : (categories ?? [])}
        indexPageData={indexPageData}
        paginationMetadata={paginationMetadata}
      />
    </>
  );
}
