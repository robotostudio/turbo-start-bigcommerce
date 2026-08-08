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
  const sort = sortFromSearchParams(searchParams);
  const density =
    searchParams.get("view") === "dense" ? "dense" : "comfortable";

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<CollectionPage>({
      queryKey: ["collection-products", handle, sort],
      queryFn: async ({ pageParam }) => {
        const params = new URLSearchParams({ sort });
        if (pageParam) params.set("after", pageParam as string);

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
      // the matching query — attached to a sorted key they would paint the
      // wrong order for a beat before the refetch corrects it. `DEFAULT_SORT`
      // is a sentinel the route turns back into "no `sortBy`", so this branch
      // and the server render ask BigCommerce for the identical order.
      initialData:
        sort === DEFAULT_SORT
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
