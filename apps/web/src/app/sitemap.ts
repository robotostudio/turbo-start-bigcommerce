import { Logger } from "@workspace/logger";
import { PUBLISHED, sanityFetch } from "@workspace/sanity/live";
import { querySitemapData } from "@workspace/sanity/query";
import type { QuerySitemapDataResult } from "@workspace/sanity/types";
import type { MetadataRoute } from "next";

import {
  ALL_PRODUCTS,
  getCategoryPaths,
  getProductPaths,
} from "@/lib/bigcommerce/catalog";
import type { StorefrontQueryResult } from "@/lib/bigcommerce/client";
import { fetchOrFallback } from "@/lib/build-guard";
import { getBaseUrl } from "@/utils";

const logger = new Logger("Sitemap");

type ChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
>;

/** How a group of URLs is weighted in the sitemap. */
type SitemapRank = {
  readonly priority: number;
  readonly changeFrequency: ChangeFrequency;
};

/** A rank plus the prefix joined to each Sanity slug. */
type SitemapSource = SitemapRank & { readonly pathPrefix: string };

/**
 * Sanity documents, keyed by `_type`. The key is bound to `querySitemapData`'s
 * result, so adding a source here without adding the matching projection to
 * that query fails `pnpm check-types` instead of silently omitting the pages.
 *
 * `pathPrefix` is empty because the Studio bakes both the leading slash and the
 * type prefix into `slug.current` — a blog slug is already `/blog/my-post`.
 */
const SANITY_SITEMAP_SOURCES = [
  { key: "page", pathPrefix: "", priority: 0.8, changeFrequency: "weekly" },
  { key: "blog", pathPrefix: "", priority: 0.5, changeFrequency: "weekly" },
] as const satisfies readonly (SitemapSource & {
  key: keyof QuerySitemapDataResult;
})[];

/**
 * Commerce-backed routes. These call the same BigCommerce path enumeration
 * that `generateStaticParams` and llms.txt use, so the three surfaces cannot
 * disagree about which catalog pages exist. Results are fetched by mapping
 * over this array, so they stay index-aligned with it.
 *
 * There is no `pathPrefix`: a BigCommerce path arrives whole, already carrying
 * its `/products/` or `/collections/` segment. Visibility filtering moves with
 * the source — the storefront API omits a product or category the merchant has
 * unpublished, which is what the `store.isVisible` clause on the retired GROQ
 * queries was mirroring.
 */
const COMMERCE_SITEMAP_SOURCES = [
  {
    label: "products",
    // Not the prerender cap: that trades build time against first-visit
    // latency, and using it here silently caps the sitemap at 100 URLs.
    fetchPaths: () => getProductPaths(ALL_PRODUCTS),
    priority: 0.7,
    changeFrequency: "weekly",
  },
  {
    label: "collections",
    fetchPaths: getCategoryPaths,
    priority: 0.6,
    changeFrequency: "weekly",
  },
] as const satisfies readonly (SitemapRank & {
  label: string;
  fetchPaths: () => Promise<StorefrontQueryResult<string[]>>;
})[];

/** Routes with no backing document. */
const STATIC_SITEMAP_ENTRIES = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/collections", priority: 0.6, changeFrequency: "weekly" },
] as const satisfies readonly ({ path: string } & SitemapRank)[];

const baseUrl = getBaseUrl();

/**
 * Sanity sources carry `_updatedAt`; commerce paths have no timestamp, so
 * they fall back to now — matching what each branch emitted previously.
 */
function toEntry(
  path: string,
  rank: SitemapRank,
  lastModified?: string
): MetadataRoute.Sitemap[number] {
  return {
    url: `${baseUrl}${path}`,
    // Omitted, not defaulted to now: a catalog path carries no timestamp, and
    // stamping build time on every commerce URL claims the whole catalog
    // changed on every deploy — which costs the editorial URLs that do carry a
    // real `_updatedAt` their credibility too.
    ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
    changeFrequency: rank.changeFrequency,
    priority: rank.priority,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = STATIC_SITEMAP_ENTRIES.map(({ path, ...rank }) =>
    toEntry(path, rank)
  );

  // The editorial half is one round trip. An unreachable Content Lake already
  // degrades to null data inside the wrapper, so this guard is for the rest:
  // fall back to the static routes rather than failing the build (or, in
  // production, serving a 500 to a crawler).
  const fetched = await fetchOrFallback(
    "Sanity sitemap data",
    "the sitemap lists static routes only",
    async () => {
      const [{ data: sanityDocs }, commercePaths] = await Promise.all([
        // Through the wrapper, not `client.fetch`: this route is prerendered,
        // and the wrapper's `SANITY_CACHE_TAG` is what lets `/api/revalidate`
        // rebuild it when a page or post is published.
        sanityFetch({ query: querySitemapData, ...PUBLISHED }),
        // A catalog read that fails costs its own section and nothing else —
        // the editorial routes are already in hand, and llms.txt degrades the
        // same way for the same reason.
        Promise.all(
          COMMERCE_SITEMAP_SOURCES.map(async ({ label, fetchPaths }) => {
            const result = await fetchPaths();
            if (result.ok) {
              return result.data;
            }
            logger.error(`Failed to load ${label} for the sitemap`, {
              error: result.error,
            });
            return [];
          })
        ),
      ]);
      return { sanityDocs, commercePaths };
    },
    null
  );

  if (!fetched) {
    return staticEntries;
  }

  const { sanityDocs, commercePaths } = fetched;

  // `blogIndex` is a singleton, neither a `page` nor a `blog`, so `/blog`
  // belonged to no source above and was missing from the sitemap entirely.
  const blogIndexEntry = sanityDocs?.blogIndex?.path
    ? [
        toEntry(
          sanityDocs.blogIndex.path,
          { priority: 0.6, changeFrequency: "weekly" },
          sanityDocs.blogIndex.lastModified ?? undefined
        ),
      ]
    : [];

  return [
    ...staticEntries,
    ...blogIndexEntry,

    // `sanityDocs` is null when the Content Lake is unreachable — the commerce
    // half is already in hand, so list that rather than nothing.
    ...SANITY_SITEMAP_SOURCES.flatMap(({ key, pathPrefix, ...rank }) =>
      (sanityDocs?.[key] ?? []).map((doc) =>
        toEntry(`${pathPrefix}${doc.path}`, rank, doc.lastModified)
      )
    ),

    // BigCommerce paths end in a slash; the canonical URL the page itself
    // emits does not, and a sitemap that disagrees with the canonical tag is
    // asking a crawler to pick one.
    ...COMMERCE_SITEMAP_SOURCES.flatMap(({ label: _label, ...rank }, index) =>
      (commercePaths[index] ?? []).map((path) =>
        toEntry(path.replace(/\/+$/, ""), rank)
      )
    ),
  ];
}
