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
