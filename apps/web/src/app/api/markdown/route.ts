import { Logger } from "@workspace/logger";
import { sanityFetch } from "@workspace/sanity/live";
import {
  queryAllBlogDataForSearch,
  queryAllCollections,
  queryBlogIndexPageData,
  queryBlogSlugPageData,
  queryCollectionByHandle,
  queryCollectionsIndexPageData,
  queryHomePageData,
  queryProductByHandle,
  queryRedirectBySource,
  querySlugPageData,
} from "@workspace/sanity/query";

import {
  type BlogListItem,
  blogIndexToMarkdown,
  blogPostToMarkdown,
  type CollectionListItem,
  collectionsIndexToMarkdown,
  collectionToMarkdown,
  pageToMarkdown,
  productToMarkdown,
} from "@/lib/markdown/documents";
import { normalizeMarkdownPath } from "@/lib/markdown/path";
import { storefrontQuery } from "@/lib/shopify/client";
import { COLLECTION_QUERY, PRODUCT_QUERY } from "@/lib/shopify/queries";
import type {
  CollectionQueryResponse,
  ProductQueryResponse,
} from "@/lib/shopify/types";

const logger = new Logger("MarkdownRoute");

/** Published, non-stega reads — this surface is for agents, never draft preview. */
const PUBLISHED = { perspective: "published", stega: false } as const;

async function fetchProductMarkdown(handle: string): Promise<string | null> {
  const [sanityRes, shopifyRes] = await Promise.all([
    sanityFetch({
      query: queryProductByHandle,
      params: { handle },
      ...PUBLISHED,
    }),
    storefrontQuery<ProductQueryResponse>(PRODUCT_QUERY, {
      variables: { handle },
    }),
  ]);
  if (!shopifyRes.ok || !shopifyRes.data.product) return null;
  return productToMarkdown(shopifyRes.data.product, sanityRes.data ?? null);
}

async function fetchCollectionMarkdown(handle: string): Promise<string | null> {
  const [sanityRes, shopifyRes] = await Promise.all([
    sanityFetch({
      query: queryCollectionByHandle,
      params: { handle },
      ...PUBLISHED,
    }),
    storefrontQuery<CollectionQueryResponse>(COLLECTION_QUERY, {
      variables: { handle, first: 50 },
    }),
  ]);
  if (!shopifyRes.ok || !shopifyRes.data.collection) return null;
  return collectionToMarkdown(
    shopifyRes.data.collection,
    sanityRes.data ?? null
  );
}

async function fetchCollectionsIndexMarkdown(): Promise<string> {
  const [indexRes, collectionsRes] = await Promise.all([
    sanityFetch({ query: queryCollectionsIndexPageData, ...PUBLISHED }),
    sanityFetch({ query: queryAllCollections, ...PUBLISHED }),
  ]);
  const index = indexRes.data ?? { title: "Collections" };
  const collections = (collectionsRes.data ?? []) as CollectionListItem[];
  return collectionsIndexToMarkdown(index, collections);
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
  if (segments.length === 2)
    return fetchCollectionMarkdown(segments[1] as string);
  return null;
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
