"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { CollectionPagination } from "@/components/collection/collection-pagination";
import { filterParamsOnly } from "@/components/collection/filter-utils";
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
  /** Every segment below `/collections`, for the request URL only. */
  handle: string;
  /**
   * What the listing actually reads by. Resolved once on the server, so paging
   * and sorting never spend a round trip turning this page's path back into an
   * id — and a nested category, whose path has more segments than the route
   * carries, pages correctly.
   */
  categoryEntityId: number;
  initialPageInfo: PageInfo;
  initialProducts: CatalogProductCard[];
};

export function CollectionProducts({
  categoryEntityId,
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
  const filterQs = filterParamsOnly(searchParams.toString()).toString();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<CollectionPage>({
      // Filters belong in the key alongside sort, or a facet pick rewrites the
      // URL and gets served the previous result set out of the cache.
      queryKey: ["collection-products", handle, sort, filterQs],
      queryFn: async ({ pageParam }) => {
        const params = new URLSearchParams(filterQs);
        params.set("categoryEntityId", String(categoryEntityId));
        params.set("sort", sort);
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
      // The server always renders the default, unfiltered view, so its products
      // only seed the matching query — attached to a sorted or filtered key they
      // would paint the wrong set for a beat before the refetch corrects it.
      // `DEFAULT_SORT` is a sentinel the route turns back into "no sort
      // argument", so this branch and the server render ask BigCommerce for the
      // identical order.
      initialData:
        sort === DEFAULT_SORT && filterQs === ""
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
