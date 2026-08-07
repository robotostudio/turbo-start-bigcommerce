"use client";

import { useQuery } from "@tanstack/react-query";

import type {
  ShopifyCollectionLite,
  ShopifyCollectionProduct,
} from "@/lib/shopify/types";

const CACHE_STALE_TIME_MS = 5 * 60 * 1000;

type SearchDefaultsResponse = {
  collections: ShopifyCollectionLite[];
  bestSellers: ShopifyCollectionProduct[];
};

async function fetchDefaults(): Promise<SearchDefaultsResponse> {
  const response = await fetch("/api/search/defaults");
  if (!response.ok) {
    return { collections: [], bestSellers: [] };
  }
  return response.json() as Promise<SearchDefaultsResponse>;
}

/** Lazily loads the empty-state data (top collections + best sellers). */
export function useSearchDefaults() {
  const { data, isLoading } = useQuery({
    queryKey: ["search-defaults"],
    queryFn: fetchDefaults,
    staleTime: CACHE_STALE_TIME_MS,
  });

  return {
    collections: data?.collections ?? [],
    bestSellers: data?.bestSellers ?? [],
    isLoading,
  };
}
