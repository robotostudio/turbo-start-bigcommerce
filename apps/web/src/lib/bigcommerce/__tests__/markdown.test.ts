import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

// `lib/markdown/shared` pulls in the Sanity image builder (→ env validation),
// which isn't available in the test runner. Stub those edges, as the existing
// Markdown suite does.
vi.mock("@workspace/sanity/client", () => ({
  urlFor: () => ({ width: () => ({ url: () => "https://cdn.test/x" }) }),
}));
vi.mock("@/utils", () => ({ getBaseUrl: () => "https://base.test" }));

const { categoryToMarkdown, productToMarkdown } = await import("../markdown");

function fixture(name: string) {
  return JSON.parse(
    readFileSync(
      new URL(`../__fixtures__/${name}.json`, import.meta.url),
      "utf8"
    )
  );
}

const PRODUCT = fixture("product-by-id").response.data.site.product;
const CATEGORY = fixture("category-top-level").response.data.site.route.node;

/** The document's H2 headings, in order — the shape assertion. */
function sections(markdown: string): string[] {
  return [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1] ?? "");
}

describe("adapters", () => {
  it("each take a single argument", () => {
    expect(productToMarkdown).toHaveLength(1);
    expect(categoryToMarkdown).toHaveLength(1);
  });
});

describe("productToMarkdown", () => {
  const markdown = productToMarkdown(PRODUCT);

  it("emits the document sections in order", () => {
    expect(markdown.startsWith("# Rye Leather Moto Jacket\n")).toBe(true);
    expect(sections(markdown)).toEqual([
      "Product Information",
      "Pricing",
      "Description",
      "Options",
      "Variants",
      // Labelled from the metafield keys the namespace actually holds — there
      // is no key allowlist to drift out of sync.
      "Product Type",
      "Tags",
      "Images",
    ]);
    // seo is all empty strings on this store, so the section is omitted.
    expect(markdown).not.toContain("## SEO");
  });

  it("derives the handle from the path without its trailing slash", () => {
    expect(markdown).toContain("- **Handle**: rye-leather-moto-jacket");
    expect(markdown).toContain(
      "- **Categories**: All Products, New Arrivals, Sale, Jackets"
    );
    expect(markdown).toContain("- **Available**: Yes");
  });

  it("prices from the product, with basePrice as the compare-at", () => {
    expect(markdown).toContain("- **Price**: £396.00");
    expect(markdown).toContain("- **Compare At**: £495.00");
  });

  it("renders the description as text, not markup", () => {
    expect(markdown).toContain(
      "A café-racer jacket in vegetable-tanned lambskin"
    );
    expect(markdown).not.toContain("<p>");
  });

  it("tabulates the variants under the options they vary by", () => {
    expect(markdown).toContain("- **Size**: XS, S, M, L, XL");
    expect(markdown).toContain(
      "| Variant | Size | Color | Price | Available |"
    );
    expect(markdown).toContain(
      "| TS-P10-BLA-XS | XS | Black | £396.00 | Yes |"
    );
  });

  it("renders each metafield as its own section", () => {
    expect(markdown).toContain("## Product Type\n\nJacket");
    expect(markdown).toContain(
      "## Tags\n\njacket, leather, moto, new, outerwear, premium"
    );
  });

  it("closes with locale and currency, and no update stamp", () => {
    expect(markdown.trimEnd().endsWith("*Locale: en-GB | Currency: GBP*")).toBe(
      true
    );
    expect(markdown).not.toContain("Last updated");
  });

  // Product 189 has no brand, a flat price range and empty SEO, so these three
  // branches are unreachable from the fixture. An inline literal is also the
  // only place `MarkdownProduct` gets type-checked — the fixture arrives as
  // `any` out of `JSON.parse`.
  it("renders brand, a price range and SEO when the product carries them", () => {
    const ranged = productToMarkdown({
      name: "Ranged",
      path: "/products/ranged/",
      brand: { name: "Roboto" },
      prices: {
        price: { value: 100, currencyCode: "GBP" },
        priceRange: {
          min: { value: 100, currencyCode: "GBP" },
          max: { value: 180, currencyCode: "GBP" },
        },
      },
      seo: { pageTitle: "Ranged", metaDescription: "A ranged thing" },
    });

    expect(ranged).toContain("- **Brand**: Roboto");
    expect(ranged).toContain("- **Price**: £100.00 – £180.00");
    expect(ranged).toContain("- **Title**: Ranged");
    expect(ranged).toContain("- **Description**: A ranged thing");
  });
});

describe("categoryToMarkdown", () => {
  const markdown = categoryToMarkdown(CATEGORY);

  it("lists the category's products as .md links", () => {
    expect(markdown.startsWith("# Jackets\n")).toBe(true);
    expect(markdown).toContain("Outerwear and jackets.");
    expect(sections(markdown)).toEqual(["Products"]);
    expect(markdown).toContain(
      "- [Aster Denim Coach Jacket](/products/aster-denim-coach-jacket.md) — from £133.00"
    );
    expect(markdown).toContain(
      "- [Rye Leather Moto Jacket](/products/rye-leather-moto-jacket.md) — from £396.00"
    );
  });

  it("decodes the entities the HTML description carries", () => {
    expect(
      categoryToMarkdown({
        name: "Coats & Jackets",
        description: "<p>Wool &amp; leather.</p><p>Sized 5 &lt; 6.</p>",
      })
    ).toBe("# Coats & Jackets\n\nWool & leather.\n\nSized 5 \\< 6.");
  });

  it("omits the products section when the category is empty", () => {
    expect(categoryToMarkdown({ name: "Empty" })).toBe("# Empty");
  });
});
