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
import { PageBuilder } from "@/components/pagebuilder";
import { getSEOMetadata } from "@/lib/seo";
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

export async function generateMetadata() {
  const { data: result } = await sanityFetch({
    query: queryBlogIndexPageData,
    stega: false,
  });
  return getSEOMetadata(
    result
      ? {
          title: result?.title ?? result?.seoTitle ?? "",
          description: result?.description ?? result?.seoDescription ?? "",
          slug: result?.slug,
          contentId: result?._id,
          contentType: result?._type,
        }
      : {}
  );
}

type BlogPageProps = {
  searchParams: Promise<{
    page?: string;
    category?: string;
  }>;
};

export default async function BlogIndexPage({ searchParams }: BlogPageProps) {
  const { page, category } = await searchParams;
  const currentPage = page ? Number(page) : 1;
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

  if (errTotalCount || totalCount === null || totalCount === undefined) {
    return (
      <main className="site-container my-16">
        <BlogHeader title={indexPageData.title} />
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            Unable to load blog posts at the moment.
          </p>
        </div>
        {indexPageData.pageBuilder && indexPageData.pageBuilder.length > 0 && (
          <PageBuilder
            id={indexPageData._id}
            pageBuilder={indexPageData.pageBuilder}
            type={indexPageData._type}
          />
        )}
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
        {indexPageData.pageBuilder && indexPageData.pageBuilder.length > 0 && (
          <PageBuilder
            id={indexPageData._id}
            pageBuilder={indexPageData.pageBuilder}
            type={indexPageData._type}
          />
        )}
      </main>
    );
  }

  const baseUrl = getBaseUrl();

  return (
    <>
      <BreadcrumbJsonLd
        items={[{ name: "Home", url: baseUrl }, { name: "Blog" }]}
      />
      <BlogPageContent
        activeCategory={activeCategory}
        blogs={blogs}
        categories={errCategories ? [] : (categories ?? [])}
        indexPageData={indexPageData}
        paginationMetadata={paginationMetadata}
      />
    </>
  );
}
