import { defineArrayMember, defineField, defineType } from "sanity";

/**
 * The three synced document types.
 *
 * Registered in `apps/studio/schemaTypes/index.ts`, and only once the catalog
 * had been backfilled (ROB-2609/ROB-2610). Registering them before the sync
 * runs gives editors a permanently blank "Products" list, which is worse than
 * the types being absent — an empty list reads as "the integration is broken",
 * an absent one reads as "not yet".
 *
 * Every field under `store` is `readOnly`: it is machine-owned and the reconcile
 * sweep overwrites it wholesale. Editor-owned fields are siblings of `store`,
 * never inside it — that separation is what makes the subtree patch in
 * `upsert.ts` safe. `body` is the only sibling there is — an earlier plan to
 * attach `hero`, `modules` and `seo` at the flip was never carried out — and it
 * is the one the upsert test asserts survives a sync.
 */

const syncedSlug = defineField({
  name: "slug",
  type: "slug",
  title: "Slug",
  description: "Derived from the BigCommerce storefront path.",
  readOnly: true,
});

const isDeleted = defineField({
  name: "isDeleted",
  type: "boolean",
  title: "Deleted in BigCommerce",
  description:
    "Set by the reconcile sweep when the entity disappears from the catalog. The document is never removed — editorial content on it would go with it.",
  initialValue: false,
  readOnly: true,
});

/**
 * Editor-owned rich text. The sync never touches anything outside `store`.
 *
 * The members are the studio's own objects, referenced by name — this package
 * cannot import from the studio, and a registered type only needs its name
 * here. They mirror what the fork's product body allowed, so the
 * hotspot renderer keeps working across the flip.
 */
const editorialBody = defineField({
  name: "body",
  type: "array",
  title: "Body",
  of: [
    defineArrayMember({ type: "block" }),
    defineArrayMember({ type: "image" }),
    defineArrayMember({ type: "accordion" }),
    defineArrayMember({ type: "callout" }),
    defineArrayMember({
      type: "imageWithProductHotspots",
      title: "Image with hotspots",
    }),
    defineArrayMember({ type: "instagram" }),
  ],
});

export const bigcommerceProduct = defineType({
  name: "bigcommerceProduct",
  title: "Product",
  type: "document",
  description:
    "A BigCommerce product. `store` is synced; every sibling is editor-owned.",
  fields: [
    defineField({
      name: "store",
      type: "object",
      title: "BigCommerce",
      readOnly: true,
      options: { collapsible: true, collapsed: false },
      fields: [
        defineField({ name: "entityId", type: "number", readOnly: true }),
        defineField({ name: "title", type: "string", readOnly: true }),
        syncedSlug,
        defineField({ name: "sku", type: "string", readOnly: true }),
        defineField({
          name: "descriptionHtml",
          type: "text",
          readOnly: true,
        }),
        defineField({ name: "price", type: "number", readOnly: true }),
        defineField({ name: "salePrice", type: "number", readOnly: true }),
        defineField({ name: "isVisible", type: "boolean", readOnly: true }),
        isDeleted,
        defineField({ name: "brandId", type: "number", readOnly: true }),
        defineField({
          name: "categoryEntityIds",
          type: "array",
          of: [defineArrayMember({ type: "number" })],
          readOnly: true,
        }),
        defineField({
          // Plain ids, not references: BigCommerce webhook payloads are
          // unordered and can duplicate, so a reference array would need
          // reconciling on every run for no read-side benefit.
          name: "variantEntityIds",
          type: "array",
          of: [defineArrayMember({ type: "number" })],
          readOnly: true,
        }),
        defineField({
          name: "optionNames",
          type: "array",
          of: [defineArrayMember({ type: "string" })],
          readOnly: true,
        }),
        defineField({ name: "previewImageUrl", type: "url", readOnly: true }),
        defineField({ name: "createdAt", type: "string", readOnly: true }),
        defineField({ name: "modifiedAt", type: "string", readOnly: true }),
      ],
    }),
    editorialBody,
  ],
  preview: {
    select: { title: "store.title", subtitle: "store.sku" },
  },
});

export const bigcommerceProductVariant = defineType({
  name: "bigcommerceProductVariant",
  title: "Product variant",
  type: "document",
  description:
    "A BigCommerce variant. Synced only by the reconcile sweep — BigCommerce has no CRUD webhooks for variants.",
  fields: [
    defineField({
      name: "store",
      type: "object",
      title: "BigCommerce",
      readOnly: true,
      options: { collapsible: true, collapsed: false },
      fields: [
        defineField({ name: "entityId", type: "number", readOnly: true }),
        defineField({
          name: "productEntityId",
          type: "number",
          readOnly: true,
        }),
        defineField({ name: "title", type: "string", readOnly: true }),
        defineField({ name: "sku", type: "string", readOnly: true }),
        defineField({ name: "price", type: "number", readOnly: true }),
        defineField({ name: "salePrice", type: "number", readOnly: true }),
        defineField({
          // Admin REST, not the Storefront API: `availableToSell` reads
          // undefined on this store, which is a store setting rather than
          // missing data.
          name: "inventoryLevel",
          type: "number",
          readOnly: true,
        }),
        defineField({
          name: "purchasingDisabled",
          type: "boolean",
          readOnly: true,
        }),
        defineField({ name: "imageUrl", type: "url", readOnly: true }),
        isDeleted,
        defineField({
          name: "optionValues",
          type: "array",
          readOnly: true,
          of: [
            defineArrayMember({
              type: "object",
              fields: [
                defineField({ name: "name", type: "string" }),
                defineField({ name: "label", type: "string" }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
  preview: {
    select: { title: "store.title", subtitle: "store.sku" },
  },
});

export const bigcommerceCategory = defineType({
  name: "bigcommerceCategory",
  title: "Category",
  type: "document",
  description:
    "A BigCommerce category. Rendered at /collections/{path}; the slug beside it is a flattened identifier, not a URL.",
  fields: [
    defineField({
      name: "store",
      type: "object",
      title: "BigCommerce",
      readOnly: true,
      options: { collapsible: true, collapsed: false },
      fields: [
        defineField({ name: "entityId", type: "number", readOnly: true }),
        defineField({ name: "title", type: "string", readOnly: true }),
        syncedSlug,
        defineField({
          // The two are deliberately both here. `slug` names the document —
          // `seed-refs.ts` and `verify.ts` match on it and neither tolerates a
          // `/` — while `path` is the only one that survives being used as a
          // URL. Every link surface projects this one.
          name: "path",
          type: "string",
          title: "Storefront path",
          description:
            "Every segment below /collections, joined with `/` — `tops/henleys`. Derived from the BigCommerce storefront path.",
          readOnly: true,
        }),
        defineField({ name: "descriptionHtml", type: "text", readOnly: true }),
        defineField({ name: "parentEntityId", type: "number", readOnly: true }),
        defineField({ name: "isVisible", type: "boolean", readOnly: true }),
        isDeleted,
        defineField({ name: "imageUrl", type: "url", readOnly: true }),
      ],
    }),
    editorialBody,
  ],
  preview: {
    select: { title: "store.title", subtitle: "store.slug.current" },
  },
});

/** Spread into `apps/studio/schemaTypes/index.ts`. */
export const syncSchemaTypes = [
  bigcommerceProduct,
  bigcommerceProductVariant,
  bigcommerceCategory,
];
