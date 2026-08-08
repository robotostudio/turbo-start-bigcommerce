/**
 * Seed verification.
 *
 * Usage:
 *   pnpm verify
 *
 * A blank homepage has four possible causes and they look identical in a
 * browser: bad credentials, a product that exists but is not on the storefront
 * channel, a catalog that was never synced into Sanity, and content pointing at
 * catalog documents that are not there. This walks the four in order and names
 * the one that broke, so nobody spends an afternoon debugging the wrong layer.
 *
 * Every call here is a read. Nothing is written to BigCommerce or Sanity.
 *
 * It reads env from three files, which is not a tidiness failure — the admin
 * token and the storefront token are deliberately separate credentials, held by
 * the two apps that need them:
 *
 *   apps/studio/.env      BIGCOMMERCE_ADMIN_TOKEN, SANITY_STUDIO_*
 *   apps/web/.env.local   BIGCOMMERCE_STOREFRONT_TOKEN, BIGCOMMERCE_CHANNEL_ID
 */

import { createClient } from "@sanity/client";
import { Logger } from "@workspace/logger";
import { catalogGet } from "@workspace/sanity-sync/client";
import { slugFromPath } from "@workspace/sanity-sync/upsert";

const log = new Logger("verify");

/** Storefront paging cap. The demo catalog is 12 products; a bigger fork pages. */
const STOREFRONT_PAGE = 50;
/** Admin paging cap without `include`. */
const ADMIN_PAGE = 250;

const REQUIRED_ENV = [
  "SANITY_STUDIO_PROJECT_ID",
  "SANITY_STUDIO_DATASET",
  "BIGCOMMERCE_STORE_HASH",
  "BIGCOMMERCE_ADMIN_TOKEN",
  "BIGCOMMERCE_STOREFRONT_TOKEN",
] as const;

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string): boolean {
  checks.push({ name, ok, detail });
  return ok;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

function missingEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

type RestProduct = {
  id: number;
  name: string;
  custom_url: { url: string };
};

type RestCategory = {
  id: number;
  name: string;
  custom_url: { url: string };
};

async function storefrontQuery<T>(query: string): Promise<T> {
  const channelId = process.env.BIGCOMMERCE_CHANNEL_ID ?? "1";
  const url = `https://store-${process.env.BIGCOMMERCE_STORE_HASH}-${channelId}.mybigcommerce.com/graphql`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.BIGCOMMERCE_STOREFRONT_TOKEN}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join("; "));
  }
  if (!body.data) {
    throw new Error("no data in the response");
  }
  return body.data;
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

const sanityClient = () =>
  createClient({
    projectId: process.env.SANITY_STUDIO_PROJECT_ID as string,
    dataset: process.env.SANITY_STUDIO_DATASET as string,
    apiVersion: process.env.SANITY_STUDIO_API_VERSION ?? "2025-05-08",
    token: process.env.SANITY_API_WRITE_TOKEN,
    useCdn: false,
    perspective: "raw",
  });

type SyncedDocument = {
  _id: string;
  _type: string;
  entityId: number | null;
  slug: string | null;
  isDeleted: boolean | null;
};

async function main() {
  const missing = missingEnv();
  if (
    !record(
      "credentials",
      missing.length === 0,
      missing.length === 0
        ? `${REQUIRED_ENV.length} variables present`
        : `not set: ${missing.join(", ")}`
    )
  ) {
    report();
    return;
  }

  const credentials = {
    storeHash: process.env.BIGCOMMERCE_STORE_HASH as string,
    adminToken: process.env.BIGCOMMERCE_ADMIN_TOKEN as string,
  };
  const channelId = process.env.BIGCOMMERCE_CHANNEL_ID ?? "1";

  // --- BigCommerce Admin -----------------------------------------------------
  let adminProducts: RestProduct[] = [];
  let adminCategories: RestCategory[] = [];
  try {
    const [products, categories] = await Promise.all([
      catalogGet<{ data: RestProduct[] }>(
        `products?limit=${ADMIN_PAGE}&include_fields=name,custom_url`,
        credentials
      ),
      catalogGet<{ data: RestCategory[] }>(
        `categories?limit=${ADMIN_PAGE}`,
        credentials
      ),
    ]);
    adminProducts = products?.data ?? [];
    adminCategories = categories?.data ?? [];
    record(
      "bigcommerce admin",
      adminProducts.length > 0,
      adminProducts.length > 0
        ? `${adminProducts.length} product(s), ${adminCategories.length} categor(y|ies)`
        : "the catalog is empty — run `pnpm seed:bigcommerce`"
    );
  } catch (error) {
    record("bigcommerce admin", false, (error as Error).message);
  }

  // --- Storefront + channel --------------------------------------------------
  // A product that exists in Admin and is absent here is the channel failure:
  // BigCommerce assigns a new product to no channel at all, and the storefront
  // then cannot see it — no error, just a shorter list.
  let storefrontIds = new Set<number>();
  let storefrontAnswered = false;
  try {
    const data = await storefrontQuery<{
      site: {
        settings: { storeName: string } | null;
        products: { edges: { node: { entityId: number } }[] | null };
      };
    }>(
      `{ site { settings { storeName }
           products(first: ${STOREFRONT_PAGE}) { edges { node { entityId } } } } }`
    );
    storefrontIds = new Set(
      (data.site.products.edges ?? []).map((edge) => edge.node.entityId)
    );
    storefrontAnswered = true;
    record(
      "storefront token",
      Boolean(data.site.settings?.storeName),
      data.site.settings?.storeName ?? "the token answered without store settings"
    );
  } catch (error) {
    record("storefront token", false, (error as Error).message);
  }

  // Only meaningful once the storefront answered at all: a rejected token
  // returns an empty product list, which is indistinguishable from every
  // product being unassigned and would report the wrong layer as broken.
  if (storefrontAnswered) {
    const unassigned = adminProducts.filter(
      (product) => !storefrontIds.has(product.id)
    );
    record(
      `channel ${channelId}`,
      adminProducts.length > 0 && unassigned.length === 0,
      unassigned.length === 0
        ? `all ${adminProducts.length} product(s) visible to the storefront`
        : `not assigned: ${unassigned.map((p) => p.name).join(", ")}`
    );
  } else {
    record(
      `channel ${channelId}`,
      false,
      "not checked — the storefront query failed above"
    );
  }

  // --- Sanity ----------------------------------------------------------------
  const client = sanityClient();
  let documents: unknown[] = [];
  let synced: SyncedDocument[] = [];
  try {
    [documents, synced] = await Promise.all([
      client.fetch<unknown[]>('*[!(_id in path("_.**"))]'),
      client.fetch<SyncedDocument[]>(
        `*[_type in ["bigcommerceProduct", "bigcommerceCategory"]]{
           _id, _type,
           "entityId": store.entityId,
           "slug": store.slug.current,
           "isDeleted": store.isDeleted
         }`
      ),
    ]);
    record(
      "sanity dataset",
      documents.length > 0,
      documents.length > 0
        ? `${documents.length} document(s), ${synced.length} synced from the catalog`
        : "the dataset is empty — run `pnpm seed:sanity`"
    );
  } catch (error) {
    record("sanity dataset", false, (error as Error).message);
  }

  // --- Catalog and content agree ---------------------------------------------
  const live = synced.filter((document) => !document.isDeleted);
  const syncedProductIds = new Set(
    live
      .filter((document) => document._type === "bigcommerceProduct")
      .map((document) => document.entityId)
  );
  const unsynced = adminProducts.filter(
    (product) => !syncedProductIds.has(product.id)
  );
  record(
    "catalog synced into sanity",
    adminProducts.length > 0 && unsynced.length === 0,
    unsynced.length === 0
      ? `${syncedProductIds.size} product document(s) match the catalog`
      : `no document for: ${unsynced.map((p) => p.name).join(", ")} — run \`pnpm sync:bigcommerce\``
  );

  const bySlug = new Map(
    live.map((document) => [`${document._type}:${document.slug}`, document])
  );
  const staleSlugs = [
    ...adminProducts
      .filter(
        (product) =>
          !bySlug.has(`bigcommerceProduct:${slugFromPath(product.custom_url.url)}`)
      )
      .map((product) => product.custom_url.url),
    ...adminCategories
      .filter(
        (category) =>
          !bySlug.has(
            `bigcommerceCategory:${slugFromPath(category.custom_url.url)}`
          )
      )
      .map((category) => category.custom_url.url),
  ];
  record(
    "storefront paths match",
    adminProducts.length > 0 && staleSlugs.length === 0,
    staleSlugs.length === 0
      ? "every catalog path has a document under the same slug"
      : `no document for: ${staleSlugs.join(", ")}`
  );

  // A dangling reference is the failure the seed is built to avoid, and the one
  // that renders as nothing rather than as an error. `_ref` values are read off
  // the raw documents because they sit at arbitrary depths — inside page builder
  // blocks, navbar columns, hotspots — and no fixed projection reaches them all.
  const documentIds = new Set(
    (documents as { _id: string }[]).map((document) => document._id)
  );
  const referenced = new Set(
    [...JSON.stringify(documents).matchAll(/"_ref":"(bigcommerce[^"]+)"/g)].map(
      (match) => match[1] as string
    )
  );
  const dangling = [...referenced].filter((ref) => !documentIds.has(ref)).sort();
  record(
    "content references resolve",
    dangling.length === 0,
    dangling.length === 0
      ? `${referenced.size} catalog reference(s) resolve`
      : `dangling: ${dangling.join(", ")} — run \`pnpm seed:refs\``
  );

  report();
}

function report(): void {
  for (const check of checks) {
    const line = `${check.ok ? "ok  " : "FAIL"}  ${check.name} — ${check.detail}`;
    if (check.ok) {
      log.info(line);
    } else {
      log.error(line);
    }
  }

  const failed = checks.filter((check) => !check.ok).length;
  if (failed > 0) {
    log.error(`${failed} of ${checks.length} check(s) failed.`);
    process.exit(1);
  }
  log.info(`All ${checks.length} checks passed.`);
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
