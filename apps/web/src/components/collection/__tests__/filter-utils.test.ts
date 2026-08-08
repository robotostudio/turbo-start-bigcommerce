import { describe, expect, it } from "vitest";

import {
  applyFacetOption,
  clearAllFilters,
  type Facet,
  FILTER_PARAMS,
  filterPanelState,
  getActiveFilters,
  hasActiveSelection,
  parseFilterParams,
  removeFilterParam,
  setFilterParam,
  toggleFilterParam,
  toSearchFilters,
} from "@/components/collection/filter-utils";

const params = (qs: string) => new URLSearchParams(qs);

/**
 * The whole point of these is the `"controls"` branch, which cannot be reached
 * by rendering against this store: `productFilteringEnabled` is `false` on this
 * plan, so no amount of clicking the Filter button will produce it. Testing the
 * decision as a pure function is the only honest way to show it works without
 * editing the code to fake the flag.
 */
describe("filterPanelState", () => {
  it("says unavailable when the store's plan has filtering switched off", () => {
    expect(filterPanelState(false, 0)).toBe("unavailable");
  });

  it("still says unavailable even if facets somehow arrived", () => {
    // Belt and braces: the plan flag is the capability, and it wins. A facet
    // list turning up while the flag is false is a contradiction, and claiming
    // filtering works on that basis is the lie this function exists to stop.
    expect(filterPanelState(false, 7)).toBe("unavailable");
  });

  it("distinguishes 'no facets matched' from 'filtering unavailable'", () => {
    // Both are an empty list. Only the flag separates them, and reading them as
    // the same thing is what made the panel assert a plan limitation on every
    // store that forked this.
    expect(filterPanelState(true, 0)).toBe("none");
  });

  it("shows controls when filtering is on and facets came back", () => {
    expect(filterPanelState(true, 1)).toBe("controls");
    expect(filterPanelState(true, 7)).toBe("controls");
  });
});

describe("parseFilterParams", () => {
  it("collects repeated brand and category ids", () => {
    const selection = parseFilterParams(
      params("filter.brand=12&filter.brand=34&filter.category=5")
    );

    expect(selection.brandEntityIds).toEqual([12, 34]);
    expect(selection.categoryEntityIds).toEqual([5]);
  });

  it("drops ids that are not positive integers rather than sending them", () => {
    const selection = parseFilterParams(
      params("filter.brand=0&filter.brand=-3&filter.brand=abc&filter.brand=7.5")
    );

    expect(selection.brandEntityIds).toEqual([]);
  });

  it("groups several values of one attribute into a single entry", () => {
    // `productAttributes` takes one entry per attribute carrying all of its
    // values. Two entries for the same attribute is a different query.
    const selection = parseFilterParams(
      params(
        "filter.attr.colour=Black&filter.attr.colour=Ecru&filter.attr.size=M"
      )
    );

    expect(selection.attributes).toEqual([
      { attribute: "colour", values: ["Black", "Ecru"] },
      { attribute: "size", values: ["M"] },
    ]);
  });

  it("drops both price bounds when they are the wrong way round", () => {
    // Sending them would return nothing at all, which reads as an empty
    // catalog rather than a typo the shopper can fix.
    const selection = parseFilterParams(
      params("filter.minPrice=200&filter.maxPrice=50")
    );

    expect(selection.minPrice).toBeUndefined();
    expect(selection.maxPrice).toBeUndefined();
  });

  it("keeps price bounds that are the right way round, and one-sided ones", () => {
    expect(
      parseFilterParams(params("filter.minPrice=50&filter.maxPrice=200"))
    ).toMatchObject({ minPrice: 50, maxPrice: 200 });
    expect(parseFilterParams(params("filter.minPrice=50"))).toMatchObject({
      minPrice: 50,
    });
    expect(parseFilterParams(params("filter.maxPrice=200"))).toMatchObject({
      maxPrice: 200,
    });
  });

  it("only treats the exact boolean values as set", () => {
    const on = parseFilterParams(
      params("filter.stock=in&filter.shipping=free&filter.featured=1")
    );
    expect(on.inStockOnly).toBe(true);
    expect(on.freeShippingOnly).toBe(true);
    expect(on.featuredOnly).toBe(true);

    const off = parseFilterParams(
      params("filter.stock=yes&filter.shipping=true&filter.featured=true")
    );
    expect(off.inStockOnly).toBe(false);
    expect(off.freeShippingOnly).toBe(false);
    expect(off.featuredOnly).toBe(false);
  });
});

describe("toSearchFilters", () => {
  it("omits keys rather than nulling them", () => {
    // BigCommerce treats an explicit null as a value on some of these inputs,
    // so `{price: {minPrice: null}}` is a request, not an absence of one.
    const payload = toSearchFilters(parseFilterParams(params("")));

    expect("price" in payload).toBe(false);
    expect("rating" in payload).toBe(false);
    expect("brandEntityIds" in payload).toBe(false);
    expect("hideOutOfStock" in payload).toBe(false);
    expect(payload).toEqual({});
  });

  it("sends only the true side of a boolean", () => {
    // `hideOutOfStock: false` is a different request from omitting it, and
    // "show everything" is the unfiltered default.
    const payload = toSearchFilters(
      parseFilterParams(params("filter.stock=in"))
    );

    expect(payload.hideOutOfStock).toBe(true);
    expect("isFreeShipping" in payload).toBe(false);
    expect("isFeatured" in payload).toBe(false);
  });

  it("builds the whole input from a full selection", () => {
    const payload = toSearchFilters(
      parseFilterParams(
        params(
          "filter.brand=12&filter.category=5&filter.minPrice=50&filter.maxPrice=200" +
            "&filter.rating=4&filter.attr.colour=Black&filter.stock=in"
        )
      ),
      { searchTerm: "jacket" }
    );

    expect(payload).toEqual({
      searchTerm: "jacket",
      brandEntityIds: [12],
      categoryEntityIds: [5],
      price: { minPrice: 50, maxPrice: 200 },
      rating: { minRating: 4 },
      productAttributes: [{ attribute: "colour", values: ["Black"] }],
      hideOutOfStock: true,
    });
  });

  it("carries a category scope through without a filter param", () => {
    // The seam that lets this same read serve a category listing later.
    const payload = toSearchFilters(parseFilterParams(params("")), {
      categoryEntityId: 23,
    });

    expect(payload).toEqual({ categoryEntityId: 23 });
  });
});

describe("hasActiveSelection", () => {
  it("is false for an empty URL and true for any one filter", () => {
    expect(hasActiveSelection(parseFilterParams(params("")))).toBe(false);
    expect(hasActiveSelection(parseFilterParams(params("sort=NEWEST")))).toBe(
      false
    );
    expect(
      hasActiveSelection(parseFilterParams(params("filter.brand=12")))
    ).toBe(true);
    expect(
      hasActiveSelection(parseFilterParams(params("filter.maxPrice=200")))
    ).toBe(true);
  });
});

describe("writers", () => {
  it("round-trips a selection through the URL and back", () => {
    const start = params("sort=NEWEST");
    const withBrand = params(
      toggleFilterParam(start, FILTER_PARAMS.brand, "12")
    );
    const withTwo = params(
      toggleFilterParam(withBrand, FILTER_PARAMS.brand, "34")
    );

    expect(parseFilterParams(withTwo).brandEntityIds).toEqual([12, 34]);
    // Unrelated params survive a filter write.
    expect(withTwo.get("sort")).toBe("NEWEST");

    const removed = params(
      toggleFilterParam(withTwo, FILTER_PARAMS.brand, "12")
    );
    expect(parseFilterParams(removed).brandEntityIds).toEqual([34]);
  });

  it("drops the cursor on every write, because it belongs to the old result set", () => {
    const sp = params("after=WzUuMTc5Mzc2NiwxODVd&filter.brand=12");

    expect(toggleFilterParam(sp, FILTER_PARAMS.brand, "34")).not.toContain(
      "after"
    );
    expect(setFilterParam(sp, FILTER_PARAMS.minPrice, "50")).not.toContain(
      "after"
    );
    expect(removeFilterParam(sp, FILTER_PARAMS.brand, "12")).not.toContain(
      "after"
    );
    expect(clearAllFilters(sp)).not.toContain("after");
  });

  it("replaces rather than appends for a single-valued option", () => {
    // Rating is one range on the input, so picking 3 after 4 has to mean 3.
    const four = {
      paramKey: FILTER_PARAMS.minRating,
      paramValue: "4",
      single: true,
    } as const;
    const three = {
      paramKey: FILTER_PARAMS.minRating,
      paramValue: "3",
      single: true,
    } as const;

    const afterFour = params(applyFacetOption(params(""), four));
    const afterThree = params(applyFacetOption(afterFour, three));

    expect(afterThree.getAll(FILTER_PARAMS.minRating)).toEqual(["3"]);
    expect(parseFilterParams(afterThree).minRating).toBe(3);
  });

  it("clears a single-valued option when its selected value is picked again", () => {
    const four = {
      paramKey: FILTER_PARAMS.minRating,
      paramValue: "4",
      single: true,
    } as const;
    const on = params(applyFacetOption(params(""), four));

    expect(
      params(applyFacetOption(on, four)).has(FILTER_PARAMS.minRating)
    ).toBe(false);
  });

  it("accumulates for a repeatable option", () => {
    const black = { paramKey: "filter.attr.colour", paramValue: "Black" };
    const ecru = { paramKey: "filter.attr.colour", paramValue: "Ecru" };

    const both = params(
      applyFacetOption(params(applyFacetOption(params(""), black)), ecru)
    );

    expect(parseFilterParams(both).attributes).toEqual([
      { attribute: "colour", values: ["Black", "Ecru"] },
    ]);
  });

  it("clears every filter param and leaves the rest alone", () => {
    const sp = params(
      "sort=NEWEST&density=compact&filter.brand=12&filter.attr.colour=Black"
    );
    const cleared = params(clearAllFilters(sp));

    expect(hasActiveSelection(parseFilterParams(cleared))).toBe(false);
    expect(cleared.get("sort")).toBe("NEWEST");
    expect(cleared.get("density")).toBe("compact");
  });
});

describe("getActiveFilters", () => {
  const brandFacet: Facet = {
    kind: "options",
    id: "BrandSearchFilter",
    name: "Brand",
    collapsedByDefault: false,
    options: [
      {
        paramKey: FILTER_PARAMS.brand,
        paramValue: "12",
        label: "Aster",
        productCount: 3,
        isSelected: true,
      },
    ],
  };

  it("labels a chip from the facet list when it is loaded", () => {
    const [chip] = getActiveFilters(params("filter.brand=12"), [brandFacet]);

    expect(chip?.label).toBe("Aster");
    expect(chip?.invalid).toBeUndefined();
  });

  it("falls back to the raw value rather than inventing a name", () => {
    // The old codec encoded `<id>|<label>` in the URL so a chip could show a
    // name with no facet list. That put display text somewhere a hand-edited
    // link could change it. An id is uglier and true.
    const [chip] = getActiveFilters(params("filter.brand=12"));

    expect(chip?.label).toBe("12");
  });

  it("labels the params that have no facet behind them", () => {
    const labels = getActiveFilters(
      params(
        "filter.minPrice=50&filter.maxPrice=200&filter.rating=4&filter.stock=in" +
          "&filter.shipping=free&filter.featured=1"
      )
    ).map((chip) => chip.label);

    expect(labels).toEqual([
      "Min 50",
      "Max 200",
      "4 stars & up",
      "In stock",
      "Free shipping",
      "Featured",
    ]);
  });

  it("flags a param the parser threw away, so the chip cannot lie", () => {
    // Every one of these renders a chip while narrowing nothing.
    const chips = getActiveFilters(
      params("filter.minPrice=abc&filter.stock=yes&filter.brand=nope")
    );

    expect(chips).toHaveLength(3);
    expect(chips.every((chip) => chip.invalid)).toBe(true);
  });

  it("ignores params outside the filter namespace", () => {
    expect(getActiveFilters(params("sort=NEWEST&q=jacket&after=abc"))).toEqual(
      []
    );
  });
});
