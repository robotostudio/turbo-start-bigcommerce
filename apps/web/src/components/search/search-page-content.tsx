"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useDebounce } from "@/hooks/use-debounce";
import type { ShopifyCollectionProduct } from "@/lib/shopify/types";
import { readSearchQuery, searchUrlWithQuery } from "./paths";
import { SearchEmptyState } from "./search-empty-state";
import { SearchProductGrid } from "./search-product-grid";

const SEARCH_DEBOUNCE_MS = 250;
const CACHE_STALE_TIME_MS = 30_000;

type FullSearchResponse = {
  products: ShopifyCollectionProduct[];
  totalCount: number;
};

const EMPTY: FullSearchResponse = { products: [], totalCount: 0 };

async function fetchFullResults(
  query: string,
  signal: AbortSignal
): Promise<FullSearchResponse> {
  const response = await fetch(
    `/api/search/full?q=${encodeURIComponent(query)}`,
    {
      signal,
    }
  );
  if (!response.ok) {
    throw new Error("Failed to search");
  }
  return response.json() as Promise<FullSearchResponse>;
}

export function SearchPageContent({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const trimmed = debouncedQuery.trim();
  const hasQuery = trimmed.length > 0;

  // Keep the address bar in sync WITHOUT a router navigation — a client nav to
  // /search would re-trigger the intercepting route and open the drawer.
  useEffect(() => {
    // Skip identical writes, and rebuild from the live URL rather than from
    // scratch: this page is a share/ad landing target, so it routinely arrives
    // carrying utm_* params that a from-scratch URL would silently drop.
    if (readSearchQuery(window.location.search) === trimmed) {
      return;
    }
    window.history.replaceState(
      null,
      "",
      searchUrlWithQuery(trimmed, window.location.search)
    );
  }, [trimmed]);

  const { data, isLoading } = useQuery({
    queryKey: ["search-full", trimmed],
    queryFn: ({ signal }) => fetchFullResults(trimmed, signal),
    enabled: hasQuery,
    staleTime: CACHE_STALE_TIME_MS,
  });

  const results = data ?? EMPTY;

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-4 border-b px-4 py-4 md:px-8">
        <input
          className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          defaultValue={initialQuery}
          id="search-page-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing to search…"
          ref={inputRef}
          type="text"
        />
      </div>

      <div className="bg-muted/30">
        {hasQuery ? (
          <div className="site-container py-8 ">
            {!isLoading && (
              <p className="mb-6 text-muted-foreground text-sm">
                {results.totalCount} result
                {results.totalCount !== 1 ? "s" : ""} for &ldquo;{trimmed}
                &rdquo;
              </p>
            )}
            <SearchProductGrid
              isLoading={isLoading}
              products={results.products}
            />
          </div>
        ) : (
          <SearchEmptyState onSelectTerm={setQuery} />
        )}
      </div>
    </div>
  );
}
