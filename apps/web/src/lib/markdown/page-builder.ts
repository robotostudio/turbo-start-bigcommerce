/**
 * Page-builder blocks → Markdown. `BLOCK_MARKDOWN` mirrors `BLOCK_COMPONENTS`
 * in `apps/web/src/components/pagebuilder.tsx` and must list every block type:
 * typecheck fails on a missing one, so a new block cannot silently drop out of
 * the agent-facing output. A purely visual block maps to `() => ""`.
 */

import type { PageBuilderBlockTypes } from "@/types";
import {
  absolutizeUrl,
  escapeMarkdown,
  formatMultiline,
  heading,
  joinSections,
} from "./shared";
import { portableTextToMarkdownString } from "./portable-text";

type Block = Record<string, unknown>;

function text(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

type Linkish = { text?: string; title?: string; href?: string };

/** Renders a list of buttons/links as `- [label](url)` bullets. */
function linksToMarkdown(links: unknown, label = ""): string {
  if (!Array.isArray(links)) return "";
  const bullets = links
    .map((raw) => {
      const link = raw as Linkish;
      const url = link?.href ? absolutizeUrl(link.href) : null;
      const linkLabel = text(link?.text) ?? text(link?.title);
      if (!url || !linkLabel) return null;
      return `- [${escapeMarkdown(linkLabel)}](${url})`;
    })
    .filter((line): line is string => Boolean(line));
  if (bullets.length === 0) return "";
  return label
    ? joinSections([`**${label}**`, bullets.join("\n")])
    : bullets.join("\n");
}

function eyebrowLine(value: unknown): string | null {
  const eyebrow = text(value);
  return eyebrow ? `_${escapeMarkdown(eyebrow)}_` : null;
}

function heroToMarkdown(block: Block): string {
  return joinSections([
    eyebrowLine(block.badge),
    text(block.title) && heading(2, text(block.title) as string),
    portableTextToMarkdownString(block.richText as unknown[]),
    linksToMarkdown(block.buttons),
  ]);
}

function ctaToMarkdown(block: Block): string {
  return joinSections([
    eyebrowLine(block.eyebrow),
    text(block.title) && heading(2, text(block.title) as string),
    portableTextToMarkdownString(block.richText as unknown[]),
    linksToMarkdown(block.buttons),
  ]);
}

function imageLinkCardsToMarkdown(block: Block): string {
  return joinSections([
    eyebrowLine(block.eyebrow),
    text(block.title) && heading(2, text(block.title) as string),
    portableTextToMarkdownString(block.richText as unknown[]),
    linksToMarkdown(block.cards),
  ]);
}

function featureCardsToMarkdown(block: Block): string {
  const cards = Array.isArray(block.cards) ? block.cards : [];
  const cardSections = cards.map((raw) => {
    const card = raw as Block;
    return joinSections([
      text(card.title) && heading(3, text(card.title) as string),
      portableTextToMarkdownString(card.richText as unknown[]),
    ]);
  });
  return joinSections([
    eyebrowLine(block.eyebrow),
    text(block.title) && heading(2, text(block.title) as string),
    portableTextToMarkdownString(block.richText as unknown[]),
    ...cardSections,
  ]);
}

function faqsToMarkdown(faqs: unknown, level: number): string[] {
  return (Array.isArray(faqs) ? faqs : []).map((raw) => {
    const faq = raw as Block;
    return joinSections([
      text(faq.title) && heading(level, text(faq.title) as string),
      portableTextToMarkdownString(faq.richText as unknown[]),
    ]);
  });
}

function faqAccordionToMarkdown(block: Block): string {
  const faqSections = faqsToMarkdown(block.faqs, 3);
  const link = block.link as Linkish | undefined;
  const linkLine =
    link?.href && absolutizeUrl(link.href) && text(link.title ?? link.text)
      ? `- [${escapeMarkdown(text(link.title ?? link.text) as string)}](${absolutizeUrl(link.href)})`
      : null;
  return joinSections([
    text(block.title) && heading(2, text(block.title) as string),
    ...faqSections,
    linkLine,
  ]);
}

function subscribeNewsletterToMarkdown(block: Block): string {
  return joinSections([
    text(block.title) && heading(2, text(block.title) as string),
    portableTextToMarkdownString(block.subTitle as unknown[]),
    portableTextToMarkdownString(block.helperText as unknown[]),
  ]);
}

function editorialTwoUpToMarkdown(block: Block): string {
  const items = Array.isArray(block.items) ? block.items : [];
  const bullets = items
    .map((raw) => {
      const item = raw as { collectionTitle?: string; collectionHref?: string };
      const title = text(item.collectionTitle);
      if (!title) return null;
      const href = item.collectionHref
        ? absolutizeUrl(item.collectionHref)
        : null;
      return href
        ? `- [${escapeMarkdown(title)}](${href})`
        : `- ${escapeMarkdown(title)}`;
    })
    .filter((line): line is string => Boolean(line));
  return bullets.join("\n");
}

function collectionBannerToMarkdown(block: Block): string {
  return joinSections([
    eyebrowLine(block.eyebrow),
    text(block.title) && heading(2, text(block.title) as string),
    text(block.description) &&
      formatMultiline(text(block.description) as string),
    linksToMarkdown(block.buttons),
  ]);
}

function exploreCategoriesToMarkdown(block: Block): string {
  const collections = Array.isArray(block.collections) ? block.collections : [];
  return joinSections([
    text(block.title) && heading(2, text(block.title) as string),
    linksToMarkdown(
      collections.map((raw) => {
        const collection = raw as { title?: string; slug?: string };
        return {
          title: collection?.title,
          href: collection?.slug
            ? `/collections/${collection.slug}`
            : undefined,
        };
      })
    ),
    linksToMarkdown(block.buttons),
  ]);
}

function faqCategoriesToMarkdown(block: Block): string {
  const categories = Array.isArray(block.categories) ? block.categories : [];
  return joinSections([
    text(block.title) && heading(2, text(block.title) as string),
    ...categories.map((raw) => {
      const category = raw as Block;
      return joinSections([
        text(category.title) && heading(3, text(category.title) as string),
        ...faqsToMarkdown(category.faqs, 4),
      ]);
    }),
  ]);
}

function layersShowcaseToMarkdown(block: Block): string {
  const title = text(block.heading)?.replace(/\s+/g, " ");
  return joinSections([
    title && heading(2, title),
    text(block.description) &&
      formatMultiline(text(block.description) as string),
    linksToMarkdown([
      {
        title: text(block.productTitle) ?? undefined,
        href: block.productHandle
          ? `/products/${block.productHandle}`
          : undefined,
      },
    ]),
  ]);
}

// ponytail: the query projects handles only, so the link label is the handle.
// Project `store.title` in featuredProductsBlock if agents need real names.
function featuredProductsToMarkdown(block: Block): string {
  const handles = Array.isArray(block.productHandles)
    ? block.productHandles
    : [];
  return joinSections([
    text(block.heading) && heading(2, text(block.heading) as string),
    linksToMarkdown(
      handles.map((handle) => ({ title: handle, href: `/products/${handle}` }))
    ),
  ]);
}

const BLOCK_MARKDOWN: Record<PageBuilderBlockTypes, (block: Block) => string> =
  {
    collectionBanner: collectionBannerToMarkdown,
    cta: ctaToMarkdown,
    editorialTwoUp: editorialTwoUpToMarkdown,
    exploreCategories: exploreCategoriesToMarkdown,
    faqAccordion: faqAccordionToMarkdown,
    faqCategories: faqCategoriesToMarkdown,
    featureCardsIcon: featureCardsToMarkdown,
    featuredProducts: featuredProductsToMarkdown,
    hero: heroToMarkdown,
    imageLinkCards: imageLinkCardsToMarkdown,
    layersShowcase: layersShowcaseToMarkdown,
    subscribeNewsletter: subscribeNewsletterToMarkdown,
  };

// A block type the schema has since dropped can still sit in the data.
function blockToMarkdown(block: Block): string {
  const type = block._type as string;
  return Object.hasOwn(BLOCK_MARKDOWN, type)
    ? BLOCK_MARKDOWN[type as PageBuilderBlockTypes](block)
    : "";
}

export function pageBuilderToMarkdown(
  blocks: readonly unknown[] | null | undefined
): string {
  if (!Array.isArray(blocks)) return "";
  return joinSections(blocks.map((block) => blockToMarkdown(block as Block)));
}
