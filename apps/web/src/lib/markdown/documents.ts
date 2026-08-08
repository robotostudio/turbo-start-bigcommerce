/**
 * Document-level Markdown orchestrators — one per content shape. Each turns the
 * data a page already fetches into a clean Markdown document, reusing the
 * page-builder and portable-text serializers so there is no representation drift
 * between the HTML page and its `.md` twin.
 *
 * Product and category documents are commerce-shaped and live in
 * `lib/bigcommerce/markdown.ts`; this module holds the Sanity-shaped ones.
 */

import { pageBuilderToMarkdown } from "./page-builder";
import { portableTextToMarkdownString } from "./portable-text";
import {
  escapeMarkdown,
  heading,
  joinSections,
  sanityImageMarkdown,
  type SanityImageRef,
  toMarkdownHref,
} from "./shared";

type PageLikeDoc = {
  title?: string | null;
  description?: string | null;
  pageBuilder?: unknown[] | null;
};

type BlogDoc = {
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  image?: SanityImageRef | null;
  richText?: unknown[] | null;
  authors?: { name?: string | null } | null;
};

export type BlogListItem = {
  title?: string | null;
  description?: string | null;
  slug?: string | null;
};

/** `# title` followed by the description paragraph. */
function documentHeader(
  title: string | null | undefined,
  description: string | null | undefined
): string {
  return joinSections([
    title ? heading(1, title) : null,
    description ? escapeMarkdown(description) : null,
  ]);
}

export function pageToMarkdown(doc: PageLikeDoc): string {
  return joinSections([
    documentHeader(doc.title, doc.description),
    pageBuilderToMarkdown(doc.pageBuilder),
  ]);
}

export function blogPostToMarkdown(doc: BlogDoc): string {
  const meta: string[] = [];
  if (doc.authors?.name) meta.push(`By ${doc.authors.name}`);
  if (doc.publishedAt) meta.push(doc.publishedAt.slice(0, 10));
  return joinSections([
    documentHeader(doc.title, doc.description),
    meta.length ? `_${meta.join(" · ")}_` : null,
    sanityImageMarkdown(doc.image),
    portableTextToMarkdownString(doc.richText),
  ]);
}

export function blogIndexToMarkdown(
  index: PageLikeDoc,
  posts: BlogListItem[]
): string {
  const bullets = posts
    .map((post) => {
      const title = post.title?.trim();
      if (!title || !post.slug) return null;
      const href = toMarkdownHref(post.slug);
      const suffix = post.description?.trim()
        ? ` — ${escapeMarkdown(post.description.trim())}`
        : "";
      return `- [${escapeMarkdown(title)}](${href})${suffix}`;
    })
    .filter((line): line is string => Boolean(line));
  return joinSections([
    documentHeader(index.title, index.description),
    bullets.length ? heading(2, "Latest posts") : null,
    bullets.length ? bullets.join("\n") : null,
  ]);
}

export type CollectionListItem = {
  title?: string | null;
  slug?: string | null;
  description?: string | null;
};

export function collectionsIndexToMarkdown(
  index: PageLikeDoc & { subtitle?: string | null },
  collections: CollectionListItem[]
): string {
  const bullets = collections
    .map((collection) => {
      const title = collection.title?.trim();
      if (!title || !collection.slug) return null;
      const href = toMarkdownHref(`/collections/${collection.slug}`);
      return `- [${escapeMarkdown(title)}](${href})`;
    })
    .filter((line): line is string => Boolean(line));
  return joinSections([
    documentHeader(index.title, index.description ?? index.subtitle),
    bullets.length ? heading(2, "Collections") : null,
    bullets.length ? bullets.join("\n") : null,
  ]);
}
