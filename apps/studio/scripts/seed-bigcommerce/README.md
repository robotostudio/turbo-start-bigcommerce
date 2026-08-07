# BigCommerce seed script

Mirrors the reference Shopify catalog into your own BigCommerce sandbox, so you
have the same products the demo site is built against. Run it as often as you
like: it updates in place and never duplicates.

**This script deletes.** Anything in the BigCommerce catalog that Shopify does
not have — including the sample products a new store ships with — is removed.
That is what makes re-running converge instead of piling up, but point it at a
sandbox, not at a store you care about.

## Setup

Both stores are read from `apps/studio/.env`:

```env
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=...

BIGCOMMERCE_STORE_HASH=abc123
BIGCOMMERCE_ADMIN_TOKEN=...
BIGCOMMERCE_CHANNEL_ID=1   # optional, defaults to 1
```

Shopify is read-only and needs `read_products`. The BigCommerce credentials are
created under Settings > API accounts with the Products scope set to modify.
They are store-level Admin credentials and have nothing to do with
`BIGCOMMERCE_STOREFRONT_TOKEN`, which the web app reads and which cannot write
catalog at all. If any of them is missing the script says so and exits. It will
not quietly fall back to another store.

## Usage

```bash
pnpm seed:bigcommerce
pnpm seed:bigcommerce -- --verbose
```

The first run takes a few minutes, most of it BigCommerce pulling images off
Shopify's CDN. Later runs are much faster, since the images and variants are
already there.

## What it mirrors

| Shopify              | BigCommerce                                        |
|----------------------|----------------------------------------------------|
| collection           | category at `/collections/{handle}/`               |
| product              | product at `/products/{handle}/`                   |
| `compareAtPrice`     | `price` — the was-price                            |
| `price`              | `sale_price` when there is a compare-at            |
| option `Color`       | swatch option, hex from `SWATCH_HEX`               |
| every other option   | rectangle option                                   |
| variant              | variant, keyed on SKU, with its own price and stock |
| media                | product images, resized on the way out             |
| `productType`, `tags`| `turbo_start` metafields                           |

Both URLs are set explicitly. BigCommerce otherwise derives a category path
from its position in the tree and a product path from its name, and neither
matches the `/collections/{handle}` and `/products/{handle}` links the
storefront generates. The categories are deliberately flat for the same reason:
nesting them would put the parent segments back into the path.

Shopify has nowhere to store a swatch hex, so `SWATCH_HEX` in `shopify.ts` maps
colour name to hex. It is the only display data this script invents. A colour
that is not in the map still renders — as neutral grey, with a warning naming
it.

## Idempotency

Everything is looked up before it is written, keyed on something Shopify
controls instead of on an id BigCommerce hands back:

| Resource   | Key                   |
|------------|-----------------------|
| Category   | `/collections/{handle}/` |
| Product    | `/products/{handle}/` |
| Option     | display name          |
| Variant    | SKU                   |
| Image      | source filename       |
| Metafield  | `namespace:key`       |

Images are keyed on the source filename rather than on alt text, which repeats
across every shot of one colourway. BigCommerce keeps the filename inside the
stored `image_file`, so it survives the upload and stays comparable.

`validateCatalog()` checks those keys are unique and mutually consistent before
the first BigCommerce call, so bad upstream data fails up front and never
leaves half a store behind. The run ends by re-reading every URL, because a
collision is the one failure BigCommerce hides: it appends `-2` and returns
200.

## Four things BigCommerce does quietly

All four accept the write, return a success, and then read back wrong on the
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

## Also worth knowing

Uploads are capped at 8 MB and the source images are bigger than that, so every
image URL goes out through Shopify's CDN resizer.

Weights are converted into whatever unit the target store is set to, read off
the store record rather than assumed.

## Layout

```
scripts/seed-bigcommerce/
  index.ts     CLI entry: store guard, orchestration, URL check, summary
  client.ts    REST client, credential loading, retry, concurrency pool
  shopify.ts   Admin API reader, mapping to the definitions below, self-check
  seed.ts      Upsert and prune logic for every resource
  types.ts     Shared interfaces
```
