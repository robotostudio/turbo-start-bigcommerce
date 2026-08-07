# BigCommerce seed script

Fills your own BigCommerce sandbox with enough catalog to build against. Run it
as often as you like. It updates in place and never duplicates.

## Setup

Add Admin API credentials to `apps/studio/.env`:

```env
BIGCOMMERCE_STORE_HASH=abc123
BIGCOMMERCE_ADMIN_TOKEN=...
```

Create them under Settings > API accounts in the control panel, with the
Products scope set to modify. These are store-level Admin credentials and have
nothing to do with `BIGCOMMERCE_STOREFRONT_TOKEN`, which the web app reads and
which cannot write catalog at all. If either variable is missing the script says
so and exits. It will not quietly fall back to another store.

## Usage

```bash
pnpm --filter studio seed:bigcommerce
pnpm --filter studio seed:bigcommerce -- --verbose
```

The first run takes about 70 seconds. Later runs take about 35, since the images
and variants are already there.

There is no `--batch` flag. SKUs are the idempotency keys, which makes the
catalog a fixed set of rows instead of a count you pick.

## What it creates

Seven categories, three levels deep:

```
/shop/  →  /shop/mens/     →  /shop/mens/jackets/
                            →  /shop/mens/tees/
        →  /shop/womens/   →  /shop/womens/dresses/
        →  /shop/accessories/
```

Sixty-four products. BigCommerce's REST list returns 50 per page by default, so
the catalog fills page one and leaves 14 on page two. An off-by-one in paging
then shows up as a wrong count, not as an empty second page.

Four products are written by hand, because other work derives behaviour from
them:

| SKU              | Exercises                                                  |
|------------------|------------------------------------------------------------|
| `TSB-JACKET-001` | Colour swatch x Size, sale + MSRP, 9 variants, 3 metafields |
| `TSB-TEE-001`    | Non-swatch options only, no sale, no variant images         |
| `TSB-DRESS-001`  | Swatch where every variant overrides the image              |
| `TSB-TOTE-001`   | No options at all, so the single-variant path               |

`TSB-JACKET-001` splits its variants on purpose. The six Sand and Moss variants
carry their own image; the three Midnight ones fall back to the product default.
You need both states on one product to derive a variant-image fallback against.

The other 60 are `TSB-FILL-001` through `TSB-FILL-060`: one image each, every
fourth on sale. Faker writes the display copy from a fixed seed, but SKUs come
from the index, so bumping faker changes a few names and duplicates nothing.

## Idempotency

Everything is looked up before it is written, keyed on something this script
controls instead of on an id BigCommerce hands back:

| Resource   | Key             |
|------------|-----------------|
| Category   | full URL path   |
| Product    | SKU             |
| Option     | display name    |
| Variant    | SKU             |
| Image      | alt text        |
| Metafield  | `namespace:key` |

`validateCatalog()` checks those keys are unique and mutually consistent before
the first API call, so bad seed data fails up front and never leaves half a
store behind.

## Two things BigCommerce does quietly

Both of these accept the write, return a 200, and then read back as null on the
storefront. Worth knowing before you trust either field.

Metafields need `permission_set: "read_and_sf_access"`. Plain `read` is
admin-only, and the Storefront API answers with an empty `metafields`
connection and no error.

A variant's own price cancels the product's sale price. Once a variant carries
`price`, the product-level `sale_price` stops applying and the storefront
reports `salePrice: null`. Any discounted variant has to repeat the sale price
on itself.

## Layout

```
scripts/seed-bigcommerce/
  index.ts     CLI entry: store guard, orchestration, summary
  client.ts    REST client, credential loading, retry, concurrency pool
  catalog.ts   The catalog as pure data, plus its self-check
  seed.ts      Upsert logic for every resource
  types.ts     Shared interfaces
```
