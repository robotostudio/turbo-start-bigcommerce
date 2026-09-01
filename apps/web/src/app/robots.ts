import { env } from "@workspace/env/client";
import type { MetadataRoute } from "next";

import { getBaseUrl } from "@/utils";

const baseUrl = getBaseUrl();

export default function robots(): MetadataRoute.Robots {
  // Preview deploys self-canonicalise to their own host, so they must not be
  // indexed. `NEXT_PUBLIC_VERCEL_ENV` alone is not the test: nothing injects it
  // off Vercel, where it defaults to "development" — gating on it disallowed a
  // self-hosted production storefront's entire catalog.
  if (
    env.NEXT_PUBLIC_VERCEL_ENV === "preview" ||
    env.NODE_ENV !== "production"
  ) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      // `/api/og` must outrank the `/api/` disallow below: every `og:image`
      // points there, and social crawlers honour robots.txt — without it every
      // shared link loses its preview image.
      allow: ["/", "/api/og"],
      disallow: [
        "/api/",
        // Already 404s in production; this keeps it out of a preview index.
        "/og-preview",
        // Per-visitor, and neither is a landing page.
        "/cart",
        "/search",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
