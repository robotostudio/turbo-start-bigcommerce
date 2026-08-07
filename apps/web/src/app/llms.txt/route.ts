import { Logger } from "@workspace/logger";
import { sanityFetch } from "@workspace/sanity/live";
import {
  queryBlogPaths,
  queryCollectionPaths,
  queryProductPaths,
  querySlugPagePaths,
} from "@workspace/sanity/query";

import { toMarkdownHref } from "@/lib/markdown/shared";
import { getBaseUrl } from "@/utils";

const logger = new Logger("LlmsTxt");

const PUBLISHED = { perspective: "published", stega: false } as const;

const SITE_TITLE = "Roboto Studio Demo";
const SITE_DESCRIPTION =
  "Headless commerce storefront. Append .md to any URL, or send Accept: text/markdown, to get a structured Markdown view of a page.";

/** Absolute `.md` URL for an internal path. */
function mdUrl(base: string, path: string): string {
  return `${base}${toMarkdownHref(path)}`;
}

function section(title: string, links: string[]): string | null {
  if (links.length === 0) return null;
  return `## ${title}\n${links.map((line) => `- ${line}`).join("\n")}`;
}

export async function GET(): Promise<Response> {
  const base = getBaseUrl();

  const [pages, blogs, products, collections] = await Promise.allSettled([
    sanityFetch({ query: querySlugPagePaths, ...PUBLISHED }),
    sanityFetch({ query: queryBlogPaths, ...PUBLISHED }),
    sanityFetch({ query: queryProductPaths, ...PUBLISHED }),
    sanityFetch({ query: queryCollectionPaths, ...PUBLISHED }),
  ]);

  const value = <T>(
    result: PromiseSettledResult<{ data: T }>,
    label: string
  ): T | null => {
    if (result.status === "fulfilled") return result.value.data;
    logger.error(`Failed to load ${label} for llms.txt`, result.reason);
    return null;
  };

  const pagePaths = (value(pages, "pages") ?? []).filter(
    (slug): slug is string => Boolean(slug)
  );
  const blogPaths = (value(blogs, "blogs") ?? []).filter(
    (slug): slug is string => Boolean(slug)
  );
  const productHandles = (value(products, "products") ?? []).filter(
    (handle): handle is string => Boolean(handle)
  );
  const collectionHandles = (value(collections, "collections") ?? []).filter(
    (handle): handle is string => Boolean(handle)
  );

  const body = [
    `# ${SITE_TITLE}`,
    `> ${SITE_DESCRIPTION}`,
    section("Pages", [
      mdUrl(base, "/"),
      ...pagePaths.map((path) => mdUrl(base, path)),
    ]),
    section(
      "Collections",
      collectionHandles.map((handle) => mdUrl(base, `/collections/${handle}`))
    ),
    section(
      "Products",
      productHandles.map((handle) => mdUrl(base, `/products/${handle}`))
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
