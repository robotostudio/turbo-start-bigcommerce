import { PUBLISHED, sanityFetch } from "@workspace/sanity/live";
import { querySettingsData } from "@workspace/sanity/query";
import { cache } from "react";

/**
 * The `settings` singleton, read once per request however many components ask.
 *
 * Through `sanityFetch`, not a raw `client.fetch`, so the read carries
 * `SANITY_CACHE_TAG` — a raw fetch bakes the old organisation name into every
 * prerendered page until the next deploy. `cache()` rather than `"use cache"`:
 * that needs `cacheComponents`, which this app does not set.
 */
export const getJsonLdSettings = cache(async () => {
  const { data } = await sanityFetch({
    query: querySettingsData,
    ...PUBLISHED,
  });
  return data;
});
