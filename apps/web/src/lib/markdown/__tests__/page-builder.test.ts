import { describe, expect, it, vi } from "vitest";

// Same stubs as shared.test.ts: shared.ts reaches env validation otherwise.
vi.mock("@workspace/sanity/client", () => ({
  urlFor: () => ({ width: () => ({ url: () => "https://cdn.test/x" }) }),
}));
vi.mock("@/utils", () => ({ getBaseUrl: () => "https://base.test" }));

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

  it("returns nothing for a block type the schema has dropped", () => {
    expect(
      pageBuilderToMarkdown([
        { _type: "removedBlock" },
        { _type: "constructor" },
      ])
    ).toBe("");
  });
});
