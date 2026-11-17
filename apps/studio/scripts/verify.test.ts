import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { readCatalog, storefrontProductIds, unsynced } from "./verify";

const credentials = { storeHash: "abc", adminToken: "t" };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (body: unknown) => new Response(JSON.stringify(body));

/** Two Admin pages of products, one of categories. */
function adminFetch(url: string): Response {
  const { pathname, searchParams } = new URL(url);
  const page = Number(searchParams.get("page"));
  if (pathname.endsWith("/products")) {
    return json({
      data: [{ id: page, name: `product ${page}` }],
      meta: { pagination: { current_page: page, total_pages: 2, total: 2 } },
    });
  }
  return json({
    data: [{ id: 10, name: "category" }],
    meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
  });
}

test("reads every Admin page, and a product past page 1 missing in Sanity fails", async () => {
  globalThis.fetch = (async (url: string) => adminFetch(url)) as typeof fetch;

  const { products } = await readCatalog(credentials);

  assert.deepEqual(
    products.map((p) => p.id),
    [1, 2]
  );
  assert.deepEqual(
    unsynced(products, new Set([1])).map((p) => p.name),
    ["product 2"]
  );
});

test("follows the storefront cursor to the last page", async () => {
  process.env.BIGCOMMERCE_API_URL = "https://storefront.test/graphql";
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const second = String(init.body).includes("after:");
    return json({
      data: {
        site: {
          settings: { storeName: "Store" },
          products: {
            edges: [{ node: { entityId: second ? 2 : 1 } }],
            pageInfo: {
              hasNextPage: !second,
              endCursor: second ? "c2" : "c1",
            },
          },
        },
      },
    });
  }) as typeof fetch;

  const { ids } = await storefrontProductIds();

  assert.deepEqual([...ids], [1, 2]);
});
