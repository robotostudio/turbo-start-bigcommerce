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
