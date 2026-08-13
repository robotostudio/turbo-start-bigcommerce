import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The server render seeds only the default, unfiltered key. Pick a facet or
 * change the sort and the query key moves off that seed, so a failed fetch
 * leaves no pages at all — and the grid printed "No products found." for a
 * category full of products. A failed "Load more" is the quieter half of the
 * same bug: `hasNextPage` stays true and the button stops doing anything.
 *
 * They are separate flags on purpose. With seeded data a page fetch can fail
 * while the query's own status stays success, so asserting only `isError`
 * would leave "Load more" exactly as silent as it was.
 */

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const useInfiniteQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: (options: unknown) => useInfiniteQuery(options),
}));

vi.mock("@/components/collection/filter-panel", () => ({
  FilterPanel: () => null,
}));
vi.mock("@/components/collection/active-filters", () => ({
  ActiveFilters: () => null,
}));
vi.mock("@/components/collection/collection-pagination", () => ({
  CollectionPagination: () => null,
}));
// Carries the real grid's empty copy, which is the string the failure cases
// have to stop showing.
vi.mock("@/components/collection/product-grid", () => ({
  ProductGrid: ({ products }: { products: unknown[] }) =>
    products.length === 0 ? "No products found." : `${products.length} shown`,
}));

const { CollectionProducts } = await import("../collection-products");

const PROPS = {
  categoryEntityId: 42,
  handle: "jackets",
  initialFacets: [],
  initialFilteringEnabled: false,
  initialPageInfo: { hasNextPage: true, endCursor: "cursor" },
  initialProducts: [],
};

const HEALTHY = {
  data: undefined,
  fetchNextPage: vi.fn(),
  hasNextPage: true,
  isFetchingNextPage: false,
  isError: false,
  isFetchNextPageError: false,
  refetch: vi.fn(),
};

function render() {
  return renderToStaticMarkup(createElement(CollectionProducts, PROPS));
}

const pageOf = (count: number) => ({
  pages: [
    {
      products: Array.from({ length: count }, (_, index) => ({ id: index })),
      pageInfo: { hasNextPage: true, endCursor: "cursor" },
      facets: [],
      filteringEnabled: false,
    },
  ],
});

describe("collection products", () => {
  it("says the read failed rather than claiming the category is empty", () => {
    useInfiniteQuery.mockReturnValue({ ...HEALTHY, isError: true });

    const markup = render();

    expect(markup).toContain("couldn&#x27;t load these products");
    expect(markup).not.toContain("No products found.");
  });

  it("says so when Load more fails, keeping the products already shown", () => {
    useInfiniteQuery.mockReturnValue({
      ...HEALTHY,
      data: pageOf(12),
      isFetchNextPageError: true,
    });

    const markup = render();

    expect(markup).toContain("couldn&#x27;t load these products");
    expect(markup).toContain("12 shown");
  });

  it("leaves a genuinely empty category reading as empty", () => {
    useInfiniteQuery.mockReturnValue({ ...HEALTHY, data: pageOf(0) });

    const markup = render();

    expect(markup).toContain("No products found.");
    expect(markup).not.toContain("couldn&#x27;t load these products");
  });
});
