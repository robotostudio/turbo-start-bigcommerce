import { sanityFetch } from "@workspace/sanity/live";
import { querySettingsData } from "@workspace/sanity/query";
import { stegaClean } from "next-sanity";

import { OrganizationJsonLd, WebSiteJsonLd } from "./json-ld";

type CombinedJsonLdProps = {
  includeWebsite?: boolean;
  includeOrganization?: boolean;
};

/**
 * The site-wide structured data, read once in the root layout.
 *
 * It lives here rather than in `json-ld.tsx` because that module is imported
 * by client components (`sections/faq-categories.tsx`), and `sanityFetch`
 * comes from `defineLive`, which refuses to be pulled into a client bundle.
 * Everything in `json-ld.tsx` takes its data as props for that reason; this is
 * the one piece that fetches its own, so it is the one piece kept apart.
 */
export async function CombinedJsonLd({
  includeWebsite = false,
  includeOrganization = false,
}: CombinedJsonLdProps) {
  // Through the wrapper so the read carries `SANITY_CACHE_TAG` like every
  // other one: this renders inside prerendered pages, and without the tag a
  // settings change never reaches their structured data. It also degrades to
  // null on an unreachable Content Lake, which the guards below already cover.
  const { data } = await sanityFetch({ query: querySettingsData });

  const cleanSettings = stegaClean(data);
  return (
    <>
      {includeWebsite && cleanSettings && (
        <WebSiteJsonLd settings={cleanSettings} />
      )}
      {includeOrganization && cleanSettings && (
        <OrganizationJsonLd settings={cleanSettings} />
      )}
    </>
  );
}
