import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted, so both land before the client module derives its endpoint from env.
vi.mock("server-only", () => ({}));
vi.mock("@workspace/env/server", () => ({
  env: {
    BIGCOMMERCE_STORE_HASH: "testhash",
    BIGCOMMERCE_CHANNEL_ID: "42",
    BIGCOMMERCE_STOREFRONT_TOKEN: "test-token",
    BIGCOMMERCE_API_URL: undefined,
    BIGCOMMERCE_PRERENDER_LIMIT: 100,
  },
}));

const search = await import("../search");

/**
 * The ticket 05 capture of a store without Product Filtering, read verbatim:
 * `{query, variables, status, response}` from the live sandbox, five products
 * and `filters.edges: []` at HTTP 200 with no `errors` key.
 *
 * The captured `query` is deliberately not compared against the document this
 * module sends. Ours asks for more — `site.settings.search`, a page cursor, the
 * full product-card selection — and a string comparison there would only tempt
 * someone to edit the evidence. The response is the contract.
 *
 * One consequence of that gap is asserted below rather than papered over: the
 * capture predates the settings selection, so `filteringEnabled` comes back
 * false via the fallback rather than off a captured field. False is both the
 * fallback and the truth for this store, and it is the safe direction — a
 * response that cannot say whether filtering exists must not promise it.
 */
function planGatedResponse(): unknown {
  const path = fileURLToPath(
    new URL("../__fixtures__/search-filters-unavailable.json", import.meta.url)
  );
  return (
    JSON.parse(readFileSync(path, "utf8")) as {
      response: unknown;
    }
  ).response;
}

/**
 * The same capture with the plan flag on and one brand facet grafted in.
 *
 * The sandbox is on a plan without Product Filtering, so there is no live
 * response to capture for the other side of the gate — and every other test
 * here reads `filteringEnabled: false` off the fallback. This is the one that
 * exercises `toFacets` with an edge in it.
 */
function filteringEnabledResponse(): unknown {
  const response = planGatedResponse() as {
    data: {
      site: {
        settings?: unknown;
        search: {
          searchProducts: { filters: { edges: unknown[] } };
        };
      };
    };
  };

  response.data.site.settings = {
    search: { productFilteringEnabled: true },
  };
  response.data.site.search.searchProducts.filters.edges = [
    {
      node: {
        __typename: "BrandSearchFilter",
        displayName: "Brand",
        isCollapsedByDefault: false,
        displayProductCount: true,
        brands: {
          pageInfo: { hasNextPage: false },
          edges: [
            {
              node: {
                entityId: 12,
                name: "Aster",
                isSelected: false,
                productCount: 3,
              },
            },
          ],
        },
      },
    },
  ];

  return response;
}

function mockResponse(body: unknown) {
  const fetchMock = vi.fn(
    (_url: string, _init: RequestInit): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "x-bc-graphql-complexity": "4057" },
        })
      )
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type SentBody = { query: string; variables: Record<string, unknown> };

function sentVariables(fetchMock: {
  mock: { calls: [string, RequestInit][] };
}): Record<string, unknown> {
  return (JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as SentBody)
    .variables;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("searchCatalog on a store without product filtering", () => {
  it("still returns the products", async () => {
    mockResponse(planGatedResponse());

    const result = await search.searchCatalog({
      searchTerm: "jacket",
      first: 24,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products).toHaveLength(5);
    expect(result.data.totalCount).toBe(5);
    expect(result.data.products[0]?.name).toBe("Rye Leather Moto Jacket");
  });

  it("reports no facets and no filtering rather than treating either as a failure", async () => {
    mockResponse(planGatedResponse());

    const result = await search.searchCatalog({
      searchTerm: "jacket",
      first: 24,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // An empty facet list and a plan without facets are byte-identical in the
    // payload. The flag is what tells them apart, and the panel needs both.
    expect(result.data.facets).toEqual([]);
    expect(result.data.filteringEnabled).toBe(false);
  });

  it("still sorts — the sort argument does not travel with the facets", async () => {
    const fetchMock = mockResponse(planGatedResponse());

    await search.searchCatalog({
      searchTerm: "jacket",
      first: 24,
      sort: "LOWEST_PRICE",
    });

    // Sort is an argument on `searchProducts` itself, not something derived
    // from the facet list, so a store that returns no facets still sorts.
    // Measured live on this sandbox: LOWEST_PRICE returns £76 first and £396
    // last, HIGHEST_PRICE the reverse.
    expect(sentVariables(fetchMock).sort).toBe("LOWEST_PRICE");
  });

  it("carries the page cursor so a filtering-disabled listing still pages", async () => {
    mockResponse(planGatedResponse());

    const result = await search.searchCatalog({
      searchTerm: "jacket",
      first: 24,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pageInfo).toEqual({
      hasNextPage: false,
      endCursor: "WzUuMTc5Mzc2NiwxODVd",
    });
  });
});

describe("searchCatalog request shape", () => {
  it("sends no sort argument for the default view", async () => {
    const fetchMock = mockResponse(planGatedResponse());

    await search.searchCatalog({ searchTerm: "jacket", first: 24 });

    // Null, not a member. Verified live that BigCommerce treats an explicit
    // null the same as an omitted argument on this field — relevance for a
    // keyword search, the category's own order otherwise.
    expect(sentVariables(fetchMock).sort).toBeNull();
  });

  it("scopes to a category by entity id, which is what a category page reads by", async () => {
    const fetchMock = mockResponse(planGatedResponse());

    await search.searchCatalog({ categoryEntityId: 36, first: 12 });

    const filters = sentVariables(fetchMock).filters as Record<string, unknown>;
    expect(filters.categoryEntityId).toBe(36);
    expect(filters.searchTerm).toBeUndefined();
  });

  it("carries both the term and the category when a search is scoped to one", async () => {
    const fetchMock = mockResponse(planGatedResponse());

    await search.searchCatalog({
      searchTerm: "jacket",
      categoryEntityId: 36,
      first: 12,
    });

    const filters = sentVariables(fetchMock).filters as Record<string, unknown>;
    expect(filters.searchTerm).toBe("jacket");
    expect(filters.categoryEntityId).toBe(36);
  });

  it("clamps the page size to what the field accepts", async () => {
    const fetchMock = mockResponse(planGatedResponse());

    await search.searchCatalog({ searchTerm: "jacket", first: 500 });

    // `first: 51` is a hard 400 from BigCommerce — "Argument 'first' cannot
    // exceed 50" — so an over-large page is clamped rather than sent and lost.
    expect(sentVariables(fetchMock).first).toBe(50);
  });
});

describe("searchCatalog on a store with product filtering", () => {
  it("reports the facets and the flag rather than the plan-gated fallback", async () => {
    mockResponse(filteringEnabledResponse());

    const result = await search.searchCatalog({
      searchTerm: "jacket",
      first: 24,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.filteringEnabled).toBe(true);
    expect(result.data.facets).toHaveLength(1);
    const facet = result.data.facets[0];
    if (facet?.kind !== "options") throw new Error("expected an options facet");
    expect(facet.name).toBe("Brand");
    expect(facet.options).toEqual([
      {
        paramKey: "filter.brand",
        paramValue: "12",
        label: "Aster",
        productCount: 3,
        isSelected: false,
      },
    ]);
  });
});

describe("searchCatalog with the facet gate off", () => {
  it("asks for neither the facet list nor the plan flag", async () => {
    const fetchMock = mockResponse(planGatedResponse());

    await search.searchCatalog({
      searchTerm: "jacket",
      first: 10,
      facets: false,
    });

    expect(sentVariables(fetchMock).withFacets).toBe(false);
  });

  it("reads a response where the facet connection is absent, not empty", async () => {
    // What `@include(if: false)` actually returns: the field is gone from the
    // payload, so the parse cannot reach for `.edges` on it.
    const response = planGatedResponse() as {
      data: { site: { search: { searchProducts: Record<string, unknown> } } };
    };
    delete response.data.site.search.searchProducts.filters;
    mockResponse(response);

    const result = await search.searchCatalog({
      searchTerm: "jacket",
      first: 10,
      facets: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products).toHaveLength(5);
    expect(result.data.facets).toEqual([]);
    expect(result.data.filteringEnabled).toBe(false);
  });

  it("still asks for them by default", async () => {
    const fetchMock = mockResponse(planGatedResponse());

    await search.searchCatalog({ searchTerm: "jacket", first: 24 });

    expect(sentVariables(fetchMock).withFacets).toBe(true);
  });
});
