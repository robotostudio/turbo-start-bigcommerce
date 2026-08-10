"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { ActiveFilters } from "@/components/collection/active-filters";
import { CollectionPagination } from "@/components/collection/collection-pagination";
import { FilterPanel } from "@/components/collection/filter-panel";
import {
  type Facet,
  filterParamsOnly,
} from "@/components/collection/filter-utils";
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
  /** Facets for this result set — the same read returned both. */
  facets: Facet[];
  filteringEnabled: boolean;
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
  /** The server render's facets and plan flag, used until the first refetch. */
  initialFacets: Facet[];
  initialFilteringEnabled: boolean;
};

/**
 * The whole listing: facet panel, filter chips, grid, pagination.
 *
 * They are one component because they read one response. The controls used to
 * render from props the server resolved at build time while the grid refetched
 * underneath them, so after any sort change or facet pick the counts described a
 * result set that was no longer on the page. Threading the fresh facets to
 * controls sitting in their own Suspense boundaries meant either lifting this
 * query above both or inventing shared client state — so the boundaries were
 * merged instead, which is what `/search` has always done (see
 * `components/search/search-page-content.tsx`).
 */
export function CollectionProducts({
  categoryEntityId,
  handle,
  initialPageInfo,
  initialProducts,
  initialFacets,
  initialFilteringEnabled,
}: CollectionProductsProps) {
  const searchParams = useSearchParams();
  // Sort comes off the URL here, not from the server component — awaiting
  // `searchParams` there would opt the whole route out of static generation.
  const sort = sortFromSearchParams(searchParams);
  const density =
    searchParams.get("view") === "dense" ? "dense" : "comfortable";
  const filterQs = filterParamsOnly(searchParams.toString()).toString();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isError,
    isFetchNextPageError,
    refetch,
  } = useInfiniteQuery<CollectionPage>({
    // Filters belong in the key alongside sort, or a facet pick rewrites the
    // URL and gets served the previous result set out of the cache.
    queryKey: ["collection-products", handle, sort, filterQs],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams(filterQs);
      params.set("categoryEntityId", String(categoryEntityId));
      params.set("sort", sort);
      if (pageParam) params.set("after", pageParam as string);

      const res = await fetch(
        `/api/collections/products/${handle}?${params.toString()}`
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
            pages: [
              {
                products: initialProducts,
                pageInfo: initialPageInfo,
                facets: initialFacets,
                filteringEnabled: initialFilteringEnabled,
              },
            ],
            pageParams: [null],
          }
        : undefined,
  });

  const allProducts = data?.pages.flatMap((page) => page.products) ?? [];

  // The first page of the current query, not the last: a sort change or a facet
  // pick changes the key, so page 0 is already the newest answer, while "Load
  // more" appends pages describing the same filter set. Reading page 0 keeps the
  // panel out of the paging path entirely.
  //
  // Undefined only while the first fetch for a sorted or filtered URL is in
  // flight, where the server's facets are the honest thing to show — they are
  // what the grid underneath is still showing too.
  const page = data?.pages[0];
  const facets = page?.facets ?? initialFacets;
  const filteringEnabled = page?.filteringEnabled ?? initialFilteringEnabled;

  /**
   * Two different failures, one line.
   *
   * A facet pick or a sort change moves the query key off the server-rendered
   * seed, so a failed fetch leaves no pages at all and the grid printed "No
   * products found." for a category full of products. A failed "Load more"
   * keeps `hasNextPage` true and the button simply stopped doing anything.
   * Both are read here rather than assumed to be the same flag: with seeded
   * data the query can report a page failure while its status stays success.
   */
  const failed = isError || isFetchNextPageError;

  return (
    <>
      <div className="mb-8 flex flex-col gap-4">
        <FilterPanel filteringEnabled={filteringEnabled} filters={facets} />
        {/* Facets passed so a brand chip reads "Aster" rather than its entity id. */}
        <ActiveFilters facets={facets} />
      </div>
      {failed && (
        <p className="mb-6 text-muted-foreground text-sm">
          We couldn&apos;t load these products.{" "}
          <button
            className="text-foreground underline underline-offset-4"
            onClick={() => refetch()}
            type="button"
          >
            Try again
          </button>
        </p>
      )}
      {/* An empty grid under that line would read "No products found." — the
       * lie the line is there to replace. */}
      {!(failed && allProducts.length === 0) && (
        <ProductGrid density={density} products={allProducts} />
      )}
      <CollectionPagination
        hasNextPage={hasNextPage}
        isLoading={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
      />
    </>
  );
}
