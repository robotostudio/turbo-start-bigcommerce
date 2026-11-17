import { describe, expect, it, vi } from "vitest";

// Same stubs as shared.test.ts: shared.ts reaches env validation otherwise.
vi.mock("@workspace/sanity/client", () => ({
  urlFor: () => ({ width: () => ({ url: () => "https://cdn.test/x" }) }),
}));
vi.mock("@/utils", () => ({ getBaseUrl: () => "https://base.test" }));

import type { ProductCardProps } from "@/components/product/product-card";
import type { CatalogProduct } from "@/lib/bigcommerce/catalog";
import { pageBuilderToMarkdown } from "@/lib/markdown/page-builder";

describe("pageBuilderToMarkdown", () => {
  it.each([
    { _type: "collectionBanner", title: "collectionBanner" },
    { _type: "cta", title: "cta" },
    { _type: "editorialTwoUp", items: [{ collectionTitle: "editorialTwoUp" }] },
    { _type: "exploreCategories", title: "exploreCategories" },
    { _type: "faqAccordion", title: "faqAccordion" },
    { _type: "faqCategories", title: "faqCategories" },
    { _type: "featureCardsIcon", title: "featureCardsIcon" },
    { _type: "featuredProducts", heading: "featuredProducts" },
    { _type: "hero", title: "hero" },
    { _type: "imageLinkCards", title: "imageLinkCards" },
    { _type: "layersShowcase", heading: "layersShowcase" },
    { _type: "subscribeNewsletter", title: "subscribeNewsletter" },
  ])("renders $_type", (block) => {
    expect(pageBuilderToMarkdown([block])).toContain(block._type);
  });

  it("links featured products by name, only the ones the page resolved", () => {
    const markdown = pageBuilderToMarkdown(
      [{ _type: "featuredProducts", _key: "f", productHandles: ["a", "gone"] }],
      {
        f: {
          _type: "featuredProducts",
          queryKey: "a,gone",
          cards: [{ slug: "a", title: "Wren Cap" } as ProductCardProps],
        },
      }
    );
    expect(markdown).toContain("- [Wren Cap](https://base.test/products/a)");
    expect(markdown).not.toContain("gone");
  });

  it("drops a featured row whose products all failed to resolve", () => {
    expect(
      pageBuilderToMarkdown(
        [{ _type: "featuredProducts", _key: "f", heading: "Featured" }],
        { f: { _type: "featuredProducts", queryKey: "gone", cards: [] } }
      )
    ).toBe("");
  });

  it("links the showcase product by name, and drops it when unresolved", () => {
    const block = {
      _type: "layersShowcase",
      _key: "l",
      heading: "Layers",
      productHandle: "a",
    };
    const product = { name: "Aster Jacket" } as CatalogProduct;
    expect(
      pageBuilderToMarkdown([block], {
        l: { _type: "layersShowcase", handle: "a", product },
      })
    ).toContain("- [Aster Jacket](https://base.test/products/a)");
    expect(
      pageBuilderToMarkdown([block], {
        l: { _type: "layersShowcase", handle: "a", product: null },
      })
    ).toBe("");
  });

  it("returns nothing for a block type the schema has dropped", () => {
    expect(
      pageBuilderToMarkdown([
        { _type: "removedBlock" },
        { _type: "constructor" },
      ])
    ).toBe("");
  });
});
