import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import captured from "../__fixtures__/search-filters-unavailable.json" with {
  type: "json",
};
import { FACET_PAYLOAD } from "./facet-payload";

// Hoisted by vitest, so it runs before the module under test is evaluated.
vi.mock("server-only", () => ({}));

const warn = vi.fn();
vi.mock("@workspace/logger", () => ({
  Logger: class {
    warn = warn;
  },
}));

const { toFacets, resetFacetWarningForTests } = await import("../facets");

const edges = (nodes: typeof FACET_PAYLOAD) => nodes.map((node) => ({ node }));

beforeEach(() => {
  warn.mockClear();
  // The unavailable warning latches once per process. Without this, whether a
  // case sees it depends on which case ran first.
  resetFacetWarningForTests();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("toFacets, on the captured plan-gated response", () => {
  /**
   * The real capture, not a hand-written empty array: this is what the live
   * store returns on every request, HTTP 200 with no `errors` key, and it is
   * byte-identical to "no facets matched". Only `productFilteringEnabled` tells
   * the two apart.
   */
  const capturedEdges =
    captured.response.data.site.search.searchProducts.filters.edges;

  it("returns no facets, because there are none in the response", () => {
    expect(capturedEdges).toEqual([]);
    expect(toFacets(capturedEdges, false)).toEqual([]);
  });

  it("warns once when the empty list is the plan gate", () => {
    toFacets(capturedEdges, false);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/productFilteringEnabled is false/);
  });

  it("warns exactly once across repeated requests, not once per request", () => {
    // A category page view per warning would be noise that teaches people to
    // filter the logs. The cause is a store-level plan setting that cannot
    // change between two requests.
    toFacets(capturedEdges, false);
    toFacets(capturedEdges, false);
    toFacets(capturedEdges, false);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("stays silent when filtering is on and the list is genuinely empty", () => {
    // A real empty result is not a capability problem, and saying so would be
    // crying wolf on every search that matched no facets.
    expect(toFacets(capturedEdges, true)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("toFacets, branching on the typed union", () => {
  const facets = () => toFacets(edges(FACET_PAYLOAD), true);

  it("flattens six union members into two renderable shapes", () => {
    // The point of the transformer: the panel never sees the union.
    expect(new Set(facets().map((facet) => facet.kind))).toEqual(
      new Set(["options", "price"])
    );
  });

  it("drops a facet that arrived with nothing selectable in it", () => {
    // A heading with no values under it reads as a UI bug, and it is not the
    // same signal as the whole filter list being empty.
    expect(facets().map((facet) => facet.name)).not.toContain(
      "Empty brand facet"
    );
  });

  it("does not offer a value nothing matches", () => {
    // About `toFacet`, not about BigCommerce: an option that arrives at zero
    // and unselected is a control that cannot change the grid, so the panel
    // stops offering it. What the store puts in `productCount` is its business.
    const fit = facets().find((facet) => facet.name === "Fit");
    const labels =
      fit?.kind === "options" ? fit.options.map((option) => option.label) : [];

    expect(labels).toContain("Relaxed");
    expect(labels).not.toContain("Slim");
  });

  it("keeps a selected value that has narrowed to zero", () => {
    // Dropping it would remove the control that undoes the combination, and
    // the label its chip reads from.
    const fit = facets().find((facet) => facet.name === "Fit");
    const labels =
      fit?.kind === "options" ? fit.options.map((option) => option.label) : [];

    expect(labels).toContain("Boxy");
  });

  it("drops a facet whose every value reached zero", () => {
    // Same rule as the empty facet above: a heading with nothing pickable under
    // it reads as a UI bug.
    expect(facets().map((facet) => facet.name)).not.toContain("Material");
  });

  it("keeps hidden counts, which are not zeroes", () => {
    // `displayProductCount: false` arrives as `null`, and a facet that hides
    // its counts says nothing about how many products are behind each value.
    const category = facets().find((facet) => facet.name === "Category");

    expect(category?.kind === "options" && category.options).toHaveLength(1);
  });

  it("keeps two attribute facets distinct", () => {
    // Both are `ProductAttributeSearchFilter`; keying on the type name alone
    // collides in React and in the collapse state.
    const ids = facets().map((facet) => facet.id);

    expect(ids).toContain("ProductAttributeSearchFilter:colour");
    expect(ids).toContain("ProductAttributeSearchFilter:size");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points brand options at the brand param, carrying the entity id", () => {
    const brand = facets().find((facet) => facet.name === "Brand");

    expect(brand?.kind === "options" && brand.options).toEqual([
      {
        paramKey: "filter.brand",
        paramValue: "12",
        label: "Aster",
        productCount: 3,
        isSelected: true,
      },
      {
        paramKey: "filter.brand",
        paramValue: "34",
        label: "Bramley",
        productCount: 5,
        isSelected: false,
      },
    ]);
  });

  it("puts the store's own filterKey into the attribute param", () => {
    // What makes a merchant-added facet filterable with no code change.
    const colour = facets().find((facet) => facet.name === "Colour");

    expect(
      colour?.kind === "options" &&
        colour.options.map((option) => option.paramKey)
    ).toEqual(["filter.attr.colour", "filter.attr.colour"]);
  });

  it("hides counts when the facet asked for them to be hidden", () => {
    // `displayProductCount: false` means no count, which is not the same as a
    // count of zero and must not render as one.
    const category = facets().find((facet) => facet.name === "Category");

    expect(
      category?.kind === "options" && category.options[0]?.productCount
    ).toBeNull();
  });

  it("marks rating options as single-valued, because it is one range", () => {
    // `rating` on the input takes a min and a max, so picking 3 after 4 has to
    // mean 3 rather than appending a second param.
    const rating = facets().find((facet) => facet.name === "Rating");

    expect(
      rating?.kind === "options" &&
        rating.options.every((option) => option.single === true)
    ).toBe(true);
  });

  it("gives price a range rather than options", () => {
    const price = facets().find((facet) => facet.name === "Price");

    expect(price?.kind).toBe("price");
    expect(price?.kind === "price" && price.selected).toEqual({
      min: 50,
      max: 200,
    });
  });

  it("drops an 'other' toggle the store has not enabled", () => {
    // All three are nullable. A toggle that filters nothing is worse than none.
    const other = facets().find((facet) => facet.name === "Other");
    const labels =
      other?.kind === "options" ? other.options.map((o) => o.label) : [];

    expect(labels).toEqual(["In stock", "Featured"]);
  });

  it("carries collapse state through from the store's own setting", () => {
    const collapsed = facets().filter((facet) => facet.collapsedByDefault);

    expect(collapsed.map((facet) => facet.name).sort()).toEqual([
      "Rating",
      "Size",
    ]);
  });
});

describe("truncation", () => {
  it("warns when a value list has more values than the page size asked for", () => {
    // The whole point of an explicit page size is that truncation stops being
    // invisible, which only holds if somebody is told. Catalyst omits the
    // argument entirely and a long brand list is silently cut off.
    toFacets(edges(FACET_PAYLOAD), true);

    const truncation = warn.mock.calls.filter((call) =>
      String(call[0]).includes("more values than the page size")
    );

    expect(truncation).toHaveLength(1);
    expect(String(truncation[0]?.[0])).toContain("Colour");
  });
});
