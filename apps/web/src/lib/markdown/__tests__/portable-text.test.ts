import { describe, expect, it, vi } from "vitest";

// portable-text.ts → shared.ts pulls in the Sanity image builder (→ env
// validation), unavailable in the test runner. Stub those edges.
vi.mock("@workspace/sanity/client", () => ({
  urlFor: () => ({ width: () => ({ url: () => "https://cdn.test/x" }) }),
}));
vi.mock("@/utils", () => ({ getBaseUrl: () => "https://base.test" }));

import { portableTextToMarkdownString } from "@/lib/markdown/portable-text";

describe("portableTextToMarkdownString — callouts", () => {
  it("escapes Markdown in callout text so it cannot inject a link", () => {
    const md = portableTextToMarkdownString([
      { _type: "callout", _key: "a", text: "See [x](http://evil.test)" },
    ]);
    expect(md).toBe("> See \\[x\\](http://evil.test)");
  });

  it("prefixes every non-empty line of a multi-line callout", () => {
    const md = portableTextToMarkdownString([
      { _type: "callout", _key: "a", text: "line one\n\nline two" },
    ]);
    expect(md).toBe("> line one\n> line two");
  });
});

describe("portableTextToMarkdownString — safety", () => {
  it("silences unknown object blocks so no component markup leaks", () => {
    const md = portableTextToMarkdownString([
      { _type: "imageWithProductHotspots", _key: "a" },
    ]);
    expect(md).toBe("");
  });

  it("returns an empty string for nullish or empty input", () => {
    expect(portableTextToMarkdownString(null)).toBe("");
    expect(portableTextToMarkdownString(undefined)).toBe("");
    expect(portableTextToMarkdownString([])).toBe("");
  });
});

describe("portableTextToMarkdownString — links", () => {
  const withLink = (href: string | null) =>
    portableTextToMarkdownString([
      {
        _type: "block",
        _key: "b",
        style: "normal",
        markDefs: [{ _key: "l", _type: "customLink", href }],
        children: [
          { _type: "span", _key: "s", text: "Read more", marks: ["l"] },
        ],
      },
    ]);

  // Same rule as the HTML `customLink` mark: an unresolved link keeps its words.
  it("renders an unresolved link as its plain text", () => {
    expect(withLink(null)).toBe("Read more");
  });

  // The fallback arm of `hrefFragment`, for a link with no type picked.
  it("renders the placeholder href as its plain text", () => {
    expect(withLink("#")).toBe("Read more");
  });

  it("keeps a resolved internal link, made absolute", () => {
    expect(withLink("/blog/returns")).toBe(
      "[Read more](https://base.test/blog/returns)"
    );
  });

  it("keeps an external link", () => {
    expect(withLink("https://example.com")).toBe(
      "[Read more](https://example.com)"
    );
  });
});
