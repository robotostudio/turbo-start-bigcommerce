# Finding 05 — Shopify web-side port surface

Source: `turbo-start-shopify` @ `67b9533` (2026-08-06), `apps/web/**` only. Baseline `turbo-start-sanity`.
Read 2026-08-07. Paths relative to `apps/web/src/`.

## `lib/shopify` — 14 files, what each costs to swap

| path | LOC | what it does | swap difficulty |
|---|---|---|---|
| `client.ts` | 86 | `createStorefrontApiClient`; wraps calls in `storefrontQuery<T>()` returning a discriminated `{ok:true,data}\|{ok:false,error,kind}` | **needs rethink** — the result contract is what every caller depends on; a replacement must preserve it |
| `types.ts` | 282 | Hand-written TS mirroring Storefront GraphQL shapes | **needs rethink** — every field name is a Storefront schema name |
| `queries.ts` | 665 | 12 query documents as template strings | **needs rethink** — sort-key enums, metafield identifiers, `predictiveSearch` |
| `mutations.ts` | 137 | `CartFields` fragment + 5 cart mutations | **needs rethink** |
| `product-card.ts` | 258 | `collectionProductToCardProps()` — the single mapper every card renders through | **needs rethink** — image resolution depends on a documented Shopify fallback quirk (comment at :111-115) |
| `image-loader.ts` | 86 | `next/image` loader, hard-codes `cdn.shopify.com` + `?width=&quality=` | **needs rethink** — CDN syntax specific |
| `search-query.ts` | ~30 | Rewrites free text to `word* OR word*` for Shopify's implicit-AND grammar | **needs rethink** — obsolete against a structured search API |
| `featured.ts` | ~40 | Resolves editor-picked handles via `handle:x OR handle:y` search string | **needs rethink** — Shopify search DSL |
| `metafields.ts` | ~35 | Unpacks Shopify's *positional* metafield array into a keyed map | **needs rethink** — Shopify-only concept and contract |
| `money.ts` | ~20 | `formatMoney(MoneyV2)`, `getDiscountPercent` — pure `Intl` | mechanical |
| `options.ts` | ~25 | `getOptionType()` name-string match for color/size | mechanical |
| `variant-utils.ts` | ~60 | `findVariantByOptions`, `getOptionAvailability`, `buildVariantUrl` | mechanical |
| `color.ts` | ~80 | Static color-name→hex map. **Zero Shopify types** | copy unchanged; move out of `lib/shopify/` |
| `index.ts` | — | Barrel re-export | mechanical |
| `__tests__/product-card.test.ts` | 290 | 20 cases covering image resolution + pricing | port alongside — documents the behavior a replacement must match |

No file in `lib/shopify/` calls Admin REST. Everything is Storefront GraphQL.

## The five mechanisms

### 1. Catalog read

```ts
// lib/shopify/client.ts:9-13
export const storefront = createStorefrontApiClient({
  storeDomain: `https://${env.SHOPIFY_STORE_DOMAIN}`,
  apiVersion: env.SHOPIFY_API_VERSION,
  publicAccessToken: env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
});
```

`import "server-only"` at `client.ts:1`. The literal header `X-Shopify-Storefront-Access-Token` never
appears in the repo — the SDK sets it from `publicAccessToken`.

**No caching anywhere.** Exhaustive grep for `\bcache\(|next\s*:\s*\{|revalidate|use cache` across
`apps/web/src` finds no `next: {tags/revalidate}`, no React `cache()`, no `unstable_cache`, no
`"use cache"` on any Storefront call. The only cache directives in the tree are on Sanity/content
routes (`app/api/blog/search/route.ts:6`, `app/api/markdown/route.ts:194`, `app/api/og/route.tsx:445`).

Pagination is Relay cursor style — `Connection<T>` at `types.ts:177-183`, consumed via TanStack
`useInfiniteQuery` in `components/collection/collection-products.tsx:48-76`.

### 2. Cart

```ts
// lib/cart/server.ts:8-24
const CART_COOKIE = "shopify-cart-id";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
cookieStore.set(CART_COOKIE, cartId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: ... });
```

Four server actions in `app/cart/actions.ts` (`createCart` :107, `addToCart` :133 — auto-creates,
`updateCartLine` :160, `removeCartLine` :219). No route handler mutates the cart.

Optimistic UI is a hand-built layer, not React's `useOptimistic`: `lib/cart/controller.ts` (614 lines)
debounces adds 300ms (:98) and quantity updates 400ms (:97), folds pending intents over server state
via `engine.ts:136-183`, exposed through `useSyncExternalStore` in `cart-context.tsx:80-84`.
Unconfirmed lines get synthetic IDs `optimistic-${variantId}` (`intents.ts:3,7-9`).

**Two latent bugs to fix rather than port:**
- SSR seeding gap — `CartProvider` accepts `initialCart` (`cart-context.tsx:65-78`) but its only call
  site (`providers.tsx:19` ← `app/layout.tsx:39`) never passes one. Cart always fetches client-side on
  mount (`cart-context.tsx:89-105`).
- `CART_CACHE_TAG = "shopify-cart"` (`server.ts:6`) is revalidated on every mutation
  (`actions.ts:103`) and attached to **nothing**. Correctness comes from the optimistic controller
  plus a visibility-change refetch (`cart-context.tsx:107-117`).

### 3. Checkout handoff

```ts
// app/cart/page.tsx:19-24 (identical at components/cart/cart-drawer.tsx:47-51)
const confirmed = await settle();
if (confirmed?.checkoutUrl) {
  window.location.href = confirmed.checkoutUrl;
```

`settle()` (`controller.ts:358-367`) flushes debounced mutations and returns the confirmed cart.
Exactly one field crosses the boundary: `Cart.checkoutUrl: string` (`types.ts:162`).

**This is the field that does not port.** BigCommerce's redirect URL is single-use and must be minted
per click via `createCartRedirectUrls` — see `docs/research/04-bigcommerce-api-semantics.md`. `checkoutUrl`
has to become a server action, not a cart field.

No validation runs before the redirect — `utils.ts:17-28` defines `isRelativeUrl`/`isValidUrl` and
neither is ever called. `engine.ts:155-160` sets `checkoutUrl: ""` on a synthetic cart, so the truthy
check prevents navigating to `""` but the button silently does nothing with no error surfaced.

### 4. Search — two Shopify mechanisms, neither uses Sanity

- Predictive (modal + panel): `app/api/search/route.ts:22-25` → `PREDICTIVE_SEARCH_QUERY`
  (`queries.ts:434-507`, `predictiveSearch(limitScope: EACH, types:[PRODUCT,COLLECTION,QUERY])`).
- Full results: `app/api/search/full/route.ts:22-25` → `SEARCH_PRODUCTS_QUERY` (`queries.ts:373-432`).
- Empty state: `app/api/search/defaults/route.ts:16-24` → `ALL_COLLECTIONS_QUERY` + `BEST_SELLING_PRODUCTS_QUERY`.
- Both funnel through `search-query.ts:19-31`, rewriting `"white shirt"` → `"white* OR shirt*"`.

Sanity search exists but is blog-only — Fuse.js over `queryAllBlogDataForSearch`.

### 5. Type generation

- **Shopify: zero codegen.** No `.graphql` files, no codegen config anywhere in the repo. Queries and
  types are both hand-written and nothing enforces they agree.
- **Sanity: fully generated, out of `apps/web`.** `apps/studio` runs
  `sanity schema extract --enforce-required-fields && sanity typegen generate`, config at
  `apps/studio/sanity-typegen.json`, output redirected to `packages/sanity/src/sanity.types.ts`
  (4,335 lines). `apps/web` only imports `QueryXxxResult` types.
- They coexist by never touching. `app/products/[handle]/page.tsx:136-144` fetches both in parallel and
  hand-stitches. The one coupling point is `lib/markdown/documents.ts:274-276`,
  `productToMarkdown(shopify: ShopifyProduct, sanity: SanityProductDoc)`.
- **Three parallel "what is a product" shapes** to reconcile: live Storefront GraphQL, the Sanity
  `store.*` mirror, and Sanity's editorial-only fields.

## Shopify-only assumptions that will not port

1. **`gid://` IDs** — treated as opaque `string` throughout production code; the literal format appears
   only in test fixtures (`lib/cart/__tests__/controller.test.ts:48`). Good news: nothing parses the
   string. But the cart cookie holds a Storefront cart ID with Storefront lifecycle rules.
2. **Handle-as-slug doing double duty as the CMS foreign key** — `$handle` is the GraphQL lookup key,
   the route param, *and* the key Sanity content is queried by
   (`app/products/[handle]/page.tsx:83-85,138-140`). Sanity adopted Shopify's handle as its own
   primary key for the join. A replacement identifier must preserve a stable string slug in this role.
3. **`checkoutUrl` as the entire checkout contract** — see mechanism 3. Full rewrite, not a rename.
4. **`MoneyV2` = `{amount: string; currencyCode: string}`** (`types.ts:3-6`) — string-typed amount.
   Consumed by `formatMoney`, `AnimatedMoney`, `lib/cart/money.ts` minor-units math, every price display.
   BigCommerce returns numeric money values — check field-for-field before reusing.
5. **Relay `edges`/`node`** — generic convention, not Shopify-proprietary. What's Shopify-specific is
   the field set inside each node.
6. **Metafields positional-array contract** — `queries.ts:91-104` queries by identifier list;
   `metafields.ts:21-35` unpacks the positional result; the comment at `:5-6` warns order must track
   the identifier list by hand.
7. **Variant model with name-string-inferred taxonomy** — Color/Size inferred purely by option **name**
   matching `"color"|"colour"|"size"` (`options.ts:4-13`), not by any structural field. The UI depends
   on this convention for swatches vs size pills.
8. **Image CDN** — `image-loader.ts:3,38-51` hard-codes `cdn.shopify.com` and `?width=&quality=`;
   `next.config.ts` pins the same hostname in `images.remotePatterns`.
9. **Availability split product- vs variant-level** — `availableForSale` plus
   `quantityAvailable`/`totalInventory` in parallel; `product-card.ts:189-215` falls back between them
   depending on which query populated the data.
10. **Sort keys are Shopify's enum, unwrapped** — `components/collection/sort-selector.tsx:14-22`
    hard-codes `COLLECTION_DEFAULT|PRICE|TITLE|BEST_SELLING|CREATED` and passes them straight through
    as `$sortKey` with no translation layer.
11. **Filters round-trip an opaque JSON string — HIGHEST RISK FILE.**
    `components/collection/filter-panel.tsx:26-72` `JSON.parse()`s Shopify's `Filter.values[].input`
    looking for exactly `available`, `productType`, `productVendor`, `tag`, `variantOption:{name,value}`,
    `category:{id}`. A mismatched filter API parses into `null`, is caught at `:68-71`, and renders **no
    filters with no error**. This is Fable's tripwire, named.
12. **Search mini-language** — `search-query.ts:19-31` and `featured.ts:31`
    (`handles.map(h => \`handle:${h}\`).join(" OR ")`) both build Shopify's `field:value` grammar.
13. **Single global currency** — `NEXT_PUBLIC_STORE_CURRENCY` (`packages/env/src/client.ts:44`,
    default `"GBP"`). No `@inContext` multi-currency directive anywhere. Matches our single-currency v1.
14. **Prerendering is governed by Sanity, and the two detail pages disagree:**
    - `generateStaticParams()` sources from Sanity (`queryProductPaths`/`queryCollectionPaths`), not the catalog.
    - `app/products/[handle]/page.tsx:146-148` — `if (!sanityProduct || !shopifyResult.ok || !shopifyResult.data.product) notFound();`
      **A product in the catalog with no Sanity doc is unreachable.**
    - `app/collections/[handle]/page.tsx:96-100` deliberately inverts this, with a comment: the
      Shopify collection is required, the Sanity doc optional, so a catalog-only collection still renders.

    Consequence: the BigCommerce→Sanity sync is load-bearing for the storefront to function, not a
    Studio nicety.

## Dead code — delete during the fork, don't port

- `embla-carousel-react` and `node-fetch` — declared in `apps/web/package.json`, **zero imports** anywhere.
- `isValidUrl` / `isRelativeUrl` (`utils.ts:17-28`) — declared, never called.
- `CART_CACHE_TAG` — tagged to nothing.
- `apps/web/.env.example` lists **none** of the three `SHOPIFY_*` vars its own env schema requires
  (`packages/env/src/server.ts:15-17`). Already stale; fix regardless.

## Reusable as-is

**Zero-touch** (no `@/lib/shopify` import at all): `product/quantity-selector.tsx`,
`product/size-selector.tsx`, `product/product-accordion.tsx`, `cart/cart-line-variant-select.tsx`,
`cart/cart-toasts.tsx`, `cart/cart-toggle.tsx`, `search/paths.ts`, `search/search-input.tsx`,
`search/search-toggle.tsx`, `hooks/use-is-mobile.tsx`, `hooks/use-prefers-reduced-motion.ts`,
`app/@modal/default.tsx`, `collections/collections-content.tsx`, `collections/collections-sort.tsx`,
`app/collections/page.tsx`, and `lib/shopify/color.ts` (misfiled — move it out).

**One-import-swap** (generic logic, repoint the import): `product/color-swatch.tsx`,
`product/price-display.tsx`, `product/product-gallery.tsx`, `product/product-lightbox.tsx` (the FLIP
zoom and scroll-linked thumbnail tracking are fully generic), `cart/cart-summary.tsx`,
`collection/product-grid.tsx`, `collection/active-filters.tsx`, `sections/featured-products.tsx`,
`search/search-product-grid.tsx`.

**Highest-value reusable subsystem:** `lib/cart/{engine,controller,classify,intents,metadata,money,types}.ts`
— ~1,090 lines. Every file imports Shopify types for signatures, none contains Shopify business logic.
Debouncing, retry-with-backoff, optimistic-intent folding, synthetic-line-ID bookkeeping and
minor-units arithmetic are all platform-agnostic. Port = repoint type imports. Scope this as its own
step, separate from the GraphQL rewrite.

## Dependency notes

New in the fork: `@shopify/storefront-api-client ^1.0.9`, `@number-flow/react` (tweened prices),
`@portabletext/markdown` (the `.md` agent route), `sanitize-html` (Shopify `descriptionHtml`),
`vitest ^4.1.10` (replaced baseline's Playwright e2e — matches the new `lib/cart/__tests__`).
Removed from baseline: `swr` (consolidated onto `@tanstack/react-query`, already present in both),
`@sanity/codegen` and `@playwright/test` (typegen now runs only from `apps/studio`),
`@workspace/sanity-blocks`, `@workspace/tailwind-config`.
