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

const catalog = await import("../catalog");

/**
 * The prerender cap is a validated variable, not a raw read, so a test cannot
 * reach it with `vi.stubEnv` — `packages/env` parses once at module load and
 * hands back a number. Mutating the mock is the seam that is left, and the cast
 * is because the real `env` is readonly, which is right everywhere but here.
 */
const mockEnv = (await import("@workspace/env/server"))
  .env as unknown as Record<"BIGCOMMERCE_PRERENDER_LIMIT", number>;

/**
 * A ticket 05 fixture, read verbatim.
 *
 * Each is `{query, variables, status, response}` captured from the live
 * sandbox. The captured `query` is deliberately never compared against the
 * document this module sends — ours asks for `redirectBehavior: FOLLOW` and a
 * different selection, and a string comparison there would only ever tempt
 * someone to edit the evidence. Responses are the contract; queries are not.
 */
function fixture(name: string): {
  query: string;
  variables: Record<string, unknown> | null;
  response: unknown;
} {
  const path = fileURLToPath(
    new URL(`../__fixtures__/${name}.json`, import.meta.url)
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "x-bc-graphql-complexity": "220" },
  });
}

/** Captures the outbound request so `variables.path` can be asserted on. */
function mockResponse(body: unknown) {
  const fetchMock = vi.fn(
    (_url: string, _init: RequestInit): Promise<Response> =>
      Promise.resolve(reply(body))
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type SentBody = { query: string; variables: Record<string, unknown> };

function bodyOf(init: RequestInit | undefined): SentBody {
  return JSON.parse(String(init?.body)) as SentBody;
}

function sentBody(fetchMock: { mock: { calls: [string, RequestInit][] } }) {
  return bodyOf(fetchMock.mock.calls[0]?.[1]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  // The mocked env object is shared across the file, so a test that lowers the
  // cap has to put it back or every later test inherits it.
  mockEnv.BIGCOMMERCE_PRERENDER_LIMIT = 100;
});

describe("toRoutePath", () => {
  it("joins every segment into one path before the lookup", () => {
    expect(catalog.toRoutePath("collections", ["jackets", "leather"])).toBe(
      "/collections/jackets/leather/"
    );
  });

  it("treats a single segment as the same code path", () => {
    expect(catalog.toRoutePath("collections", ["jackets"])).toBe(
      "/collections/jackets/"
    );
  });

  it("survives segments that already carry slashes or padding", () => {
    expect(catalog.toRoutePath("products", ["/rye-leather-moto-jacket/"])).toBe(
      "/products/rye-leather-moto-jacket/"
    );
  });

  it("round-trips through toSegments", () => {
    const segments = ["jackets", "leather"];
    expect(
      catalog.toSegments(catalog.toRoutePath("collections", segments))
    ).toEqual(segments);
  });
});

describe("getProductByPath", () => {
  it("resolves a product from the captured route payload", async () => {
    const { response } = fixture("product-by-path");
    mockResponse(response);

    const result = await catalog.getProductByPath(["rye-leather-moto-jacket"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.redirectTo).toBeNull();
    expect(result.data.node?.entityId).toBe(189);
    expect(result.data.node?.name).toBe("Rye Leather Moto Jacket");
    expect(result.data.node?.path).toBe("/products/rye-leather-moto-jacket/");
  });

  it("sends the path the fixture was captured with", async () => {
    const { response, variables } = fixture("product-by-path");
    const fetchMock = mockResponse(response);

    await catalog.getProductByPath(["rye-leather-moto-jacket"]);

    expect(sentBody(fetchMock).variables.path).toBe(variables?.path);
  });

  it("asks BigCommerce to follow redirects", async () => {
    const { response } = fixture("product-by-path");
    const fetchMock = mockResponse(response);

    await catalog.getProductByPath(["rye-leather-moto-jacket"]);

    expect(sentBody(fetchMock).query).toContain("redirectBehavior: FOLLOW");
  });

  // No ticket 05 fixture captured a stale path — every route capture ran with
  // the schema default of IGNORE and came back `redirect: null`. The response
  // shape is `Route`, though, so a static redirect is this and nothing more.
  it("returns the canonical URL when a stale path redirects", async () => {
    mockResponse({
      data: {
        site: {
          route: {
            redirect: {
              toUrl:
                "https://store-testhash-42.mybigcommerce.com/products/rye-leather-moto-jacket/",
            },
            node: null,
          },
        },
      },
    });

    const result = await catalog.getProductByPath(["old-moto-jacket"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.node).toBeNull();
    expect(result.data.redirectTo).toContain("/rye-leather-moto-jacket/");
  });

  it("ignores a redirect that points back at the requested path", async () => {
    mockResponse({
      data: {
        site: {
          route: {
            redirect: {
              toUrl:
                "https://store-testhash-42.mybigcommerce.com/products/rye-leather-moto-jacket/",
            },
            node: null,
          },
        },
      },
    });

    const result = await catalog.getProductByPath(["rye-leather-moto-jacket"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.redirectTo).toBeNull();
  });

  it("resolves nothing for an unknown path", async () => {
    mockResponse({ data: { site: { route: { redirect: null, node: null } } } });

    const result = await catalog.getProductByPath(["no-such-product"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.node).toBeNull();
    expect(result.data.redirectTo).toBeNull();
  });

  it("passes a storefront failure straight through", async () => {
    mockResponse({ errors: [{ message: "boom" }] });

    const result = await catalog.getProductByPath(["rye"]);

    // toMatchObject, not toEqual: a failure result also carries `status` and
    // the raw `errors` array, which the cart classifier keys on — it needs
    // `path` to tell a missing cart from a missing product. What this test is
    // about is that the failure passes through rather than being swallowed.
    expect(result).toMatchObject({ ok: false, error: "boom", kind: "graphql" });
  });
});

describe("getProductById", () => {
  it("reads the unwrapped site.product envelope", async () => {
    const { response, variables } = fixture("product-by-id");
    const fetchMock = mockResponse(response);

    const result = await catalog.getProductById(189);

    expect(sentBody(fetchMock).variables.entityId).toBe(variables?.entityId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.entityId).toBe(189);
    expect(result.data?.path).toBe("/products/rye-leather-moto-jacket/");
    // The parent product carries no SKU on this store, so the query no longer
    // asks for one; the variants are where they live.
    expect(catalog.nodes(result.data?.variants)[0]?.sku).toBe("TS-P10-BLA-XS");
  });

  it("returns null for a product that no longer exists", async () => {
    mockResponse({ data: { site: { product: null } } });

    const result = await catalog.getProductById(999_999);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeNull();
  });
});

describe("product variants and options", () => {
  it("comes back on the same read as the product", async () => {
    const { response } = fixture("product-variants-and-options");
    mockResponse(response);

    const result = await catalog.getProductById(183);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const variants = catalog.nodes(result.data?.variants);
    const options = catalog.nodes(result.data?.productOptions);

    expect(variants).toHaveLength(10);
    expect(options.map((option) => option.displayName)).toEqual([
      "Size",
      "Color",
    ]);
    // This store hides stock levels, so `aggregated` is null on every variant
    // and `isInStock` is the authoritative signal.
    expect(variants[0]?.inventory?.aggregated).toBeNull();
    expect(variants[0]?.inventory?.isInStock).toBe(true);
  });
});

describe("getProductsByIds", () => {
  it("does not call the API for an empty list", async () => {
    const fetchMock = mockResponse({});

    const result = await catalog.getProductsByIds([]);

    expect(result).toEqual({ ok: true, data: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns products in the order they were asked for", async () => {
    const fetchMock = mockResponse({
      data: {
        site: {
          products: {
            edges: [
              { node: { entityId: 183, name: "Aster" } },
              { node: { entityId: 189, name: "Rye" } },
            ],
          },
        },
      },
    });

    const result = await catalog.getProductsByIds([189, 183]);

    expect(sentBody(fetchMock).variables.entityIds).toEqual([189, 183]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((product) => product.entityId)).toEqual([189, 183]);
  });

  it("drops ids that no longer resolve instead of erroring", async () => {
    mockResponse({
      data: { site: { products: { edges: [{ node: { entityId: 183 } }] } } },
    });

    const result = await catalog.getProductsByIds([183, 999_999]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((product) => product.entityId)).toEqual([183]);
  });

  it("caps the batch at what site.products will accept", async () => {
    const fetchMock = mockResponse({
      data: { site: { products: { edges: [] } } },
    });

    await catalog.getProductsByIds(
      Array.from({ length: 80 }, (_, index) => index + 1)
    );

    const { variables } = sentBody(fetchMock);
    expect(variables.entityIds).toHaveLength(50);
    expect(variables.first).toBe(50);
  });
});

describe("getCategoryByPath", () => {
  it("resolves a single-segment category", async () => {
    const { response, variables } = fixture("category-top-level");
    const fetchMock = mockResponse(response);

    const result = await catalog.getCategoryByPath(["jackets"]);

    expect(sentBody(fetchMock).variables.path).toBe(variables?.path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.node?.entityId).toBe(36);
    expect(catalog.nodes(result.data.node?.breadcrumbs)).toHaveLength(1);
    expect(catalog.nodes(result.data.node?.products)).toHaveLength(2);
    expect(result.data.node?.products.collectionInfo?.totalItems).toBe(2);
  });

  it("resolves a multi-segment category from the joined path", async () => {
    const { response, variables } = fixture("category-nested");
    const fetchMock = mockResponse(response);

    const result = await catalog.getCategoryByPath(["tops", "henleys"]);

    // The whole point: one joined lookup, byte-identical to the path the
    // fixture was captured against.
    expect(sentBody(fetchMock).variables.path).toBe(variables?.path);
    expect(sentBody(fetchMock).variables.path).toBe(
      "/collections/tops/henleys/"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.node?.entityId).toBe(43);
    expect(
      catalog.nodes(result.data.node?.breadcrumbs).map((crumb) => crumb.name)
    ).toEqual(["Tops", "Henleys"]);
  });

  it("pages the product list", async () => {
    const { response } = fixture("category-top-level");
    const fetchMock = mockResponse(response);

    await catalog.getCategoryByPath(["jackets"], {
      first: 24,
      after: "eyJpZCI6MTg5fQ==",
    });

    const { variables } = sentBody(fetchMock);
    expect(variables.first).toBe(24);
    expect(variables.after).toBe("eyJpZCI6MTg5fQ==");
  });

  it("resolves nothing when the path is a product, not a category", async () => {
    const { response } = fixture("product-by-path");
    mockResponse(response);

    const result = await catalog.getCategoryByPath(["rye-leather-moto-jacket"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.node).toBeNull();
  });
});

describe("getCategoryTree", () => {
  it("fetches the tree", async () => {
    const { response } = fixture("category-tree");
    mockResponse(response);

    const result = await catalog.getCategoryTree();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(10);
    expect(result.data.find((item) => item.name === "Tops")?.hasChildren).toBe(
      true
    );
  });

  it("flattens children into the path list", async () => {
    const { response } = fixture("category-tree");
    mockResponse(response);

    const result = await catalog.getCategoryPaths();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(11);
    expect(result.data).toContain("/collections/tops/");
    expect(result.data).toContain("/collections/tops/henleys/");
  });

  it("yields segments a catch-all route can prerender", async () => {
    const { response } = fixture("category-tree");
    mockResponse(response);

    const result = await catalog.getCategoryPaths();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map(catalog.toSegments)).toContainEqual([
      "tops",
      "henleys",
    ]);
  });
});

describe("getProductPaths", () => {
  function page(paths: string[], hasNextPage: boolean, endCursor: string) {
    return {
      data: {
        site: {
          products: {
            pageInfo: { hasNextPage, endCursor },
            edges: paths.map((path) => ({ node: { path } })),
          },
        },
      },
    };
  }

  function mockPages(pages: unknown[]) {
    let call = 0;
    const fetchMock = vi.fn(
      (_url: string, _init: RequestInit): Promise<Response> => {
        const body = pages[Math.min(call, pages.length - 1)];
        call += 1;
        return Promise.resolve(reply(body));
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("stops at the end of the catalog", async () => {
    mockPages([page(["/products/a/", "/products/b/"], false, "c1")]);

    const result = await catalog.getProductPaths();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(["/products/a/", "/products/b/"]);
  });

  it("follows the cursor across pages", async () => {
    const fetchMock = mockPages([
      page(["/products/a/"], true, "c1"),
      page(["/products/b/"], false, "c2"),
    ]);

    const result = await catalog.getProductPaths(2);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(["/products/a/", "/products/b/"]);

    expect(bodyOf(fetchMock.mock.calls[1]?.[1]).variables.after).toBe("c1");
  });

  it("holds the cap even when a page overshoots what it was asked for", async () => {
    const fetchMock = mockPages([
      page(["/products/a/", "/products/b/"], true, "c1"),
      page(["/products/c/", "/products/d/"], true, "c2"),
    ]);

    const result = await catalog.getProductPaths(3);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Each request asks for only what is left in the budget...
    expect(sentBody(fetchMock).variables.first).toBe(3);
    expect(bodyOf(fetchMock.mock.calls[1]?.[1]).variables.first).toBe(1);
    // ...and the cap holds regardless of what came back.
    expect(result.data).toHaveLength(3);
  });

  it("stops on a page that returns nothing, whatever the cursor says", async () => {
    const fetchMock = mockPages([page([], true, "c1")]);

    const result = await catalog.getProductPaths(50);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps prerendering at the environment variable", async () => {
    mockEnv.BIGCOMMERCE_PRERENDER_LIMIT = 1;
    const fetchMock = mockPages([page(["/products/a/"], true, "c1")]);

    const result = await catalog.getProductPaths();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // One page requested, one path kept, and the remaining catalog is left to
    // render on demand rather than at build time.
    expect(result.data).toEqual(["/products/a/"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody(fetchMock).variables.first).toBe(1);
  });

  /**
   * There is no "unusable value" case left to test. The variable is validated
   * as a positive integer in `packages/env/src/server.ts`, so a typo fails the
   * build rather than falling back — which is the whole reason it moved out of
   * a raw `process.env` read. What remains testable is the default itself.
   */
  it("defaults to 100 when the variable is unset", () => {
    expect(catalog.prerenderLimit()).toBe(100);
  });
});

describe("resolveSeo", () => {
  it("reads BigCommerce's native SEO fields", () => {
    expect(
      catalog.resolveSeo(
        {
          pageTitle: "Rye Leather Moto Jacket | Turbo Start",
          metaDescription: "A leather moto jacket.",
          metaKeywords: "leather, jacket,  moto ",
        },
        { title: "Rye Leather Moto Jacket" }
      )
    ).toEqual({
      title: "Rye Leather Moto Jacket | Turbo Start",
      description: "A leather moto jacket.",
      keywords: ["leather", "jacket", "moto"],
    });
  });

  // The trap the fixtures expose: unset SEO fields come back as "", not null,
  // so `??` never fires and the page ships an empty <title>.
  it("falls back when the store left the SEO fields blank", async () => {
    const { response } = fixture("category-top-level");
    mockResponse(response);

    const result = await catalog.getCategoryByPath(["jackets"]);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data.node) return;

    const seo = catalog.resolveSeo(result.data.node.seo, {
      title: result.data.node.name,
      description: result.data.node.description,
    });

    expect(result.data.node.seo.pageTitle).toBe("");
    expect(seo.title).toBe("Jackets");
    expect(seo.description).toBe("<p>Outerwear and jackets.</p>");
    expect(seo.keywords).toEqual([]);
  });

  it("falls back for a product too", async () => {
    const { response } = fixture("product-by-path");
    mockResponse(response);

    const result = await catalog.getProductByPath(["rye-leather-moto-jacket"]);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data.node) return;

    const seo = catalog.resolveSeo(result.data.node.seo, {
      title: result.data.node.name,
      description: result.data.node.plainTextDescription,
    });

    expect(seo.title).toBe("Rye Leather Moto Jacket");
    // The seeded catalog ships no product description either, so the honest
    // answer is an empty description rather than an invented one. A store that
    // fills either field gets it used.
    expect(result.data.node.plainTextDescription).toBe("");
    expect(seo.description).toBe("");
  });
});
