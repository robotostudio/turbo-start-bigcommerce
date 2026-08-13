import { describe, expect, it, vi } from "vitest";

/**
 * A failed category read and a category that does not exist are different
 * answers, and this route used to give them the same one. `notFound()` on
 * `!result.ok` told a shopper that a live category was gone — and because the
 * route is held for `revalidate = 300`, that 404 was cached and served to
 * everyone for five minutes after BigCommerce recovered.
 *
 * The pair is what discriminates: a blanket throw would satisfy the first case
 * and turn a genuinely deleted category into a 500, which is the opposite
 * mistake. `notFound()` is mocked to throw its own error so the two exits are
 * telling apart at all.
 */

vi.mock("server-only", () => ({}));
vi.mock("@workspace/env/server", () => ({
  env: {
    BIGCOMMERCE_STORE_HASH: "testhash",
    BIGCOMMERCE_CHANNEL_ID: "42",
    BIGCOMMERCE_STOREFRONT_TOKEN: "test-token",
    BIGCOMMERCE_API_URL: undefined,
  },
}));
vi.mock("@workspace/env/client", () => ({
  env: {
    NEXT_PUBLIC_SANITY_PROJECT_ID: "testproject",
    NEXT_PUBLIC_SANITY_DATASET: "test",
    NEXT_PUBLIC_SANITY_API_VERSION: "2024-10-28",
    NEXT_PUBLIC_SANITY_STUDIO_URL: "http://localhost:3333",
  },
}));

const NOT_FOUND = "NEXT_NOT_FOUND";
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

// Client components whose trees this test has no use for — the assertion is
// which exit the route takes, not what it paints on the way out.
vi.mock("@/components/collection/collection-products", () => ({
  CollectionProducts: () => null,
}));
vi.mock("@/components/collection/product-grid", () => ({
  ProductGrid: () => null,
}));
vi.mock("@/components/collection/listing-controls", () => ({
  ListingControls: () => null,
  ListingControlsProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/json-ld", () => ({
  BreadcrumbJsonLd: () => null,
  CollectionJsonLd: () => null,
}));

const getCategoryByPath = vi.fn();
vi.mock("@/lib/bigcommerce/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bigcommerce/catalog")>()),
  getCategoryByPath: (...args: unknown[]) => getCategoryByPath(...args),
}));
vi.mock("@/lib/bigcommerce/search", () => ({
  searchCatalog: () =>
    Promise.resolve({
      ok: true,
      data: {
        products: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        filteringEnabled: false,
        facets: [],
      },
    }),
}));

const { default: CollectionPage } = await import("../[...slug]/page");

const params = Promise.resolve({ slug: ["jackets"] });

describe("category page", () => {
  it("throws rather than 404s when the category read fails", async () => {
    getCategoryByPath.mockResolvedValue({
      ok: false,
      error: "storefront 503",
      kind: "http",
      status: 503,
    });

    await expect(CollectionPage({ params })).rejects.toThrow(
      /category read failed/i
    );
  });

  it("still 404s when the category genuinely does not exist", async () => {
    getCategoryByPath.mockResolvedValue({
      ok: true,
      data: { node: null, redirectTo: null },
    });

    await expect(CollectionPage({ params })).rejects.toThrow(NOT_FOUND);
  });
});
