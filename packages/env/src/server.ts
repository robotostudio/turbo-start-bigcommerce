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
    /**
     * Admin REST, not storefront. `/api/bigcommerce/hook-health` lists the
     * store's webhooks with it, and the storefront token cannot: `/v3/hooks`
     * is Admin-only, as is the `/v3/catalog` read the webhook receiver will
     * make next to it.
     */
    BIGCOMMERCE_ADMIN_TOKEN: z.string().min(1),
    /**
     * The public URL the catalog webhooks are registered against, used to tell
     * this deployment's hooks apart from everyone else's on the same store.
     *
     * Explicit rather than derived from the request, because the two have to
     * agree exactly and a derived host is whatever the proxy in front of the
     * app happened to send. A mismatch reports all nine hooks missing every
     * day until somebody stops reading the alert.
     */
    BIGCOMMERCE_WEBHOOK_DESTINATION: z.url().min(1),
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

    /**
     * Vercel sends `Authorization: Bearer ${CRON_SECRET}` with every cron
     * invocation when this is set, and nothing else knows the value.
     *
     * Required, unlike Vercel's own docs, which call it optional. Optional
     * leaves two bad choices: run the check unauthenticated, or refuse every
     * request and have the check quietly never run. The second is the failure
     * this whole route exists to catch, so it is the one worth spending a
     * hard startup error on.
     */
    CRON_SECRET: z.string().min(1),
    /**
     * Where a dead-hook alert goes so a person sees it. Any endpoint that
     * accepts `{"text": "..."}` — a Slack incoming webhook is the assumed one.
     *
     * Optional, and the check still answers 500 without it, which is what
     * turns the run red in the platform's own cron log. This is the difference
     * between a red row somebody has to go looking for and a message that
     * arrives.
     */
    HOOK_HEALTH_ALERT_WEBHOOK_URL: z.url().min(1).optional(),
  },

  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },

  extends: [vercel()],

  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

export { env };
