import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PortableText } from "next-sanity";
import { describe, expect, it, vi } from "vitest";

import { sharedPortableTextTypes } from "../portable-text-types";

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
    // biome-ignore lint/suspicious/noExplicitAny: Portable Text render props
    const body = findPortableText(
      (Accordion as any)({ value: accordionWithLink })
    );
    expect(body).not.toBeNull();

    const html = renderToStaticMarkup(body as ReactElement);

    expect(html).toContain('href="/blog/returns"');
    expect(html).not.toContain("unknown__pt__mark__customLink");
  });
});
