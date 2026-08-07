/**
 * Shared building blocks for the Markdown serializers. Kept framework-light so
 * the serializers stay focused on structure rather than formatting minutiae.
 */

import { urlFor } from "@workspace/sanity/client";

import { getBaseUrl } from "@/utils";

/** A Sanity image as returned by the shared `imageFields` GROQ fragment. */
export type SanityImageRef = {
  id?: string | null;
  alt?: string | null;
  caption?: string | null;
};

/** A Shopify Money value. */
export type Money = { amount: string; currencyCode: string };

/** Drops empty/nullish sections and joins the rest with blank lines. */
export function joinSections(
  sections: Array<string | null | undefined>
): string {
  return sections
    .map((section) => section?.trim())
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}

/** `#`-style heading at the given level, with the text Markdown-escaped. */
export function heading(level: number, text: string): string {
  const clamped = Math.min(Math.max(level, 1), 6);
  return `${"#".repeat(clamped)} ${escapeMarkdown(text.trim())}`;
}

/**
 * Escapes the Markdown control characters that would otherwise reinterpret
 * author text. Deliberately conservative — we only escape what commonly breaks
 * inline text, not every possible construct.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]<>])/g, "\\$1").replace(/\|/g, "\\|");
}

/** Rejects dangerous URL schemes so serialized links are safe to publish. */
export function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  // Browsers strip embedded whitespace/control chars when parsing a scheme, so
  // `java\tscript:` stays live. Test a stripped copy, but return the original.
  const normalized = Array.from(trimmed)
    .filter((char) => char.charCodeAt(0) > 0x20)
    .join("")
    .toLowerCase();
  if (/^(javascript|vbscript|data):/.test(normalized)) return null;
  return trimmed;
}

/** Resolves a relative href against the site's base URL; passes through absolute URLs. */
export function absolutizeUrl(url: string): string | null {
  const safe = sanitizeUrl(url);
  if (!safe) return null;
  if (/^https?:\/\//i.test(safe) || safe.startsWith("mailto:")) return safe;
  const base = getBaseUrl();
  return `${base}${safe.startsWith("/") ? "" : "/"}${safe}`;
}

/** Resolves a Sanity image ref to an absolute CDN URL. */
export function sanityImageUrl(
  image: SanityImageRef | null | undefined,
  width = 1600
): string | null {
  if (!image?.id) return null;
  try {
    return urlFor(image.id).width(width).url();
  } catch {
    return null;
  }
}

/** `![alt](url)` for a resolved Sanity image, or null when unresolved. */
export function sanityImageMarkdown(
  image: SanityImageRef | null | undefined
): string | null {
  const url = sanityImageUrl(image);
  if (!url) return null;
  const alt = (image?.alt ?? image?.caption ?? "").trim();
  return `![${escapeMarkdown(alt)}](${url})`;
}

/** Formats a Shopify Money value, e.g. `£29.00`. Falls back to `CODE amount`. */
export function formatMoney(money: Money | null | undefined): string {
  if (!money) return "";
  const amount = Number.parseFloat(money.amount);
  if (!Number.isFinite(amount)) return `${money.currencyCode} ${money.amount}`;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: money.currencyCode,
    }).format(amount);
  } catch {
    return `${money.currencyCode} ${amount.toFixed(2)}`;
  }
}

/**
 * Preserves an author's line breaks for Markdown: single newlines become hard
 * breaks (trailing two spaces), blank lines separate paragraphs. Each line is
 * Markdown-escaped so merchant-authored text can't inject links or formatting.
 */
export function formatMultiline(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map(escapeMarkdown)
        .join("  \n")
    )
    .filter(Boolean)
    .join("\n\n");
}

/** Appends `.md` to an internal path so agents keep following the Markdown surface. */
export function toMarkdownHref(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") return "/index.md";
  return `${normalized}.md`;
}
