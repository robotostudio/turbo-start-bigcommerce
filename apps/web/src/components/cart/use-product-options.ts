"use client";

import { useQuery } from "@tanstack/react-query";

import { getProductOptions, type ProductOptions } from "@/app/cart/actions";

/**
 * Fetches a product's options + variants by handle for the in-cart variant
 * selectors. Keyed by handle so multiple cart lines sharing a product dedupe
 * to a single request. The drawer only mounts line items while open, so the
 * query is naturally gated to an open cart.
 */
export function useProductOptions(handle: string) {
  return useQuery<ProductOptions | null>({
    queryKey: ["product-options", handle],
    queryFn: () => getProductOptions(handle),
    staleTime: 5 * 60 * 1000,
  });
}
