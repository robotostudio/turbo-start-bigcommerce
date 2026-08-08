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

const ADMIN_API = "https://api.bigcommerce.com/stores";

/** Options are needed for the product document; variants and images ride along free. */
export const PRODUCT_INCLUDE = "variants,options,images";

/**
 * One Admin REST catalog GET, for both the sweep's pages and the single-entity
 * sync. `path` carries its own query string.
 *
 * Returns `null` on 404. A missing entity is an answer the sync acts on — an
 * `updated` event that lost a race with a delete looks exactly like this — so
 * it must not come back as an exception indistinguishable from a 500.
 */
export async function catalogGet<T>(
  path: string,
  credentials: BigCommerceCredentials
): Promise<T | null> {
  const response = await fetch(
    `${ADMIN_API}/${credentials.storeHash}/v3/catalog/${path}`,
    {
      headers: {
        "X-Auth-Token": credentials.adminToken,
        Accept: "application/json",
      },
    }
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `GET /v3/catalog/${path} failed: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as T;
}
