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
    SHOPIFY_STORE_DOMAIN: z.string().min(1),
    SHOPIFY_STOREFRONT_ACCESS_TOKEN: z.string().min(1),
    SHOPIFY_API_VERSION: z.string().default("2025-01"),

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
  },

  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },

  extends: [vercel()],

  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

export { env };
