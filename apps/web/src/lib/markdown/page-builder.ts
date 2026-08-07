/**
 * Page-builder blocks → Markdown. The dispatcher mirrors `BLOCK_COMPONENTS` in
 * `apps/web/src/components/pagebuilder.tsx`: text-bearing blocks are serialized,
 * and every other block type falls through to an empty string so purely visual
 * sections never leak markup into the agent-facing output.
 */

import { absolutizeUrl, escapeMarkdown, heading, joinSections } from "./shared";
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

function faqAccordionToMarkdown(block: Block): string {
  const faqs = Array.isArray(block.faqs) ? block.faqs : [];
  const faqSections = faqs.map((raw) => {
    const faq = raw as Block;
    return joinSections([
      text(faq.title) && heading(3, text(faq.title) as string),
      portableTextToMarkdownString(faq.richText as unknown[]),
    ]);
  });
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

function blockToMarkdown(block: Block): string {
  switch (block._type) {
    case "hero":
      return heroToMarkdown(block);
    case "cta":
      return ctaToMarkdown(block);
    case "imageLinkCards":
      return imageLinkCardsToMarkdown(block);
    case "featureCardsIcon":
      return featureCardsToMarkdown(block);
    case "faqAccordion":
      return faqAccordionToMarkdown(block);
    case "subscribeNewsletter":
      return subscribeNewsletterToMarkdown(block);
    case "editorialTwoUp":
      return editorialTwoUpToMarkdown(block);
    // collectionBanner, exploreCategories, faqCategories, layersShowcase —
    // primarily visual; intentionally omitted from the Markdown surface.
    default:
      return "";
  }
}

export function pageBuilderToMarkdown(
  blocks: readonly unknown[] | null | undefined
): string {
  if (!Array.isArray(blocks)) return "";
  return joinSections(blocks.map((block) => blockToMarkdown(block as Block)));
}
