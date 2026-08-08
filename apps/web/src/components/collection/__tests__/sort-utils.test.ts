import { describe, expect, it } from "vitest";

import {
  DEFAULT_SORT,
  defaultSortLabel,
  SORT_OPTIONS,
  sortFromSearchParams,
  toListingSort,
} from "@/components/collection/sort-utils";

describe("toListingSort", () => {
  it("passes a live enum member straight through", () => {
    expect(toListingSort("LOWEST_PRICE")).toBe("LOWEST_PRICE");
    expect(toListingSort("HIGHEST_PRICE")).toBe("HIGHEST_PRICE");
    expect(toListingSort("A_TO_Z")).toBe("A_TO_Z");
    expect(toListingSort("Z_TO_A")).toBe("Z_TO_A");
    expect(toListingSort("BEST_SELLING")).toBe("BEST_SELLING");
    expect(toListingSort("NEWEST")).toBe("NEWEST");
  });

  it("sends nothing for the default view", () => {
    expect(toListingSort(DEFAULT_SORT)).toBeUndefined();
    expect(toListingSort(null)).toBeUndefined();
    expect(toListingSort(undefined)).toBeUndefined();
  });

  it("never maps the default option onto a real enum member", () => {
    // The server renders with no sort argument, so either of these reaching the
    // wire reshuffles the grid on hydration. `FEATURED` is the tempting one on a
    // category — it matches the label the menu shows there — and `RELEVANCE` is
    // the tempting one on a search, where it is what omitting the argument
    // resolves to anyway. Neither is the sentinel.
    expect(toListingSort("FEATURED")).toBeUndefined();
    expect(toListingSort("RELEVANCE")).toBeUndefined();
    // `DEFAULT` only exists on `CategoryProductSort`; sending it to
    // `searchProducts` is a GraphQL error, not a different order.
    expect(toListingSort("DEFAULT")).toBeUndefined();
  });

  it("sends nothing for a hand-edited or legacy value", () => {
    expect(toListingSort("PRICE")).toBeUndefined();
    expect(toListingSort("TITLE")).toBeUndefined();
    expect(toListingSort("CREATED")).toBeUndefined();
    expect(toListingSort("lowest_price")).toBeUndefined();
  });
});

describe("sortFromSearchParams", () => {
  it("reads the param and normalises anything unrecognised to the default", () => {
    expect(sortFromSearchParams(new URLSearchParams("sort=NEWEST"))).toBe(
      "NEWEST"
    );
    expect(sortFromSearchParams(new URLSearchParams(""))).toBe(DEFAULT_SORT);
    expect(sortFromSearchParams(new URLSearchParams("sort=PRICE"))).toBe(
      DEFAULT_SORT
    );
  });
});

describe("defaultSortLabel", () => {
  it("names the order the shopper is actually looking at", () => {
    // Omitting the sort argument is relevance on a keyword search and the
    // category's own order otherwise — one sentinel, two meanings. Verified
    // against the store: `site.settings.search.defaultSearchProductSort` reads
    // RELEVANCE, and a search with the argument omitted returns the same order
    // as one sorted RELEVANCE explicitly.
    expect(defaultSortLabel(true)).toBe("Relevance");
    expect(defaultSortLabel(false)).toBe("Featured");
  });
});

describe("SORT_OPTIONS", () => {
  it("offers no dead entry — every option but the default is a live enum member", () => {
    for (const option of SORT_OPTIONS) {
      if (option.value === DEFAULT_SORT) continue;
      expect(toListingSort(option.value)).toBe(option.value);
    }
  });

  it("offers only members both sort enums share", () => {
    // `SearchProductsSortInput` and `CategoryProductSort` overlap on these
    // seven and differ at the edges. The menu is one list across both surfaces,
    // so a member outside the intersection would break whichever enum lacks it.
    const inBothEnums = new Set([
      "A_TO_Z",
      "BEST_REVIEWED",
      "BEST_SELLING",
      "FEATURED",
      "HIGHEST_PRICE",
      "LOWEST_PRICE",
      "NEWEST",
      "Z_TO_A",
    ]);
    for (const option of SORT_OPTIONS) {
      if (option.value === DEFAULT_SORT) continue;
      expect(inBothEnums.has(option.value)).toBe(true);
    }
  });
});
