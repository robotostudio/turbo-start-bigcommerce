# The webhook receiver, designed and not built

> **Built, 2026-08-11, and three things below are now wrong.** The receiver is
> `apps/web/src/app/api/bigcommerce/webhook/route.ts`. Read this file for the
> shape of the transport, not for these three decisions:
>
> 1. **Variants do have CRUD webhooks.** `store/sku/created`, `store/sku/updated`
>    and `store/sku/deleted` all fire. A variant price change fires
>    `store/sku/updated` and *nothing else* — no `store/product/updated` — so the
>    sku hooks are required, not a latency nicety. Measured, twice, in
>    `docs/research/09-webhook-payloads.md`. Their `data.id` is the `sku_id`, and
>    the ids the receiver needs are `data.sku.product_id` and
>    `data.sku.variant_id`. (ROB-2613)
> 2. **There is no scheduled sweep.** ROB-2608 ruled its cron out. The sweep
>    still exists as a one-off backfill you run by hand; nothing runs it for you.
> 3. **The receiver does not use `after()`, and cannot.** `after()` answers 200
>    before the work happens, which is only survivable "because the sweep
>    exists" — and it does not. The sync runs inline and a failure answers 500,
>    so BigCommerce's retry ladder repairs it. That ladder is now the only repair
>    mechanism in the design. (ROB-2611)
>
> Also measured and not covered below: image changes made through the
> `/v3/catalog/products/{id}/images` endpoint fire no event at all, on any scope.
> The storefront reads product images live from BigCommerce and treats the synced
> `store.previewImageUrl` as the fallback. (ROB-2614)

`packages/sanity-sync` ships the write path, the reconcile sweep, and the four functions a webhook
receiver would call. It does not ship the receiver, and that is on purpose. A live endpoint that writes
nothing rots without anyone noticing: the hook goes green in the BigCommerce dashboard, the 200s come
back, and the dataset stays empty until someone thinks to check.

So the write logic went first. Everything a receiver needs to do already exists and is runnable from a
terminal today:

```ts
import {
  deleteCategory,
  deleteProduct,
  syncCategory,
  syncProduct,
} from "@workspace/sanity-sync/sync";
```

Each takes a BigCommerce entity id, re-fetches that entity from the Admin REST catalog, and writes the
current state. Nothing in them knows what a `Request` is. This file is what the transport around them
should look like when someone wires it up.

## Webhooks are not enough on their own

The reconcile sweep is the primary mechanism. Webhooks shave latency off it. Three gaps in BigCommerce's
event coverage make that ordering forced rather than a preference:

Variants have no CRUD webhooks at all. There is `store/product/variant/metafield/*` and nothing else, so
a price or stock change on a variant reaches you only through `store/product/updated` or `store/sku/*`,
and only if the store happens to fire one.

Brands have no CRUD webhooks either. A brand rename is invisible until you poll.

Product images mostly don't fire an update. BigCommerce's own docs say it plainly: changing the current
thumbnail, uploading an additional image and setting it as the thumbnail, or deleting every thumbnail
generates no update event.

On top of that, payloads carry no state and no order, and the same event can arrive twice. A sync built
only on webhooks is missing entire classes of change, not just a few seconds of freshness.

## The `hash` field is not a signature

This is the one detail worth writing down before anyone reaches for it. A payload looks like:

```json
{
  "scope": "store/product/updated",
  "store_id": "1025646",
  "data": { "type": "product", "id": 250 },
  "hash": "3f9ea420af83450d7ef9f78b08c8af25b2213637",
  "created_at": 1561479335,
  "producer": "stores/{store_hash}"
}
```

`hash` is the SHA-1 of the JSON-encoded payload data, **unkeyed**. No shared secret goes into it, so
anyone who can reach your endpoint can compute a valid one. Verifying it proves the body wasn't mangled
in transit; it proves nothing about who sent it. Treating it as authentication gives you an open write
endpoint into your CMS.

Authentication lives somewhere else: the optional `headers` object you set when you create the hook.
BigCommerce sends those headers on every delivery, and nobody else knows them.

## The receiver

**Path:** `apps/web/src/app/api/bigcommerce/webhook/route.ts`, one `POST` handler.

Under `bigcommerce/` rather than at the top level because it is the first of a family. `POST
/api/bigcommerce/webhook` leaves room for the customer and order hooks that follow, without any of them
having to be renamed.

```ts
// Not edge. `crypto.timingSafeEqual` and the Admin REST token both need Node.
export const runtime = "nodejs";
```

### 1. Authenticate on the header, in constant time

```ts
const presented = request.headers.get("x-bigcommerce-webhook-secret") ?? "";
const expected = process.env.BIGCOMMERCE_WEBHOOK_SECRET ?? "";
const a = Buffer.from(presented);
const b = Buffer.from(expected);
// timingSafeEqual throws on a length mismatch, so the length has to be checked
// first. That leaks how long the secret is, which is a leak worth taking; a
// byte-at-a-time comparison of the contents is not.
const authorised =
  expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
if (!authorised) {
  return new Response("Unauthorized", { status: 401 });
}
```

### 2. Map `scope` to one of the four functions

The payload gives you a scope string and `data.id`. That is the whole routing table:

| `scope`                    | call                        |
| -------------------------- | --------------------------- |
| `store/product/created`    | `syncProduct(data.id)`      |
| `store/product/updated`    | `syncProduct(data.id)`      |
| `store/product/deleted`    | `deleteProduct(data.id)`    |
| `store/category/created`   | `syncCategory(data.id)`     |
| `store/category/updated`   | `syncCategory(data.id)`     |
| `store/category/deleted`   | `deleteCategory(data.id)`   |

Created and updated share a handler deliberately. The functions re-fetch and write the current state, so
there is nothing for a create to do that an update doesn't already do. Anything not in the table is a
scope nobody registered: log it and return 200, because a 4xx counts as a failure against the retry
policy below and will eventually deactivate the hook.

Every call needs `{ write: true }`. Dry run is the package-wide default, which is right for a CLI and
wrong for a receiver.

### 3. Answer immediately, work afterwards

BigCommerce retries at 60, 180, 300, 600, 900, 1800, 3600, 7200, 21600, 50400 and 86400 seconds, and
after roughly 48 hours of cumulative failure it deactivates the hook and emails someone. A sync is two
or three round trips to two different APIs; doing that inside the response starts that clock the first
time BigCommerce has a slow minute.

Next 16 has this built in. No queue, no new dependency:

```ts
import { after } from "next/server";

after(async () => {
  const result = await syncProduct(data.id, { write: true });
  logger.info(`${result.entity} ${result.entityId}: ${result.action}`);
});

return new Response(null, { status: 200 });
```

`after` runs the callback once the response has been sent. Verified present in the installed Next
(16.1.3): `next/server.d.ts` re-exports it from `next/dist/server/after`.

The one thing `after` does not give you is a retry. If the sync throws in there, BigCommerce has already
been told 200 and will not send that event again. That is survivable precisely because the sweep exists:
catch it, log loudly, and let the next sweep pick it up. It stops being survivable the day someone
deletes the sweep.

### 4. An id that will not resolve

Two different cases, and neither is an error.

**Gone from BigCommerce.** `syncProduct` gets a 404 from `/v3/catalog/products/{id}` and falls through to
`deleteProduct`, converging on deleted. An `updated` that lost a race with a `deleted`, or a `deleted`
that never arrived, both end up in the same state. A transient 404 costs nothing either: the flag is not
sticky, because `toProductDocument` writes `isDeleted: false` and the upsert sets the whole `store`
object, so the next sync or sweep clears it with no intervention.

**Not in Sanity.** `deleteProduct` and `deleteCategory` only ever patch ids a GROQ query just returned.
This is not defensive coding. A patch against a document Sanity does not hold fails the *entire*
transaction with `The document with the ID "..." was not found`, so one delete for an entity that was
never synced would otherwise take the whole batch down with it. Nothing to flag returns
`action: "absent"` with zero mutations.

That same `store.isDeleted != true` filter is what makes a re-delivery free. Confirmed against the
sandbox: the second identical delete reports `absent, 0 document(s), 0 mutation(s)`.

### Why the deterministic ids earn their keep — measured, not argued

Deleting a synced document that page-builder content points at is survivable, and the reason is the
combination of a weak reference and an id derived from `entityId`. Verified end to end against the
sandbox on 2026-08-08, not reasoned about:

1. `bigcommerceProduct-183` was deleted from Sanity while the homepage's `layersShowcase` block
   referenced it. Sanity allowed it without complaint — the reference is weak, so it is not
   delete-protected. The stored `_ref` stayed on the block; only the target went.
2. The storefront degraded rather than breaking: the block kept its heading and description and rendered
   empty collage tiles, because `product->store.slug.current` resolved to null and the component's
   fetch is gated on that handle. No exception, no blank page.
3. In the Studio the block row turned red and the field read "Document unavailable".
4. `pnpm sync:bigcommerce` restored it with **no editor action at all**. The sweep rewrote
   `bigcommerceProduct-183` — the same id, because the id is a function of the BigCommerce entity rather
   than of when the document was made — and the dangling `_ref` resolved again to "Aster Denim Coach
   Jacket".

A random-uuid id scheme fails step 4: the restored document would carry a new id, every reference to it
would stay dangling, and someone would have to re-pick each one by hand. That is the argument for
`bigcommerceProduct-{entityId}`, and it is why the ids must never become random, even for documents the
sync creates fresh.

The one thing this does not do is *tell* anyone. Step 2 is silent on the storefront and step 3 does not
name which product went missing, which is why the block previews now fall back to `Missing product:
{_ref}` instead of an empty row.

### What deduplication?

Nothing here needs a `hash` cache. Every function re-fetches and writes current state, so a duplicate
delivery converges instead of corrupting; two `syncProduct(183)` calls in a row produce byte-identical
documents. A Redis instance to remember hashes for an hour would be a service to operate, a failure mode
to handle, and a bill, in exchange for saving one Admin REST call.

## Registering the hooks

Six hooks, one `POST /v3/hooks` each (the endpoint takes one scope at a time). Requires an Admin API
token with the `Information & Settings` scope, the same one `packages/sanity-sync/.env` already holds
as `BIGCOMMERCE_ADMIN_TOKEN`.

```jsonc
// POST https://api.bigcommerce.com/stores/{store_hash}/v3/hooks
// X-Auth-Token: {admin token}
{
  "scope": "store/product/updated",
  "destination": "https://your-app.example.com/api/bigcommerce/webhook",
  "is_active": true,
  "headers": {
    // Header name <= 64 chars, value <= 8KB. This is the only authentication
    // BigCommerce offers. Generate once (`openssl rand -hex 32`), store it as
    // BIGCOMMERCE_WEBHOOK_SECRET on the app, never in the repo.
    "x-bigcommerce-webhook-secret": "<generated once, stored in env on both ends>"
  }
}
```

Repeat for `store/product/created`, `store/product/deleted`, `store/category/created`,
`store/category/updated`, `store/category/deleted`.

`destination` must be publicly reachable HTTPS, so local development needs a tunnel; BigCommerce will not
call `localhost`.

Two operational notes that follow from the retry policy. Poll `GET /v3/hooks` for `is_active` and re-arm
anything that got switched off, because a deactivated hook fails silently forever. And every event costs
a follow-up Admin REST call against the same quota the sweep uses, so a bulk catalog import can produce a
webhook storm that starves the sweep. Coalescing by entity id over a short window is the usual answer,
and it is the upgrade path flagged in `src/sync.ts`.

### The sku hooks, if variant latency ever matters

`store/sku/created`, `store/sku/updated`, `store/sku/deleted` and `store/sku/inventory/updated` are the
closest BigCommerce gets to a variant event. They would map to `syncProduct` on the *parent product* id,
since the sync writes a product and its variants as one unit.

They are left out of the block above on purpose: this store has never fired one, so the payload's shape
is unverified, and a guessed field access in a block people copy-paste is worse than an absent one.
Register one, capture a real delivery, then add it.

## Deletes

The sweep soft-deletes by comparing what BigCommerce returns against what Sanity holds
(`store.isDeleted != true`), then flagging the difference. `store/product/deleted` flags the same
documents sooner, but it can't replace that comparison. A delete that arrives while the endpoint is down,
or during the 48-hour window before a dead hook gets noticed, is only ever caught by the sweep.

Whatever the trigger, the mutation is the same one: `softDeleteMutations(id)`. Never `client.delete()`.
The document carries editor-owned `body`, `hero`, `modules` and `seo` alongside the synced `store`
subtree, and removing it takes all of that with it. `deleteProduct` extends this to the product's
variants, because deleting a product otherwise leaves its variant documents live and referenceable.

## What the route needs that does not exist yet

`packages/sanity-sync/src/client.ts` reads its own env and deliberately does not reach into any app's.
Four of the names it wants are not in `apps/web`:

| name                          | state in `apps/web`                                                     |
| ----------------------------- | ----------------------------------------------------------------------- |
| `SANITY_API_WRITE_TOKEN`      | already there, same name                                                 |
| `BIGCOMMERCE_STORE_HASH`      | already there, same name                                                 |
| `SANITY_PROJECT_ID`           | missing (the app has `NEXT_PUBLIC_SANITY_PROJECT_ID`)                    |
| `SANITY_DATASET`              | missing (the app has `NEXT_PUBLIC_SANITY_DATASET`)                       |
| `BIGCOMMERCE_ADMIN_TOKEN`     | missing (the app has `BIGCOMMERCE_STOREFRONT_TOKEN`, a different token)   |
| `BIGCOMMERCE_WEBHOOK_SECRET`  | missing, new, and read by nothing but the receiver                        |

`BIGCOMMERCE_STOREFRONT_TOKEN` is not a substitute for the admin token. The sweep and the sync both read
`/v3/catalog`, which needs Admin REST: a storefront token cannot see invisible products and cannot filter
on `date_modified`.

Wiring the receiver therefore means adding those four to `packages/env/src/server.ts` and
`apps/web/.env.example` as well as writing the handler. Whoever picks that ticket up should expect to
touch three packages, not one.

## Wiring it on

The receiver is the last step, not the first. In order:

1. Register `syncSchemaTypes` from `@workspace/sanity-sync/schema` in `apps/studio/schemaTypes/index.ts`.
2. Run the sweep for real once (`--write`) and check the Studio. Always after `pnpm seed:sanity`, never
   before; the seed replaces the dataset.
3. Put the sweep on a schedule (cron, Vercel Cron, whatever).
4. Only then add the receiver, and only as a latency optimisation over a sweep that already works.

## Sources

- Webhook events reference: https://developer.bigcommerce.com/docs/integrations/webhooks/events
- Webhook payload and retry policy: https://developer.bigcommerce.com/docs/integrations/webhooks
- `POST /v3/hooks`: https://developer.bigcommerce.com/docs/rest-management/webhooks
- Local notes: `docs/research/04-bigcommerce-api-semantics.md`, "Webhooks (for BC → Sanity sync)"
