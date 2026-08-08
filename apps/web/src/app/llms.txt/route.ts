import { Logger } from "@workspace/logger";
import { sanityFetch } from "@workspace/sanity/live";
import { queryBlogPaths, querySlugPagePaths } from "@workspace/sanity/query";

import { getCategoryPaths, getProductPaths } from "@/lib/bigcommerce/catalog";
import type { StorefrontQueryResult } from "@/lib/bigcommerce/client";
import { normalizeMarkdownPath } from "@/lib/markdown/path";
import { toMarkdownHref } from "@/lib/markdown/shared";
import { getBaseUrl } from "@/utils";

const logger = new Logger("LlmsTxt");

const PUBLISHED = { perspective: "published", stega: false } as const;

const SITE_TITLE = "Roboto Studio Demo";
const SITE_DESCRIPTION =
  "Headless commerce storefront. Append .md to any URL, or send Accept: text/markdown, to get a structured Markdown view of a page.";

/** Absolute `.md` URL for an internal path. */
function mdUrl(base: string, path: string): string {
  return `${base}${toMarkdownHref(normalizeMarkdownPath(path))}`;
}

function section(title: string, links: string[]): string | null {
  if (links.length === 0) return null;
  return `## ${title}\n${links.map((line) => `- ${line}`).join("\n")}`;
}

export async function GET(): Promise<Response> {
  const base = getBaseUrl();

  // Editorial paths come from Sanity; catalog paths come from BigCommerce —
  // the same enumeration `generateStaticParams` and the sitemap use.
  const [pages, blogs, products, collections] = await Promise.allSettled([
    sanityFetch({ query: querySlugPagePaths, ...PUBLISHED }),
    sanityFetch({ query: queryBlogPaths, ...PUBLISHED }),
    getProductPaths(),
    getCategoryPaths(),
  ]);

  const sanityValue = <T>(
    result: PromiseSettledResult<{ data: T }>,
    label: string
  ): T | null => {
    if (result.status === "fulfilled") return result.value.data;
    logger.error(`Failed to load ${label} for llms.txt`, result.reason);
    return null;
  };

  const catalogValue = (
    result: PromiseSettledResult<StorefrontQueryResult<string[]>>,
    label: string
  ): string[] => {
    if (result.status !== "fulfilled") {
      logger.error(`Failed to load ${label} for llms.txt`, result.reason);
      return [];
    }
    if (!result.value.ok) {
      logger.error(`Failed to load ${label} for llms.txt`, result.value.error);
      return [];
    }
    return result.value.data;
  };

  const pagePaths = (sanityValue(pages, "pages") ?? []).filter(
    (slug): slug is string => Boolean(slug)
  );
  const blogPaths = (sanityValue(blogs, "blogs") ?? []).filter(
    (slug): slug is string => Boolean(slug)
  );
  const productPaths = catalogValue(products, "products");
  const categoryPaths = catalogValue(collections, "collections");

  const body = [
    `# ${SITE_TITLE}`,
    `> ${SITE_DESCRIPTION}`,
    section("Pages", [
      mdUrl(base, "/"),
      ...pagePaths.map((path) => mdUrl(base, path)),
    ]),
    section(
      "Collections",
      categoryPaths.map((path) => mdUrl(base, path))
    ),
    section(
      "Products",
      productPaths.map((path) => mdUrl(base, path))
    ),
    section("Blog", [
      mdUrl(base, "/blog"),
      ...blogPaths.map((path) => mdUrl(base, path)),
    ]),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  return new Response(`${body}\n`, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
