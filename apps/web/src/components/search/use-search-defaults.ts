"use client";

import { useQuery } from "@tanstack/react-query";

import type { BigCommerceCardProduct } from "@/lib/bigcommerce/product-card";
import type { SearchCollection } from "./use-product-search";

const CACHE_STALE_TIME_MS = 5 * 60 * 1000;

type SearchDefaultsResponse = {
  collections: SearchCollection[];
  bestSellers: BigCommerceCardProduct[];
};

async function fetchDefaults(): Promise<SearchDefaultsResponse> {
  const response = await fetch("/api/search/defaults");
  if (!response.ok) {
    return { collections: [], bestSellers: [] };
  }
  return response.json() as Promise<SearchDefaultsResponse>;
}

/** Lazily loads the empty-state data (top categories + best sellers). */
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
