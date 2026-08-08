"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { ActiveFilters } from "@/components/collection/active-filters";
import {
  type Facet,
  filterParamsOnly,
} from "@/components/collection/filter-utils";
import { FilterPanel } from "@/components/collection/filter-panel";
import {
  ListingControls,
  ListingControlsProvider,
} from "@/components/collection/listing-controls";
import { useDebounce } from "@/hooks/use-debounce";
import type { BigCommerceCardProduct } from "@/lib/bigcommerce/product-card";
import { searchUrlWithQuery } from "./paths";
import { SearchEmptyState } from "./search-empty-state";
import { SearchProductGrid } from "./search-product-grid";

const SEARCH_DEBOUNCE_MS = 250;
const CACHE_STALE_TIME_MS = 30_000;

type FullSearchResponse = {
  products: BigCommerceCardProduct[];
  totalCount: number;
  facets: Facet[];
  filteringEnabled: boolean;
};

const EMPTY: FullSearchResponse = {
  products: [],
  totalCount: 0,
  facets: [],
  filteringEnabled: false,
};

/**
 * The listing state this page owns: every `filter.*` param plus `sort`. Both
 * are written by controls that hand back a whole query string, so they are held
 * together rather than as two states that would each have to preserve the
 * other's params.
 */
function readListingParams(search: string): URLSearchParams {
  const params = filterParamsOnly(search);
  const sort = new URLSearchParams(search).get("sort");
  if (sort) params.set("sort", sort);
  return params;
}

async function fetchFullResults(
  query: string,
  listingQs: string,
  signal: AbortSignal
): Promise<FullSearchResponse> {
  const params = new URLSearchParams(listingQs);
  params.set("q", query);

  const response = await fetch(`/api/search/full?${params.toString()}`, {
    signal,
  });
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

  /**
   * Filter and sort state live here for the same reason `query` does: this page
   * treats the address bar as an output it writes with `replaceState`, and
   * `useSearchParams` does not observe that. A control reading the hook would
   * build its second pick from the params of its first.
   *
   * Initialised from the live URL so a shared or bookmarked filtered, sorted
   * search opens that way.
   */
  const [listingParams, setListingParams] = useState(() =>
    readListingParams(
      typeof window === "undefined" ? "" : window.location.search
    )
  );
  const listingQs = listingParams.toString();

  const onListingNavigate = useCallback((qs: string) => {
    setListingParams(readListingParams(qs));
  }, []);

  // Keep the address bar in sync WITHOUT a router navigation — a client nav to
  // /search would re-trigger the intercepting route and open the drawer.
  useEffect(() => {
    // Rebuild from the live URL rather than from scratch: this page is a
    // share/ad landing target, so it routinely arrives carrying utm_* params
    // that a from-scratch URL would silently drop. `searchUrlWithQuery` keeps
    // every param it is given, so the listing state written below survives a
    // later keystroke and vice versa.
    const live = window.location.search;
    const next = new URLSearchParams(live);
    for (const key of [...next.keys()]) {
      if (key.startsWith("filter.") || key === "sort") next.delete(key);
    }
    for (const [key, value] of listingParams.entries()) {
      next.append(key, value);
    }

    const url = searchUrlWithQuery(trimmed, next.toString());
    if (url === `${window.location.pathname}${live}`) return;

    window.history.replaceState(null, "", url);
  }, [trimmed, listingParams]);

  const { data, isLoading } = useQuery({
    // Filters and sort are part of the key, or a pick would rewrite the URL and
    // serve the previous result set — in the previous order — out of the cache.
    queryKey: ["search-full", trimmed, listingQs],
    queryFn: ({ signal }) => fetchFullResults(trimmed, listingQs, signal),
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
            <ListingControlsProvider>
              <div className="mb-6 flex items-start justify-between gap-4">
                {isLoading ? (
                  <span />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {results.totalCount} result
                    {results.totalCount !== 1 ? "s" : ""} for &ldquo;{trimmed}
                    &rdquo;
                  </p>
                )}
                {/* Same overrides as the panel: the sort menu writes the same
                 * address bar, and a router push here would reopen the drawer.
                 * `hasSearchTerm` is what makes the default option read
                 * "Relevance" rather than "Featured". */}
                <ListingControls
                  hasSearchTerm
                  onNavigate={onListingNavigate}
                  params={listingParams}
                />
              </div>

              <div className="mb-8 flex flex-col gap-4">
                <FilterPanel
                  filteringEnabled={results.filteringEnabled}
                  filters={results.facets}
                  onNavigate={onListingNavigate}
                  params={listingParams}
                />
                {/* Facets passed so a brand chip reads "Aster" rather than its
                 * entity id. */}
                <ActiveFilters
                  facets={results.facets}
                  onNavigate={onListingNavigate}
                  params={listingParams}
                />
              </div>
            </ListingControlsProvider>

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
