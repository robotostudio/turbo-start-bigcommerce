import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

const env = createEnv({
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },

  server: {
    SANITY_API_READ_TOKEN: z.string().min(1),
    SANITY_API_WRITE_TOKEN: z.string().min(1),
    /**
     * Shared with the Sanity webhook that drives `/api/revalidate`.
     *
     * Required, like the two tokens above, because without it nothing
     * invalidates the `sanity` cache tag and a deployment serves whatever was
     * true at build time for as long as it runs. `sanityFetch` caches every
     * Sanity read with `revalidate: false`, so it is never refreshed rather
     * than slowly refreshed, and `export const revalidate` on a page does not
     * help — it re-runs the render against the same cached read. A green build
     * with old content is the failure mode, and required is how this file
     * already stops that for every other secret.
     */
    SANITY_REVALIDATE_SECRET: z.string().min(1),

    /** BigCommerce GraphQL Storefront API.
     *  BIGCOMMERCE_STOREFRONT_TOKEN must be a *private* token. Vanilla tokens
     *  are not supported: server-to-server use sunsets 2027-03-31, and their
     *  CORS allowlist caps at 2 origins (we need localhost + prod + preview).
     */
    BIGCOMMERCE_STORE_HASH: z.string().min(1),
    BIGCOMMERCE_STOREFRONT_TOKEN: z.string().min(1),
    BIGCOMMERCE_CHANNEL_ID: z.string().default("1"),
    /** Endpoint override. Unset means derive it from hash + channel. */
    BIGCOMMERCE_API_URL: z.string().min(1).optional(),
    /**
     * How many catalog paths to prerender. The rest render on demand, so this
     * trades build time against first-visit latency rather than coverage.
     * Validated rather than read raw so a typo fails the build instead of
     * silently falling back to the default.
     */
    BIGCOMMERCE_PRERENDER_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .default(100),
  },

  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },

  extends: [vercel()],

  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

export { env };
