"use client";

import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

import { SearchProductGrid } from "./search-product-grid";
import { useSearchDefaults } from "./use-search-defaults";

type SearchEmptyStateProps = {
  /** Runs a search for the given term (mirrors the Related chips). */
  onSelectTerm: (term: string) => void;
  /** Forwarded to `next/link`: replace the current history entry, don't push. */
  replace?: boolean;
};

export function SearchEmptyState({
  onSelectTerm,
  replace,
}: SearchEmptyStateProps) {
  const { collections, bestSellers, isLoading } = useSearchDefaults();

  return (
    <div className="flex flex-col gap-8 site-container">
      {collections.length > 0 && (
        <section className="flex flex-col gap-4 py-8">
          <h2 className="font-medium text-foreground text-xl tracking-[0.24px]">
            Popular Searches
          </h2>
          <div className="flex flex-wrap gap-2">
            {collections.map((collection) => (
              <button
                className="bg-zinc-200 px-1 text-base text-zinc-900 tracking-[0.24px] transition-colors hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                key={collection.id}
                onClick={() => onSelectTerm(collection.title)}
                type="button"
              >
                {collection.title}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-foreground text-xl tracking-[0.24px]">
            Best Sellers
          </h2>
          <Button asChild size="sm">
            <Link href="/collections" replace={replace}>
              Shop All
            </Link>
          </Button>
        </div>
        <SearchProductGrid
          isLoading={isLoading}
          products={bestSellers}
          replace={replace}
          skeletonCount={4}
        />
      </section>
    </div>
  );
}
