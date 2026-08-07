# The webhook receiver, designed and not built

`packages/sanity-sync` ships the write path and the reconcile sweep. It does not ship
`/api/bigcommerce/webhook`, and that is on purpose. A live endpoint that writes nothing rots without
anyone noticing: the hook goes green in the BigCommerce dashboard, the 200s come back, and the dataset
stays empty until someone thinks to check. Building the transport before the write logic is proven gets
you exactly that.

So the write logic went first. This file is what the receiver should look like when someone wires it up.

## Webhooks are not enough on their own

The reconcile sweep is the primary mechanism. Webhooks, if they ever land, shave latency off it. Three
gaps in BigCommerce's event coverage make that ordering forced rather than a preference:

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
anyone who can reach your endpoint can compute a valid one. It is a deduplication key and nothing more.
Verifying it proves the body wasn't mangled in transit; it proves nothing about who sent it.

Authentication lives somewhere else: the optional `headers` object you set when you create the hook.

```jsonc
// POST /v3/hooks
{
  "scope": "store/product/updated",
  "destination": "https://example.com/api/bigcommerce/webhook",
  "is_active": true,
  "headers": {
    // Header name <= 64 chars, value <= 8KB.
    "x-sync-secret": "<generated once, stored in env on both ends>"
  }
}
```

The receiver compares that header against its own env var with a timing-safe comparison
(`crypto.timingSafeEqual`) and 401s on a mismatch. Use `hash` only to skip a payload you have already
processed.

## Sketch of the receiver

```
POST /api/bigcommerce/webhook
  1. Compare the shared-secret header. Mismatch -> 401.
  2. Look up `hash` in a short-lived store (Redis, TTL ~1h). Seen -> 200, drop it.
  3. Return 200 immediately. Do the work off the request.
  4. Off-request: re-fetch the entity by id from the Admin REST catalog,
     build the document, issue upsertMutations() from @workspace/sanity-sync/upsert.
```

Step 3 matters more than it looks. BigCommerce retries at 60, 180, 300, 600, 900, 1800, 3600, 7200,
21600, 50400 and 86400 seconds, and after roughly 48 hours of cumulative failure it deactivates the hook
and emails someone. Anything slower than the ACK timeout starts that clock.

Step 4 is a re-fetch, never a delta. The payload gives you `{type, id}` and nothing else, events arrive
out of order, and duplicates are normal. Read the current state and write that.

Two operational notes that follow from the retry policy. Poll `GET /v3/hooks` for `is_active` and re-arm
anything that got switched off, because a deactivated hook fails silently forever. And every event costs
a follow-up Admin REST call against the same quota the sweep uses, so a bulk catalog import can produce
a webhook storm that starves the sweep. Coalescing by entity id over a short window is the usual answer.

## Deletes

The sweep soft-deletes by comparing what BigCommerce returns against what Sanity holds
(`store.isDeleted != true`), then flagging the difference. `store/product/deleted` can flag the same
document sooner, but it can't replace that comparison. A delete that arrives while the endpoint is down,
or during the 48-hour window before a dead hook gets noticed, is only ever caught by the sweep.

Whatever the trigger, the mutation is the same one: `softDeleteMutations(id)`. Never `client.delete()`.
The document carries editor-owned `body`, `hero`, `modules` and `seo` alongside the synced `store`
subtree, and removing it takes all of that with it.

## Wiring it on

The receiver is the last step, not the first. In order:

1. Register `syncSchemaTypes` from `@workspace/sanity-sync/schema` in `apps/studio/schemaTypes/index.ts`.
2. Run the sweep for real once (`--write`) and check the Studio.
3. Put the sweep on a schedule (cron, Vercel Cron, whatever).
4. Only then add the receiver, and only as a latency optimisation over a sweep that already works.

## Sources

- Webhook events reference: https://developer.bigcommerce.com/docs/integrations/webhooks/events
- Webhook payload and retry policy: https://developer.bigcommerce.com/docs/integrations/webhooks
- `POST /v3/hooks`: https://developer.bigcommerce.com/docs/rest-management/webhooks
- Local notes: `docs/research/04-bigcommerce-api-semantics.md`, "Webhooks (for BC → Sanity sync)"
