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

import { pathToFileURL } from "node:url";
import { createClient } from "@sanity/client";
import { initCliLogging } from "@workspace/logger/cli";
import { Logger } from "@workspace/logger";
import type { BigCommerceCredentials } from "@workspace/sanity-sync/client";
import { paginate } from "@workspace/sanity-sync/reconcile";
import { slugFromPath } from "@workspace/sanity-sync/upsert";

const log = new Logger("verify");

/** Storefront page size. The storefront caps `first` at 50. */
const STOREFRONT_PAGE = 50;

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

export async function readCatalog(credentials: BigCommerceCredentials) {
  const all = async <T>(resource: string) => {
    const rows: T[] = [];
    for await (const page of paginate<T>(resource, credentials)) {
      rows.push(...page);
    }
    return rows;
  };
  const [products, categories] = await Promise.all([
    all<RestProduct>("products"),
    all<RestCategory>("categories"),
  ]);
  return { products, categories };
}

export async function storefrontProductIds(): Promise<{
  storeName?: string;
  ids: Set<number>;
}> {
  const ids = new Set<number>();
  let storeName: string | undefined;
  let after: string | null = null;
  do {
    const args: string = after
      ? `first: ${STOREFRONT_PAGE}, after: ${JSON.stringify(after)}`
      : `first: ${STOREFRONT_PAGE}`;
    const data: {
      site?: {
        settings?: { storeName: string } | null;
        products?: {
          edges?: { node: { entityId: number } }[] | null;
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        } | null;
      } | null;
    } = await storefrontQuery(
      `{ site { settings { storeName }
           products(${args}) {
             edges { node { entityId } }
             pageInfo { hasNextPage endCursor } } } }`
    );
    storeName ??= data.site?.settings?.storeName;
    for (const edge of data.site?.products?.edges ?? []) {
      ids.add(edge.node.entityId);
    }
    const pageInfo = data.site?.products?.pageInfo;
    const next = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
    // A cursor that does not move would loop forever.
    if (next !== null && next === after) {
      throw new Error("storefront pagination returned the same cursor twice");
    }
    after = next;
  } while (after);
  return { storeName, ids };
}

export function unsynced<T extends { id: number }>(
  entities: T[],
  syncedIds: Set<number | null>
): T[] {
  return entities.filter((entity) => !syncedIds.has(entity.id));
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

/**
 * Categories whose synced href does not survive being used as a URL.
 *
 * A synced slug is an identifier, not a path: `slugFromPath` joins every
 * segment with `-`, so Henleys under Tops stores `tops-henleys` while its
 * storefront path is `/collections/tops/henleys/`. `pathProblems` cannot see
 * that, because it flattens the catalog path before comparing — flattened
 * matches flattened and a link that 404s passes. This compares the href a link
 * surface would build against the real path instead.
 *
 * `store.path` is what those surfaces project (`categoryHandle` in
 * `packages/sanity/src/query.ts`), and the fallback here is the same one they
 * use — so what this checks is the string an editor's picked link renders,
 * whichever of the two it came from. Every category is checked, not only the
 * top-level ones: before `store.path` existed, `/collections/{slug}` was
 * correct for a single segment and wrong for everything below it, so the check
 * had to exclude the nested ones it could not have passed.
 *
 * It therefore goes red on a dataset the sync has not re-run against, which is
 * the honest answer: those documents carry no path and their nested links do
 * 404 until it does.
 */
function categoryHrefProblems(
  categories: SyncedDocument[],
  catalogPaths: Map<number | null, string | undefined>
): string[] {
  return categories
    .filter(
      (document) =>
        document._type === "bigcommerceCategory" &&
        // A GROQ projection drops an attribute the document does not carry
        // rather than returning it as null, so `path` is absent rather than
        // null on anything the current sync has not written.
        (document.path ?? document.slug)
    )
    .map((document) => ({
      href: `/collections/${document.path ?? document.slug}`,
      real: catalogPaths.get(document.entityId),
    }))
    .filter((link) => link.real !== `${link.href}/`)
    .map((link) => `${link.href} (really ${link.real ?? "no catalog path"})`);
}

type SyncedDocument = {
  _id: string;
  _type: string;
  entityId: number | null;
  slug: string | null;
  path: string | null;
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
    ({ products: adminProducts, categories: adminCategories } =
      await readCatalog(credentials));

    if (adminProducts.length === 0) {
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
    const storefront = await storefrontProductIds();
    storefrontIds = storefront.ids;
    storefrontBlocked = null;
    record(
      "storefront token",
      Boolean(storefront.storeName),
      storefront.storeName ?? "the token answered without store settings"
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
           "path": store.path,
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
  const syncedIds = (type: string) =>
    new Set(
      live
        .filter((document) => document._type === type)
        .map((document) => document.entityId)
    );
  const syncedProductIds = syncedIds("bigcommerceProduct");
  const syncedCategoryIds = syncedIds("bigcommerceCategory");
  if (blocked) {
    record("catalog synced into sanity", false, `not checked — ${blocked}`);
    record("storefront paths match", false, `not checked — ${blocked}`);
    record("category links resolve", false, `not checked — ${blocked}`);
  } else {
    // Categories as well as products. They were left out while only the
    // homepage read them, and the omission outlived the reason: the navbar
    // dropdown, the explorer and the editorial two-up all reference category
    // documents now, and one the sync never wrote renders as nothing at all.
    const missingDocs = [
      ...unsynced(adminProducts, syncedProductIds),
      ...unsynced(adminCategories, syncedCategoryIds),
    ];
    record(
      "catalog synced into sanity",
      missingDocs.length === 0,
      missingDocs.length === 0
        ? `${syncedProductIds.size} product and ${syncedCategoryIds.size} category document(s) match the catalog`
        : `no document for: ${missingDocs.map((e) => e.name).join(", ")} — run \`pnpm sync:bigcommerce\``
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

    const catalogPaths = new Map(
      adminCategories.map((c) => [c.id, c.custom_url?.url])
    );
    const brokenHrefs = categoryHrefProblems(live, catalogPaths);
    record(
      "category links resolve",
      brokenHrefs.length === 0,
      brokenHrefs.length === 0
        ? `every category link is its storefront path (${syncedCategoryIds.size} checked)`
        : `does not resolve: ${brokenHrefs.join(", ")} — run \`pnpm sync:bigcommerce\``
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  // Pretty one-liners on a terminal, JSON when this is redirected or piped.
  // Without it evlog decides from NODE_ENV, which is always "development" here,
  // so a redirected log fills with ANSI escapes and errors never reach stderr.
  initCliLogging();

  main().catch((error: unknown) => {
    log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
