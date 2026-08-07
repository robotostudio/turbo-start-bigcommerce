"use client";

import type {
  QueryBlogCategoriesResult,
  QueryBlogIndexPageDataResult,
} from "@workspace/sanity/types";

import { BlogHeader, FeaturedBlogCard } from "@/components/blog-card";
import { BlogFilterSidebar } from "@/components/blog-filter-sidebar";
import { BlogList } from "@/components/blog-list";
import { BlogPagination } from "@/components/blog-pagination";
import { BlogSearchResults } from "@/components/blog-search-results";
import { PageBuilder } from "@/components/pagebuilder";
import { useBlogSearch } from "@/hooks/use-blog-search";
import type { Blog } from "@/types";
import type { PaginationMetadata } from "@/utils";

type BlogPageContentProps = {
  indexPageData: NonNullable<QueryBlogIndexPageDataResult>;
  blogs: Blog[];
  categories: QueryBlogCategoriesResult;
  activeCategory: string;
  paginationMetadata: PaginationMetadata;
};

export function BlogPageContent({
  indexPageData,
  blogs,
  categories,
  activeCategory,
  paginationMetadata,
}: BlogPageContentProps) {
  const {
    title,
    pageBuilder = [],
    _id,
    _type,
    featuredBlogsCount,
    displayFeaturedBlogs,
  } = indexPageData;

  const { searchQuery, setSearchQuery, results, isSearching, hasQuery, error } =
    useBlogSearch();

  const validFeaturedBlogsCount = featuredBlogsCount
    ? Number.parseInt(featuredBlogsCount, 10)
    : 0;

  const shouldDisplayFeaturedBlogs =
    displayFeaturedBlogs &&
    validFeaturedBlogsCount > 0 &&
    paginationMetadata.currentPage === 1 &&
    !activeCategory &&
    !hasQuery;

  const featuredBlogs = shouldDisplayFeaturedBlogs
    ? blogs.slice(0, validFeaturedBlogsCount)
    : [];

  const remainingBlogs = shouldDisplayFeaturedBlogs
    ? blogs.slice(validFeaturedBlogsCount)
    : blogs;

  const basePath = activeCategory
    ? `/blog?category=${activeCategory}`
    : "/blog";

  return (
    <main className="bg-background">
      <div className="site-container my-16 flex flex-col gap-12">
        <BlogHeader title={title} />

        {featuredBlogs.length > 0 && (
          <section className="flex flex-col gap-8">
            <h2 className="sr-only">Featured Posts</h2>
            {featuredBlogs.map((blog) => (
              <FeaturedBlogCard blog={blog} key={blog._id} />
            ))}
          </section>
        )}

        <div className="flex flex-col gap-8 lg:flex-row lg:gap-16">
          <BlogFilterSidebar
            activeCategory={activeCategory}
            categories={categories}
            onSearchChange={setSearchQuery}
            onSearchClear={() => setSearchQuery("")}
            searchQuery={searchQuery}
          />

          <div className="min-w-0 flex-1">
            {hasQuery ? (
              <BlogSearchResults
                error={error}
                hasQuery={hasQuery}
                isSearching={isSearching}
                results={results}
                searchQuery={searchQuery}
              />
            ) : (
              <div className="flex flex-col gap-12">
                <BlogList blogs={remainingBlogs} />
                {paginationMetadata?.totalPages > 1 && (
                  <BlogPagination
                    basePath={basePath}
                    className="flex justify-center"
                    currentPage={paginationMetadata.currentPage}
                    hasNextPage={paginationMetadata.hasNextPage}
                    hasPreviousPage={paginationMetadata.hasPreviousPage}
                    totalPages={paginationMetadata.totalPages}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {pageBuilder && pageBuilder.length > 0 && (
        <PageBuilder id={_id} pageBuilder={pageBuilder} type={_type} />
      )}
    </main>
  );
}
