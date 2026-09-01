import { env } from "@workspace/env/client";
import type { MetadataRoute } from "next";

import { getBaseUrl } from "@/utils";

const baseUrl = getBaseUrl();

export default function robots(): MetadataRoute.Robots {
  // `getBaseUrl` returns the preview host outside production, so without this
  // every preview URL self-canonicalises and competes with production.
  if (env.NEXT_PUBLIC_VERCEL_ENV !== "production") {
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
