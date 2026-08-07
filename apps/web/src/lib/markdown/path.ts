/**
 * Pure, framework-agnostic helpers for content negotiation.
 *
 * An agent asks for the Markdown representation of a page either by appending
 * `.md` to the URL, or by sending `Accept: text/markdown`. These helpers decide
 * intent and canonicalize the requested path. No Next.js or Node APIs here so
 * the module can run in the Edge middleware and in the route handler alike.
 */

export const MARKDOWN_MEDIA_TYPE = "text/markdown";

/**
 * Canonicalizes a path for lookup: ensures a leading slash, strips a trailing
 * `.md`, drops a trailing slash, and maps `/index` → `/`.
 */
export function normalizeMarkdownPath(raw: string): string {
  const trimmed = raw.trim();
  const slashed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutMd = slashed.endsWith(".md") ? slashed.slice(0, -3) : slashed;
  const withoutTrailing =
    withoutMd.length > 1 && withoutMd.endsWith("/")
      ? withoutMd.slice(0, -1)
      : withoutMd;
  return withoutTrailing === "/index" ? "/" : withoutTrailing;
}

type AcceptEntry = { type: string; q: number };

/** Parses an `Accept` header into media types with their q-values. */
function parseAccept(accept: string): AcceptEntry[] {
  const entries: AcceptEntry[] = [];
  for (const part of accept.split(",")) {
    const [media, ...params] = part
      .trim()
      .split(";")
      .map((p) => p.trim());
    if (!media) continue;
    const qParam = params.find((p) => p.toLowerCase().startsWith("q="));
    const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
    if (!Number.isFinite(q) || q < 0 || q > 1) continue;
    entries.push({ type: media.toLowerCase(), q });
  }
  return entries;
}

/**
 * True when `text/markdown` is the client's preferred type — its q-value is
 * above zero and at least as high as every other offered type. This resolves
 * `text/markdown;q=0.9, text/html` to HTML, as intended.
 */
export function prefersMarkdown(accept: string): boolean {
  const entries = parseAccept(accept);
  const markdownQ = entries
    .filter(({ type }) => type === MARKDOWN_MEDIA_TYPE)
    .reduce((max, { q }) => Math.max(max, q), 0);
  const otherQ = entries
    .filter(({ type }) => type !== MARKDOWN_MEDIA_TYPE)
    .reduce((max, { q }) => Math.max(max, q), 0);
  return markdownQ > 0 && markdownQ >= otherQ;
}
