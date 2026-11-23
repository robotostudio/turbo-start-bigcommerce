import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CTACard, type CTACardProps } from "../image-link-card";

// The image builder pulls in validated env; the link is what is under test.
vi.mock("../elements/sanity-image", () => ({ SanityImage: () => null }));

const render = (openInNewTab: boolean) =>
  renderToStaticMarkup(
    createElement(CTACard, {
      card: {
        _key: "c",
        title: "Docs",
        href: "https://www.sanity.io/docs",
        openInNewTab,
      } as unknown as CTACardProps["card"],
    })
  );

describe("CTACard", () => {
  it("opens in a new tab with rel when the editor asks for it", () => {
    const html = render(true);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("stays in the same tab otherwise", () => {
    const html = render(false);
    expect(html).not.toContain("target=");
    expect(html).not.toContain("rel=");
  });
});
