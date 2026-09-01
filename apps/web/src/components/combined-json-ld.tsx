import { stegaClean } from "next-sanity";

import { getJsonLdSettings } from "@/lib/json-ld-data";
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
  // Shared with `ArticleJsonLd`'s caller and `lib/seo.ts`, so one render makes
  // one round trip rather than three.
  const data = await getJsonLdSettings();

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
