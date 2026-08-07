"use client";

import type { QueryBlogCategoriesResult } from "@workspace/sanity/types";
import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";

import { SearchInput } from "./blog-search";

type BlogFilterSidebarProps = {
  categories: QueryBlogCategoriesResult;
  activeCategory: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
};

function FilterLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      className={cn(
        "font-mono text-sm uppercase tracking-widest transition-colors",
        isActive
          ? "text-foreground underline underline-offset-4"
          : "text-muted-foreground hover:text-foreground"
      )}
      href={href}
    >
      {label}
    </Link>
  );
}

export function BlogFilterSidebar({
  categories,
  activeCategory,
  searchQuery,
  onSearchChange,
  onSearchClear,
}: BlogFilterSidebarProps) {
  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-56 lg:self-start">
      <div className="bg-grid-dots p-4 text-muted-foreground">
        <div className="flex flex-col gap-6 bg-card p-4 text-foreground">
          <SearchInput
            onChange={onSearchChange}
            onClear={onSearchClear}
            placeholder="Search..."
            value={searchQuery}
          />
          <nav className="grid grid-cols-2 gap-x-4 gap-y-3 lg:flex lg:flex-col lg:gap-2">
            <FilterLink href="/blog" isActive={!activeCategory} label="All" />
            {categories.map((category) =>
              category.slug ? (
                <FilterLink
                  href={`/blog?category=${category.slug}`}
                  isActive={activeCategory === category.slug}
                  key={category._id}
                  label={category.title ?? ""}
                />
              ) : null
            )}
          </nav>
        </div>
      </div>
    </aside>
  );
}
