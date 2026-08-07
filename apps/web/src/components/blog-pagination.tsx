import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { useCallback } from "react";

export type PaginationProps = {
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  /** Base path, optionally including a query string (e.g. `/blog?category=seo`). */
  basePath?: string;
};

interface BlogPaginationProps extends PaginationProps {
  className?: string;
}

function generatePaginationItems(currentPage: number, totalPages: number) {
  const items: (number | "ellipsis")[] = [];
  const delta = 2; // Number of pages to show around current page

  if (totalPages <= 7) {
    // Show all pages if total is small
    for (let i = 1; i <= totalPages; i++) {
      items.push(i);
    }
  } else {
    // Always show first page
    items.push(1);

    // Add ellipsis if needed
    if (currentPage - delta > 2) {
      items.push("ellipsis");
    }

    // Add pages around current page
    const start = Math.max(2, currentPage - delta);
    const end = Math.min(totalPages - 1, currentPage + delta);

    for (let i = start; i <= end; i++) {
      items.push(i);
    }

    // Add ellipsis if needed
    if (currentPage + delta < totalPages - 1) {
      items.push("ellipsis");
    }

    // Always show last page
    if (totalPages > 1) {
      items.push(totalPages);
    }
  }

  return items;
}

export function BlogPagination({
  currentPage,
  totalPages,
  hasNextPage,
  basePath = "/blog",
  className,
}: BlogPaginationProps) {
  const paginationItems = generatePaginationItems(currentPage, totalPages);

  const getPageUrl = useCallback(
    (page: number): string => {
      const [path = "/blog", query = ""] = basePath.split("?");
      const params = new URLSearchParams(query);
      if (page <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(page));
      }
      const nextQuery = params.toString();
      return nextQuery ? `${path}?${nextQuery}` : path;
    },
    [basePath]
  );

  return (
    <nav
      aria-label="Blog pagination"
      className={cn("flex items-center gap-5 font-mono text-base", className)}
    >
      {paginationItems.map((item, index) =>
        item === "ellipsis" ? (
          <span
            className="text-muted-foreground"
            key={`ellipsis-${index.toString()}`}
          >
            …
          </span>
        ) : item === currentPage ? (
          <span
            aria-current="page"
            className="flex items-center justify-center border-[0.75px] border-foreground px-2 pt-0.5 pb-1 text-foreground"
            key={item}
          >
            {item}
          </span>
        ) : (
          <Link
            aria-label={`Go to page ${item}`}
            className="text-muted-foreground transition-colors hover:text-foreground"
            href={getPageUrl(item)}
            key={item}
          >
            {item}
          </Link>
        )
      )}

      {hasNextPage && (
        <Link
          aria-label={`Go to page ${currentPage + 1}`}
          className="font-sans text-muted-foreground transition-colors hover:text-foreground"
          href={getPageUrl(currentPage + 1)}
        >
          Next
        </Link>
      )}
    </nav>
  );
}
