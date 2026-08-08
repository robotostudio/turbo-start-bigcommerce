import type { Mutation, SanityClient } from "@sanity/client";
import { Logger } from "@workspace/logger";

import {
  catalogGet,
  createWriteClient,
  PRODUCT_INCLUDE,
  readBigCommerceCredentials,
} from "./client.js";
import {
  categoryDocumentId,
  productDocumentId,
  productDocuments,
  type RestCategory,
  type RestProduct,
  softDeleteMutations,
  staleMutations,
  toCategoryDocument,
  upsertMutations,
} from "./upsert.js";

/**
 * One function per event BigCommerce delivers. This is the whole sync core, and
 * it knows nothing about how it was invoked: no `Request`, no `Response`, no
 * `process.argv`. `src/reconcile.ts` calls it from a CLI today and
 * `apps/web/src/app/api/bigcommerce/webhook/route.ts` will call the same four
 * functions from a POST handler later — see `docs/sync-design.md`.
 *
 * Every function re-fetches the entity by id and writes the current state.
 * Never a delta: webhook payloads carry `{type, id}` and nothing else, arrive
 * out of order, and duplicate. Re-fetching is what makes a duplicate delivery a
 * no-op instead of a corruption, and it is why an out-of-order `updated` after
 * a `deleted` still converges on deleted.
 *
 * Dry run is the default, matching `reconcile()`. Pass `{ write: true }`.
 *
 * ponytail: no locking. Two overlapping syncs of the same entity both write and
 * the last one wins — harmless here because each writes a full re-fetch rather
 * than a delta. If a webhook storm ever makes the wasted round trips hurt,
 * coalesce by entity id over a short window before adding locks.
 */

const logger = new Logger("Sync");

export type SyncOptions = {
  /** Issue the mutations. Default is a dry run. */
  write?: boolean;
};

export type SyncResult = {
  entity: "product" | "category";
  entityId: number;
  /** `absent` — nothing in BigCommerce and nothing in Sanity to flag. */
  action: "upserted" | "softDeleted" | "absent";
  /** The documents this call touched. */
  documentIds: string[];
  mutations: Mutation[];
  written: boolean;
};

async function commit(
  result: Omit<SyncResult, "written">,
  client: SanityClient,
  write: boolean
): Promise<SyncResult> {
  const written = write && result.mutations.length > 0;
  if (written) {
    await client.mutate(result.mutations);
  }

  logger.info(
    `${result.entity} ${result.entityId}: ${result.action}, ${result.documentIds.length} document(s), ${result.mutations.length} mutation(s)${write ? "" : " (dry run)"}`
  );

  return { ...result, written };
}

/**
 * The variant documents Sanity currently holds for a product.
 *
 * `store.isDeleted != true` matters for more than tidiness: without it, a
 * re-delivery of the same event re-flags documents that are already flagged,
 * and the run stops being a no-op.
 */
function liveVariantIds(
  client: SanityClient,
  productEntityId: number
): Promise<string[]> {
  return client.fetch<string[]>(
    '*[_type == "bigcommerceProductVariant" && store.productEntityId == $productEntityId && store.isDeleted != true]._id',
    { productEntityId }
  );
}

/**
 * `store/product/created` and `store/product/updated`.
 *
 * Creates or updates the product and every variant on it. A 404 falls through
 * to `deleteProduct`: the entity is gone, and flagging it is safe even if the
 * 404 was transient, because `toProductDocument` writes `isDeleted: false` and
 * `upsertMutations` sets `store` whole — the next successful sync or sweep
 * clears the flag with no intervention.
 */
export async function syncProduct(
  entityId: number,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const credentials = readBigCommerceCredentials();
  const client = createWriteClient();

  const response = await catalogGet<{ data: RestProduct }>(
    `products/${entityId}?include=${PRODUCT_INCLUDE}`,
    credentials
  );

  if (!response) {
    logger.info(
      `product ${entityId}: 404 from BigCommerce — converging on deleted`
    );
    return deleteProduct(entityId, options);
  }

  const product = response.data;
  const documents = productDocuments(product);
  const mutations = documents.flatMap(upsertMutations);

  // BigCommerce has no CRUD webhooks for variants, so a product event is the
  // only signal that one went away. Absent `variants` means the include did not
  // come back — never read that as "every variant was deleted".
  if (product.variants) {
    const kept = new Set(documents.map((document) => document._id));
    const orphans = staleMutations(
      await liveVariantIds(client, entityId),
      kept
    );
    if (orphans.length > 0) {
      logger.info(
        `product ${entityId}: ${orphans.length} variant(s) no longer on the product`
      );
      mutations.push(...orphans);
    }
  }

  return commit(
    {
      entity: "product",
      entityId,
      action: "upserted",
      documentIds: documents.map((document) => document._id),
      mutations,
    },
    client,
    options.write ?? false
  );
}

/**
 * `store/product/deleted`. Flags the product and every variant under it.
 *
 * Only ever flags what Sanity holds. A patch against a missing document fails
 * the whole transaction, and a delete for an entity that was never synced —
 * another channel, an event that beat the first sweep — is a legitimate no-op.
 */
export async function deleteProduct(
  entityId: number,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const client = createWriteClient();

  const documentIds = await client.fetch<string[]>(
    '*[(_id == $productId || (_type == "bigcommerceProductVariant" && store.productEntityId == $entityId)) && store.isDeleted != true]._id',
    { productId: productDocumentId(entityId), entityId }
  );

  return commit(
    {
      entity: "product",
      entityId,
      action: documentIds.length > 0 ? "softDeleted" : "absent",
      documentIds,
      mutations: documentIds.flatMap(softDeleteMutations),
    },
    client,
    options.write ?? false
  );
}

/** `store/category/created` and `store/category/updated`. */
export async function syncCategory(
  entityId: number,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const credentials = readBigCommerceCredentials();
  const client = createWriteClient();

  const response = await catalogGet<{ data: RestCategory }>(
    `categories/${entityId}`,
    credentials
  );

  if (!response) {
    logger.info(
      `category ${entityId}: 404 from BigCommerce — converging on deleted`
    );
    return deleteCategory(entityId, options);
  }

  const document = toCategoryDocument(response.data);

  return commit(
    {
      entity: "category",
      entityId,
      action: "upserted",
      documentIds: [document._id],
      mutations: upsertMutations(document),
    },
    client,
    options.write ?? false
  );
}

/**
 * `store/category/deleted`.
 *
 * Products under a deleted category are not touched: BigCommerce reassigns
 * them rather than deleting them, and each one fires its own product event.
 */
export async function deleteCategory(
  entityId: number,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const client = createWriteClient();

  const documentIds = await client.fetch<string[]>(
    "*[_id == $id && store.isDeleted != true]._id",
    { id: categoryDocumentId(entityId) }
  );

  return commit(
    {
      entity: "category",
      entityId,
      action: documentIds.length > 0 ? "softDeleted" : "absent",
      documentIds,
      mutations: documentIds.flatMap(softDeleteMutations),
    },
    client,
    options.write ?? false
  );
}
