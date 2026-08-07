# @workspace/sanity-sync

The BigCommerce to Sanity catalog sync. Built, tested, and invoked by nothing.

Nothing in `apps/web` or `apps/studio` imports this package, and the schema types it exports are not
registered in the Studio. That's the intended state for v1. Turning the sync on later should be wiring,
not building.

```
src/client.ts     Sanity write client + BigCommerce credentials, from this package's own .env
src/upsert.ts     Deterministic ids, REST -> document transforms, the two mutation builders
src/reconcile.ts  The sweep. Pages the Admin REST catalog and upserts. Dry run by default
src/schema.ts     The three document types, exported and unregistered
```

## The two rules

Neither is written down anywhere in the fork base, and both cost real editor data if you rediscover them
after the sync has been running.

**Patch the `store` subtree. Never replace the document.** `body`, `hero`, `modules` and `seo` sit
alongside `store` on the same document and belong to editors. `upsertMutations()` emits
`createIfNotExists` followed by a patch that sets `store` and only `store`. The throwaway script at
`apps/studio/scripts/sync-bigcommerce-sanity.ts` used `createOrReplace` per document, which wipes every
one of those siblings on every run.

**Soft-delete with a flag. Never remove the document.** `softDeleteMutations()` sets
`store.isDeleted = true`. A hard delete takes the editorial content with it, which is precisely why the
fork base needed `cleanup-stale-sanity.ts` as a separate manual sweep.

`src/upsert.test.ts` asserts both: that `createOrReplace` never appears in an emitted mutation, that no
`set` key falls outside `store`, and that a delete is a patch rather than a removal.

## Deterministic ids

```
bigcommerceProduct-{entityId}
bigcommerceProductVariant-{entityId}
bigcommerceCategory-{entityId}
```

This is the part that must never be cut. Keying on `entityId` is what lets a stub document created today
join its synced document later without a content migration. Anything else means writing one.

Verified against the sandbox: Storefront GraphQL `Variant.entityId` equals Admin REST `variant.id`
(167, 173, 177 on product 180), not `sku_id`. Keying variants on `sku_id` would look fine right up until
the join.

## Running it

Copy `.env.example` to `.env` and fill it in. The package reads that file and no other. It deliberately
does not fall back to `apps/web/.env.local`, which is what `cleanup-stale-sanity.ts` did and what broke
whenever the web app's env moved.

```bash
pnpm --filter @workspace/sanity-sync reconcile                  # dry run
pnpm --filter @workspace/sanity-sync reconcile -- --since 2026-08-01T00:00:00Z
pnpm --filter @workspace/sanity-sync reconcile -- --write       # actually writes
```

Dry run is the default. A package that ships dark shouldn't write unless you say so.

**Order matters: run this after `pnpm seed:sanity`, never before.** The Sanity seed replaces the whole
dataset, so anything the sweep writes beforehand is gone the moment someone reseeds.

## What the sweep does

It pages `GET /v3/catalog/products?date_modified:min=` with `include=variants,options,images`, then pages
`/v3/catalog/categories`, and builds upserts from both.

The sweep is the primary mechanism, not a fallback. BigCommerce has no CRUD webhooks for variants, none
for brands, and most product image changes fire no update event. Payloads are id-only, unordered, and can
duplicate. See `docs/sync-design.md`.

Three things about the REST API the code accounts for, all confirmed against store `8jbhprizry`:

A catalog page maxes out at 50, but asking for `include=options` or `include=modifiers` silently drops it
to 10. Request `?limit=50&include=variants,options,images` and the response comes back `per_page: 10`
with no error. The sweep requests the right size up front and drives its loop off the `total_pages` the
server reports, so a silent re-cap costs extra round trips and never truncates.

`/v3/catalog/categories` has no date filter. It answers 422, "The filter(s): date_modified:min are not
valid filter parameter(s)". Categories are always swept whole. Cheap enough: 11 rows in one page.

`--since` skips the soft-delete pass. An incremental sweep only sees what changed, so every unmodified
entity would look deleted. Only a full sweep compares the catalog against `store.isDeleted != true` in
Sanity and flags the difference.

## Turning it on

1. Register `syncSchemaTypes` from `@workspace/sanity-sync/schema` in `apps/studio/schemaTypes/index.ts`.
   Not before: registered types with no documents behind them give editors a permanently blank Products
   list, which reads as broken. Absent reads as not yet.
2. Run the sweep with `--write` once and look at the Studio.
3. Schedule it.
4. Optionally add the webhook receiver, per `docs/sync-design.md`. It's a latency optimisation over a
   sweep that already works, and it is not built.
