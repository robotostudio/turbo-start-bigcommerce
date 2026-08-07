"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { ShopifyCollectionProduct } from "@/lib/shopify/types";
import { useSavedItems } from "./saved-items-context";

type SavedProductsResponse = {
  products: ShopifyCollectionProduct[];
};

async function fetchSavedProducts(
  handles: string[]
): Promise<ShopifyCollectionProduct[]> {
  if (handles.length === 0) return [];
  const response = await fetch(`/api/saved-items?handles=${handles.join(",")}`);
  if (!response.ok) return [];
  const data: SavedProductsResponse = await response.json();
  return data.products;
}

/**
 * Fetches full product data for the saved handles, lazily (only while the
 * drawer is open). Products are re-sorted back into the localStorage order —
 * the API resolves handles in parallel, so response order is not guaranteed.
 */
export function useSavedProducts() {
  const { items, isSavedOpen } = useSavedItems();

  const query = useQuery({
    queryKey: ["saved-items", [...items].sort().join(",")],
    queryFn: () => fetchSavedProducts(items),
    enabled: isSavedOpen && items.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const products = query.data ?? [];
  const sortedProducts = items
    .map((handle) => products.find((p) => p.handle === handle))
    .filter((p): p is ShopifyCollectionProduct => p !== undefined);

  return { ...query, products: sortedProducts };
}
