# @workspace/sanity-sync

The BigCommerce to Sanity catalog sync. A CLI today, a webhook route later, and the same code either way.

Nothing in `apps/web` imports this package. Run it from a terminal; the four functions the future route
needs are in `src/sync.ts` and already do the whole job, so wiring the route up is a transport and some
env, not a rewrite.

```
src/client.ts     Sanity write client, BigCommerce credentials and one catalog GET, from this package's own .env
src/upsert.ts     Deterministic ids, REST -> document transforms, the mutation builders
src/sync.ts       The four per-entity functions. Transport-agnostic: a CLI calls them today, a route will later
src/reconcile.ts  The sweep, and the CLI over both it and src/sync.ts. Dry run by default
src/schema.ts     The three document types
```

> **Run this after `pnpm seed:sanity`, never before.** The seed replaces the whole dataset. Anything the
> sync writes beforehand is gone the moment someone reseeds, and it goes quietly. No error, just an
> empty Products list and a sync that cheerfully reports success.

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

Verified against the live sandbox, not just in tests: writing a hand-typed `body` and `seo` onto
`bigcommerceProduct-183`, then running `--product 183 --write` twice and a full delete/restore cycle,
left both fields untouched and the synced `store` subtree byte-identical each time.

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
S="pnpm --filter @workspace/sanity-sync reconcile"

# The full sweep
$S                                          # dry run
$S -- --since 2026-08-01T00:00:00Z          # incremental, no soft-delete pass
$S -- --write                               # actually writes

# One entity, which is exactly what a webhook delivery does
$S -- --product 183                         # dry run
$S -- --product 183 --write
$S -- --product 183 --delete --write        # soft-delete, product and its variants
$S -- --category 36 --write
```

Dry run is the default everywhere. A package that ships dark shouldn't write unless you say so, and a
dry run prints the exact mutations a real run would send rather than a summary of them.

The single-entity flags exist so a developer can reproduce a webhook delivery from a terminal before the
receiver exists. `--product 183 --write` and a `store/product/updated` for 183 run the same code.

**Order matters: run this after `pnpm seed:sanity`, never before.** The Sanity seed replaces the whole
dataset, so anything the sync writes beforehand is gone the moment someone reseeds.

## The four functions the webhook route will call

`src/sync.ts` is the whole sync core, and it knows nothing about how it was invoked: no `Request`, no
`Response`, no `process.argv`. The CLI is a shell over it; the route in `docs/sync-design.md` will be a
different shell over the same four functions.

```ts
syncProduct(entityId, { write: true }); // store/product/created, store/product/updated
deleteProduct(entityId, { write: true }); // store/product/deleted
syncCategory(entityId, { write: true }); // store/category/created, store/category/updated
deleteCategory(entityId, { write: true }); // store/category/deleted
```

Each re-fetches the entity by id and writes current state, never a delta. That is what makes them
idempotent, and idempotence is not optional here: BigCommerce payloads are id-only, arrive out of order,
and duplicate. Re-running converges instead of corrupting, which is also why there is no deduplication
cache to operate.

Each returns a `SyncResult` of `{ entity, entityId, action, documentIds, mutations, written }`, so a CLI
and a route report the same thing. `action` is `upserted`, `softDeleted`, or `absent` when there was
nothing in BigCommerce and nothing in Sanity to flag.

Two behaviours worth knowing before you call them:

A 404 from BigCommerce converges on deleted rather than throwing. The flag is not sticky, because the
upsert writes `store` whole with `isDeleted: false`, so a transient 404 heals on the next run.

`syncProduct` also soft-deletes variants that Sanity holds and the product no longer lists. Since there
are no variant webhooks at all, a product event is the only signal a variant ever went away.

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
valid filter parameter(s)". Categories are always swept whole. Cheap enough: 10 rows in one page.

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
   sweep that already works, and it is not built. It is also not much work. The four functions it needs
   are done; what's left is a `POST` handler, six `POST /v3/hooks` calls, and four env names that
   `apps/web` does not have yet. All four are listed in that doc.
