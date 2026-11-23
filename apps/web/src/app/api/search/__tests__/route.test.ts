import { beforeEach, describe, expect, it, vi } from "vitest";

const searchCatalog = vi.fn();
vi.mock("@/lib/bigcommerce/search", () => ({
  flattenCategories: () => [],
  searchCatalog: (...args: unknown[]) => searchCatalog(...args),
  toSearchCategory: (category: unknown) => category,
}));

const getCategoryTree = vi.fn();
vi.mock("@/lib/bigcommerce/catalog", () => ({
  getCategoryTree: () => getCategoryTree(),
}));

const { GET } = await import("../route");

const EMPTY = { products: [], collections: [], related: [] };

const get = (query: string) =>
  GET(new Request(`https://store.test/api/search?${query}`));

beforeEach(() => {
  searchCatalog.mockReset();
  searchCatalog.mockResolvedValue({
    ok: true,
    data: { products: [], suggestions: [] },
  });
  getCategoryTree.mockReset();
  getCategoryTree.mockResolvedValue({ ok: true, data: [] });
});

describe("search drawer route", () => {
  it("reports a failed storefront request instead of an empty 200", async () => {
    searchCatalog.mockResolvedValue({ ok: false, error: "upstream down" });

    const res = await get("q=jacket");

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("upstream down");
  });

  it("answers a search with no matches with an empty 200", async () => {
    const res = await get("q=zzzznomatch");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EMPTY);
  });

  it.each([
    ["no query", ""],
    ["an empty query", "q="],
    ["a whitespace-only query", "q=%20%20"],
  ])(
    "answers %s with an empty 200, without searching",
    async (_label, query) => {
      const res = await get(query);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(EMPTY);
      expect(searchCatalog).not.toHaveBeenCalled();
    }
  );
});
