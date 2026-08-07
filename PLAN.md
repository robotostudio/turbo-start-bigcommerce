# turbo-start-bigcommerce — build plan

Decided 2026-08-07 by Fable, on evidence from eight research documents in `docs/research/`.
Read `docs/research/00-decisions.md` first for the settled decisions this plan assumes.

**Q19 DECIDED: a denormalised inline stub — `productReference = {entityId, slug, title, imageUrl}`
(sibling `categoryReference`) — replacing every weak Sanity reference. `entityId` is the fetch key,
`slug` is the href key, `title`/`imageUrl` are a display cache. 10 phases, ~14.5 engineer-days.**

**Q22 DECIDED (revises Q12–Q14): the catalog sync does not run in v1, but its infrastructure ships.**
`packages/sanity-sync/` lands real and tested — write client, upsert semantics, reconcile script — and
is invoked by nothing. Turning the sync on later is wiring, not building. See P7.

---

# Part 1 — How the page builder references a BigCommerce product

## The fact that decided it

Three consumers demand three different keys **from document data**, and only the stub supplies all three.

1. **Hrefs are built inside GROQ, not in components.** `packages/sanity/src/query.ts:41` —
   `type == "product" => "/products/" + product->store.slug.current` — and the same `select()` repeats at
   `:114, :151, :191, :501, :528, :557, :574`. The slug must exist as Sanity data at query time.
   An entityId-only option would force rewriting every link fragment *and* every component receiving the
   resolved `href`. Dead on arrival.
2. **Studio previews are synchronous `select()`s over document paths.** `definitions/custom-url.ts:123`
   (`productTitle: "product.store.title"`), `blocks/layers-showcase.ts:42`, `objects/hotspot/spot.tsx:39-46`.
   Without a stored title every page-builder row reads "Untitled". A live fetch per list row is flaky,
   slow, and impossible inside `prepare()`.
3. **Renames and deletes need the immutable key.** BigCommerce URL paths are editable; `entityId` is not.
   A handle-only stub silently 404s after a rename with no way to detect "same product, new slug".

## The stub is forward-compatible with the sync, by design

`entityId` is also the deterministic document `_id` key for the future sync: a synced product document
lands at **`bigcommerceProduct-{entityId}`** (siblings `bigcommerceProductVariant-`,
`bigcommerceCategory-`), mirroring the `shopifyProduct-{id}` convention research 01 found in the fork
base (`objects/shopify/product-with-variant.tsx:34-36`).

The consequence is the point: when the sync turns on, GROQ can join a stub to its document with

```groq
"doc": *[_id == "bigcommerceProduct-" + string(^.entityId)][0]
```

**without migrating a single stored page.** Every stub written in v1 becomes joinable the day the sync
runs. Stubs and documents are not alternatives — the stub is the read side of the sync, shipped first.

The stub is not a compromise — it is the union of those obligations, with staleness contained by
construction. **Every live fetch keys on `entityId`** (`site.products(entityIds:)`, proven in Catalyst
`core/app/[locale]/(default)/(faceted)/fetch-compare-products.ts:26`) and **every href resolves through
`site.route(path:, redirectBehavior: FOLLOW)`** (Catalyst `core/proxies/with-routes.ts:22`), which
follows the 301s BigCommerce auto-creates on URL change. Only `title`/`imageUrl` can go stale, and they
are never trusted at render.

**On being first:** correct — no verified BigCommerce+Sanity repo implements this (research 03). It does
not change the answer, because the alternative set is empty. Handle-only and entityId-only fail hard
requirements above; Pattern B needs the sync we deferred; and the sneaky fourth option — the picker
creating throwaway `product` documents on selection — is Pattern-B staleness without Pattern-B sync,
exactly the hole `scripts/cleanup-stale-sanity.ts` existed to mop up. The whole pattern is ~60 lines of
schema plus one input component.

## Schema surgery

**Deleted outright** (paths under `apps/studio/`):

| File | Why |
|---|---|
| `schemaTypes/documents/product.tsx`, `product-variant.tsx`, `collection.tsx` | The documents that no longer exist |
| `schemaTypes/objects/shopify/` — all 11 files | The `store.*` mirror and its scaffolding |
| `schemaTypes/objects/link/link-product.tsx` | **Already dead** — registered at `objects/index.ts:37` but no block's marks include it; `definitions/rich-text.ts:39-46` wires only `customLink` |
| `schemaTypes/objects/custom-product-option/` (4 files) | Registered, referenced nowhere (grep-verified) |
| `components/media/shopify-document-status.tsx`, `components/inputs/product-hidden.tsx`, `components/inputs/proxy-string.tsx`, `components/studio/navbar.tsx`, `utils/shopifyUrls.ts`, `utils/getPriceRange.ts` | Their only consumers are deleted files |
| `scripts/cleanup-stale-sanity.ts`, `scripts/migrate-handoff/` (1,676 LOC) | Existed only because synced docs existed |
| `structure.ts:87-115` Commerce section | Shrinks to Color Themes. `collectionsIndex` (pure editorial) survives, renamed `categoriesIndex` |

**Rewritten:** `blocks/featured-products.ts`, `blocks/layers-showcase.ts`, `definitions/custom-url.ts`,
`objects/module/collection-reference.tsx` → `category-reference`, `objects/collection/collection-group.ts`,
`collection-links.ts`, `objects/hotspot/spot.tsx` (preview paths only), `blocks/editorial-two-up.ts`.

### The new type

```tsx
// apps/studio/schemaTypes/definitions/product-reference.tsx
import { TagIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";
import { ProductReferenceInput } from "../../components/inputs/product-reference-input";

/**
 * Denormalised pointer to a BigCommerce product. No product documents exist in
 * Sanity (no catalog sync in v1) — this object is the page builder's only link
 * to the catalog.
 *
 *   entityId — immutable BigCommerce key; every live fetch uses it
 *   slug     — BC URL path without slashes; GROQ builds hrefs from it,
 *              renames are healed by site.route(redirectBehavior: FOLLOW)
 *   title / imageUrl — display cache for Studio previews; never trusted at render
 */
export const productReference = defineType({
  name: "productReference",
  title: "Product",
  type: "object",
  icon: TagIcon,
  components: { input: ProductReferenceInput },
  fields: [
    defineField({
      name: "entityId",
      title: "BigCommerce product ID",
      type: "number",
      validation: (Rule) => Rule.required().integer().positive(),
    }),
    defineField({
      name: "slug",
      title: "URL slug",
      type: "string",
      description: "BigCommerce URL path without slashes, e.g. `blue-oxford-shirt`",
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "title", type: "string" }),
    defineField({ name: "imageUrl", type: "url" }),
  ],
  preview: {
    select: { title: "title", slug: "slug", imageUrl: "imageUrl" },
    prepare: ({ title, slug, imageUrl }) => ({
      title: title ?? "Untitled product",
      subtitle: slug ? `/products/${slug}` : "not linked",
      media: imageUrl ? <img alt="" src={imageUrl} style={{ objectFit: "cover" }} /> : TagIcon,
    }),
  },
});
```

`categoryReference` is the same shape with `CategoryReferenceInput` and subtitle `/categories/{slug}`.

The reborn picker replaces the old document-reference pair:

```tsx
// apps/studio/schemaTypes/objects/commerce/product-with-variant.tsx
export const productWithVariant = defineType({
  name: "productWithVariant",
  title: "Product with variant",
  type: "object",
  icon: TagIcon,
  fields: [
    defineField({ name: "product", type: "productReference", validation: (R) => R.required() }),
    defineField({
      name: "variantEntityId",
      title: "Variant",
      type: "number",
      description: "First variant is used if left empty",
      components: { input: VariantSelectInput },
      hidden: ({ parent }) => !parent?.product?.entityId,
    }),
    defineField({ name: "variantLabel", type: "string", hidden: true }),
  ],
  preview: {
    select: { title: "product.title", variant: "variantLabel", imageUrl: "product.imageUrl" },
    prepare: ({ title, variant, imageUrl }) => ({
      title: [title ?? "Untitled product", variant && `[${variant}]`].filter(Boolean).join(" "),
      media: imageUrl ? <img alt="" src={imageUrl} /> : TagIcon,
    }),
  },
});
```

The old variant validation (`product-with-variant.tsx:56-82`, a `references($productVariantId)` GROQ
check) dies with the documents. The input enforces variant∈product structurally — the dropdown only
lists the picked product's variants — and the storefront falls back to the first variant when the ID
doesn't resolve, the same fallback the schema already documents.

`custom-url.ts` diff: `allLinkableTypes` (`:5-11`) drops `product` and `collection`; the `product` field
(`:91-107`) becomes `type: "productReference"`; a `category` field of `categoryReference` joins it;
options (`:26`) become `["internal", "external", "email", "product", "category"]`; preview (`:123`)
`product.store.title` → `product.title`. `featuredProducts.products[]` becomes
`of: [{ type: "productReference" }]`, max 4 unchanged. `layersShowcase.product` becomes
`type: "productReference"` — which erases its known missing-`weak` inconsistency (research 01) by
construction: there is nothing left to dangle.

## The custom Studio input

**The Studio has no server context.** It is a static Vite SPA — any token given to it ships to the
browser. So no token goes in it at all.

- **Search:** `ProductReferenceInput` debounce-queries the **storefront's own `/api/search` route**,
  which is being rewritten for BigCommerce anyway and returns public catalog data any shopper can
  already query. The route gains `Access-Control-Allow-Origin` for the Studio origin (an `OPTIONS`
  handler plus one header; the data is public, so a permissive policy on this read-only route is safe).
  The Studio finds it via a new `SANITY_STUDIO_WEB_URL` env. The BigCommerce payload carries
  `entityId`, `path`, `name`, `defaultImage.url` — everything the stub needs. Picking a row writes all
  four fields via `set()` patches.
- **Variants:** `VariantSelectInput` reads the sibling `product.slug` via `useFormValue`, fetches the
  existing `/api/products/[slug]` route (already consumed client-side by `layers-showcase.tsx:47`),
  renders the dropdown, writes `variantEntityId` + `variantLabel`.
- **Categories:** `CategoryReferenceInput` fetches `/api/search/defaults` (exists today) and filters
  client-side. Category counts are small; no search API needed.
- **Liveness badge:** on mount with an existing value the input re-fetches by `entityId`; a miss renders
  a red "Not found in BigCommerce" badge — the `ShopifyDocumentStatus` affordance reborn — plus a
  **Refresh** button that re-patches `slug`/`title`/`imageUrl` from live data.

**Rejected:** a vanilla browser token calling BigCommerce directly from the Studio. It is a second secret
with a hard `allowed_cors_origins` cap of **two** origins (research 04), killed by localhost + prod +
preview studios needing three, and it doubles the rotation story for nothing.

**If the env isn't configured** or the web app is down, the input renders `props.renderDefault(props)` —
the raw fields — under a one-line warning card. The schema is plain fields; the input is sugar. Nothing
about content editing hard-depends on BigCommerce being reachable.

## GROQ rewrite — `packages/sanity/src/query.ts`

End state: **zero `store.` occurrences survive.** Today there are ~50.

| Site | Before | After |
|---|---|---|
| `customLinkFragment` :31-45 | `"/products/" + product->store.slug.current`; `coalesce(internal->slug.current, "/collections/" + internal->store.slug.current)` | `"/products/" + product.slug`; the collection branch dies → plain `internal->slug.current`; add `type == "category" => "/categories/" + category.slug` |
| `buttonsFragment` :100-118 | same `select()` | same rewrite — repeated verbatim at `imageLinkCardsBlock` :136-157, `faqAccordionBlock` :177-196, `queryPromoBannerData` :488-505, `queryFooterData` :507-534, `queryNavbarData` :536-577. **Extract one shared `hrefFragment`** — this select is pasted 8 times |
| `exploreCategoriesBlock` :224-235 | embedded `*[_type == "collection"]...[0...4]{store.*}` | subquery **deleted**; projection is `{..., buttons}`; the section fetches `site.categoryTree` live |
| `editorialTwoUpBlock` :248-262 | `collection->store.title / imageUrl / slug` | `category.title`, `category.imageUrl`, `"/categories/" + category.slug` |
| `layersShowcaseBlock` :264-272 | `product->store.slug.current`, `->store.title` | `"product": product{entityId, slug, title}` |
| `featuredProductsBlock` :274-280 | `array::compact(products[]->store.slug.current)` | `"products": products[]{entityId, slug}`; resolver swaps Shopify's `handle:x OR handle:y` grammar (`lib/shopify/featured.ts:31`) for `site.products(entityIds: $ids)`, editor order restored client-side as today (`featured.ts:40-45`) |
| navbar `collectionGroup` :578-596 | `collectionLinks[]->{store...}` | `collectionLinks[]{entityId, slug, title, imageUrl}` — same projected shape, zero derefs |
| `productWithVariantFragment` :665-687 | derefs both docs, exposes `gid`, `price` | inline `productWithVariant{ product{entityId, slug, title, imageUrl}, variantEntityId }`. Price and gid drop — the tooltip fetches live |
| `queryProductOGData` :433-458, `queryCollectionOGData` :460-486 | Sanity-side commerce snapshot | **deleted** — OG fetches BigCommerce live, cached |
| `queryProductByHandle` :738-753, `queryProductPaths` :755-757, `queryCollectionByHandle` :786-807, `queryCollectionPaths` :809-811, `queryAllCollections` :829-839 | the PDP/category Sanity layer | **deleted**. PDP and category pages are catalog-only; `generateStaticParams` flips to a build-time BigCommerce fetch |
| `productBodyFragment` :698-736, `collectionModulesFragment` :761-784 | product/collection editorial | die with their documents; a v2 sync restores them |
| `sitemap.ts:47-60` | sourced from the two deleted path queries | re-pointed at the BigCommerce catalog path fetchers shared with `generateStaticParams` and `llms.txt` |

## Deleted or renamed in BigCommerce while Sanity still points at it

| Event | Surface | Behaviour | Guard |
|---|---|---|---|
| Deleted | featured grid | `site.products(entityIds:)` returns only live products; missing ones drop; empty grid renders null (`featured-products.tsx:14`) | none needed |
| Deleted | layers showcase / hotspot | live fetch returns null → block hides, spot skipped (`layers-showcase.tsx:50`) | render-time null guards; add the missing one in the hotspot tooltip |
| Deleted | link hrefs | `/products/x` → route miss → `notFound()` | the unavoidable one without sync. Studio shows the red badge next time anyone opens the doc. README caveat |
| Renamed (slug) | link hrefs | stale slug → PDP resolves via `site.route(redirectBehavior: FOLLOW)` → 301 to canonical | belt: all data fetches key on `entityId` and never notice |
| Renamed (title) / image swapped | Studio previews | cosmetic only — live data overrides everything user-facing | Refresh button re-patches the cache |
| Merchant disabled auto-redirects | link hrefs | 404 | `entityId` still correct; editor re-picks; README caveat |

**Write this down: a stub is a claim, not a truth.** Every runtime consumer verifies it against live
BigCommerce. The only surfaces that trust it blind are Studio previews and href strings, and both have
explicit heal paths.

## The three addendum consumers

**OG images — live fetch, cached; the bespoke card survives.** `getSEOMetadata` (`lib/seo.ts:111-112`)
sends `type=product&id={slug}` instead of a Sanity `_id`; `og-data.ts:30`'s product branch becomes one
BigCommerce fetch with `next: { revalidate: 3600 }`. The distinctive product card at `route.tsx:353`
(price, compare-at, colour swatch hexes, image) survives byte-for-byte — all its inputs come from that
one fetch. Crawler latency ≈ one GraphQL round trip cold, ~0 warm. "Cached snapshot" was rejected as a
sync by another name; "drop price" trades the family's most distinctive OG output for one cached call.

**`exploreCategories` — live `site.categoryTree` slice.** The embedded Sanity query never gave editors
control anyway; it hard-selected `[0...4]`. Parity is a server-component fetch of the first four
top-level categories. No new schema field, no editor UI, one fewer GROQ subquery. If editors later want
curation the field is `of: [{type: "categoryReference"}]` — a v1.1 nicety.

**Hotspots — KEEP, and the stub fixes a live bug.** The current hosts die with their documents
(`product.tsx:60` body, `collection.tsx:96` modules) but blog rich text remains a first-class host:
`blog.ts:111-112` uses the full `richText` type, which includes `imageWithProductHotspots`
(`rich-text.ts:70-73`). The generic `richTextFragment` spreads `...` **without dereferencing**, so
hotspots in blog bodies today arrive as dead `_ref`s and `product-hotspots.tsx:55`
(`if (!product?.store) return null`) silently drops every spot. Self-contained stub data survives the
spread — hotspots in blog posts start working. The web tooltip renders instantly from the stub and
lazily `useQuery`-fetches live price on first activation, the pattern `layers-showcase.tsx:45-52`
already uses. `sanity-plugin-hotspot-array@5.0.12` declares `sanity: "^5 || ^6.0.0-0"` — verified
v6-compatible, so nothing here blocks the upgrade phase.

## `.md` content negotiation

`productToMarkdown(shopify, sanity)` (`lib/markdown/documents.ts:274-277`) becomes **single-arg**. The
`sanity` parameter's entire footprint is `portableTextToMarkdownString(sanity?.body)` at `:282` and the
editorial section at `:305` — already optional-chained. Delete both. `collectionToMarkdown` (`:312-314`)
already ignores its `_sanity` param — the underscore was the confession — so it becomes single-arg for
free. The metafields section (`:228`) is re-derived from BigCommerce's **namespace-keyed**
`metafields(namespace:)` connection, which also kills the fragile positional-array contract
(`lib/shopify/metafields.ts:21-35`). `proxy.ts` and `/api/markdown` are structurally untouched.

---

# Part 2 — Phases

Interpretation of the "same commit" constraint that keeps commits reviewable: `lib/bigcommerce` is built
dark across several commits (nothing imports it), then **one flip commit** repoints every
`@/lib/shopify` import and deletes `lib/shopify/` in the same diff. Before the flip Shopify is the only
live path; after, BigCommerce is. Nothing half-lives.

### P0 — Fork & amputate (0.5d)

Repo is `turbo-start-bigcommerce`, dead weight gone, CI at family parity.

Files: root/app `package.json`s, README header, `turbo.json` globalEnv, `packages/env/src/server.ts`
(add BigCommerce vars — Shopify vars stay until the flip so the build keeps passing), both
`.env.example`s (writing the web one fixes its already-stale state), `.github/workflows/` (adopt
baseline `ci.yml`, `e2e.yml`, issue/PR templates — absent only through fork drift, research 01).

1. `chore: rename turbo-start-shopify -> turbo-start-bigcommerce`
2. `chore: delete migrate-handoff scripts (1,676 LOC)`
3. `chore: delete dead code` — `embla-carousel-react` + `node-fetch`, `isValidUrl`/`isRelativeUrl`
   (`utils.ts:17-28`), `CART_CACHE_TAG` + `invalidateCartCache` (`lib/cart/server.ts:6,31-33`,
   `app/cart/actions.ts`), studio `components/studio/navbar.tsx`, `objects/link/link-product.tsx`,
   `objects/custom-product-option/`
4. `chore(env): add BIGCOMMERCE_STORE_HASH / BIGCOMMERCE_CHANNEL_ID / BIGCOMMERCE_STOREFRONT_PRIVATE_TOKEN; write real .env.examples`
5. `ci: adopt baseline workflows; add shopify-grep gate as warn-only` (becomes required in P7)

**Done when:** `pnpm i && pnpm lint && pnpm check-types && pnpm build` green with dummy env;
`git grep -l "migrate-handoff\|embla-carousel\|CART_CACHE_TAG"` returns nothing.

### P1 — BigCommerce foundation (1d)

Typed GraphQL access that typechecks on a fresh clone with no store.

Files: `packages/bigcommerce-client/` (vendor `@bigcommerce/catalyst-client` **from GitHub, not npm** —
the npm tarball lacks the SPDX `license` field, research 06), `apps/web/bigcommerce.graphql` (committed
schema), `apps/web/src/lib/bigcommerce/client.ts` (wrapper preserving the exact
`{ok:true,data}|{ok:false,error,kind}` contract of `lib/shopify/client.ts:9-13` — every caller depends
on it), gql.tada wiring in `apps/web/tsconfig.json`, `scripts/schema-pull.ts`.

**Also here, not P7 — a minimal catalog seed.** P2's definition of done requires a populated sandbox
(prerendering the catalog, capturing product-card fixtures), so the seed cannot wait five phases. Ship
the smallest thing that unblocks it: enough products to page, variants with options, images, and **at
least one multi-segment category path** (`/shop-all/shirts/`) so the catch-all route work in P2 is
exercised against a real path shape. The polished CLI (`--clean/--batch/--verbose`), the verify script
and the docs stay in P7.

**Done when:** fresh clone with **no** credentials — `pnpm check-types` green. With sandbox credentials —
`pnpm tsx scripts/smoke-bc.ts` prints `site.settings.storeName`, and `pnpm seed:min` populates a
sandbox that P2 can build against.

### P2 — Catalog reads + THE FLIP COMMIT (2.5d)

Every shopper-facing read runs on BigCommerce; `lib/shopify/` no longer exists.

Files: `lib/bigcommerce/{queries,types,product-card,image-loader,featured,options,variant-utils,money,metafields}.ts`;
`app/products/[...slug]/page.tsx` + `app/categories/[...slug]/page.tsx` — **catch-all segments**, because
BigCommerce paths are multi-segment by default (`/shop-all/shirts/`), and joining `slug.join("/")` into
`site.route()` kills that whole bug class. ~~`/collections` renames to `/categories`~~ — **SUPERSEDED 2026-08-07. The route prefix stays
`/collections`.** The rename was proposed here on the argument that a BigCommerce starter whose primary
commerce noun is Shopify's reads as residue. It was rejected: renaming public URLs is one-way, keeping
them is not. See SPEC.md and ROB-2537. `generateStaticParams` from a build-time
catalog fetch with an env cap. PDP flips to **catalog-required / Sanity-none** — the `!sanityProduct`
gate at `products/[handle]/page.tsx:146-148` goes, and BigCommerce's native
`seo { pageTitle, metaDescription }` means metadata doesn't regress. API routes rewritten. Cart actions
repointed at BigCommerce cart CRUD with the cart ID still in a renamed httpOnly cookie. **`checkoutUrl`
removed from the `Cart` type**, replaced by a `redirectToCheckout` server action stub. Filter panel
renders its explicit empty state. `next.config.ts` `remotePatterns` → `*.bigcommerce.com`. Image loader
re-derived from BigCommerce's `urlTemplate("{:size}")` semantics.

The flip commit **deletes `lib/shopify/` in the same diff** — including the variant-image heuristic,
which is re-derived and mostly *deleted*: BigCommerce's model (product images plus per-variant
`defaultImage` override) doesn't have the Shopify quirk that the 76-line `colorsByImage` fallback
(`product-card.ts:110-186`) worked around.

**Done when:** `pnpm build` prerenders the seeded catalog; rewritten `product-card` vitest suite green
**from BigCommerce fixtures captured in the sandbox** (write the fixtures *before* porting the mapper —
this is the tripwire from research 02); `git grep -c "lib/shopify"` = 0; manual smoke of home, category,
PDP, keyword search against the sandbox.

### P3 — Sessions, checkout, auth (1.5d)

Cart ID in JWTs, hosted-checkout redirect, guest→customer merge.

Files: `auth/index.ts` (Auth.js credentials provider on BigCommerce `login` with `guestCartEntityId`),
`auth/anonymous-session.ts` (guest JWT, Catalyst's shape — `core/auth/anonymous-session.ts:5,31-35`),
`lib/cart/server.ts` reimplemented over the session — its `getCartId`/`setCartId`/`clearCartId`
signatures are the seam, so zero caller changes. `redirectToCheckout` calls `createCartRedirectUrls`
**per click, never cached**; the two checkout buttons (`app/cart/page.tsx:19-24`,
`cart-drawer.tsx:47-51`) call the action after `settle()` instead of reading `cart.checkoutUrl`. Copy
Catalyst's last-item-removed cookie clear (`remove-item.ts:56-63`) and login cart merge
(`login/_actions/login.ts:21,30-35`).

**Done when:** vitest green (engine/controller semantically untouched); scripted e2e against sandbox —
add → update → remove → checkout returns a 302 to the BigCommerce checkout domain **twice in a row**
(proves per-click minting); login with a guest cart merges it.

### P4 — Faceted search (1.5d)

One `searchProducts` adapter serving search page, category pages and typeahead (research 08: identical
field, different filter payload; no `predictiveSearch` equivalent — typeahead is `products(first: 5)`
with client-side grouping).

Files: `lib/bigcommerce/faceted-search.ts` (filters input builder + URL-param codec; size anchor is
Catalyst's 190-line `facets-transformer.ts`), `components/collection/filter-panel.tsx` **rewritten**
around the `__typename` union — the `JSON.parse` of Shopify's opaque `input` (`filter-panel.tsx:26-72`)
has no counterpart; the presentational shell survives. `sort-selector.tsx` remapped to BigCommerce's two
sort enums. **Pass `first:` on facet value connections** — Catalyst omits it and silently truncates long
facet lists (research 08). Drop the `productType`/`tag` panels; no BigCommerce counterpart exists.

**Done when:** `/search?q=` returns sandbox products; facet selections round-trip through the URL; a
store with Product Filtering off shows the explicit "no filters available" state **and logs one
server-side warning** — a vitest case on the transformer: empty `filters.edges` → `{state: "unavailable"}`,
never `[]`-rendered-as-nothing.

### P5 — Studio stubs + GROQ rewrite (2d)

All of Part 1 lands. Files: the three input components, the `query.ts` rewrite (including extracting the
8-times-pasted href `select()`), pagebuilder consumers (`pagebuilder.tsx` featured-products wiring
`page.tsx:56-61`, `layers-showcase.tsx` props, hotspot tooltip live fetch, `editorial-two-up.tsx`,
`explore-categories.tsx` live categoryTree), OG re-key, markdown single-arg, sitemap re-point,
`structure.ts`, CORS on `/api/search`.

**Done when:** `pnpm --filter studio type` green and the generated `sanity.types.ts` diff contains
**zero** `store` fields; Studio boots; picking a product in a Featured Products block round-trips (badge,
refresh, manual-entry fallback with the env unset); home renders the picked products via `entityIds`.

### P6 — Customer accounts (1.5d)

Files: `app/account/{page,orders,addresses,settings}` plus actions on `registerCustomer`,
`updateCustomer`, `addCustomerAddress`, `updateCustomerAddress`, `deleteCustomerAddress`,
`changePassword`, `requestResetPassword`. Customer-scoped fetches send `X-Bc-Customer-Access-Token`
beside the private token (research 04). Surface the documented single-device constraint in UI copy.

**Done when:** scripted e2e — register → login → orders empty state → address create/edit/delete →
password change → logout.

### P7 — Sync infrastructure, dark (1.5d)

The catalog sync does not run in v1 (Q12–Q14), but its hard part ships built and tested (Q22). The hard
part is the upsert semantics, not the transport — so this phase builds the write path and the reconcile
sweep, and deliberately does **not** build the webhook receiver. Nothing invokes any of it.

Sequenced here rather than earlier because P8's seed script needs the same Sanity write client to patch
stub `entityId`s into imported demo documents — build it once, use it twice.

Files: `packages/sanity-sync/`
- `client.ts` — Sanity write client, its own `SANITY_API_WRITE_TOKEN` (**not** read from
  `apps/web/.env.local` the way `cleanup-stale-sanity.ts:20` did — that cross-app coupling was a bug,
  research 01).
- `upsert.ts` — the two rules that research 01 found written down nowhere in the fork base, and that
  cost real editor data if rediscovered late:
  1. **Patch the `store` subtree only. Never `createOrReplace()` the document.** `body`, `hero`,
     `modules`, `seo` are editor-owned siblings; a whole-doc overwrite destroys editor work on every
     sync run.
  2. **Soft-delete via `store.isDeleted`, never remove the document.** Skipping this is precisely why
     `scripts/cleanup-stale-sanity.ts` had to exist as a separate manual sweep.
  Deterministic `_id`s: `bigcommerceProduct-{entityId}`, `bigcommerceProductVariant-{entityId}`,
  `bigcommerceCategory-{entityId}`.
- `reconcile.ts` + `pnpm sync:reconcile` — paginates `GET /v3/catalog/products?date_modified:min=`
  (page max 50, **drops to 10 when `include`ing options or modifiers** — research 01) and upserts.
  This is the load-bearing piece: BigCommerce webhooks have **no CRUD events for variants**, **none for
  brands**, and product image changes mostly don't fire an update ("changing the current thumbnail…
  does not generate an update event"). Payloads are ID-only, unordered and can duplicate. A webhook-only
  sync is structurally incomplete, so the reconcile sweep is the primary mechanism and webhooks are only
  a latency optimisation on top.
- `schema/` — the `store.*` object types and the three document types, exported but **not registered**
  in `apps/studio/schemaTypes/index.ts`. Registering them would give editors a permanently blank
  "Products" list, which is worse than absent. Registration is the flip that turns the sync on.

Deliberately **not** built: `/api/bigcommerce/webhook`. Building the transport before the reconcile
logic is proven means a live endpoint writing nothing, which rots unnoticed. Its design is written up
in `docs/sync-design.md` (header-auth via the optional `headers` object at hook creation — the `hash`
field is an unkeyed SHA-1 for dedup only, **not** a signature).

**Done when:** `pnpm sync:reconcile --dry-run` against the seeded sandbox prints the exact mutations it
would issue and writes nothing; a vitest suite proves the upsert patches `store` while leaving a
sibling `body` field untouched, and that a delete sets `store.isDeleted` rather than removing the
document; `git grep -rn "sanity-sync" apps/` returns nothing (the package is genuinely unwired).

### P8 — Seed, verify, docs, gate (1d)

Files: `scripts/seed-bigcommerce/` (Faker catalog via REST Catalog v3, keeping the
`--clean/--batch/--verbose` CLI shape; **two-phase** — create BigCommerce products, then import the
Sanity seed tarball and patch stub `entityId`s into the demo docs by slug lookup, because stubs can't
ship hardcoded IDs when every sandbox mints its own), `scripts/verify-bigcommerce.ts`,
README/CLAUDE.md/CONTRIBUTING rewrite (the private-token mint command with `expires_at` +1yr, the facet
plan-gate caveat, the v2 sync design pointer to research 01 and 03). Flip the CI grep gate to
**required**.

**Done when:** on a fresh sandbox `pnpm seed && pnpm build && pnpm verify` green;
`git grep -riE 'shopify|sanity connect' | grep -v CHANGELOG` exits empty.

### P9 — Sanity v6 + polish (1.5d)

Only starts after P2–P8 are green. `sanity ^6`, `next-sanity 13.1`, `@sanity/vision ^6`,
`@sanity/codegen ^7`, Next `16.1.3 → 16.2.9`, pnpm pin, port `tailwind-config` (6 LOC), adopt baseline's
Playwright smoke spec extended with PDP/cart/checkout-redirect/search steps.

**Done when:** `pnpm build && pnpm --filter studio type && pnpm e2e` green; `pnpm why sanity` shows 6.x only.

---

# Part 3 — Tests

**`lib/cart/__tests__/` — 1,467 LOC:**

- `money.test.ts` (55 LOC): **unchanged.** Keep the internal `MoneyV2 = {amount: string, currencyCode}`
  shape and stringify BigCommerce's numeric money once in the adapter. One line there saves touching
  every price display and this suite.
- `engine.test.ts` (268 LOC): fixture edits only — line/merchandise IDs, and `checkoutUrl` deleted from
  the `Cart` type (the synthetic cart at `engine.ts:155-160` loses the field). Folding assertions untouched.
- `controller.test.ts` (936 LOC): `gid://` fixtures (`:48`) → BigCommerce IDs; `settle()` no longer
  carries `checkoutUrl`. Debounce/retry/optimistic assertions untouched. ~50–80 lines.
- `classify.test.ts` (208 LOC): **rewrite.** The taxonomy input is Shopify-shaped (`userErrors` codes).
  Map BigCommerce's typed mutation errors onto the *same* `CartErrorCode` enum so the controller suite
  never notices. Table-driven from payloads captured in the sandbox.

**New suites:** `normalize-cart.test.ts` (BigCommerce cart JSON → internal `Cart`; must cover the
`physicalItems`/`digitalItems` merge into one `lines` list) · `product-card.test.ts` rewritten from
live-captured fixtures, **keeping the 20 existing case names as the behavioural spec** ·
`checkout-action.test.ts` (two invocations → two distinct redirect URLs, no caching) ·
`facets-transformer.test.ts` (union parsing + empty-facets-means-unavailable) · `featured.test.ts`
(entityId order restoration) · markdown suite on BigCommerce fixtures.

---

# Part 4 — Risks

| # | Risk | Early warning | Cheapest mitigation |
|---|---|---|---|
| 1 | **Facets are plan-gated** (Pro/Enterprise ≈ Scale/Performance, exact tier unconfirmed) and the failure is **silent** — empty `filters` while products load | Day 1 of P4: sandbox query returns `filters.edges: []` (also tells you whether partner sandboxes have Product Filtering at all) | Explicit "filters unavailable" state + one server-side warn log; README note; keyword search and sort never depend on it |
| 2 | **Single-use checkout URL mishandled** — double click, back button, or a future dev re-caching it | Second sequential checkout click errors on the BigCommerce domain in e2e | Mint inside the server action per click; disable the button in flight; the two-mints e2e plus removing the field from the `Cart` type makes re-caching a type error |
| 3 | **Auth.js v5 beta × Next 16 friction** (Catalyst pins `5.0.0-beta.30`) | P3 day 1: session callback type errors, or cookies not set in dev | Pin Catalyst's exact beta; copy its `auth/index.ts` and anonymous-session shape verbatim. Pre-agreed fallback: hand-rolled httpOnly cookie (research 04, "legitimately small diff"). **Decide by end of P3 day 1, not later** |
| 4 | **Residual Shopify semantics under new names** — the grep gate cannot catch semantics (variant-image heuristic, tag-string badges, `custom.*` metafield keys, sort enums) | Rewritten product-card tests fail against transliterated logic; seeded catalog shows wrong card images | Capture fixtures and write card tests **before** porting the mapper; delete rather than translate `colorsByImage`; re-derive badge/metafield conventions in the seed so the demo exercises them |
| 5 | **Build-time catalog fetch scales badly** (complexity limit 10,000/query) | Build minutes climb; `X-Bc-Graphql-Complexity` nears the limit in the paginated paths fetch | Env-capped `generateStaticParams` — prerender first N, rest on-demand ISR. The client logs the complexity header for free |

---

# Part 5 — Estimate

| Phase | Days |
|---|---|
| P0 fork & amputate | 0.5 |
| P1 foundation | 1 |
| P2 catalog reads + flip commit | 2.5 |
| P3 sessions/checkout/auth | 1.5 |
| P4 faceted search | 1.5 |
| P5 studio stubs + GROQ | 2 |
| P6 customer accounts | 1.5 |
| P7 sync infrastructure (dark) | 1.5 |
| P8 seed/verify/docs/gate | 1 |
| P9 Sanity v6 + e2e | 1.5 |
| **Total** | **14.5** (range 12.5–17) |

**Why the earlier ~7-day number was wrong:** it priced a different scope. No customer accounts at all
(+1.5), no gql.tada/committed-schema infrastructure (+0.5), "search/filters/verify/green" as a single
day when the filter panel is a verified rewrite with its own transformer and URL codec (+1), and a
studio estimate that assumed a sync writing `store.*` docs — the stub world instead needs three custom
inputs, a full rewrite of every link fragment, and the OG/markdown/sitemap re-keying (+1), plus the
two-phase seed that exists only because stubs can't ship hardcoded entityIds (+0.5). Its v6 estimate
(1–2d) was right and is kept.

## If the deadline halves (14.5 → ~7)

Cut in this order:

1. **Customer accounts and Auth.js entirely** (−3). P6 goes; P3 shrinks to checkout-redirect-only on the
   plain httpOnly cart cookie. Guests check out fine; login and cart merge become the fast-follow.
2. **The sync infrastructure** (−1.5). P7 drops to the `docs/sync-design.md` write-up plus the
   deterministic `_id` scheme — which is free and must survive, because it is what keeps the sync from
   becoming a content migration later.
3. **The facet panel** (−1). Keyword search and sort ship; the URL codec is deferred, which also parks
   risks 1 and 4's worst file.
4. **The Sanity v6 upgrade** (−1.5). Ship on v5, the fork's native version — it is already an isolated
   phase by design.
5. **Bespoke product OG and input polish** (−0.5). Static full-bleed OG for products; category input
   ships as raw fields.

**Never cut:** the stub schema + GROQ rewrite (the starter's identity), the deterministic `_id` scheme,
the flip-commit discipline, per-click checkout minting, the seed script, or the grep gate. Each is
either the product itself or a one-way door.
