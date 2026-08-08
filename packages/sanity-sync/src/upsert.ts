import type { Mutation } from "@sanity/client";

/**
 * The two rules that cost real editor data if they are rediscovered late.
 * Neither is written down anywhere in the fork base.
 *
 * 1. **Patch the `store` subtree only. Never replace the whole document.**
 *    `body`, `hero`, `modules` and `seo` are editor-owned siblings of `store`
 *    on the same document. `createOrReplace()` — which is what the throwaway
 *    `apps/studio/scripts/sync-bigcommerce-sanity.ts` used — destroys all of
 *    them on every sync run.
 * 2. **Soft-delete via `store.isDeleted`. Never remove the document.** A hard
 *    delete drops the editor-owned siblings with it, and it is precisely why
 *    the fork base needed `cleanup-stale-sanity.ts` as a separate manual sweep.
 *
 * Everything here is pure: it returns mutations rather than issuing them, so a
 * dry run prints exactly what a real run would send, and the tests assert on
 * the same objects the transport would.
 */

// ---------------------------------------------------------------------------
// Deterministic ids
// ---------------------------------------------------------------------------

/**
 * Keyed on BigCommerce's `entityId`, which is stable for the life of the
 * entity. This is the piece that must never be cut: it is what lets a stub
 * document created today join its synced document later with no content
 * migration.
 *
 * Verified against the sandbox: Storefront GraphQL `Variant.entityId` equals
 * Admin REST `variant.id` (167, 173, 177 on product 180) — NOT `sku_id`.
 */
export const productDocumentId = (entityId: number) =>
  `bigcommerceProduct-${entityId}`;

export const variantDocumentId = (entityId: number) =>
  `bigcommerceProductVariant-${entityId}`;

export const categoryDocumentId = (entityId: number) =>
  `bigcommerceCategory-${entityId}`;

/** Matches every id this package owns. Used by the reconcile sweep's GROQ. */
export const SYNCED_ID_PREFIXES = [
  "bigcommerceProduct-",
  "bigcommerceProductVariant-",
  "bigcommerceCategory-",
] as const;

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

const ROUTE_PREFIXES = new Set(["products", "collections"]);

/**
 * BigCommerce `custom_url.url` is a full storefront path with a leading slash
 * and usually a trailing one: `/products/wren-washed-cap/`,
 * `/collections/jackets/leather/`. Our routes are single dynamic segments, so
 * a stored slug containing a slash can never match.
 *
 * Drop the route prefix when there is one, then join what's left with `-`.
 * Flat categories give the handle unchanged; nested ones flatten losslessly
 * (`jackets-leather`), which the last segment alone would not — two branches
 * sharing a leaf name would collide. Products with a customised URL carry no
 * prefix at all (`/turbo-start-care-guide-digital/` on the sandbox), which is
 * why the prefix is stripped conditionally rather than by position.
 */
export function slugFromPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] && ROUTE_PREFIXES.has(segments[0])) {
    segments.shift();
  }
  return segments.join("-");
}

// ---------------------------------------------------------------------------
// BigCommerce Admin REST shapes — only the fields the sync stores
// ---------------------------------------------------------------------------

type CustomUrl = { url: string };

export type RestVariant = {
  id: number;
  product_id: number;
  sku: string;
  price: number | null;
  sale_price: number | null;
  calculated_price: number;
  inventory_level: number;
  image_url: string | null;
  purchasing_disabled: boolean;
  option_values?: {
    id: number;
    label: string;
    option_display_name: string;
  }[];
};

export type RestProduct = {
  id: number;
  name: string;
  sku: string;
  description: string;
  price: number;
  sale_price: number;
  calculated_price: number;
  is_visible: boolean;
  brand_id: number;
  categories: number[];
  date_created: string;
  date_modified: string;
  custom_url: CustomUrl;
  variants?: RestVariant[];
  options?: { id: number; display_name: string }[];
  images?: {
    url_standard: string;
    is_thumbnail: boolean;
    sort_order: number;
  }[];
};

export type RestCategory = {
  id: number;
  parent_id: number;
  name: string;
  description: string;
  is_visible: boolean;
  image_url: string;
  custom_url: CustomUrl;
};

// ---------------------------------------------------------------------------
// The synced subtree
// ---------------------------------------------------------------------------

/** A document id plus the `store` object that is the whole of the sync's write surface. */
export type SyncedDocument = {
  _id: string;
  _type: string;
  store: Record<string, unknown>;
};

export function toProductDocument(product: RestProduct): SyncedDocument {
  return {
    _id: productDocumentId(product.id),
    _type: "bigcommerceProduct",
    store: {
      entityId: product.id,
      title: product.name,
      slug: { _type: "slug", current: slugFromPath(product.custom_url.url) },
      sku: product.sku,
      descriptionHtml: product.description,
      // `price` is the list price and `sale_price` 0 means "no sale". A variant
      // carrying its own `price` cancels the product's `sale_price`, so
      // `calculated_price` here is the product-level figure only — variant
      // documents carry the authoritative per-variant number.
      price: product.price,
      salePrice: product.sale_price || null,
      isVisible: product.is_visible,
      isDeleted: false,
      brandId: product.brand_id || null,
      categoryEntityIds: product.categories,
      variantEntityIds: (product.variants ?? []).map((v) => v.id),
      optionNames: (product.options ?? []).map((o) => o.display_name),
      previewImageUrl:
        (product.images ?? []).find((i) => i.is_thumbnail)?.url_standard ??
        product.images?.[0]?.url_standard ??
        null,
      createdAt: product.date_created,
      modifiedAt: product.date_modified,
    },
  };
}

export function toVariantDocument(variant: RestVariant): SyncedDocument {
  return {
    _id: variantDocumentId(variant.id),
    _type: "bigcommerceProductVariant",
    store: {
      entityId: variant.id,
      productEntityId: variant.product_id,
      title: (variant.option_values ?? []).map((v) => v.label).join(" / "),
      sku: variant.sku,
      price: variant.price ?? variant.calculated_price,
      salePrice: variant.sale_price || null,
      // `availableToSell` reads undefined on this store — a store setting, not
      // missing data — so stock comes from the Admin REST inventory level.
      inventoryLevel: variant.inventory_level,
      purchasingDisabled: variant.purchasing_disabled,
      imageUrl: variant.image_url,
      isDeleted: false,
      optionValues: (variant.option_values ?? []).map((value) => ({
        _key: `option-${value.id}`,
        name: value.option_display_name,
        label: value.label,
      })),
    },
  };
}

export function toCategoryDocument(category: RestCategory): SyncedDocument {
  return {
    _id: categoryDocumentId(category.id),
    _type: "bigcommerceCategory",
    store: {
      entityId: category.id,
      title: category.name,
      slug: { _type: "slug", current: slugFromPath(category.custom_url.url) },
      descriptionHtml: category.description,
      parentEntityId: category.parent_id || null,
      isVisible: category.is_visible,
      isDeleted: false,
      imageUrl: category.image_url || null,
    },
  };
}

/**
 * Every document a product owns, as one unit.
 *
 * The sweep and the single-entity sync must not diverge here: both read the
 * same `include=variants` payload, and a variant that exists in one path but
 * not the other is a document an editor can reference and never see updated.
 */
export function productDocuments(product: RestProduct): SyncedDocument[] {
  return [
    toProductDocument(product),
    ...(product.variants ?? []).map(toVariantDocument),
  ];
}

// ---------------------------------------------------------------------------
// Mutations — rule 1 and rule 2, and nothing else
// ---------------------------------------------------------------------------

/**
 * `createIfNotExists` then `patch`, never `createOrReplace`.
 *
 * The create lands a bare `{_id, _type}` shell for an entity Sanity has not
 * seen; on a document that already exists it is a no-op and the editor-owned
 * siblings survive. The patch then sets `store` whole — replacing the object
 * at that one path, which is subtree-confined and has no missing-parent case.
 */
export function upsertMutations(document: SyncedDocument): Mutation[] {
  return [
    { createIfNotExists: { _id: document._id, _type: document._type } },
    { patch: { id: document._id, set: { store: document.store } } },
  ];
}

/**
 * Soft delete. The document, and every editor-owned field on it, stays.
 *
 * `setIfMissing` guards the case where the shell exists but `store` does not —
 * a stub created by the seed, for instance — which a bare dotted-path `set`
 * would fail on.
 */
export function softDeleteMutations(documentId: string): Mutation[] {
  return [
    {
      patch: {
        id: documentId,
        setIfMissing: { store: {} },
        set: { "store.isDeleted": true },
      },
    },
  ];
}

/**
 * Flags the live documents this run did not see.
 *
 * The full sweep uses it against the whole synced set; `syncProduct` uses it
 * against one product's variants. Both are the same comparison, and both must
 * be given ids that Sanity actually holds — a patch on a missing document fails
 * the entire transaction with "The document with the ID ... was not found".
 */
export function staleMutations(
  liveIds: string[],
  kept: Set<string>
): Mutation[] {
  return liveIds.filter((id) => !kept.has(id)).flatMap(softDeleteMutations);
}
