/**
 * Portable Text → Markdown for this repo's rich-text and body fields.
 *
 * Built on `@portabletext/markdown`, with renderers for the annotation and
 * object types this codebase actually uses (see `markDefsFragment` and the
 * body fragments in `packages/sanity/src/query.ts`). Anything unrecognized
 * serializes to an empty string so custom React-only blocks (product hotspots,
 * accordions, …) never leak as raw tags or JSON into the output.
 */

import {
  portableTextToMarkdown,
  type PortableTextMarkRenderer,
  type PortableTextTypeRenderer,
} from "@portabletext/markdown";
import type { PortableTextBlock } from "next-sanity";

import { absolutizeUrl, escapeMarkdown, sanityImageMarkdown } from "./shared";

/** All of this repo's link annotations resolve an `href` in GROQ. */
const linkMark: PortableTextMarkRenderer = ({ value, children }) => {
  const href =
    typeof (value as { href?: unknown })?.href === "string"
      ? (value as { href: string }).href
      : null;
  const url = href ? absolutizeUrl(href) : null;
  return url ? `[${children}](${url})` : children;
};

/** Sanity inline image — `id`/`alt`/`caption` from the shared image fields. */
const imageType: PortableTextTypeRenderer = ({ value }) => {
  const image = value as {
    id?: string | null;
    alt?: string | null;
    caption?: string | null;
  };
  return (
    sanityImageMarkdown(image) ?? (image.caption ?? image.alt ?? "").trim()
  );
};

/** Product-body callout block → blockquote (each line prefixed). */
const calloutType: PortableTextTypeRenderer = ({ value }) => {
  const text = (value as { text?: string | null })?.text?.trim();
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      return trimmed ? `> ${escapeMarkdown(trimmed)}` : "";
    })
    .filter(Boolean)
    .join("\n");
};

export function portableTextToMarkdownString(
  blocks: readonly unknown[] | null | undefined
): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  return portableTextToMarkdown(blocks as PortableTextBlock[], {
    marks: {
      customLink: linkMark,
      linkInternal: linkMark,
      linkExternal: linkMark,
      linkEmail: linkMark,
    },
    types: {
      image: imageType,
      callout: calloutType,
    },
    // Unknown decorators (e.g. `underline`) render as their plain text.
    unknownMark: ({ children }) => children,
    // Unknown object blocks are silenced so no component markup leaks.
    unknownType: () => "",
  }).trim();
}
