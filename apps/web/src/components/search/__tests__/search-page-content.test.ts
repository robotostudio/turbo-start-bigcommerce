import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * A failed search and a search that matched nothing used to render the same
 * page. `/api/search/full` answers a failed catalog read with a 500, the client
 * throws on `!response.ok`, and `data ?? EMPTY` then printed `0 results for
 * "jacket"` and "No products found." — telling a shopper the store does not
 * sell something it does.
 *
 * Both cases are asserted, and the second is the one that matters: an
 * unavailable state shown for a genuine zero-result search would be its own
 * lie.
 */

vi.mock("@workspace/env/client", () => ({
  env: {
    NEXT_PUBLIC_SANITY_PROJECT_ID: "testproject",
    NEXT_PUBLIC_SANITY_DATASET: "test",
    NEXT_PUBLIC_SANITY_API_VERSION: "2024-10-28",
    NEXT_PUBLIC_SANITY_STUDIO_URL: "http://localhost:3333",
  },
}));

const useQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQuery(options),
}));

// The listing furniture is not what is under test, and each piece of it reads
// router state this environment has none of.
vi.mock("@/components/collection/listing-controls", () => ({
  ListingControls: () => null,
  ListingControlsProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/collection/filter-panel", () => ({
  FilterPanel: () => null,
}));
vi.mock("@/components/collection/active-filters", () => ({
  ActiveFilters: () => null,
}));
vi.mock("@/components/search/search-empty-state", () => ({
  SearchEmptyState: () => "Popular searches",
}));
// Stands in for the real grid's own empty copy, so the failure case can assert
// that the shopper is not shown it.
vi.mock("@/components/search/search-product-grid", () => ({
  SearchProductGrid: ({ products }: { products: unknown[] }) =>
    products.length === 0 ? "No products found." : `${products.length} shown`,
}));

const { SearchPageContent } = await import("../search-page-content");

function render() {
  return renderToStaticMarkup(
    createElement(SearchPageContent, { initialQuery: "jacket" })
  );
}

describe("search page", () => {
  it("says search is unavailable when the search read fails", () => {
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const markup = render();

    expect(markup).toContain("Search isn&#x27;t available");
    expect(markup).not.toContain("No products found.");
    expect(markup).not.toContain("0 result");
  });

  it("still reports a genuine zero-result search as zero results", () => {
    useQuery.mockReturnValue({
      data: {
        products: [],
        totalCount: 0,
        facets: [],
        filteringEnabled: false,
      },
      isLoading: false,
      isError: false,
    });

    const markup = render();

    expect(markup).toContain("0 result");
    expect(markup).toContain("No products found.");
    expect(markup).not.toContain("Search isn&#x27;t available");
  });
});
