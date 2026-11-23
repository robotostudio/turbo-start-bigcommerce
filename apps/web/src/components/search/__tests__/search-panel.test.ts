import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const useQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQuery(options),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/components/collection/collection-card", () => ({
  CollectionCard: () => null,
}));
vi.mock("@/components/search/search-empty-state", () => ({
  SearchEmptyState: () => "Popular searches",
}));
vi.mock("@/components/search/search-product-grid", () => ({
  SearchProductGrid: ({
    products,
    isLoading,
  }: {
    products: unknown[];
    isLoading: boolean;
  }) => {
    if (isLoading) {
      return "Loading";
    }
    return products.length === 0
      ? "No products found."
      : `${products.length} shown`;
  },
}));

const { SearchPanel } = await import("../search-panel");

function render(initialQuery = "jacket") {
  return renderToStaticMarkup(createElement(SearchPanel, { initialQuery }));
}

const UNAVAILABLE = "Search isn&#x27;t available";

describe("search drawer", () => {
  it("says search is unavailable when the search read fails", () => {
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const markup = render();

    expect(markup).toContain(UNAVAILABLE);
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("No products found.");
  });

  it("retries a failed search once, so the message is not held back", () => {
    useQuery.mockClear();
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render();

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ retry: 1 })
    );
  });

  it("still reports a search with no matches as no products found", () => {
    useQuery.mockReturnValue({
      data: { products: [], collections: [], related: [] },
      isLoading: false,
      isError: false,
    });

    const markup = render();

    expect(markup).toContain("No products found.");
    expect(markup).not.toContain(UNAVAILABLE);
  });

  it("shows the loading state, not the message, while a request is in flight", () => {
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const markup = render();

    expect(markup).toContain("Loading");
    expect(markup).not.toContain(UNAVAILABLE);
  });

  it("drops the message once the query is cleared", () => {
    // An empty box shows the empty state even while useQuery still reports
    // the failed read.
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const markup = render("");

    expect(markup).toContain("Popular searches");
    expect(markup).not.toContain(UNAVAILABLE);
  });
});
