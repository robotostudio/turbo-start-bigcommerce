"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useDebounce } from "@/hooks/use-debounce";
import type {
  ShopifyCollectionLite,
  ShopifyCollectionProduct,
} from "@/lib/shopify/types";

const SEARCH_DEBOUNCE_MS = 250;
const CACHE_STALE_TIME_MS = 30_000;

type SearchResponse = {
  products: ShopifyCollectionProduct[];
  collections: ShopifyCollectionLite[];
  related: string[];
};

const EMPTY: SearchResponse = { products: [], collections: [], related: [] };

async function searchProducts(
  query: string,
  signal: AbortSignal
): Promise<SearchResponse> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    signal,
  });
  if (!response.ok) {
    throw new Error("Failed to search");
  }
  return response.json() as Promise<SearchResponse>;
}

export function useProductSearch(initialQuery = "") {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);

  const hasQuery = debouncedQuery.trim().length > 0;
  const { data, isLoading } = useQuery({
    queryKey: ["product-search", debouncedQuery],
    queryFn: ({ signal }) => searchProducts(debouncedQuery, signal),
    enabled: hasQuery,
    staleTime: CACHE_STALE_TIME_MS,
  });

  const results = data ?? EMPTY;

  return {
    query,
    setQuery,
    debouncedQuery,
    products: results.products,
    collections: results.collections,
    related: results.related,
    isSearching: isLoading,
    hasQuery: query.trim().length > 0,
  };
}
