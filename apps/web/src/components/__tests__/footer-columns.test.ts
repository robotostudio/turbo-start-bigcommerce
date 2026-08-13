import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * `hrefFragment` resolves `href` to null when a link's internal reference is
 * missing, unpublished or tombstoned — its `"#"` fallback has no arm that
 * fires for a dangling ref. The navbar drops such a link; the footer rendered
 * it as a `#` anchor that looked clickable and did nothing. One behaviour, and
 * the navbar's is the safe one.
 */

vi.mock("@workspace/sanity/live", () => ({ sanityFetch: vi.fn() }));
vi.mock("@workspace/env/client", () => ({
  env: { NEXT_PUBLIC_SANITY_STUDIO_URL: "http://localhost:3333" },
}));

const { FooterColumns } = await import("../footer");

// The GROQ result type is wider than this test needs; the two fields the
// component reads are `href` and `name`.
// biome-ignore lint/suspicious/noExplicitAny: fixture stands in for one column
const columns: any = [
  {
    _key: "column-1",
    title: "Shop",
    links: [
      { _key: "link-1", name: "Jackets", href: "/collections/jackets" },
      { _key: "link-2", name: "Deleted page", href: null },
    ],
  },
];

describe("footer columns", () => {
  it("drops a link whose target is gone rather than rendering a dead anchor", () => {
    const markup = renderToStaticMarkup(
      createElement(FooterColumns, { columns })
    );

    expect(markup).toContain("Jackets");
    expect(markup).not.toContain("Deleted page");
    expect(markup).not.toContain('href="#"');
  });
});
