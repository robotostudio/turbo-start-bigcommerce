import { describe, expect, it } from "vitest";

import {
  DEFAULT_SORT,
  SORT_OPTIONS,
  sortFromSearchParams,
  toCategorySort,
} from "@/components/collection/sort-utils";

describe("toCategorySort", () => {
  it("passes a CategoryProductSort member straight through", () => {
    expect(toCategorySort("LOWEST_PRICE")).toBe("LOWEST_PRICE");
    expect(toCategorySort("HIGHEST_PRICE")).toBe("HIGHEST_PRICE");
    expect(toCategorySort("A_TO_Z")).toBe("A_TO_Z");
    expect(toCategorySort("Z_TO_A")).toBe("Z_TO_A");
    expect(toCategorySort("BEST_SELLING")).toBe("BEST_SELLING");
    expect(toCategorySort("NEWEST")).toBe("NEWEST");
  });

  it("sends nothing for the default view", () => {
    expect(toCategorySort(DEFAULT_SORT)).toBeUndefined();
    expect(toCategorySort(null)).toBeUndefined();
    expect(toCategorySort(undefined)).toBeUndefined();
  });

  it("never maps the Featured label onto a real enum member", () => {
    // Verified live: omitting `sortBy` returns products ascending by entity id,
    // while both `DEFAULT` and `FEATURED` return them descending. The category
    // page server-renders with no sort, so either of these reaching the wire
    // reshuffles the grid on hydration. `FEATURED` is the tempting one — it
    // matches the menu label.
    expect(toCategorySort("DEFAULT")).toBeUndefined();
    expect(toCategorySort("FEATURED")).toBeUndefined();
  });

  it("sends nothing for a hand-edited or legacy value", () => {
    expect(toCategorySort("PRICE")).toBeUndefined();
    expect(toCategorySort("TITLE")).toBeUndefined();
    expect(toCategorySort("CREATED")).toBeUndefined();
    expect(toCategorySort("lowest_price")).toBeUndefined();
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

describe("SORT_OPTIONS", () => {
  it("offers no dead entry — every option but Featured is a live enum member", () => {
    for (const option of SORT_OPTIONS) {
      if (option.value === DEFAULT_SORT) continue;
      expect(toCategorySort(option.value)).toBe(option.value);
    }
  });
});
