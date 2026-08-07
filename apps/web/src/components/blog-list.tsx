import { BlogCard } from "@/components/blog-card";
import type { Blog } from "@/types";

export type BlogListProps = {
  blogs: Blog[];
  isLoading?: boolean;
};

const GRID_CLASSES = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

export function BlogList({ blogs, isLoading = false }: BlogListProps) {
  if (isLoading) {
    return (
      <div className={GRID_CLASSES}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            className="flex h-full flex-col gap-4 border border-border p-6"
            key={`skeleton-${index.toString()}`}
          >
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-6 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="mt-auto h-6 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (blogs.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">
          No blog posts available at the moment.
        </p>
      </div>
    );
  }

  return (
    <div className={GRID_CLASSES}>
      {blogs.map((blog) => (
        <BlogCard blog={blog} key={blog._id} />
      ))}
    </div>
  );
}
