# 09 — Real BigCommerce webhook payloads

Empirical capture, 2026-08-11, against the live store `8jbhprizry`. Every payload below was
received by a throwaway logging stub over a cloudflared tunnel. Nothing here is inferred from
documentation. Where a question could not be answered, that is stated as such rather than
filled in with a plausible guess.

Ticket: ROB-2612. Parent map: ROB-2608.

## The rig

- Stub route: `apps/web/src/app/api/bigcommerce/webhook/route.ts`, `runtime = "nodejs"`. Logs the
  raw body text, every header, and a timestamp to a file, then returns 200. No auth check, no
  Sanity write.
- Dev server: `pnpm exec next dev -p 3000` from `apps/web`.
- Tunnel: `cloudflared tunnel --url http://localhost:3000`.
- Nine hooks registered via `POST /v3/hooks`, each carrying
  `headers: {"x-bigcommerce-webhook-secret": "<BIGCOMMERCE_WEBHOOK_SECRET from apps/web/.env.local>"}`:
  `store/product/{created,updated,deleted}`, `store/sku/{created,updated,deleted}`,
  `store/category/updated`, `store/option/updated`, `store/modifier/updated`.
  All nine confirmed `is_active: true` before any experiment ran.
- Test subject: product `180` (Ashcroft Linen-Cotton Shirt), variant `167`
  (`sku_id` 145, `sku` `TS-P3-FAD-XS`). Chosen because `variant.id` (167) and `sku_id` (145) are
  different numbers, so a payload cannot match both by accident.

### Method

Every experiment was: write a delimiter into the log, make **exactly one** Admin REST mutation,
then poll the log until it had been unchanged for **60 seconds** before starting the next one.
No two mutations ever shared an observation window. "Nothing fired" below always means "nothing
arrived in a 60-second quiet window", and the window length is stated per experiment.

All mutations were made with Admin REST `PUT`/`POST`/`DELETE`. Original values were captured with
`GET` before any change and restored afterwards; restores were run as their own marked actions so
their deliveries could not be mistaken for experiment results. See "Store restored" at the end.

## The envelope

Every delivery, regardless of scope, has the same five top-level keys. Verbatim:

```json
{
  "producer": "stores/8jbhprizry",
  "hash": "64d346b71e4c02453da81c5d97cec8063a6e7a4d",
  "created_at": 1786447828,
  "store_id": "1003502318",
  "scope": "store/product/updated",
  "data": { "type": "product", "id": 180 }
}
```

- `producer` — string, `stores/{store_hash}`.
- `hash` — string, 40 hex chars. Equal to the `webhook-id` request header on the same delivery.
- `created_at` — integer, Unix seconds. This is when BigCommerce *created* the event, not when it
  delivered it. In the captures below it ran 3–4 seconds behind the request timestamp.
- `store_id` — string, and it is **not** the store hash. Two different identifiers.
- `scope` — string, matches the registered hook scope exactly.
- `data` — object. Shape varies by scope. `data.type` is a short string, never the full scope.

Only `data` changes between scopes. Everything else is fixed.

## 1. `store/product/updated` — full raw payload

Action: `PUT /v3/catalog/products/180` with `{"warranty":"ROB-2612 probe"}`. One delivery, 4 seconds
after the request. 60-second quiet window, nothing else arrived.

```json
{"producer":"stores/8jbhprizry","hash":"64d346b71e4c02453da81c5d97cec8063a6e7a4d","created_at":1786447828,"store_id":"1003502318","scope":"store/product/updated","data":{"type":"product","id":180}}
```

That is the entire body, 197 bytes. `data` carries two keys and no more:

- `data.type` — `"product"`
- `data.id` — `180`, the product id

**No changed-field list, no timestamp of the edit, no before/after, no product data at all.** A
receiver learns only that product 180 changed. It has to re-fetch the product from Admin REST to
find out what changed, which is what `packages/sanity-sync` already does.

## 2. `store/sku/updated` — full raw payload, and which id it carries

This is the decisive capture of the ticket.

Action: `PUT /v3/catalog/products/180/variants/167` with `{"price":91}`. One delivery, 3 seconds
after the request.

```json
{"producer":"stores/8jbhprizry","hash":"14cd73eb75a18497d869470ae6f6e62540be8d9a","created_at":1786447917,"store_id":"1003502318","scope":"store/sku/updated","data":{"type":"sku","id":145,"sku":{"product_id":180,"variant_id":167}}}
```

Repeated on the restore edit (`{"price":89}`), byte-identical apart from `hash` and `created_at`:

```json
{"producer":"stores/8jbhprizry","hash":"809cfab105c23e3a3b8886361b5688bf512f5cc9","created_at":1786448130,"store_id":"1003502318","scope":"store/sku/updated","data":{"type":"sku","id":145,"sku":{"product_id":180,"variant_id":167}}}
```

### The answer: it carries all three, and the top-level one is the wrong one

`data` has a nested `sku` object that the product payload does not have. The raw field names are
`id`, `sku.product_id` and `sku.variant_id` — not `sku_id`, and not `variant.id`.

Side-by-side against `GET /v3/catalog/products/180/variants/167` on the same variant:

| Payload field | Value | Admin REST field it equals |
| --- | --- | --- |
| `data.id` | `145` | `variant.sku_id` |
| `data.sku.variant_id` | `167` | `variant.id` |
| `data.sku.product_id` | `180` | `variant.product_id` |

**`data.id` is `sku_id`. It is the wrong id for Sanity and it is the field a receiver reaches for
first.** Sanity variant documents live at `bigcommerceProductVariant-{variant.id}`, so the id the
receiver needs is `data.sku.variant_id`, buried one level down and named differently from the
top-level `id` that every other scope uses.

This is exactly the failure `packages/sanity-sync/README.md:54` predicted. A receiver that follows
the shape of the product payload — read `data.id`, that's the entity — writes
`bigcommerceProductVariant-145` for a variant whose document is `bigcommerceProductVariant-167`.
Both ids are real numbers on the same variant, so nothing throws. The write succeeds, the document
appears, and it never joins. It fails silently, which is the worst kind.

**For ROB-2616: read `data.sku.variant_id`, never `data.id`, on `store/sku/*`.**

The parent product id is present as `data.sku.product_id`, so routing a sku event to `syncProduct`
costs no extra Admin REST lookup. The first of the ticket's three sub-questions is answered yes.

## 3. Does editing a variant also fire `store/product/updated`?

**No.**

`store/product/created`, `store/product/updated` and `store/product/deleted` were all registered
and active at the time. A variant price change fired `store/sku/updated` and nothing else, across a
60-second quiet window, twice (the change and the restore). Delivery counts were 1 and 1.

The sku hooks are **not** redundant. ROB-2613 does not shrink — a receiver registered only on
`store/product/*` would miss variant price changes entirely.

Note the converse, which was not part of the question but fell out of the captures: a
product-level edit (`warranty`) fired `store/product/updated` and no `store/sku/*`. The two scopes
are disjoint for these two edits, in both directions.

## 4. Does a variant with a blank SKU fire `store/sku/*` at all?

**Could not be tested through Admin REST, because Admin REST will not accept a blank variant SKU.**

`PUT /v3/catalog/products/180/variants/167` with `{"sku":""}` returns 422 and changes nothing:

```json
{
    "status": 422,
    "code": 22004,
    "title": "Variant sku cannot be empty",
    "type": "https://developer.bigcommerce.com/api-docs/getting-started/api-status-codes",
    "errors": {
        "sku": "Variant sku cannot be empty"
    }
}
```

The mutation was rejected, so the zero deliveries in that window say nothing about webhooks. That
is a failed experiment, not a finding about hook coverage.

What this does establish: **on this store, through Admin REST, a variant cannot have a blank SKU.**
If that constraint holds for the control panel too, the question is moot — there are no
blank-SKU variants for the sku hooks to miss. Whether the control panel enforces the same rule was
not tested here.

### The related finding that did come out of it

The follow-up `PUT` set `sku` back to `TS-P3-FAD-XS`, which was already its value. **An
identical-value `PUT` fired nothing** — zero deliveries in a 60-second window. BigCommerce appears
to fire `store/sku/updated` on actual change, not on every write. This is worth carrying into
ROB-2611's webhook-storm note: a no-op write does not cost an event.

The same is not confirmed for products; no identical-value product `PUT` was run.

## 5. Images

Four image actions, each its own action with its own 60-second quiet window, all through Admin
REST against product 180. All nine hooks were registered and active throughout.

| Action | Call | Result | BigCommerce deliveries |
| --- | --- | --- | --- |
| Swap the existing thumbnail | `PUT /catalog/products/180/images/450` `{"is_thumbnail":true}` | 200 | **0** |
| Upload an extra image | `POST /catalog/products/180/images` `{"image_url":...}` | 200, image 509 created | **0** |
| Delete an image | `DELETE /catalog/products/180/images/509` | 204 | **0** |
| Restore thumbnail | `PUT /catalog/products/180/images/448` `{"is_thumbnail":true}` | 200 | **0** |

**Nothing fired. Not `store/product/updated`, not anything else, on any of the four.**

That is the finding, and it is a hard one for ROB-2614: over Admin REST, image changes on this
store are invisible to every scope registered here, including the product scopes. A receiver built
on these nine hooks will never learn that a product's imagery changed.

The "set as thumbnail for the first time" case was **not** isolated. Image 448 was already
`is_thumbnail: true` before any experiment ran, so every thumbnail action captured here was a
change of an existing thumbnail, not a first set. The BigCommerce documentation claim that a
thumbnail fires `updated` only the first time one is set is therefore **neither confirmed nor
refuted** by these captures. What is established is the case that matters operationally — a store
whose products already have thumbnails, where a swap fires nothing.

### Why the images endpoint is silent, and what does fire

The mechanism is the shape of the write, not the fact that an image changed. A whole-product
`PUT /v3/catalog/products/180` fires `store/product/updated` — that is finding 1 above, captured
three times. A targeted `PUT`/`POST`/`DELETE` against `/v3/catalog/products/180/images/...` fires
nothing — captured four times.

So anything that saves the whole product produces an event, and anything that touches only the
images sub-resource does not. The BigCommerce documentation's claim is accurate about the images
endpoint and misleading about the merchant workflow, because the two paths differ.

**The control-panel half of this was not established here.** A dashboard save is widely understood
to `PUT` the whole product, which would fire by the mechanism above, but the one capture offered as
evidence for it did not survive attribution: the delivery in question had `created_at` one second
after a whole-product `PUT` of this worker's own, and forty-two seconds after the dashboard save.
Every other capture in this document shows a 1–2 second gap between the request and `created_at`.
No delivery arrived in the two minutes covering the dashboard save. Whether a control-panel image
edit fires an event is therefore **unresolved**, and worth one clean capture with no concurrent
API writes before anyone relies on it.

For ROB-2614 the practical consequence is unchanged either way: a change made through the images
API is silent, so a receiver built on these hooks will not learn about it.

## Deliveries are not unique — the same event arrived twice

Not one of the ticket's questions, but it fell out of the captures and it changes ROB-2616.

One event was delivered **twice**, 455 milliseconds apart:

```
2026-08-11T11:45:54.755Z  hash 492a381a00feb901335931d8fa5df722cde657a5  created_at 1786448752
2026-08-11T11:45:55.210Z  hash 492a381a00feb901335931d8fa5df722cde657a5  created_at 1786448752
```

Same `hash`, same `webhook-id` header, same `created_at`, same `data`. The stub returned `200`
immediately to the first one — there was no sleep configured and no failure to retry from. 455ms
is far too short for a retry backoff in any case.

**This is a duplicate delivery, not a retry.** BigCommerce delivers at-least-once, and the receiver
has to be idempotent. `hash` (equivalently the `webhook-id` header) is the deduplication key: it is
stable across copies of the same event and differs between distinct events, including two events
on the same entity seconds apart.

The sync's writes are already idempotent by construction — deterministic document ids, whole-object
writes — so a duplicate costs a redundant Admin REST fetch and a redundant Sanity write rather than
corrupting anything. Worth deduplicating on `hash` anyway, to halve the quota cost.
