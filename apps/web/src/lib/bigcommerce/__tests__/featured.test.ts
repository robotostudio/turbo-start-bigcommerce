import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted by vitest, so both run before `client.ts` is evaluated — it derives
// its endpoint from env at load time.
vi.mock("server-only", () => ({}));
vi.mock("@workspace/env/server", () => ({
  env: {
    BIGCOMMERCE_STORE_HASH: "testhash",
    BIGCOMMERCE_CHANNEL_ID: "42",
    BIGCOMMERCE_STOREFRONT_TOKEN: "test-token",
    BIGCOMMERCE_API_URL: undefined,
  },
}));

const { getFeaturedProducts } = await import("../featured");

/** The captured product, read from the fixture unedited. */
const RYE = JSON.parse(
  readFileSync(
    new URL("../__fixtures__/product-by-id.json", import.meta.url),
    "utf8"
  )
).response.data.site.product;

/**
 * A second product for the batch. The capture pass recorded a single-product
 * read, so the sibling is the same captured node under another id rather than
 * an invented shape.
 */
const ASTER = { ...RYE, entityId: 183, name: "Aster Denim Coach Jacket" };

function mockFetch(nodes: unknown[]): ReturnType<typeof vi.fn> {
  return mockBody(
    JSON.stringify({
      data: { site: { products: { edges: nodes.map((node) => ({ node })) } } },
    })
  );
}

function mockBody(body: string): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    (_url: string, _init: RequestInit): Promise<Response> =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "x-bc-graphql-complexity": "180" },
        })
      )
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The JSON body of the nth outgoing request. */
function sentBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as {
    query: string;
    variables: Record<string, unknown>;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getFeaturedProducts", () => {
  it("restores the editor's order when the batch comes back in another one", async () => {
    // `site.products(entityIds:)` is a set lookup: this is the reverse of what
    // was asked for, which is exactly what BigCommerce is free to return.
    mockFetch([ASTER, RYE]);

    const products = await getFeaturedProducts([189, 183]);

    expect(products.map((product) => product.entityId)).toEqual([189, 183]);
  });

  it("drops an id the batch didn't return rather than leaving a gap", async () => {
    // BigCommerce silently omits unknown ids from the connection.
    mockFetch([RYE, ASTER]);

    const products = await getFeaturedProducts([189, 999999, 183]);

    expect(products).toHaveLength(2);
    expect(products.map((product) => product.entityId)).toEqual([189, 183]);
    expect(products.every(Boolean)).toBe(true);
  });

  it("asks for each id once even when the editor picked a duplicate", async () => {
    const fetchMock = mockFetch([RYE, ASTER]);

    await getFeaturedProducts([189, 183, 189]);

    expect(sentBody(fetchMock).variables).toMatchObject({
      entityIds: [189, 183],
      first: 2,
    });
  });

  it("returns nothing when the batch request fails", async () => {
    mockBody('{"errors":[{"message":"boom"}]}');

    await expect(getFeaturedProducts([189, 183])).resolves.toEqual([]);
  });

  it("falls back to best sellers when the editor picked none", async () => {
    const fetchMock = mockBody(
      JSON.stringify({
        data: {
          site: { bestSellingProducts: { edges: [{ node: RYE }] } },
        },
      })
    );

    const products = await getFeaturedProducts();

    expect(sentBody(fetchMock).query).toContain("bestSellingProducts");
    expect(products.map((product) => product.entityId)).toEqual([189]);
  });
});
