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

const { getProductDetail } = await import("../fetch-product");

/** A ticket 05 fixture, read verbatim — the same ones `catalog.test.ts` uses. */
function fixture(name: string): { response: unknown } {
  const path = fileURLToPath(
    new URL(
      `../../../lib/bigcommerce/__fixtures__/${name}.json`,
      import.meta.url
    )
  );
  return JSON.parse(readFileSync(path, "utf8")) as { response: unknown };
}

function mockResponse(body: unknown) {
  const fetchMock = vi.fn(
    (): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "x-bc-graphql-complexity": "4048" },
        })
      )
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A refusal, as `client.ts` sees it: a status and an `errors` array. */
function mockFailure(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (): Promise<Response> =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          })
        )
    )
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getProductDetail", () => {
  /**
   * The PDP used to resolve the route and then re-read the same product by id,
   * because a bare fragment spread on `site.route.node` dropped half the
   * selection. The query wraps its spread in `... on Product { … }` now, so the
   * second read is redundant — and it cost a whole extra request against a
   * per-request complexity budget that the cart mutations already run at 92% of.
   *
   * Counting requests rather than asserting a complexity number on purpose:
   * BigCommerce reports complexity per request, so the cheapest way for this
   * page to creep back toward the ceiling is to start making more of them.
   */
  it("reads the product in exactly one storefront request", async () => {
    const fetchMock = mockResponse(fixture("product-by-path").response);

    const route = await getProductDetail(["rye-leather-moto-jacket"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(route.node?.name).toBe("Rye Leather Moto Jacket");
    expect(route.unavailable).toBe(false);
  });

  /**
   * The whole PDP renders off this payload, so a partial one is a broken page.
   *
   * The route node here is `product-by-id`'s, not `product-by-path`'s: that
   * fixture was captured through the bare spread and is the evidence of the old
   * bug — it carries `productOptions: []` and a null `defaultImage`. Wrapped in
   * `... on Product`, the route returns what the id lookup returns, byte for
   * byte, verified live across all 12 seeded products.
   */
  it("returns the options and image the second read used to supply", async () => {
    const node = (
      fixture("product-by-id").response as {
        data: { site: { product: unknown } };
      }
    ).data.site.product;
    mockResponse({ data: { site: { route: { redirect: null, node } } } });

    const route = await getProductDetail(["rye-leather-moto-jacket"]);

    expect(route.node?.productOptions.edges?.length).toBeGreaterThan(0);
    expect(route.node?.defaultImage?.url).toBeTruthy();
  });

  /**
   * A storefront that did not answer is not a product that does not exist. Both
   * arrive as `node: null`, and only the flag separates the 404 the PDP owes a
   * missing product from the visible failure it owes a broken read.
   */
  it("flags a failed read as unavailable rather than as a missing product", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNREFUSED")))
    );

    const route = await getProductDetail(["rye-leather-moto-jacket"]);

    expect(route.unavailable).toBe(true);
    expect(route.node).toBeNull();
  });

  it("leaves a genuinely missing product available and empty", async () => {
    mockResponse({ data: { site: { route: { redirect: null, node: null } } } });

    const route = await getProductDetail(["gone-forever"]);

    expect(route.unavailable).toBe(false);
    expect(route.node).toBeNull();
  });

  /**
   * The rejection this whole ticket is about, verbatim from the live API: HTTP
   * 400, one message, no `path`, no `locations`, no complexity header.
   */
  it("degrades on a complexity rejection", async () => {
    mockFailure(400, {
      errors: [
        {
          message:
            "The query is too complex as it has a complexity score of 34314 out of 10000. Please remove some elements and try again",
        },
      ],
    });

    const route = await getProductDetail(["too-expensive"]);

    expect(route.unavailable).toBe(true);
  });

  it("degrades when the storefront rate limits the read", async () => {
    mockFailure(429, { errors: [{ message: "Too many requests" }] });

    const route = await getProductDetail(["rate-limited"]);

    expect(route.unavailable).toBe(true);
  });

  /**
   * The narrowness that makes the rest of it safe. A malformed query is a bug
   * in this repo and arrives as the same HTTP 400 an over-complex one does —
   * rendering "temporarily unavailable" over it would hide it for good.
   */
  it("keeps throwing on a query the storefront could not parse", async () => {
    mockFailure(400, {
      errors: [
        {
          message: 'Cannot query field "nope" on type "Product".',
          locations: [{ line: 3, column: 5 }],
        },
      ],
    });

    await expect(getProductDetail(["malformed"])).rejects.toThrow(
      /Cannot query field/
    );
  });
});
