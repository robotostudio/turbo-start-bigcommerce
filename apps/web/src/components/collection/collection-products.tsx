"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { CollectionPagination } from "@/components/collection/collection-pagination";
import { ProductGrid } from "@/components/collection/product-grid";
import {
  DEFAULT_SORT,
  sortFromSearchParams,
} from "@/components/collection/sort-utils";
import type { CatalogProductCard } from "@/lib/bigcommerce/catalog";

type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

type CollectionPage = {
  products: CatalogProductCard[];
  pageInfo: PageInfo;
};

type CollectionProductsProps = {
  /**
   * Every segment below `/collections`. The load-more route is still
   * single-segment (`/api/collections/[handle]/products`), so a nested category
   * renders its first page and stops there rather than paging wrongly.
   */
  handle: string;
  initialPageInfo: PageInfo;
  initialProducts: CatalogProductCard[];
};

export function CollectionProducts({
  handle,
  initialPageInfo,
  initialProducts,
}: CollectionProductsProps) {
  const searchParams = useSearchParams();
  // Sort comes off the URL here, not from the server component — awaiting
  // `searchParams` there would opt the whole route out of static generation.
  const { sort, reverse } = sortFromSearchParams(searchParams);
  const density =
    searchParams.get("view") === "dense" ? "dense" : "comfortable";

  // Extract filter params to include in query key and API calls
  const filterEntries: [string, string][] = [];
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith("filter.")) {
      filterEntries.push([key, value]);
    }
  }
  const filterKey = JSON.stringify(filterEntries);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<CollectionPage>({
      queryKey: ["collection-products", handle, sort, reverse, filterKey],
      queryFn: async ({ pageParam }) => {
        const params = new URLSearchParams({
          sort,
          reverse: String(reverse),
        });
        if (pageParam) params.set("after", pageParam as string);

        // Forward filter params to the API route
        for (const [key, value] of filterEntries) {
          params.append(key, value);
        }

        const res = await fetch(
          `/api/collections/${handle}/products?${params.toString()}`
        );
        if (!res.ok) throw new Error("Failed to fetch products");
        return res.json() as Promise<CollectionPage>;
      },
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) =>
        lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : undefined,
      // The server always renders the default view, so its products only seed
      // the matching query — attached to a sorted/filtered key they would
      // paint the wrong order for a beat before the refetch corrects it.
      initialData:
        sort === DEFAULT_SORT && !reverse && filterEntries.length === 0
          ? {
              pages: [{ products: initialProducts, pageInfo: initialPageInfo }],
              pageParams: [null],
            }
          : undefined,
    });

  const allProducts = data?.pages.flatMap((page) => page.products) ?? [];

  return (
    <>
      <ProductGrid density={density} products={allProducts} />
      <CollectionPagination
        hasNextPage={hasNextPage}
        isLoading={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
      />
    </>
  );
}
