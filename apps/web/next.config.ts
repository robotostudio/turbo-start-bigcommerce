import "@workspace/env/client";
import "@workspace/env/server";

import { env } from "@workspace/env/client";
import { Logger } from "@workspace/logger";
import { client } from "@workspace/sanity/client";
import { queryRedirects } from "@workspace/sanity/query";
import type { NextConfig } from "next";

const logger = new Logger("NextConfig");

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui"],
  reactCompiler: true,
  experimental: {
    inlineCss: true,
  },
  logging: {
    fetches: {},
  },
  images: {
    // Skip optimization in dev to avoid optimizer fetch timeouts on large
    // CDN masters; Vercel optimizes normally in production.
    unoptimized: process.env.NODE_ENV === "development",
    minimumCacheTTL: 31_536_000,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 828, 1080, 1440, 1920, 2560, 3840],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        pathname: `/images/${env.NEXT_PUBLIC_SANITY_PROJECT_ID}/**`,
      },
      {
        // Hostname only, so the store hash stays out of committed config.
        protocol: "https",
        hostname: "cdn11.bigcommerce.com",
      },
    ],
  },
  // Not shared with `src/lib/build-guard.ts`: this file is evaluated by Next's
  // config loader, and the loss here is redirects (SEO-visible), not
  // prerendering — a different warning.
  async redirects() {
    try {
      const redirects = await client.fetch(queryRedirects);
      return redirects.map((redirect) => ({
        source: redirect.source,
        destination: redirect.destination,
        permanent: redirect.permanent ?? false,
      }));
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      logger.warn(
        `Could not fetch Sanity redirects. The build is CONTINUING, but NO redirects will be applied in this build. Cause: ${cause}`
      );
      return [];
    }
  },
};

export default nextConfig;
