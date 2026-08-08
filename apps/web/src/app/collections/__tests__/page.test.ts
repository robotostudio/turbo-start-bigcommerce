import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The collections index is prerendered and held for `revalidate = 300`, so what
 * it renders on a failed category-tree read is what every shopper sees for the
 * next five minutes. Degrading to an empty list makes that a 200 nobody can
 * tell apart from a store with no categories; throwing keeps the last good page
 * in place through the revalidation.
 *
 * The two cases are a pair, and the second is the one that discriminates. A
 * blanket `if (!ok || data.length === 0) throw` would satisfy the first and
 * break a genuinely empty store, which is a legitimate 200.
 *
 * `environment: "node"` means there is no status code to assert here — resolve
 * versus reject is the honest assertion at this level. That the reject reaches
 * the shopper as a 5xx is Next's error boundary, same as the category listing
 * page it matches.
 */

// Hoisted above the page's module graph: `catalog.ts` reads env at load time
// and is `server-only`, and the two components are client components whose UI
// tree this test has no use for.
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
vi.mock("@workspace/sanity/live", () => ({
  sanityFetch: () => Promise.resolve({ data: { title: "Collections" } }),
}));
// Stands in for the request scope. `connection()` aborts a build prerender and
// resolves at request time; resolving is the request-time half, which is the
// one where the failure has to reach the shopper as an error.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/components/json-ld", () => ({
  BreadcrumbJsonLd: () => null,
  CollectionJsonLd: () => null,
}));
// Stands in for the empty state, so the passing case proves the page rendered
// the list it was given rather than only that it did not throw.
vi.mock("@/components/collections/collections-content", () => ({
  CollectionsContent: ({ collections }: { collections: unknown[] }) =>
    collections.length === 0 ? "No collections" : `${collections.length} shown`,
}));

const getCategoryTree = vi.fn();
// `flattenCategoryTree` stays real: it is what turns the tree into the list the
// page counts, and a stub of it would test nothing.
vi.mock("@/lib/bigcommerce/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bigcommerce/catalog")>()),
  getCategoryTree: () => getCategoryTree(),
}));

const { default: CollectionsPage } = await import("../page");

describe("collections index page", () => {
  it("throws when the category tree read fails", async () => {
    getCategoryTree.mockResolvedValue({
      ok: false,
      error: "storefront 503",
      kind: "http",
      status: 503,
    });

    await expect(CollectionsPage()).rejects.toThrow(/category tree read/i);
  });

  it("renders the empty state when the store genuinely has no categories", async () => {
    getCategoryTree.mockResolvedValue({ ok: true, data: [] });

    expect(renderToStaticMarkup(await CollectionsPage())).toContain(
      "No collections"
    );
  });
});
