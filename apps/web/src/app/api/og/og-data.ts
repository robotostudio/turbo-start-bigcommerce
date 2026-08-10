import { PUBLISHED, sanityFetch } from "@workspace/sanity/live";
import {
  queryBlogPageOGData,
  queryGenericPageOGData,
  queryHomePageOGData,
  querySettingsData,
  querySlugPageOGData,
} from "@workspace/sanity/query";

import { handleErrors } from "@/utils";

/**
 * Every read here goes through `sanityFetch` rather than `client.fetch`, so it
 * carries `SANITY_CACHE_TAG` and `/api/revalidate` can clear it on publish —
 * otherwise an OG card keeps the title and image it was generated with until
 * the next deploy.
 *
 * `PUBLISHED` for the same reason llms.txt and the Markdown views use it: a
 * card is what a crawler unfurls, so a draft-mode session must not change it,
 * and satori draws stega's invisible characters rather than resolving them.
 *
 * `handleErrors` stays. The wrapper degrades an unreachable Content Lake to
 * null data, which arrives here as `[null, undefined]` and reads the same to
 * the route as a failure; it still throws on a malformed query or a bug in
 * this repo, and those are what the tuple catches.
 */

export async function getHomePageOGData(id: string) {
  return await handleErrors(
    sanityFetch({
      query: queryHomePageOGData,
      params: { id },
      ...PUBLISHED,
    }).then((res) => res.data)
  );
}

export async function getSlugPageOGData(id: string) {
  return await handleErrors(
    sanityFetch({
      query: querySlugPageOGData,
      params: { id },
      ...PUBLISHED,
    }).then((res) => res.data)
  );
}

export async function getBlogPageOGData(id: string) {
  return await handleErrors(
    sanityFetch({
      query: queryBlogPageOGData,
      params: { id },
      ...PUBLISHED,
    }).then((res) => res.data)
  );
}

export async function getGenericPageOGData(id: string) {
  return await handleErrors(
    sanityFetch({
      query: queryGenericPageOGData,
      params: { id },
      ...PUBLISHED,
    }).then((res) => res.data)
  );
}

/**
 * Products and categories have no Sanity document to read, so their cards
 * fetch BigCommerce directly and come here only for the store name that sits
 * in the bar — the one part of a catalog card that is editorial.
 */
export async function getStoreOGData() {
  return await handleErrors(
    sanityFetch({ query: querySettingsData, ...PUBLISHED }).then(
      (res) => res.data
    )
  );
}
