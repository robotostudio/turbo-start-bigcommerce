import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * "The editor picked nothing" and "every product the editor picked is gone"
 * reach this block as the same thing: an empty `productHandles`, because the
 * GROQ compacts a dangling reference away. Empty handles is what makes
 * `/api/featured-products/cards` answer with the four newest products in the
 * catalog — so a curated row silently became whatever shipped most recently,
 * under the editor's own heading.
 *
 * The second case is the guard rail: the automatic row is a documented feature
 * of this block, and a fix that killed it would be a worse bug than the one
 * being fixed.
 */

const useQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQuery(options),
}));

vi.mock("@/components/product/product-card", () => ({
  ProductCard: ({ slug }: { slug: string }) => slug,
}));

const { FeaturedProducts } = await import("../featured-products");

const CARDS = [{ slug: "newest-hoodie" }];

describe("featured products block", () => {
  it("renders nothing rather than unrelated products when every pick dangles", () => {
    useQuery.mockReturnValue({ data: CARDS, isPending: false });

    const markup = renderToStaticMarkup(
      createElement(FeaturedProducts, {
        heading: "Editor's picks",
        // GROQ compacted four dead references down to nothing; the raw picks
        // are still on the block and are the only remaining evidence of them.
        productHandles: [],
        products: [{ _key: "a" }, { _key: "b" }, { _key: "c" }, { _key: "d" }],
      })
    );

    expect(markup).toBe("");
    expect(useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: false });
  });

  it("still falls back to the newest products when the editor picked none", () => {
    useQuery.mockReturnValue({ data: CARDS, isPending: false });

    const markup = renderToStaticMarkup(
      createElement(FeaturedProducts, {
        heading: "Featured",
        productHandles: [],
        products: [],
      })
    );

    expect(markup).toContain("newest-hoodie");
    expect(useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: true });
  });

  it("renders the picks that survived when only some dangled", () => {
    useQuery.mockReturnValue({ data: CARDS, isPending: false });

    const markup = renderToStaticMarkup(
      createElement(FeaturedProducts, {
        heading: "Featured",
        productHandles: ["wren-washed-cap"],
        products: [{ _key: "a" }, { _key: "b" }],
      })
    );

    expect(markup).toContain("newest-hoodie");
  });
});
