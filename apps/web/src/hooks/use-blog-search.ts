import { useQuery } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { Blog } from "@/types";
import { useDebounce } from "./use-debounce";

const SEARCH_DEBOUNCE_MS = 400;
const CACHE_STALE_TIME_MS = 30_000;
const SEARCH_PARAM = "search";

async function searchBlog(query: string, signal: AbortSignal) {
  if (!query.trim()) {
    return [];
  }

  const response = await fetch(
    `/api/blog/search?q=${encodeURIComponent(query)}`,
    { signal }
  );

  if (!response.ok) {
    throw new Error("Failed to search");
  }

  return response.json() as Promise<Blog[]>;
}

export function useBlogSearch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Seed the input from the URL so a shared/refreshed ?search= URL works.
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get(SEARCH_PARAM) ?? ""
  );
  const debouncedQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  // Reflect the debounced query into the URL, preserving other params
  // (e.g. ?category=) and dropping ?page= since search replaces the grid.
  // Uses the native History API instead of router.replace so it does NOT
  // re-run the server component / refetch Sanity on every keystroke.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.get(SEARCH_PARAM) ?? "";
    const next = debouncedQuery.trim();

    if (next === current) {
      return;
    }

    if (next) {
      params.set(SEARCH_PARAM, next);
      params.delete("page");
    } else {
      params.delete(SEARCH_PARAM);
    }

    const queryString = params.toString();
    const url = queryString ? `${pathname}?${queryString}` : pathname;
    window.history.replaceState(window.history.state, "", url);
  }, [debouncedQuery, pathname, searchParams]);

  const hasQuery = debouncedQuery.trim().length > 0;
  const { data, isLoading, error } = useQuery({
    queryKey: ["blog-search", debouncedQuery],
    queryFn: ({ signal }) => searchBlog(debouncedQuery, signal),
    enabled: hasQuery,
    staleTime: CACHE_STALE_TIME_MS,
  });
  return {
    searchQuery,
    setSearchQuery,
    results: data ?? [],
    isSearching: isLoading,
    error,
    hasQuery,
  };
}
