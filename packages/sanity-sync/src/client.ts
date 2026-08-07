import { createClient, type SanityClient } from "@sanity/client";

/**
 * Reads `packages/sanity-sync/.env` and nothing else.
 *
 * The fork base's `cleanup-stale-sanity.ts` loaded `apps/web/.env.local` from a
 * studio-side script. That coupling meant renaming a web env var silently broke
 * a script in another app, and it only surfaced at run time. This package owns
 * its own env file; see `.env.example`.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in packages/sanity-sync/.env (see .env.example).`
    );
  }
  return value;
}

/** Lazy so that importing `upsert` or `schema` needs no credentials. */
export function createWriteClient(): SanityClient {
  return createClient({
    projectId: required("SANITY_PROJECT_ID"),
    dataset: required("SANITY_DATASET"),
    token: required("SANITY_API_WRITE_TOKEN"),
    apiVersion: process.env.SANITY_API_VERSION ?? "2024-10-01",
    useCdn: false,
  });
}

export type BigCommerceCredentials = {
  storeHash: string;
  adminToken: string;
};

export function readBigCommerceCredentials(): BigCommerceCredentials {
  return {
    storeHash: required("BIGCOMMERCE_STORE_HASH"),
    adminToken: required("BIGCOMMERCE_ADMIN_TOKEN"),
  };
}
