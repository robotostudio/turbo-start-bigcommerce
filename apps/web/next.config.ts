import "@workspace/env/client";
import "@workspace/env/server";

import { env } from "@workspace/env/client";
import { Logger } from "@workspace/logger";
import { client } from "@workspace/sanity/client";
import { queryRedirects } from "@workspace/sanity/query";
import type { NextConfig } from "next";

const logger = new Logger("NextConfig");

/**
 * Sanity's Presentation tool iframes this storefront from the Studio origin,
 * so `X-Frame-Options` is deliberately not sent at all: its `SAMEORIGIN` has
 * no allowlist and would break visual editing. `*.sanity.studio` covers a
 * deployed Studio alongside the configured one.
 */
function studioOrigin(): string | null {
  try {
    return new URL(env.NEXT_PUBLIC_SANITY_STUDIO_URL).origin;
  } catch {
    // `SKIP_ENV_VALIDATION` hands the value through unparsed, undefined
    // included, and this runs at module scope — throwing here takes the whole
    // config down before Next reads any of it.
    return null;
  }
}

const FRAME_ANCESTORS = ["'self'", studioOrigin(), "https://*.sanity.studio"]
  .filter(Boolean)
  .join(" ");

/**
 * `script-src` is deliberately absent: without a per-request nonce it would
 * need `'unsafe-inline'` for Next's own bootstrap, which buys nothing.
 */
const HSTS_HEADER = {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains; preload",
};

const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: [
      `frame-ancestors ${FRAME_ANCESTORS}`,
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

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
    // Do not add `unoptimized` back: it bypasses the custom loader, so cards
    // fall back to the raw `url(width: 320)` rendition and render soft. Every
    // `next/image` goes through `StoreImage`, so none reaches the optimizer.
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
  async headers() {
    // Production only: `preload` submits the host to the browser preload list,
    // and a throwaway preview host should not assert two years of HSTS.
    const headers =
      env.NEXT_PUBLIC_VERCEL_ENV === "production"
        ? [...SECURITY_HEADERS, HSTS_HEADER]
        : SECURITY_HEADERS;
    return [{ source: "/:path*", headers }];
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
