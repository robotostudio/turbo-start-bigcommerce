# BigCommerce seed script

Writes the catalog frozen in `seed/bigcommerce-catalog.json` into your own
BigCommerce store, so you have the same products the demo site is built
against. Run it as often as you like: it updates in place and never duplicates.

**This script deletes.** Anything in the BigCommerce catalog the file does not
have — including the sample products a new store ships with — is removed. That
is what makes re-running converge instead of piling up, but point it at a
sandbox, not at a store you care about.

## Setup

One store, read from `apps/studio/.env`:

```env
BIGCOMMERCE_STORE_HASH=abc123
BIGCOMMERCE_ADMIN_TOKEN=...
BIGCOMMERCE_CHANNEL_ID=1   # optional, defaults to 1
```

Created under Settings > API accounts with the Products scope set to modify.
They are store-level Admin credentials and have nothing to do with
`BIGCOMMERCE_STOREFRONT_TOKEN`, which the web app reads and which cannot write
catalog at all. If either is missing the script says so and exits. It will not
quietly fall back to another store.

## Usage

```bash
pnpm seed:bigcommerce
pnpm seed:bigcommerce -- --verbose
pnpm seed:bigcommerce -- --batch 8
pnpm seed:bigcommerce -- --no-clean
```

| Flag | What it does |
|------|--------------|
| `--verbose`, `-v` | Log every resource as it is written, not just the summary |
| `--batch <n>` | How many products to write at once. Defaults to 4 |
| `--no-clean` | Keep whatever the catalog file does not have, instead of deleting it |

`--batch` is the knob to reach for when BigCommerce starts rate-limiting: turn
it down, not up. Everything inside one product stays ordered whatever you set,
because variant creation needs the option ids the option calls hand back.

Prune is on by default and `--no-clean` turns it off, rather than `--clean`
turning it on. That way round because pruning is what makes a second run
converge instead of piling up — an opt-in flag would make the idempotency
contract something you had to remember. `--no-clean` is for adding this catalog
to a store that already holds products somebody wants to keep.

The first run takes a few minutes, most of it BigCommerce pulling the 132
images off the reference store's CDN. Later runs are much faster, since the
images and variants are already there.

Run it before `pnpm sync:bigcommerce`, which reads this catalog back out of
BigCommerce and into Sanity, and before `pnpm seed:refs`, which points the
seeded content at the ids your store minted. `pnpm seed --yes` runs all four in
order. A dataset seeded without those last two steps has a homepage pointing at
products that do not exist.

## Where the catalog comes from

`seed/bigcommerce-catalog.json` — 12 products, 61 variants, 10 categories,
GBP. It is a committed snapshot: no live store is read at seed time, and no
image bytes are in git. Every image is a URL on the reference store's public
CDN, which BigCommerce downloads into your store on the way through.

See `seed/README.md` for how it was generated and how to replace it with your
own catalog.

## What it writes

| Catalog file           | BigCommerce                                        |
|------------------------|----------------------------------------------------|
| `categories[]`         | category at `/collections/{slug}/`                 |
| `products[]`           | product at `/products/{slug}/`                     |
| `price`                | `price` — the was-price where `salePrice` is set   |
| `salePrice`            | `sale_price`, on the product and on each variant   |
| option with `hex`      | swatch option                                      |
| every other option     | rectangle option                                   |
| `variants[]`           | variant, keyed on SKU, with its own price and stock |
| `images[]`             | product images                                     |
| `metafields[]`         | `turbo_start` metafields                           |

Both URLs are set explicitly. BigCommerce otherwise derives a category path
from its position in the tree and a product path from its name, and neither
matches the `/collections/{slug}` and `/products/{slug}` links the storefront
generates. The categories are deliberately flat for the same reason: nesting
them would put the parent segments back into the path.

Weights are stored in grams and converted into whatever unit the target store
is set to, read off the store record rather than assumed.

## Idempotency

Everything is looked up before it is written, keyed on something the catalog
file controls instead of on an id BigCommerce hands back:

| Resource   | Key                      |
|------------|--------------------------|
| Category   | `/collections/{slug}/`   |
| Product    | `/products/{slug}/`      |
| Option     | display name             |
| Variant    | SKU                      |
| Image      | source filename          |
| Metafield  | `namespace:key`          |

Images are keyed on the source filename rather than on alt text, which repeats
across every shot of one colourway. BigCommerce keeps the filename inside the
stored `image_file`, so it survives the upload and stays comparable.

`validateCatalog()` checks those keys are unique and mutually consistent before
the first BigCommerce call, so a bad hand-edit fails up front and never leaves
half a store behind. The run ends by re-reading every URL, because a collision
is the one failure BigCommerce hides: it appends `-2` and returns 200.

## Five things BigCommerce does quietly

All five accept the write, return a success, and then read back wrong on the
storefront.

**Metafields need `permission_set: "read_and_sf_access"`.** Plain `read` is
admin-only, and the Storefront API answers with an empty `metafields`
connection and no error.

**A variant's own price cancels the product's sale price.** Once a variant
carries `price`, the product-level `sale_price` stops applying and the
storefront reports `salePrice: null`. Every discounted variant repeats the sale
price on itself.

**A new product is not assigned to any channel.** It exists, the Admin API
returns it, and the Storefront API cannot see it. `assignToChannel` binds every
product to the storefront channel after it is written.

**A slow bulk create still succeeds.** BigCommerce answers a bulk category
create with 504 after doing the work, so the client does not retry 5xx on
POST — a retry would turn one timeout into a duplicate, or into a 422 that
hides the original success.

**Re-sending a category's `image_url` re-uploads it.** BigCommerce downloads
the file again and stores it under a fresh random path, orphaning the old one.
That would break the committed catalog on the second run — the URL it names
would 404 — so `upsertCategories` sends `image_url` only for a category that
does not have one yet. The same guard is why `upsertVariants` and
`upsertImages` skip an image that is already there.

## Layout

```
scripts/seed-bigcommerce/
  index.ts     CLI entry: store guard, orchestration, URL check, summary
  client.ts    REST client, credential loading, retry, concurrency pool
  catalog.ts   Reads seed/bigcommerce-catalog.json, weight conversion, self-check
  seed.ts      Upsert and prune logic for every resource
  types.ts     Shared interfaces
```
