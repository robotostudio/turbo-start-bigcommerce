import { Logger } from "@workspace/logger";
import { PUBLISHED, sanityFetch } from "@workspace/sanity/live";
import {
  queryAllBlogDataForSearch,
  querySettingsData,
  querySlugPagePaths,
} from "@workspace/sanity/query";

import {
  ALL_PRODUCTS,
  getCategoryPaths,
  getProductPaths,
} from "@/lib/bigcommerce/catalog";
import type { StorefrontQueryResult } from "@/lib/bigcommerce/client";
import { normalizeMarkdownPath } from "@/lib/markdown/path";
import { toMarkdownHref } from "@/lib/markdown/shared";
import { getBaseUrl } from "@/utils";

const logger = new Logger("LlmsTxt");

/** The no-CMS state, matching `lib/seo.ts` — the real identity is in Sanity. */
const FALLBACK_SITE_TITLE = "Turbo Start BigCommerce";
const SITE_DESCRIPTION =
  "Headless commerce storefront. Append .md to any URL, or send Accept: text/markdown, to get a structured Markdown view of a page.";

/**
 * Paired with the route's `revalidate` below, which is what stops the origin
 * re-running five upstream reads per miss — 446 ms a request before it existed.
 */
const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

/** Absolute `.md` URL for an internal path. */
function mdUrl(base: string, path: string): string {
  return `${base}${toMarkdownHref(normalizeMarkdownPath(path))}`;
}

/**
 * A label for entries with no title of their own: `/collections/mens-outerwear`
 * becomes "Mens Outerwear". A wall of bare URLs tells a reading agent nothing.
 */
function slugToTitle(slug: string): string {
  return (
    slug
      .replace(/^\//, "")
      .split("/")
      .filter(Boolean)
      .map((segment) =>
        segment
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")
      )
      .join(" / ") || "Home"
  );
}

type LlmsLink = { title: string; path: string };

function section(
  base: string,
  title: string,
  links: LlmsLink[]
): string | null {
  if (links.length === 0) return null;
  const lines = links.map(
    (link) => `- [${link.title}](${mdUrl(base, link.path)})`
  );
  return `## ${title}\n${lines.join("\n")}`;
}

/**
 * `strip` drops the routing segment the section heading already carries, so a
 * category reads "Tops / Henleys" under `## Collections`, not
 * "Collections / Tops / Henleys".
 */
function toLinks(paths: string[], strip?: string): LlmsLink[] {
  return paths.map((path) => ({
    title: slugToTitle(strip ? path.replace(`/${strip}/`, "/") : path),
    path,
  }));
}

/** Refreshed hourly rather than per request; nothing here changes faster. */
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const base = getBaseUrl();

  // Editorial paths come from Sanity; catalog paths come from BigCommerce —
  // the same enumeration `generateStaticParams` and the sitemap use.
  const [settings, pages, blogs, products, collections] =
    await Promise.allSettled([
      sanityFetch({ query: querySettingsData, ...PUBLISHED }),
      sanityFetch({ query: querySlugPagePaths, ...PUBLISHED }),
      sanityFetch({ query: queryAllBlogDataForSearch, ...PUBLISHED }),
      getProductPaths(ALL_PRODUCTS),
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
  // `queryAllBlogDataForSearch` carries real titles and honours
  // `seoHideFromLists`, which the bare path query did not.
  // Filtered here, not in the query: the same query backs on-site blog search,
  // where a noindex post must still be findable. An agent is a search engine.
  const blogPosts = (sanityValue(blogs, "blogs") ?? []).filter(
    (post) => post?.slug && post.seoNoIndex !== true
  );
  const productPaths = catalogValue(products, "products");
  const categoryPaths = catalogValue(collections, "collections");
  const siteTitle =
    sanityValue(settings, "settings")?.siteTitle || FALLBACK_SITE_TITLE;

  const body = [
    `# ${siteTitle}`,
    `> ${SITE_DESCRIPTION}`,
    section(base, "Pages", [
      { title: "Home", path: "/" },
      ...toLinks(pagePaths),
    ]),
    section(base, "Collections", toLinks(categoryPaths, "collections")),
    section(base, "Products", toLinks(productPaths, "products")),
    section(base, "Blog", [
      { title: "Blog", path: "/blog" },
      ...blogPosts.map((post) => ({
        title: post.title || slugToTitle(post.slug),
        path: post.slug,
      })),
    ]),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  return new Response(`${body}\n`, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": CACHE_CONTROL,
    },
  });
}
