import { Logger } from "@workspace/logger";
import { sanityFetch } from "@workspace/sanity/live";
import {
  queryAllBlogDataForSearch,
  queryBlogIndexPageData,
  queryBlogSlugPageData,
  queryCollectionsIndexPageData,
  queryHomePageData,
  queryRedirectBySource,
  querySlugPageData,
} from "@workspace/sanity/query";

import {
  categoryTreeToCollectionList,
  getCategoryByPath,
  getCategoryTree,
  getProductByPath,
} from "@/lib/bigcommerce/catalog";
import {
  categoryToMarkdown,
  productToMarkdown,
} from "@/lib/bigcommerce/markdown";
import {
  type BlogListItem,
  blogIndexToMarkdown,
  blogPostToMarkdown,
  collectionsIndexToMarkdown,
  pageToMarkdown,
} from "@/lib/markdown/documents";
import { normalizeMarkdownPath } from "@/lib/markdown/path";

const logger = new Logger("MarkdownRoute");

/** Published, non-stega reads — this surface is for agents, never draft preview. */
const PUBLISHED = { perspective: "published", stega: false } as const;

/** How many products a category's Markdown lists. */
const CATEGORY_PRODUCTS = 50;

async function fetchProductMarkdown(handle: string): Promise<string | null> {
  const result = await getProductByPath([handle]);
  if (!result.ok || !result.data.node) return null;
  return productToMarkdown(result.data.node);
}

async function fetchCollectionMarkdown(
  segments: string[]
): Promise<string | null> {
  const result = await getCategoryByPath(segments, {
    first: CATEGORY_PRODUCTS,
  });
  if (!result.ok || !result.data.node) return null;
  return categoryToMarkdown(result.data.node);
}

/**
 * The heading is editorial and stays in Sanity; the categories come from the
 * live tree, which is the same read `app/collections/page.tsx` renders the HTML
 * index from. One read, so the two cannot disagree — and they did: the synced
 * Sanity document flattens a nested category's path into its slug, so listing
 * from it linked Henleys at `/collections/tops-henleys`, one segment that
 * `/collections/[...slug]` cannot resolve. The tree carries the real path.
 *
 * It also drops a hidden category for free, where the Sanity mirror needed an
 * explicit `isVisible` clause to do it: BigCommerce leaves one out of the tree.
 *
 * A failed tree read throws rather than degrading to an empty list. The caller
 * turns that into a 503, which is uncached and self-correcting; an empty index
 * is a 200 this route tells the CDN to hold for a minute and reuse for five,
 * and it is indistinguishable from a store with no categories, so the agent
 * reading it has no way to know it should come back. Same verdict the
 * collections page reached when a failed `searchCatalog` was degrading to an
 * empty product grid under `revalidate = 300`.
 */
async function fetchCollectionsIndexMarkdown(): Promise<string> {
  const [indexRes, treeResult] = await Promise.all([
    sanityFetch({ query: queryCollectionsIndexPageData, ...PUBLISHED }),
    getCategoryTree(),
  ]);
  if (!treeResult.ok) {
    throw new Error(`category tree read failed: ${treeResult.error}`);
  }
  const index = indexRes.data ?? { title: "Collections" };
  return collectionsIndexToMarkdown(
    index,
    categoryTreeToCollectionList(treeResult.data)
  );
}

async function fetchBlogIndexMarkdown(): Promise<string | null> {
  const [indexRes, postsRes] = await Promise.all([
    sanityFetch({ query: queryBlogIndexPageData, ...PUBLISHED }),
    sanityFetch({ query: queryAllBlogDataForSearch, ...PUBLISHED }),
  ]);
  if (!indexRes.data) return null;
  return blogIndexToMarkdown(
    indexRes.data,
    (postsRes.data ?? []) as BlogListItem[]
  );
}

async function fetchHomeMarkdown(): Promise<string | null> {
  const { data } = await sanityFetch({
    query: queryHomePageData,
    ...PUBLISHED,
  });
  return data ? pageToMarkdown(data) : null;
}

async function fetchBlogMarkdown(
  segments: string[],
  path: string
): Promise<string | null> {
  if (segments.length === 1) return fetchBlogIndexMarkdown();
  const { data } = await sanityFetch({
    query: queryBlogSlugPageData,
    params: { slug: path },
    ...PUBLISHED,
  });
  return data ? blogPostToMarkdown(data) : null;
}

async function fetchCollectionsMarkdown(
  segments: string[]
): Promise<string | null> {
  if (segments.length === 1) return fetchCollectionsIndexMarkdown();
  // BigCommerce category paths are multi-segment; pass everything after the
  // `/collections` prefix through as one lookup.
  return fetchCollectionMarkdown(segments.slice(1));
}

async function fetchPageMarkdown(path: string): Promise<string | null> {
  const { data } = await sanityFetch({
    query: querySlugPageData,
    params: { slug: path },
    ...PUBLISHED,
  });
  return data ? pageToMarkdown(data) : null;
}

/** Resolves a normalized path to a Markdown document, or null when not found. */
async function buildMarkdown(path: string): Promise<string | null> {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return fetchHomeMarkdown();

  switch (segments[0]) {
    case "blog":
      return fetchBlogMarkdown(segments, path);
    case "products":
      return segments.length === 2
        ? fetchProductMarkdown(segments[1] as string)
        : null;
    case "collections":
      return fetchCollectionsMarkdown(segments);
    default:
      return fetchPageMarkdown(path);
  }
}

async function findRedirect(path: string) {
  const { data } = await sanityFetch({
    query: queryRedirectBySource,
    params: { source: path },
    ...PUBLISHED,
  });
  return data
    ? { destination: data.destination, permanent: data.permanent }
    : null;
}

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  vary: "Accept",
  "x-content-type-options": "nosniff",
} as const;

export async function GET(request: Request): Promise<Response> {
  const headerPath = request.headers.get("x-markdown-path");
  const queryPath = new URL(request.url).searchParams.get("path");
  const path = normalizeMarkdownPath(headerPath ?? queryPath ?? "/");

  let markdown: string | null;
  try {
    markdown = await buildMarkdown(path);
  } catch (error) {
    logger.error("Markdown build failed", error);
    return new Response("Upstream content fetch failed\n", {
      status: 503,
      headers: TEXT_HEADERS,
    });
  }

  if (markdown) {
    return new Response(`${markdown}\n`, {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        vary: "Accept",
        "content-location": path,
        "x-robots-tag": "noindex, nofollow",
        "x-content-type-options": "nosniff",
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  }

  // No content — honour a Sanity-managed redirect, re-pointed at the `.md` twin.
  try {
    const redirect = await findRedirect(path);
    if (redirect?.destination) {
      const requestUrl = new URL(request.url);
      const target = new URL(redirect.destination, requestUrl);
      if (target.origin === requestUrl.origin) {
        const normalized = normalizeMarkdownPath(target.pathname);
        target.pathname = normalized === "/" ? "/index.md" : `${normalized}.md`;
        return new Response(null, {
          status: redirect.permanent ? 308 : 307,
          headers: { location: target.toString(), ...TEXT_HEADERS },
        });
      }
    }
  } catch (error) {
    logger.error("Redirect lookup failed", error);
    return new Response("Upstream content fetch failed\n", {
      status: 503,
      headers: TEXT_HEADERS,
    });
  }

  return new Response(`Not found: ${path}\n`, {
    status: 404,
    headers: TEXT_HEADERS,
  });
}
