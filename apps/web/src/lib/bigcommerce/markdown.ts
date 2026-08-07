/**
 * BigCommerce → Markdown adapters for the content-negotiation routes.
 *
 * Both take a single argument: the commerce document. There is no Sanity half
 * any more — product and collection documents are gone, and with them the
 * editorial body that was the only thing the second argument carried.
 *
 * Pure, so it stays out of `server-only` and is testable against the captured
 * fixtures. The input types are structural on purpose: any query selecting at
 * least these fields satisfies them.
 */

import sanitizeHtml from "sanitize-html";

import { normalizeMarkdownPath } from "@/lib/markdown/path";
import {
  escapeMarkdown,
  formatMoney,
  formatMultiline,
  heading,
  joinSections,
  toMarkdownHref,
} from "@/lib/markdown/shared";

type Money = { value: number; currencyCode: string };

type Connection<T> = { edges?: readonly { node: T }[] | null } | null;

export type MarkdownProduct = {
  name: string;
  path: string;
  description?: string | null;
  availabilityV2?: { status: string } | null;
  brand?: { name: string } | null;
  categories?: Connection<{ name: string }>;
  prices?: {
    price: Money;
    basePrice?: Money | null;
    priceRange?: { min: Money; max: Money } | null;
  } | null;
  productOptions?: Connection<{
    displayName: string;
    values?: Connection<{ label: string }>;
  }>;
  variants?: Connection<{
    sku?: string | null;
    isPurchasable?: boolean | null;
    prices?: { price: Money } | null;
    options?: Connection<{
      displayName: string;
      values?: Connection<{ label: string }>;
    }>;
  }>;
  metafields?: Connection<{ key: string; value: string }>;
  images?: Connection<{ url: string }>;
  seo?: { pageTitle?: string | null; metaDescription?: string | null } | null;
};

export type MarkdownCategory = {
  name: string;
  description?: string | null;
  products?: Connection<{
    name: string;
    path: string;
    prices?: { price: Money } | null;
  }>;
};

function nodes<T>(connection: Connection<T> | undefined): T[] {
  return (connection?.edges ?? []).map((edge) => edge.node);
}

/** `formatMoney` takes a string amount; BigCommerce sends a number. */
function money(value: Money | null | undefined): string {
  if (!value) return "";
  return formatMoney({
    amount: String(value.value),
    currencyCode: value.currencyCode,
  });
}

/** Block-level tags whose close is a paragraph break once the markup is gone. */
const BLOCK_END = /<\/(?:p|div|li|h[1-6]|tr|blockquote)>|<br\s*\/?>/gi;

/** The entities `sanitize-html` emits when it escapes text, longest-lived last. */
const ENTITIES: [RegExp, string][] = [
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&amp;/g, "&"],
];

/**
 * BigCommerce returns `description` as HTML on both Product and Category, and
 * offers no plain-text twin for Category. Mark the block boundaries, strip the
 * markup with the sanitizer this app already depends on, then undo the escaping
 * it applies to text — `formatMultiline` re-escapes for Markdown afterwards.
 */
function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const stripped = sanitizeHtml(html.replace(BLOCK_END, "\n\n"), {
    allowedTags: [],
    allowedAttributes: {},
  });
  return ENTITIES.reduce(
    (text, [pattern, char]) => text.replace(pattern, char),
    stripped
  ).trim();
}

/** `/products/rye-leather-moto-jacket/` → `rye-leather-moto-jacket`. */
function handleOf(path: string): string {
  return normalizeMarkdownPath(path).split("/").pop() ?? "";
}

function productInfoSection(product: MarkdownProduct): string {
  const categories = nodes(product.categories).map((category) => category.name);
  const bullets = [
    `- **Handle**: ${handleOf(product.path)}`,
    product.brand?.name
      ? `- **Brand**: ${escapeMarkdown(product.brand.name)}`
      : null,
    categories.length > 0
      ? `- **Categories**: ${categories.map((name) => escapeMarkdown(name)).join(", ")}`
      : null,
    // `inventory.aggregated` reads null on this store, so availability is the
    // only field that answers "can a buyer have this".
    `- **Available**: ${product.availabilityV2?.status === "Available" ? "Yes" : "No"}`,
  ].filter((line): line is string => Boolean(line));
  return joinSections([heading(2, "Product Information"), bullets.join("\n")]);
}

function pricingSection(product: MarkdownProduct): string | null {
  const prices = product.prices;
  if (!prices) return null;

  const range = prices.priceRange;
  const price =
    range && range.min.value !== range.max.value
      ? `${money(range.min)} – ${money(range.max)}`
      : money(prices.price);

  const bullets = [`- **Price**: ${price}`];
  // `basePrice` is the was-price; it only differs when a sale price is live.
  if (prices.basePrice && prices.basePrice.value > prices.price.value) {
    bullets.push(`- **Compare At**: ${money(prices.basePrice)}`);
  }

  return joinSections([heading(2, "Pricing"), bullets.join("\n")]);
}

function optionsSection(product: MarkdownProduct): string | null {
  const options = nodes(product.productOptions);
  if (options.length === 0) return null;
  const bullets = options.map(
    (option) =>
      `- **${escapeMarkdown(option.displayName)}**: ${nodes(option.values)
        .map((value) => escapeMarkdown(value.label))
        .join(", ")}`
  );
  return joinSections([heading(2, "Options"), bullets.join("\n")]);
}

function variantsSection(product: MarkdownProduct): string | null {
  const variants = nodes(product.variants);
  if (variants.length === 0) return null;

  // Columns are whatever the variants actually vary by, in first-seen order —
  // no need to guess which product options are variant options.
  const columns: string[] = [];
  for (const variant of variants) {
    for (const option of nodes(variant.options)) {
      if (!columns.includes(option.displayName)) {
        columns.push(option.displayName);
      }
    }
  }

  const headers = [
    "Variant",
    ...columns.map((column) => escapeMarkdown(column)),
    "Price",
    "Available",
  ];
  const rows = variants.map((variant) => {
    const byName = new Map(
      nodes(variant.options).map((option) => [
        option.displayName,
        nodes(option.values)
          .map((value) => value.label)
          .join(" / "),
      ])
    );
    return `| ${[
      escapeMarkdown(variant.sku || "Default"),
      ...columns.map((column) => escapeMarkdown(byName.get(column) || "—")),
      money(variant.prices?.price),
      variant.isPurchasable ? "Yes" : "No",
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

/** `product_type` → `Product Type`. BigCommerce metafield keys are snake_case. */
function metafieldLabel(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * Each metafield becomes its own H2, labelled from its own key. The connection
 * is namespace-scoped by the query, so this renders whatever the namespace
 * holds, in the order it comes back — there is no key list to keep in sync.
 */
function metafieldSections(product: MarkdownProduct): string | null {
  const sections = nodes(product.metafields)
    .filter((metafield) => metafield.value.trim())
    .map((metafield) =>
      joinSections([
        heading(2, metafieldLabel(metafield.key)),
        formatMultiline(metafield.value.trim()),
      ])
    );
  return sections.length > 0 ? joinSections(sections) : null;
}

function imagesSection(product: MarkdownProduct): string | null {
  const urls = nodes(product.images).map((image) => image.url);
  if (urls.length === 0) return null;
  return joinSections([
    heading(2, "Images"),
    urls.map((url) => `- ${url}`).join("\n"),
  ]);
}

function seoSection(product: MarkdownProduct): string | null {
  const title = product.seo?.pageTitle?.trim();
  const description = product.seo?.metaDescription?.trim();
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

export function productToMarkdown(product: MarkdownProduct): string {
  const currency = product.prices?.price.currencyCode ?? "";
  const description = htmlToText(product.description);

  // No `Last updated` line: Product has no `updatedAt`, and `createdAt` is
  // marked alpha / not for production use in the schema.
  const footer = joinSections([
    "---",
    currency
      ? `*Locale: ${CURRENCY_LOCALE[currency] ?? "en"} | Currency: ${currency}*`
      : null,
  ]);

  return joinSections([
    heading(1, product.name),
    productInfoSection(product),
    pricingSection(product),
    description
      ? joinSections([heading(2, "Description"), formatMultiline(description)])
      : null,
    optionsSection(product),
    variantsSection(product),
    metafieldSections(product),
    imagesSection(product),
    seoSection(product),
    footer,
  ]);
}

export function categoryToMarkdown(category: MarkdownCategory): string {
  const description = htmlToText(category.description);
  const bullets = nodes(category.products).map((product) => {
    const href = toMarkdownHref(normalizeMarkdownPath(product.path));
    const price = money(product.prices?.price);
    return `- [${escapeMarkdown(product.name)}](${href})${price ? ` — from ${price}` : ""}`;
  });
  return joinSections([
    heading(1, category.name),
    description ? formatMultiline(description) : null,
    bullets.length > 0 ? heading(2, "Products") : null,
    bullets.length > 0 ? bullets.join("\n") : null,
  ]);
}
