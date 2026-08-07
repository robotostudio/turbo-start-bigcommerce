# Finding 01 — How turbo-start-shopify joins Sanity to Shopify

Source: `turbo-start-shopify` @ `67b9533` (2026-08-06). Baseline `turbo-start-sanity` @ `1c5f6f1` (2026-07-28). Read 2026-08-07.

## Headline: there is no sync code

Nothing in turbo-start-shopify writes Shopify catalog data into Sanity. `product` / `productVariant` /
`collection` documents are created and maintained by **Sanity Connect for Shopify** — an externally
hosted Sanity SaaS app installed via the Shopify App Store. Zero code footprint in the repo.

Evidence:
- `apps/studio/schemaTypes/documents/product.tsx:18` — "Shopify product with editorial content, synced via Shopify Connect"
- `apps/studio/scripts/migrate-handoff/index.ts:6-7` — "Shopify Connect then syncs them into Sanity, and the storefront reads them live."
- Repo-wide grep for `@sanity/client|createClient` in `apps/studio/**` + `packages/**`: 5 files, none write `store.*`.
  Only `scripts/cleanup-stale-sanity.ts` touches product docs, and only to delete.
- `apps/studio/seed-data.tar.gz` contains zero product/collection/productVariant documents.

**There is no Sanity Connect for BigCommerce.** This sync layer must be built from scratch. It is the
largest unknown in the project and the one part with no prior art to copy.

## The document model (this part IS portable)

Three real Sanity documents, not stubs. Each holds a read-only commerce subtree beside editor-owned fields.

```ts
// documents/product.tsx:70-75
defineField({
  name: "store",
  type: "shopifyProduct",
  description: "Product data from Shopify (read-only)",
  group: GROUP.COMMERCE,
}),
```

- **Commerce-owned**, inside `store`, `readOnly: true` at object level (`objects/shopify/shopify-product.ts:13`):
  `id`, `gid`, `slug`, `title`, `descriptionHtml`, `status`, `isDeleted`, `createdAt/updatedAt`,
  `priceRange{min,max}`, `previewImageUrl`, `options[]`, `productType`, `vendor`, `tags`,
  `variants[]` (weak refs to `productVariant` docs), `shop{domain}`.
  Variant-only: `sku`, `price`, `compareAtPrice`, `inventory{isAvailable,management,policy}`, `option1/2/3`.
  Collection-only: `rules[]`, `disjunctive`, `imageUrl`, `sortOrder`.
- **Editor-owned**: `product.body` (portable text), `product.colorTheme`, `product.seo`,
  `collection.hero`, `collection.modules`, `collection.vector`, `collection.showHero`, `collection.seo`.
- `titleProxy` / `slugProxy` (`type: proxyString`) store nothing — a custom input reads `store.title`
  via `useFormValue` and renders it locked, so doc lists show a human title.

### Four distinct join keys

1. **Document `_id` prefix** — `shopifyProduct-{numericId}`. Only in-repo proof:
   `objects/shopify/product-with-variant.tsx:34-36` → `productId?.replace("shopifyProduct-", "")`.
   Variant/collection prefixes are inferred by symmetry, not evidenced.
2. **`store.gid`** — liveness key. `cleanup-stale-sanity.ts:91-96` marks docs stale when the gid is
   absent from a fresh live-Shopify gid set.
3. **`store.slug.current`** (Shopify handle) — the routing key. ~10 link resolvers in `query.ts` build
   URLs from it. `queryProductByHandle` looks up by handle, not `_id`.
4. **`store.id`** (plain numeric) — only for Shopify admin deep links (`utils/shopifyUrls.ts`).

### Page builder references products by weak Sanity reference, never a raw ID string

- `featuredProducts.products[]` — weak ref (`blocks/featured-products.ts:25-32`)
- `layersShowcase.product` — ref, **missing `weak: true`** unlike every sibling
  (`blocks/layers-showcase.ts:29-37`). Inconsistency; fix rather than copy.
- `productWithVariant.product/.variant` — weak refs (`objects/shopify/product-with-variant.tsx:17-29`)
- `collectionReference.collection`, `collectionGroup.collectionProducts`, `collectionLinks[]` — weak refs
- `customUrl.product` (`definitions/custom-url.ts:91-97`) — used by every generic link sitewide

## GROQ: Sanity returns handles, frontend fetches commerce live

```groq
// query.ts:274-280
_type == "featuredProducts" => {
  ..., heading,
  "productHandles": array::compact(products[]->store.slug.current)
}
```

`queryProductByHandle` (`query.ts:738-753`) matches `store.slug.current == $handle && store.status == "active"`
and returns only `_id, slug, title, colorTheme, body, seo` — **no price or variant data**. Sanity holds the
editorial overlay; commerce truth for the PDP comes from Shopify, joined by handle.

Exceptions that do read `store`: `productWithVariantFragment` (`query.ts:665-687`, exposes `gid` so a
hotspot can add-to-cart without a second fetch) and the OG-image queries (`query.ts:433-486`).

## What the BigCommerce sync must do (re-authored from scratch)

1. Upsert `product`/`productVariant`/`collection` by a stable `_id` derived from the BigCommerce ID.
2. Populate a `store`-equivalent object re-derived from BigCommerce's Catalog API shape — its field
   names, inventory model and category rules are not Shopify's.
3. Maintain the `store.variants[]` weak-ref array.
4. **Soft-delete via `store.isDeleted`**, never remove the doc. Skipping this is exactly why
   `cleanup-stale-sanity.ts` had to exist.
5. Keep `store.status` accurate — `query.ts:739` filters on `"active"`, so a stale status silently 404s
   a live product page.
6. **PATCH the `store` subtree only. Never `createOrReplace()` the document.** `body`, `hero`, `modules`,
   `seo` are editor-owned siblings; a whole-doc overwrite destroys editor work every sync run.
   This constraint is written down nowhere in the Shopify repo.

`scripts/seed-shopify/**` is the easy part: swap Admin GraphQL mutations for BigCommerce Catalog API
calls, keep the Faker generator and CLI shape (`--clean`, `--batch=N`, `--verbose`).

## Studio UX affordances worth porting

- `components/media/shopify-document-status.tsx` (85 lines) — thumbnail renderer used by every
  commerce schema preview. Red "deleted" badge on `isDeleted`, "no longer active" badge on `!isActive`.
- `components/inputs/product-hidden.tsx` — warning card that appears only when a product is
  deleted/inactive (`product.tsx:27-31`), plus a deep link to the Shopify admin.
- `components/inputs/proxy-string.tsx` — locked input, tooltip "This value is set in Shopify ({path})".
- `structure.ts:87-115` — dedicated "Commerce" desk section: Products, Collections, Variants, Color Themes.

**Broken/dead in the original — do not copy the bugs:**
- `utils/constants.ts:48` hardcodes `SHOPIFY_STORE_ID = ""`, so every admin deep link is inert on a
  fresh clone until someone hand-edits it.
- `collectionUrl` / `productVariantUrl` are defined but never imported.
- `components/studio/navbar.tsx` is built but never registered in `sanity.config.ts`. Zero effect.
- `scripts/seed-shopify/client.ts:9,24` hardcodes API version `2026-01` while ignoring the
  `SHOPIFY_API_VERSION` env var the schema defines.
- `cleanup-stale-sanity.ts:20` reads `SANITY_API_WRITE_TOKEN` from `apps/web/.env.local` — a cross-app
  env coupling. Give the studio its own token.
- `CLAUDE.md:96-104` omits `SHOPIFY_ADMIN_ACCESS_TOKEN` / `SHOPIFY_STORE_DOMAIN` despite the seed
  script requiring them.

## Fork checklist

**Copy verbatim** (byte-identical): `LICENSE`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
`.github/dependabot.yml`, root `tsconfig.json`, root `.npmrc`.

**Copy with adaptation**: `.github/workflows/deploy-sanity.yml` (take the *shopify* version — more
mature: dependabot-safe build-only path, `PNPM_VERSION` pin, `id-token: write`), `biome.jsonc`,
`turbo.json` (swap `SHOPIFY_*` globalEnv keys), `pnpm-workspace.yaml` catalog.

**Add fresh from turbo-start-sanity** — absent in shopify only because of fork drift, dated 2026-01/03:
`.github/workflows/ci.yml` (lint, format:check, check-types), `e2e.yml` (Playwright on
`deployment_status`), `.github/ISSUE_TEMPLATE/*`, `PULL_REQUEST_TEMPLATE.md`.

**Must rewrite**: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, root + studio `package.json`,
`apps/studio/.env.example`, `packages/env/src/server.ts` (3 `SHOPIFY_*` Zod entries → BigCommerce
store hash / storefront token / channel ID / API version), `schemaTypes/objects/shopify/**` (rename
dir + all 11 types, re-derive fields from BigCommerce's real shape), `utils/shopifyUrls.ts`,
`components/icons/shopify.tsx`, all seed/verify/cleanup scripts, `packages/sanity/src/query.ts`
(~20+ `store.*` call sites).

## Drift is fork-age, not intent

`packages/sanity-blocks` (baseline init 2026-03-17), `packages/tailwind-config` (2026-06-26),
`ci.yml` (2026-01-28), `e2e.yml` (2026-03-20) all postdate the shopify fork point. Their absence is
not a precedent to follow.
