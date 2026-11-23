import { PortableText, type PortableTextBlock } from "next-sanity";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  sharedPortableTextMarks,
  sharedPortableTextTypes,
} from "../portable-text-types";

// Unrelated to the accordion, and it drags the Sanity image builder — and with it
// validated env — into a test that needs neither.
vi.mock("@/components/product/product-hotspots", () => ({
  ProductHotspotsImage: () => null,
}));

/**
 * A blog accordion group whose body carries a `customLink` annotation. The
 * projection fetches the markDef (`editorialMembersFragment` in
 * packages/sanity/src/query.ts), so the href can only be lost in the nested
 * `<PortableText>` the accordion renderer builds for the group body.
 */
const accordionWithLink = {
  _type: "accordion",
  _key: "acc",
  groups: [
    {
      _key: "group",
      title: "Shipping",
      body: [
        {
          _type: "block",
          _key: "block",
          style: "normal",
          markDefs: [
            {
              _key: "link",
              _type: "customLink",
              href: "/blog/returns",
              openInNewTab: false,
            },
          ],
          children: [
            {
              _type: "span",
              _key: "span",
              text: "Returns policy",
              marks: ["link"],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Radix leaves a closed panel's children unmounted, so rendering the accordion
 * whole gives an empty body. Pull the body's `<PortableText>` out of the tree
 * instead and render that — same element the accordion built, `components` prop
 * and all.
 */
function findPortableText(node: unknown): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findPortableText(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === PortableText) return node;
  const { children } = node.props as { children?: unknown };
  return findPortableText(children);
}

describe("accordion portable text type", () => {
  it("renders a link annotation inside a group as an anchor with an href", () => {
    const Accordion = sharedPortableTextTypes().accordion;
    if (typeof Accordion !== "function") throw new Error("no accordion type");
    const body = findPortableText(
      // biome-ignore lint/suspicious/noExplicitAny: Portable Text render props
      (Accordion as any)({ value: accordionWithLink })
    );
    expect(body).not.toBeNull();

    const html = renderToStaticMarkup(body as ReactElement);

    expect(html).toContain('href="/blog/returns"');
    expect(html).not.toContain("unknown__pt__mark__customLink");
  });
});

// Biome's noBlankTarget misses a conditional `target={x ? "_blank" : …}`, which
// is how these links shipped without rel (ROB-6791), so the markup is asserted.
describe("rich-text link marks", () => {
  const render = (_type: string, openInNewTab: boolean) =>
    renderToStaticMarkup(
      createElement(PortableText, {
        value: [
          <PortableTextBlock>{
            _type: "block",
            _key: "b",
            style: "normal",
            markDefs: [
              {
                _key: "l",
                _type,
                href: "https://www.sanity.io/docs",
                openInNewTab,
              },
            ],
            children: [
              { _type: "span", _key: "s", text: "Docs", marks: ["l"] },
            ],
          },
        ],
        components: { marks: sharedPortableTextMarks },
      })
    );

  it.each(["customLink", "linkExternal"])(
    "%s opens a new tab with rel when asked",
    (type) => {
      const html = render(type, true);
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    }
  );

  it.each(["customLink", "linkExternal"])(
    "%s stays in the same tab otherwise",
    (type) => {
      const html = render(type, false);
      expect(html).not.toContain("target=");
      expect(html).not.toContain("rel=");
    }
  );
});

type LinkMarkDef = { href?: string | null; openInNewTab?: boolean };

const paragraphWithLink = (link: LinkMarkDef) => [
  {
    _type: "block",
    _key: "block",
    style: "normal",
    markDefs: [{ _key: "link", _type: "customLink", ...link }],
    children: [
      { _type: "span", _key: "span", text: "Read more", marks: ["link"] },
    ],
  },
];

const renderLink = (link: LinkMarkDef) =>
  renderToStaticMarkup(
    createElement(PortableText, {
      components: { marks: sharedPortableTextMarks },
      value: paragraphWithLink(link),
    })
  );

describe("customLink mark", () => {
  // `hrefFragment` projects a null href when the weak reference dangles.
  it("renders an unresolved internal link as its plain text", () => {
    expect(renderLink({ href: null })).toBe("<p>Read more</p>");
  });

  // `...customLink{}` spreads nothing when the annotation's field is unset.
  it("renders a link with no href key as its plain text", () => {
    expect(renderLink({})).toBe("<p>Read more</p>");
  });

  // The fallback arm of `hrefFragment`, for a link with no type picked.
  it("renders the placeholder href as its plain text", () => {
    expect(renderLink({ href: "#" })).toBe("<p>Read more</p>");
  });

  it("keeps a resolved internal link", () => {
    const html = renderLink({ href: "/blog/returns" });
    expect(html).toContain('href="/blog/returns"');
    expect(html).toContain(">Read more</a>");
  });

  // WCAG 2.5.3: the accessible name must be the visible words, not the URL.
  it("names a resolved link by its text, not its href", () => {
    expect(renderLink({ href: "/blog/returns" })).not.toContain("aria-label");
  });

  it("keeps an external link", () => {
    const html = renderLink({
      href: "https://example.com",
      openInNewTab: true,
    });
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
  });
});
