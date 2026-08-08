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
 *   apps/web/.env.local   BIGCOMMERCE_STOREFRONT_TOKEN, BIGCOMMERCE_CHANNEL_ID,
 *                         SANITY_API_READ_TOKEN
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

/** `@workspace/env` defaults this to "1" as well, so an unset value is not a divergence. */
const channelId = process.env.BIGCOMMERCE_CHANNEL_ID ?? "1";

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

/** `custom_url` is optional here because a catalog entity without one must be reported, not crashed on. */
type RestProduct = {
  id: number;
  name: string;
  custom_url?: { url?: string };
};

type RestCategory = {
  id: number;
  name: string;
  custom_url?: { url?: string };
};

/** Matches `apps/web`'s own resolution, override included, or it checks a different endpoint than the app uses. */
function storefrontUrl(): string {
  return (
    process.env.BIGCOMMERCE_API_URL ??
    `https://store-${process.env.BIGCOMMERCE_STORE_HASH}-${channelId}.mybigcommerce.com/graphql`
  );
}

async function storefrontQuery<T>(query: string): Promise<T> {
  const response = await fetch(storefrontUrl(), {
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
    // Read token first: this script only reads, and a tool holding write
    // credentials is one careless edit away from mutating the dataset it checks.
    token:
      process.env.SANITY_API_READ_TOKEN ?? process.env.SANITY_API_WRITE_TOKEN,
    useCdn: false,
    perspective: "raw",
  });

/** Catalog entities whose storefront path has no synced document under the same slug. */
function pathProblems(
  entities: { name: string; custom_url?: { url?: string } }[],
  type: string,
  bySlug: Set<string>
): string[] {
  return entities
    .filter((entity) => {
      const path = entity.custom_url?.url;
      return !(path && bySlug.has(`${type}:${slugFromPath(path)}`));
    })
    .map((entity) => entity.custom_url?.url ?? `${entity.name} (no URL)`);
}

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

  // --- BigCommerce Admin -----------------------------------------------------
  let adminProducts: RestProduct[] = [];
  let adminCategories: RestCategory[] = [];
  /**
   * Why the checks below the Admin read cannot be answered, when they cannot.
   * They all compare something against the catalog, so an empty or truncated
   * catalog makes every one of them come out clean — three green-sounding
   * details under a FAIL verdict, while the real cause sits further up.
   */
  let blocked: string | null = null;
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

    // One page each. Neither read follows pagination, and a fork that fills a
    // page is something this script cannot answer for: every product past the
    // cap would read as unassigned and unsynced, which is a confident FAIL
    // naming three wrong layers. Say the catalog is too big instead.
    if (
      adminProducts.length >= ADMIN_PAGE ||
      adminCategories.length >= ADMIN_PAGE
    ) {
      blocked = `the catalog fills the ${ADMIN_PAGE}-row page this script reads; it does not paginate`;
    } else if (adminProducts.length === 0) {
      blocked = "the catalog is empty — run `pnpm seed:bigcommerce`";
    }

    record(
      "bigcommerce admin",
      blocked === null,
      blocked ??
        `${adminProducts.length} product(s), ${adminCategories.length} categor(y|ies)`
    );
  } catch (error) {
    blocked = "the Admin read failed";
    record("bigcommerce admin", false, (error as Error).message);
  }

  // --- Storefront + channel --------------------------------------------------
  // A product that exists in Admin and is absent here is the channel failure:
  // BigCommerce assigns a new product to no channel at all, and the storefront
  // then cannot see it — no error, just a shorter list.
  let storefrontIds = new Set<number>();
  // A rejected token returns an empty product list, which is byte-identical to
  // every product being unassigned — so the channel check needs to know the
  // query answered at all before it reads anything into a short list.
  let storefrontBlocked: string | null = "the storefront query failed above";
  try {
    const data = await storefrontQuery<{
      site?: {
        settings?: { storeName: string } | null;
        products?: { edges?: { node: { entityId: number } }[] | null } | null;
      } | null;
    }>(
      `{ site { settings { storeName }
           products(first: ${STOREFRONT_PAGE}) { edges { node { entityId } } } } }`
    );
    storefrontIds = new Set(
      (data.site?.products?.edges ?? []).map((edge) => edge.node.entityId)
    );
    storefrontBlocked =
      storefrontIds.size >= STOREFRONT_PAGE
        ? `the storefront returned the full ${STOREFRONT_PAGE}-row page; this script does not paginate`
        : null;
    record(
      "storefront token",
      Boolean(data.site?.settings?.storeName),
      data.site?.settings?.storeName ??
        "the token answered without store settings"
    );
  } catch (error) {
    record("storefront token", false, (error as Error).message);
  }

  const channelBlocked = blocked ?? storefrontBlocked;
  if (channelBlocked) {
    record(`channel ${channelId}`, false, `not checked — ${channelBlocked}`);
  } else {
    const unassigned = adminProducts.filter(
      (product) => !storefrontIds.has(product.id)
    );
    record(
      `channel ${channelId}`,
      unassigned.length === 0,
      unassigned.length === 0
        ? `all ${adminProducts.length} product(s) visible to the storefront`
        : `not assigned: ${unassigned.map((p) => p.name).join(", ")}`
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
  if (blocked) {
    record("catalog synced into sanity", false, `not checked — ${blocked}`);
    record("storefront paths match", false, `not checked — ${blocked}`);
  } else {
    const unsynced = adminProducts.filter(
      (product) => !syncedProductIds.has(product.id)
    );
    record(
      "catalog synced into sanity",
      unsynced.length === 0,
      unsynced.length === 0
        ? `${syncedProductIds.size} product document(s) match the catalog`
        : `no document for: ${unsynced.map((p) => p.name).join(", ")} — run \`pnpm sync:bigcommerce\``
    );

    const bySlug = new Set(
      live.map((document) => `${document._type}:${document.slug}`)
    );
    // A catalog entity with no `custom_url` has no storefront path at all, so
    // it can never match a synced slug. It is reported rather than skipped:
    // dereferencing it would throw and take every check below it with it.
    const staleSlugs = [
      ...pathProblems(adminProducts, "bigcommerceProduct", bySlug),
      ...pathProblems(adminCategories, "bigcommerceCategory", bySlug),
    ];
    record(
      "storefront paths match",
      staleSlugs.length === 0,
      staleSlugs.length === 0
        ? "every catalog path has a document under the same slug"
        : `no document for: ${staleSlugs.join(", ")}`
    );
  }

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
