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

```bash
pnpm seed:bigcommerce   # catalog into BigCommerce
pnpm seed:sanity        # content into Sanity  (destructive: wipes the dataset)
pnpm sync:bigcommerce   # catalog back out of BigCommerce, into Sanity
```

The sync is not optional. `reference-dataset.ndjson` no longer carries product
or category documents — it references the ones the sync writes, by the ids the
sync assigns (`bigcommerceProduct-{entityId}`, `bigcommerceCategory-{entityId}`).
Seed the content without syncing and the navbar, the promo banner and the
homepage's featured product all point at documents that do not exist yet.

Those references are deliberately **weak**. A strong reference to a document
outside the import set is rejected outright — `sanity dataset import` fails at
"Strengthening references" — so weak is what lets content and catalog be
seeded from two independent sources and still meet up.

### The contract the sync has to meet

This file references 6 categories and 4 products. For the demo pages to render,
the sync must write, for each:

| | |
|---|---|
| `_id` | `bigcommerceCategory-{entityId}` / `bigcommerceProduct-{entityId}` |
| `_type` | `bigcommerceCategory` / `bigcommerceProduct` |

`entityId` is BigCommerce's own catalog id — the `category_id` and `id` the
Admin API returns, which the Storefront API calls `entityId`. Both halves
matter. The id alone resolves the reference, but a GROQ query filtered on
`_type` still returns nothing if the document was written under a different
one, and the page renders empty with no error to explain why.

`pnpm seed:sanity` deletes every document in the target dataset before it
imports, catalog documents included. Run the sync after the seed, never before.

## `bigcommerce-catalog.json`

12 products, 61 variants, 10 categories, GBP. Prices, compare-at prices,
options with swatch hexes, per-variant SKUs and stock, 132 images.

Weights are in **grams**. `loadCatalog()` converts them into whatever unit the
target store is set to, so a store configured in kilograms does not end up with
products 1000× too heavy.

Images point at the reference store's BigCommerce CDN, which is a public read.
Product images use the original upload path (`product_images/{image_file}`)
rather than a sized rendition, so what lands in your store is the full-fidelity
file rather than a thumbnail.

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
6. Write the result here and run `pnpm seed:sanity` against a scratch dataset
   before you commit it.

Steps 4 and 5 are not optional. The importer refuses an asset document that
names a different project — it fails with "references a different project ID
than the specified target" — and rewriting the reference to a URL is the
documented way round it. A strong reference to a catalog document fails the
same import at a different step.

Only 11 of the reference project's 22 image assets are reachable from a
document. The other 11 are orphans and are deliberately not carried over.
