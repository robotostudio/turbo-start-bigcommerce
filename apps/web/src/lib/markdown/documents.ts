/**
 * Document-level Markdown orchestrators — one per content shape. Each turns the
 * data a page already fetches into a clean Markdown document, reusing the
 * page-builder and portable-text serializers so there is no representation drift
 * between the HTML page and its `.md` twin.
 */

import { env } from "@workspace/env/client";

import {
  keyMetafields,
  PRODUCT_METAFIELD_KEYS,
  type ProductMetafieldKey,
} from "@/lib/shopify/metafields";
import type {
  ShopifyCollection,
  ShopifyProduct,
  ShopifyVariant,
} from "@/lib/shopify/types";
import { pageBuilderToMarkdown } from "./page-builder";
import { portableTextToMarkdownString } from "./portable-text";
import {
  escapeMarkdown,
  formatMoney,
  formatMultiline,
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

type SanityProductDoc = {
  title?: string | null;
  body?: unknown[] | null;
} | null;
type SanityCollectionDoc = { title?: string | null } | null;

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

const METAFIELD_LABELS: Record<ProductMetafieldKey, string> = {
  details: "Details",
  fit_sizing: "Fit & Sizing",
  materials: "Materials",
  shipping: "Shipping & Returns",
};

const DEFAULT_OPTION_NAME = "Title";
const DEFAULT_OPTION_VALUE = "Default Title";

/** Options that carry real, buyer-facing choices (not Shopify's synthetic default). */
function realOptions(product: ShopifyProduct) {
  return product.options.filter(
    (option) =>
      !(
        option.name === DEFAULT_OPTION_NAME &&
        option.values.length === 1 &&
        option.values[0] === DEFAULT_OPTION_VALUE
      )
  );
}

function productInfoSection(product: ShopifyProduct): string {
  const available = product.variants.edges.some(
    (edge) => edge.node.availableForSale
  );
  const bullets = [
    `- **Handle**: ${product.handle}`,
    product.vendor ? `- **Brand**: ${escapeMarkdown(product.vendor)}` : null,
    product.productType
      ? `- **Category**: ${escapeMarkdown(product.productType)}`
      : null,
    `- **Available**: ${available ? "Yes" : "No"}`,
  ].filter((line): line is string => Boolean(line));
  return joinSections([heading(2, "Product Information"), bullets.join("\n")]);
}

function pricingSection(variants: ShopifyVariant[]): string | null {
  const priced = variants
    .map((variant) => ({
      variant,
      amount: Number.parseFloat(variant.price.amount),
    }))
    .filter((entry) => Number.isFinite(entry.amount));
  if (priced.length === 0) return null;

  const min = priced.reduce((a, b) => (a.amount <= b.amount ? a : b));
  const max = priced.reduce((a, b) => (a.amount >= b.amount ? a : b));
  const price =
    min.amount === max.amount
      ? formatMoney(min.variant.price)
      : `${formatMoney(min.variant.price)} – ${formatMoney(max.variant.price)}`;

  const bullets = [`- **Price**: ${price}`];
  if (min.variant.compareAtPrice) {
    bullets.push(
      `- **Compare At**: ${formatMoney(min.variant.compareAtPrice)}`
    );
  }

  return joinSections([heading(2, "Pricing"), bullets.join("\n")]);
}

function optionsSection(product: ShopifyProduct): string | null {
  const options = realOptions(product);
  if (options.length === 0) return null;
  const bullets = options.map(
    (option) =>
      `- **${escapeMarkdown(option.name)}**: ${option.values
        .map((value) => escapeMarkdown(value))
        .join(", ")}`
  );
  return joinSections([heading(2, "Options"), bullets.join("\n")]);
}

function variantsSection(
  product: ShopifyProduct,
  variants: ShopifyVariant[]
): string | null {
  if (variants.length === 0) return null;
  const columns = realOptions(product);
  const headers = [
    "Variant",
    ...columns.map((column) => escapeMarkdown(column.name)),
    "Price",
    "Available",
  ];
  const rows = variants.map((variant) => {
    const optionCells = columns.map((column) => {
      const selected = variant.selectedOptions.find(
        (option) => option.name === column.name
      );
      return escapeMarkdown(selected?.value ?? "—");
    });
    return `| ${[
      escapeMarkdown(variant.title || "Default"),
      ...optionCells,
      formatMoney(variant.price),
      variant.availableForSale ? "Yes" : "No",
    ].join(" | ")} |`;
  });
  return joinSections([
    heading(2, "Variants"),
    [
      `| ${headers.join(" | ")} |`,
      `|${"---|".repeat(headers.length)}`,
      ...rows,
    ].join("\n"),
  ]);
}

/**
 * Our store's `custom.*` metafields — extends the Vercel format with richer
 * detail. Each metafield becomes its own H2 section, with author line breaks
 * preserved.
 */
function metafieldSections(product: ShopifyProduct): string | null {
  const metafields = keyMetafields(product.metafields);
  const sections = PRODUCT_METAFIELD_KEYS.map((key) => {
    const value = metafields[key];
    return value
      ? joinSections([
          heading(2, METAFIELD_LABELS[key]),
          formatMultiline(value),
        ])
      : null;
  }).filter((section): section is string => Boolean(section));
  if (sections.length === 0) return null;
  return joinSections(sections);
}

function imagesSection(product: ShopifyProduct): string | null {
  const urls = product.images.edges.map((edge) => edge.node.url);
  if (urls.length === 0) return null;
  return joinSections([
    heading(2, "Images"),
    urls.map((url) => `- ${url}`).join("\n"),
  ]);
}

function seoSection(product: ShopifyProduct): string | null {
  const title = product.seo.title?.trim();
  const description = product.seo.description?.trim();
  if (!title && !description) return null;
  const bullets = [
    title ? `- **Title**: ${escapeMarkdown(title)}` : null,
    description ? `- **Description**: ${escapeMarkdown(description)}` : null,
  ].filter((line): line is string => Boolean(line));
  return joinSections([heading(2, "SEO"), bullets.join("\n")]);
}

/** Best-effort locale for a currency, so the footer stays internally consistent. */
const CURRENCY_LOCALE: Record<string, string> = {
  GBP: "en-GB",
  USD: "en-US",
  EUR: "en-IE",
  CAD: "en-CA",
  AUD: "en-AU",
  NZD: "en-NZ",
  JPY: "ja-JP",
};

export function productToMarkdown(
  shopify: ShopifyProduct,
  sanity: SanityProductDoc
): string {
  const variants = shopify.variants.edges.map((edge) => edge.node);
  const currency =
    variants[0]?.price.currencyCode ?? env.NEXT_PUBLIC_STORE_CURRENCY;
  const locale = CURRENCY_LOCALE[currency] ?? "en";
  const editorial = portableTextToMarkdownString(sanity?.body);

  const footer = joinSections([
    "---",
    [
      `*Last updated: ${shopify.updatedAt}*`,
      `*Locale: ${locale} | Currency: ${currency}*`,
    ].join("\n"),
  ]);

  return joinSections([
    heading(1, shopify.title),
    productInfoSection(shopify),
    pricingSection(variants),
    shopify.description?.trim()
      ? joinSections([
          heading(2, "Description"),
          formatMultiline(shopify.description.trim()),
        ])
      : null,
    optionsSection(shopify),
    variantsSection(shopify, variants),
    metafieldSections(shopify),
    editorial ? joinSections([heading(2, "Editorial"), editorial]) : null,
    imagesSection(shopify),
    seoSection(shopify),
    footer,
  ]);
}

export function collectionToMarkdown(
  shopify: ShopifyCollection,
  _sanity: SanityCollectionDoc
): string {
  const products = shopify.products.edges.map((edge) => edge.node);
  const bullets = products.map((product) => {
    const href = toMarkdownHref(`/products/${product.handle}`);
    const price = formatMoney(product.priceRange.minVariantPrice);
    const suffix = price ? ` — from ${price}` : "";
    return `- [${escapeMarkdown(product.title)}](${href})${suffix}`;
  });
  return joinSections([
    documentHeader(shopify.title, shopify.description),
    bullets.length ? heading(2, "Products") : null,
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
