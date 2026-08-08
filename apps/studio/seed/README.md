# Seed data

Two committed files, two commands, no live store read at seed time.

| File | Command | Writes to |
|------|---------|-----------|
| `bigcommerce-catalog.json` | `pnpm seed:bigcommerce` | your BigCommerce store |
| `reference-dataset.ndjson` | `pnpm seed:sanity` | your Sanity dataset |

Neither holds image bytes. Both name images as URLs on a public CDN, and the
importer on the far side downloads each one into whatever project or store you
own. That keeps ~30 MB of photography out of git while still giving a fresh
clone the real pages.

## Run them in this order

`pnpm seed --yes` runs all four and is the one to use. Separately, they are:

```bash
pnpm seed:bigcommerce   # catalog into BigCommerce
pnpm seed:sanity        # content into Sanity  (destructive: wipes the dataset)
pnpm sync:bigcommerce   # catalog back out of BigCommerce, into Sanity
pnpm seed:refs --write  # point the content at the ids this store minted
```

Neither of the last two is optional. `reference-dataset.ndjson` no longer
carries product or category documents — it references the ones the sync
writes. Seed the content without syncing and the navbar, the promo banner and
the homepage's featured products all point at documents that do not exist yet.

Those references are deliberately **weak**. A strong reference to a document
outside the import set is rejected outright — `sanity dataset import` fails at
"Strengthening references" — so weak is what lets content and catalog be
seeded from two independent sources and still meet up.

### Why the ids in this file are not ids

The sync writes `bigcommerceProduct-{entityId}`, and `entityId` is whatever
BigCommerce handed that product when it was created. Every store counts from
its own starting point, so the crewneck that is 181 on the store this content
was captured from is some other number on yours, and a committed id would be
right on exactly one store and dangling on every other one. A dangling weak
reference renders as nothing — no error, no gap in the log, just an empty
navbar.

So this file names catalog documents by **slug** instead:
`bigcommerceProduct-bramley-wool-crewneck`, `bigcommerceCategory-shirts`.
Those strings are placeholders, not ids. `pnpm seed:refs` reads the synced
documents, looks each slug up among them, and rewrites the reference to the
real id.

It rewrites only references whose tail is not a number, which is what makes a
second run cost nothing: once a reference points at `bigcommerceProduct-47` it
no longer matches, so re-running after a re-seed touches only what the re-seed
put back. Run it without `--write` to see the patches first.

It writes all of the references or none of them. A slug with no catalog
document means the sync is incomplete, and half a remap is a dataset that is
neither the old state nor the new one.

The same rule puts one constraint on the catalog: **no slug may be entirely
numeric.** `bigcommerceProduct-2024` reads as an id that has already been
resolved, so it is skipped and stays dangling, with the empty navbar and no
error described above. Nothing in the committed fixture is close to this, but a
replacement catalog could be.

### The contract the sync has to meet

This file references 6 categories and 5 products. For the demo pages to render,
the sync must write, for each:

| | |
|---|---|
| `_id` | `bigcommerceCategory-{entityId}` / `bigcommerceProduct-{entityId}` |
| `_type` | `bigcommerceCategory` / `bigcommerceProduct` |
| `store.slug.current` | the storefront path, minus its route prefix |

`entityId` is BigCommerce's own catalog id — the `category_id` and `id` the
Admin API returns, which the Storefront API calls `entityId`. All three matter.
The id is what the rewritten reference points at; the slug is how `seed:refs`
finds it; and a GROQ query filtered on `_type` still returns nothing if the
document was written under a different one, so the page renders empty with no
error to explain why.

`pnpm seed:sanity` deletes every document in the target dataset before it
imports, catalog documents included. Run the sync after the seed, never before.

## `bigcommerce-catalog.json`

12 products, 61 variants, 11 categories, GBP. Prices, compare-at prices,
options with swatch hexes, per-variant SKUs and stock, 132 images.

### Badges come from the tags metafield

BigCommerce has no tag field, so the catalog carries tags as a comma-separated
`tags` metafield in the `turbo_start` namespace, and the card reads the badge
off it: `new` wins, then `online-exclusive`, then no badge at all. Four
products are tagged `new`, two `online-exclusive`, and six neither, so all
three states are on screen in the seeded store — and the homepage's four
featured products cover three of them on their own.

That distribution is the point. Tagging everything `new` is not a nicer demo,
it is the same demo as tagging nothing: one badge everywhere reads as a
default, and the `online-exclusive` branch never runs where anyone can see it.
A test in `apps/web/src/lib/bigcommerce/__tests__/product-card.test.ts` reads
this file and fails if the three states stop appearing.

Weights are in **grams**. `loadCatalog()` converts them into whatever unit the
target store is set to, so a store configured in kilograms does not end up with
products 1000× too heavy.

Images point at the reference store's BigCommerce CDN, which is a public read.
Product images use the original upload path (`product_images/{image_file}`)
rather than a sized rendition, so what lands in your store is the full-fidelity
file rather than a thumbnail.

### No reviews, on purpose

The fixture seeds no product reviews, so a fresh store has none and the star
row renders nowhere. That is the correct empty state, not a broken feature:
`cardRating` returns null at zero reviews and the card renders nothing rather
than an empty five-star row, which would read as a badly-rated product.

Reviews stay out because seeding them is the one fixture that could deceive a
real shopper. Everything else here is obviously sample data — a catalogue of
invented products under an invented brand — but a fabricated five-star review
sitting on a product a fork actually sells is a lie told to that fork's
customers, and it would arrive silently with `pnpm seed:bigcommerce`.

To see the stars, write one review against your own store and delete it after:

```
POST /v3/catalog/products/{id}/reviews
{ "title": "...", "text": "...", "rating": 5, "status": "approved",
  "name": "...", "email": "...", "date_reviewed": "2026-01-01T00:00:00+00:00" }
```

Two reviews with different scores are worth more than one: the card divides
`summationOfRatings` by `numberOfReviews`, so a single review cannot tell you
whether the mean is computed or merely echoed.

### Regenerating it

Only needed to ship a different catalog. Point the seed at your own store,
then read it back:

1. Seed or build the catalog you want in a BigCommerce store you own.
2. Dump it to this shape — see `Catalog` in
   `scripts/seed-bigcommerce/types.ts` — with categories keyed on
   `/collections/{slug}/` and products on `/products/{slug}/`.
3. Store `weight` in grams, and every image as a public URL.
4. Run `pnpm seed:bigcommerce` twice against a scratch store. The second run
   must report `created:0 deleted:0 failed:0`, and every URL in the file must
   still resolve afterwards.

Step 4 is the one that catches the subtle break: BigCommerce treats an image
URL as an upload instruction, so a resource that re-sends one on every run
re-downloads the file under a fresh path and orphans the URL the file names.

## `reference-dataset.ndjson`

50 documents: pages, blog posts, FAQs, navigation, settings, and the page
builder content the demo site renders.

Every image reference is a `_sanityAsset` pointing at Sanity's public image
CDN, and the importer downloads each one and re-uploads it into your project on
the way through. You need a write token for your own project and nothing else.

### Regenerating it

Maintainer job. It needs read access to the reference project, which lives in
Roboto Studio's Sanity org.

1. Export the reference dataset as NDJSON.
2. Drop every `sanity.imageAsset`, `sanity.fileAsset` and `system.*` document.
3. Drop the catalog documents. They come from `pnpm sync:bigcommerce`, not from
   here, and seeding a stale copy would fight the sync.
4. Replace each `asset: { _type: "reference", _ref: "image-<hash>-<dims>-<ext>" }`
   with `_sanityAsset: "image@https://cdn.sanity.io/images/<project>/<dataset>/<hash>-<dims>.<ext>"`,
   keeping any sibling `hotspot`, `crop` and `alt` on the image object.
5. Mark every reference to a `bigcommerceProduct-*` / `bigcommerceCategory-*`
   document `"_weak": true`.
6. Replace the `entityId` in each of those references with the document's slug:
   `bigcommerceProduct-183` becomes
   `bigcommerceProduct-aster-denim-coach-jacket`. The slugs are in the export,
   on `store.slug.current` of the catalog documents you dropped in step 3.
7. Write the result here, then run `pnpm seed:sanity`, `pnpm sync:bigcommerce`,
   `pnpm seed:refs --write` and `pnpm verify` against a scratch dataset before
   you commit it. The import accepts any string, so it is `seed:refs` and
   `verify` that catch a slug mistyped in step 6 — otherwise it surfaces on
   somebody else's fresh sandbox as a reference that points at nothing.

Steps 4, 5 and 6 are not optional. The importer refuses an asset document that
names a different project — it fails with "references a different project ID
than the specified target" — and rewriting the reference to a URL is the
documented way round it. A strong reference to a catalog document fails the
same import at a different step. And an id left in place is the failure that
does not announce itself: it resolves on the store you exported from and
nowhere else.

Only 11 of the reference project's 22 image assets are reachable from a
document. The other 11 are orphans and are deliberately not carried over.
