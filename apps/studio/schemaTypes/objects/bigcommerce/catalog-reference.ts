/**
 * The options every reference into the synced BigCommerce catalog uses.
 *
 * Both rules exist because these documents are written by
 * `pnpm sync:bigcommerce` and never by hand.
 *
 * `disableNew` — the picker's "Create new" button would mint a
 * `bigcommerceProduct` at an id Sanity chose rather than the deterministic
 * `bigcommerceProduct-{entityId}` the sync writes to. The next reconcile sweep
 * would neither update nor delete it, so it would sit in the catalog list
 * forever looking like a product and resolving to nothing on the storefront.
 *
 * `filter` — the sync soft-deletes. A product that leaves BigCommerce gets
 * `store.isDeleted: true` and keeps its document, so references to it still
 * resolve instead of dangling. Useful, and it means the picker goes on
 * offering it: without this filter an editor can newly pick a product that no
 * longer exists in the store. One already picked before the delete keeps
 * working and shows a "Deleted in BigCommerce" badge instead — see
 * `withStoreThumbnails` in `schemaTypes/synced-previews.ts`.
 *
 * Safe on the mixed target list in `customUrl.internal`, which spans editorial
 * documents too: `store.isDeleted` is null on a `page`, and GROQ evaluates
 * `null != true` as true, so they all still list.
 */
export const catalogReferenceOptions = {
  disableNew: true,
  filter: "store.isDeleted != true",
};
