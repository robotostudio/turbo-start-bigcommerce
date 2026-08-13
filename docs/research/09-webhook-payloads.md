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
their deliveries could not be mistaken for experiment results. See "Store state and cleanup" at the
end — cleanup is not complete at the time of writing and that section says so.

## The envelope

Every delivery, regardless of scope, has the same six top-level keys. Verbatim:

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
  delivered it. Measured against the request that caused it, `created_at` ran 1–2 seconds behind;
  the delivery itself arrived 1–4 seconds after that. `created_at` is the reliable field for
  attributing a delivery to an action, because it is BigCommerce's own clock and no tunnel latency
  sits between the edit and the stamp.
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

On attribution, since this document holds other people's captures to that standard: the first three
rows — the thumbnail swap, the upload and the delete — all completed before any other worker made
a write to this store, so their windows were provably free of third-party traffic. The fourth row,
the thumbnail restore, ran in a window that another worker's dashboard save overlapped. That row is
therefore weaker evidence than the other three. The conclusion does not rest on it: the swap, the
upload and the delete are each independently clean, and each fired nothing.

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

## 6. Headers

### Does `x-bigcommerce-webhook-secret` arrive? Yes.

Confirmed on every delivery, through two independent receivers (the Next stub and a raw
`node:http` server on a separate tunnel), carrying exactly the value registered in the hook's
`headers` object. Full header set on a `store/product/updated` delivery, as the Next route sees it:

```
accept-encoding:              gzip
cdn-loop:                     cloudflare; loops=1; subreqs=1
cf-connecting-ip:             35.226.165.250
cf-ew-via:                    15
cf-ipcountry:                 US
cf-ray:                       a296e8a3bb74230f-BOM
cf-visitor:                   {"scheme":"https"}
cf-warp-tag-id:               9b7bdeaf-e247-453a-8298-888c01871c9a
cf-worker:                    trycloudflare.com
connection:                   keep-alive
content-length:               197
content-type:                 application/json
host:                         continues-skill-competitions-themselves.trycloudflare.com
user-agent:                   pekko-http/1.3.0
webhook-id:                   64d346b71e4c02453da81c5d97cec8063a6e7a4d
webhook-signature:            v1,Op+8O1TMMJSf6PU/SDZbpSTsqdMuVBZ1wbpYq1C3dCY=
webhook-timestamp:            1786447831
x-bigcommerce-webhook-secret: <64 hex chars — equals BIGCOMMERCE_WEBHOOK_SECRET>
x-forwarded-for:              35.226.165.250
x-forwarded-host:             continues-skill-competitions-themselves.trycloudflare.com
x-forwarded-port:             3000
x-forwarded-proto:            https
```

Everything from `cdn-loop` down to `cf-worker`, plus the three `x-forwarded-*` and `host`, is added
by **cloudflared**, not BigCommerce. In production behind a real origin those disappear or change.
BigCommerce itself sends: `accept-encoding`, `content-length`, `content-type`, `user-agent`
(`pekko-http/1.3.0`), `webhook-id`, `webhook-signature`, `webhook-timestamp`, and the custom
`x-bigcommerce-webhook-secret` registered on the hook. `connection: keep-alive` is hop-by-hop.

### The exact casing could NOT be determined, and here is why

**cloudflared rewrites header casing.** Control test, sending deliberately non-canonical names
through the tunnel to a raw `node:http` server reading `req.rawHeaders`:

| sent | arrived |
| --- | --- |
| `x-bigcommerce-WEBHOOK-secret` | `X-Bigcommerce-Webhook-Secret` |
| `aLL-lower-MIXED` | `All-Lower-Mixed` |

Both were canonicalised. So the `X-Bigcommerce-Webhook-Secret` casing observed on the raw server is
**cloudflared's**, not BigCommerce's, and this capture cannot report what BigCommerce puts on the
wire. Determining that needs BigCommerce to reach an origin directly, with no tunnel in the path —
not possible from a laptop, and not attempted here.

Two earlier readings that would have been wrong to publish, recorded so nobody repeats them:

- The Next stub's header dump is lowercase, but that proves nothing: the Fetch API `Headers` object
  lowercases every name by construction.
- A first control sending `X-Mixed-Case-Test` arrived unchanged, which looked like proof that
  cloudflared preserves casing. It is not — that name is *already* in canonical form, so the test
  could not detect canonicalisation. The non-canonical control above is the valid one.

**This does not matter for ROB-2616.** HTTP header names are case-insensitive per RFC 9110, and
every reasonable lookup (`request.headers.get()` in the Fetch API, Node's `req.headers`) is
case-insensitive. The receiver must do a case-insensitive lookup and must not compare casing. Given
that, the unanswered question has no consequence.

### `webhook-signature` — a real HMAC, and its key is not the shared secret

Undocumented in the parent map, which states the shared header is the only authentication
BigCommerce offers. It is not: every delivery also carries a Standard Webhooks signature.

```
webhook-id:        64d346b71e4c02453da81c5d97cec8063a6e7a4d
webhook-signature: v1,Op+8O1TMMJSf6PU/SDZbpSTsqdMuVBZ1wbpYq1C3dCY=
webhook-timestamp: 1786447831
```

Format is `v1,<base64>`, the Standard Webhooks shape: HMAC-SHA256 over
`{webhook-id}.{webhook-timestamp}.{raw body}`. `webhook-id` equals the body's `hash`.

**The signing key is not the value passed in the hook's `headers`.** Two derivations were computed
over the exact signed string and neither matched:

- secret as UTF-8 bytes → `v1,Dwp5EcYABnZhtve1E5iLloZQuP7ix8IUywG59NH2uZ4=`
- secret hex-decoded to 32 bytes → `v1,UYJlgUzrUDjftqCp2jzEQEAfJWt5QNyvx2awniDPRXE=`
- actual header → `v1,Op+8O1TMMJSf6PU/SDZbpSTsqdMuVBZ1wbpYq1C3dCY=`

`GET /v3/hooks/signing-keys` returns 400, so the key was not retrievable from the API by guessing
an endpoint. **Where the key comes from is unidentified.** Do not build authentication on this
signature until someone establishes the key source; the `x-bigcommerce-webhook-secret` header is
the mechanism that is verified to work.

## `store/category/updated` — captured in passing

Exercised while answering question 6. `PUT /v3/catalog/categories/43` changing `description`, and
the restoring edit. Two deliveries, one each:

```json
{"producer":"stores/8jbhprizry","hash":"d685c597dad2af27d512dd2c5a7f9376b8257cf7","created_at":1786448882,"store_id":"1003502318","scope":"store/category/updated","data":{"type":"category","id":43}}
```

Same envelope, `data.type` is `"category"`, `data.id` is the category id. No nested object, so this
scope has none of the id ambiguity that `store/sku/*` has.

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

## 7. What is the ACK timeout?

**Partially answered: it is longer than 5 seconds. The upper bound was not established.**

`docs/research/04-bigcommerce-api-semantics.md:453` lists the exact webhook ACK timeout as unfound.
This narrows it at the bottom and leaves the top open.

Method: the stub takes a `?sleep=N` query parameter that delays the response by N seconds *after*
writing its log line, so a delivery BigCommerce gives up on still leaves a record of when the origin
actually finished. Hook `31588703` (`store/product/updated`) was repointed at
`.../api/bigcommerce/webhook?sleep=N`, then one `warranty` edit was made on product 180.
Retry detection is the `hash` field, not timing — the same `hash` arriving twice is a redelivery.

`sleep=5`:

```
MARK  Q7-sleep-5s          2026-08-11T11:50:26Z
RECV  2026-08-11T11:50:30.384Z  store/product/updated  hash=8fa9a2c687ae  created_at=1786449027
RESP  2026-08-11T11:50:35.386Z  slept=5s  status=200
```

One delivery, one origin response 5.002 seconds later, `200`. **No second delivery with that
hash.** BigCommerce waited at least 5 seconds and accepted the late ACK.

`sleep=10`, `sleep=20` and `sleep=30` were **not run.** The store was frozen for another worker's
capture partway through the sequence and the probe was stopped. This is a gap, not a finding: the
timeout could be anywhere above 5 seconds.

Two things worth carrying to whoever finishes it:

- The rig works and is in `q7-acktimeout.sh` — repoint the hook, one edit, wait `N + 120`s, look
  for a duplicate `hash`. Finishing 10/20/30 is about seven minutes.
- A retry arriving later than the observation window would be missed and read as "no retry".
  BigCommerce retries over a 48-hour window, and the backoff schedule for the *first* retry is not
  known, so a negative result inside two minutes is weaker evidence than a positive one.

For ROB-2611 and ROB-2616 the practical guidance does not depend on the exact number: return `200`
immediately and do the work after responding. The design already says this. The only thing the
number would change is how much slack a naive synchronous receiver has before it starts
double-processing every event, and the answer "more than 5 seconds, unknown how much more" is
enough to say do not rely on it.

## Coverage: what each registered scope actually did

Nine scopes were registered and active throughout. "Not exercised" is a different claim from
"fired nothing" and they are separated here.

| Scope | Status | Evidence |
| --- | --- | --- |
| `store/product/updated` | **Observed** | Fires on any whole-product `PUT`. Payload in section 1. |
| `store/sku/updated` | **Observed** | Fires on a variant `PUT` that changes a value. Payload in section 2. |
| `store/category/updated` | **Observed** | Fires on a category `PUT`. Payload above. |
| `store/product/created` | Not exercised | No product was created. |
| `store/product/deleted` | Not exercised | No product was deleted. |
| `store/sku/created` | Not exercised | No variant was created — see section 4. |
| `store/sku/deleted` | Not exercised | No variant was deleted. |
| `store/option/updated` | Not exercised | No option was edited. |
| `store/modifier/updated` | Not exercised | Product 180 has no modifiers, so there was nothing to edit. |

Separately, and this is the load-bearing negative: **image changes made through
`/catalog/products/{id}/images/...` fired nothing on any of the nine.** Four different image
actions, four quiet windows, zero deliveries. That is a fired-nothing result, not a not-exercised
one.

## What this means for the tickets downstream

**ROB-2616 (build the receiver).** Three things this capture settles:

1. On `store/sku/*`, read `data.sku.variant_id`. Never `data.id` — that is `sku_id`, and using it
   writes Sanity documents at ids that never join, silently. `data.sku.product_id` gives the parent
   product with no extra lookup.
2. Deduplicate on `hash`. Delivery is at-least-once; one event arrived twice, 455ms apart.
3. Authenticate on `x-bigcommerce-webhook-secret` with a case-insensitive lookup. The
   `webhook-signature` HMAC is real but its key is unidentified, so it cannot be used yet.

**ROB-2613 (which scopes to register).** The sku scopes are **not** redundant. A variant edit fires
`store/sku/updated` and does not fire `store/product/updated`. A receiver on the product scopes
alone misses every variant price change.

**ROB-2614 (image freshness).** Image changes through the images API are invisible to all nine
scopes. Whether a control-panel image edit fires is unresolved — see section 5.

**ROB-2611 (error handling).** A no-op write fires nothing, so identical-value writes cost no
events. The ACK timeout is over 5 seconds, upper bound unknown.

## The stub

`apps/web/src/app/api/bigcommerce/webhook/route.ts` is committed with this document. It is a
throwaway: it logs and returns 200, with no authentication and no Sanity write, and its own comment
says ROB-2616 replaces it wholesale. It is committed rather than deleted so the capture is
reproducible and so the `?sleep=N` rig survives for whoever finishes question 7.

## Store state and cleanup — PENDING, NOT YET DONE

**Read this before trusting anything above about the store being tidy.**

At the time of writing, cleanup has **not** run:

- **Nine hooks are still live**, pointed at a `trycloudflare.com` URL that dies with the tunnel
  process. They must be deleted. The ids are `31588702`, `31588703`, `31588704`, `31588705`,
  `31588706`, `31588707`, `31588708`, `31588709`, `31588710`. A tenth, `31588750`, was created for
  the header capture and has already been deleted.
- **Product 180 was verified restored at 11:51:14Z**, field by field against the pre-experiment
  `GET` snapshots: `name`, `price`, `sku`, `warranty`, `is_visible` matching; variants
  `167, 173, 177, 180, 185` with 167 back to `sku=TS-P3-FAD-XS`, `price=89`, `inventory_level=30`;
  images exactly `448, 450, 454, 457, 461` with `sort_order` 0–4 and `is_thumbnail` on 448 only;
  options 118 (values 113–117) and 122 (value 133) untouched throughout. The probe image uploaded
  during the capture was deleted.
- **That verification is now stale.** Another worker began changing thumbnails on product 180 after
  11:51:14Z. The store must be re-diffed against the snapshots before this section can claim the
  store is as it was found.

Why the hooks matter more than the rest: a quick tunnel URL dies with its process, and a live hook
pointing at a dead URL burns BigCommerce's 48-hour retry window and then deactivates itself
silently. Leaving them is worse than never registering them.

**Outstanding work, in order:** the question 4 create path on a throwaway product; question 7 at
`sleep=10/20/30`; re-diff product 180 and category 43 against the snapshots; delete the nine hooks
and confirm `GET /v3/hooks` comes back empty; kill both tunnels, the dev server and the raw server.

## 7. The ACK timeout — how long BigCommerce waits before giving up

Measured 2026-08-11 against store `8jbhprizry`, after the main capture. **Between 9 and 12
seconds.**

The rig was deliberately not the app. A standalone node server held each delivery open for a fixed
time before answering 200, behind its own cloudflared tunnel, with exactly one hook registered
(`store/product/updated`). Nothing in the repo was involved, so nothing about the receiver's own
behaviour could confound the result.

### How a timeout is detected

There is no error to observe — a delivery BigCommerce gives up on still gets its 200 eventually, and
the connection is not visibly cut. What gives it away is the **redelivery**: an event BigCommerce
considers failed is retried, and a retry carries the same `hash`. So the question "did this hold
exceed the timeout" becomes "did the same `hash` arrive twice".

### Control first

Before trusting any of it, the tunnel was checked for a timeout of its own, since one would look
identical from here. Holds of 5s, 20s and 35s all came back `200` with `elapsed` matching the hold
to within 140 ms. The tunnel passes long holds through untouched, so every result below is
BigCommerce's behaviour.

### Results

| Hold | Deliveries of that event | Verdict |
| --- | --- | --- |
| 5s | 1 | inside the window |
| 5s (second event) | 1 | inside the window |
| 9s | 1 | inside the window |
| 12s | 3 | **timed out**, retried |
| 30s | 3 | **timed out**, retried |

Each retry landed about 71 seconds after the event's first delivery. BigCommerce's documented first
retry interval is 60 seconds, and it is measured from the moment the attempt is abandoned rather
than from the moment it was sent — 71 minus 60 puts the abandonment around 11 seconds in, which
agrees with 9 passing and 12 failing.

Raw log, trimmed to the arrivals:

```
13:18:15  arrived  hold 30s  17f8c3b5f254
13:19:26  arrived  hold 30s  17f8c3b5f254   <- retry, 71s later
13:22:16  arrived  hold  5s  bdf7740a89ac   <- never retried
13:24:06  arrived  hold 12s  91cd3f346af8
13:25:17  arrived  hold 12s  91cd3f346af8   <- retry, 71s later
13:26:52  arrived  hold  9s  0cf6559c6f3d   <- never retried
13:28:54  arrived  hold  5s  9222b7021efe   <- never retried
```

### What this changes

`SYNC_TIMEOUT_MS` in `apps/web/src/app/api/bigcommerce/webhook/route.ts` was 5000, chosen when the
number was unknown. It is now 8000: under the low end of the measured range with a second to spare,
and comfortably above the 2.3 to 3.7 seconds a real `syncProduct` takes against a dev server.

It is deliberately not 9000. The boundary is bracketed, not pinned, and the two failure directions
cost different amounts. Setting it too high means BigCommerce abandons a sync that was about to
succeed and redelivers it, so the work is done twice and the Admin REST quota pays for both.
Setting it too low means one unnecessary 500 and one retry.

Nobody should raise it past 9 seconds without re-running this. The number belongs to BigCommerce
and nothing obliges them to keep it.

### Cleanup

The probe hook was deleted, `GET /v3/hooks` returns zero, the tunnel and the probe server were
killed, and product 180's `warranty` field was restored to its snapshot value of `""`.
