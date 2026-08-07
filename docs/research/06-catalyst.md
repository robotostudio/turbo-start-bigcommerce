# Finding 06 — BigCommerce Catalyst source read

`bigcommerce/catalyst` @ `7848623` (2026-08-05), `canary` branch. 243★ / 356 forks. Created 2023-02-07,
pushed 2026-08-06. **MIT.** Read 2026-08-07. Paths relative to repo root.

No separate `catalyst-core` repo — that's the npm name of the `core/` workspace. `bigcommerce/nextjs-commerce`
is a stale unmodified fork of `vercel/commerce` (last push 2025-12-15), not the successor.
`bigcommerce/storefront-kit` publishes to npm as MIT but **its GitHub repo 404s** — source not browsable.

Live, fast-moving: changesets version each package independently, multiple times a day.
`@bigcommerce/catalyst-core@1.10.1`, CLI `1.2.0`, `@bigcommerce/catalyst-client@1.0.2`,
`create-catalyst@2.0.3`.

## Shape

pnpm workspaces + Turborepo. `pnpm-workspace.yaml:1-2` → `packages: [core, packages/*]`.
`packageManager: pnpm@10.12.4`. Next **16.2.11** (pinned; bumped for the July 2026 security release).
React 19.1.7. App Router only — no `core/pages` directory exists.

**`core/package.json:8` requires `"node": ">=24.0.0"`** — load-bearing. Next 16 renamed `middleware.ts`
to `proxy.ts` and it runs on the **Node runtime, not Edge**. Catalyst's own changelog spells this out.

## The GraphQL layer — gql.tada, not graphql-codegen

`core/tsconfig.json:20-30` — wiring is a TS-LSP plugin, no codegen CLI step:

```json
{
  "name": "@0no-co/graphqlsp",
  "trackFieldUsage": false,
  "shouldCheckForColocatedFragments": false,
  "schemas": [
    { "name": "bigcommerce", "schema": "./bigcommerce.graphql", "tadaOutputLocation": "./bigcommerce-graphql.d.ts" }
  ]
}
```

```ts
// core/client/graphql.ts
export const graphql = initGraphQLTada<{
  introspection: introspection;
  scalars: { DateTime: string; Long: number; BigDecimal: number; UUID: string };
  disableMasking: true;
}>();
```

`disableMasking: true` — consumers read fragment fields directly.

**The schema is NOT in the repo.** `core/scripts/generate.cjs` (70 lines) introspects a *live* store at
`https://store-{hash}-{channel}.mybigcommerce.com/graphql` with
`Authorization: Bearer <BIGCOMMERCE_STOREFRONT_TOKEN>`, writing `core/bigcommerce.graphql` and
`core/bigcommerce-graphql.d.ts` — **both gitignored**. `npm run dev` runs `generate` before `next dev`.
Every clone needs a live BigCommerce store and token just to typecheck.

**Fragment colocation is real.** Components own a sibling `fragment.ts`; the route's `page-data.ts`
imports from sibling component directories *and* shared `core/client/fragments/*`, composing via
gql.tada's `graphql(doc, [fragment, ...])`. `core/app/[locale]/(default)/product/[slug]/page-data.ts:104-134`
shows fragment-of-fragments — `ProductOptionsFragment` built from six field-type fragments.
`core/client/fragments/pricing.ts:5` references an outer operation variable `$currencyCode` from
inside the fragment body.

## The client — the single highest-value thing to lift

Two layers:

1. **`packages/client/src/client.ts`** (288 lines) — framework-agnostic `Client` class, `createClient(config)`.
   Per request: `Content-Type`, `Authorization: Bearer <storefrontToken>`, `User-Agent`; conditionally
   `X-Bc-Customer-Access-Token`, `X-Bc-Error-On-Invalid-Customer-Access-Token: true` (default),
   `X-BC-Trusted-Proxy-Secret`. POSTs to
   `https://store-{hash}-{channelId}.{domain}/graphql?operation={name}&type={query|mutation}`.
   Has an `errorPolicy` (`none`/`all`/`auth`/`ignore`) and a logger reading back
   BigCommerce's `x-bc-graphql-complexity` response header.
   **Zero Next.js imports. Only runtime deps: `@0no-co/graphql.web`, `std-env`** (`packages/client/package.json:19-22`).
2. **`core/client/index.ts`** (89 lines) — the Next wrapper. `getChannelId` resolves channel from locale
   via a *dynamic* `import()` of `next-intl/server`, guarded in try/catch because static-importing
   `next/headers` inside `next.config.ts`'s module graph poisons process-wide `AsyncLocalStorage`
   (11-line comment at lines 6-15 — read it verbatim if vendoring). `beforeRequest` adds
   `X-Correlation-ID` via `core/client/correlation-id.ts`:
   `export const getCorrelationId = cache(() => crypto.randomUUID())` — a clean React `cache()`
   per-request memo. `onError` redirects to `/api/auth/signout` on `BigCommerceAuthError` for queries.

Clean seam. `@bigcommerce/catalyst-client` is copy-able on its own.

## Caching

**No `'use cache'`, no `cacheComponents`, no `dynamicIO`** — repo-wide grep empty on all three, despite
Next 16. All classic `fetch()`: `{ cache: 'no-store' }` for mutating/customer-scoped,
`{ next: { revalidate } }` for public reads. `core/client/revalidate-target.ts` is the whole default:
`process.env.DEFAULT_REVALIDATE_TARGET ?? 3600`. Per-query overrides — 60s variant inventory, 300s store status.

Tags in `core/client/tags.ts`: `TAGS = { cart: 'cart', checkout: 'checkout', customer: 'customer' }`,
invalidated as `revalidateTag(TAGS.cart, { expire: 0 })`.

Observed tension, reported not resolved: `core/app/[locale]/(default)/cart/page-data.ts:327-332` sets
**both** `cache: 'no-store'` and `next: { tags: [...] }` on the same fetch.

## Cart

Cart ID does **not** live in its own cookie. `core/lib/cart/index.ts:13-23`:

```ts
export async function getCartId(): Promise<string | undefined> {
  const anonymousSession = await getAnonymousSession();
  if (anonymousSession) return anonymousSession.user?.cartId ?? undefined;
  const session = await auth();
  return session?.user?.cartId ?? undefined;
}
```

Two JWT cookies, both `httpOnly`, `sameSite: 'lax'`, `__Secure-` prefixed over HTTPS:
- Authenticated: Auth.js default `authjs.session-token` (JWT strategy, `core/auth/index.ts:185-188`)
- Guest: bespoke `authjs.anonymous-session-token` (`core/auth/anonymous-session.ts:5,31-35`),
  encoded with `next-auth/jwt`'s `encode`/`decode` on the same `AUTH_SECRET`

`addToOrCreateCart` (`core/lib/cart/index.ts:49-76`) validates the existing cart, adds a line or creates,
then `revalidateTag(TAGS.cart, { expire: 0 })`.

Edge case worth copying, verbatim from `core/app/[locale]/(default)/cart/_actions/remove-item.ts:56-63`:

```ts
const cart = response.data.cart.deleteCartLineItem?.cart;
// If we remove the last item in a cart the cart is deleted
// so we need to remove the cartId cookie
// TODO: We need to figure out if it actually failed.
if (!cart) { await clearCartId(); }
```

**Checkout** is a Route Handler, not a server action —
`core/app/[locale]/(default)/checkout/route.ts` `GET`. Resolves `cartId`, gathers analytics
visit/visitor cookies and consent flags, calls `createCartRedirectUrls`, then
`redirect({ href: ...redirectUrls.redirectedCheckoutUrl, locale })` — a 302 off-app to BigCommerce's
hosted checkout (`bigcommerce/checkout-js`, a separate repo). **Catalyst does not implement checkout.**
Auth carries over via the `customerAccessToken` passed into the same call.

**Cart merge on login:** `core/app/[locale]/(default)/(auth)/login/_actions/login.ts:21,30-35` passes the
guest `cartId` into `signIn('password', {...})`; `core/auth/index.ts`'s `LoginMutation` sends it as
`guestCartEntityId`, and `handleLoginCart` (`:90-104`) toasts "cart restored" / "cart combined".

## Auth

Auth.js v5 **beta** (`next-auth: 5.0.0-beta.30`). Two `CredentialsProvider`s, no OAuth:
`id: 'password'` → BC `login(email, password, guestCartEntityId)`; `id: 'jwt'` →
`loginWithCustomerLoginJwt(jwt, guestCartEntityId)` for SSO.

Session strategy `jwt`, stock cookie names. Callbacks propagate `customerAccessToken`, `cartId`,
`firstName`, `lastName` (`:194-262`). `signOut` event (`:264-300`) calls BC's `LogoutMutation`, then
re-establishes an anonymous session and restores or clears the guest cart depending on whether BC's
persistent-cart feature is on.

`core/proxy.ts` composes six functions: `withAuth, withAnalyticsCookies, withIntl, withChannelId,
withGraphqlProxy, withRoutes`. Both `withAuth` (`:38`) and `withRoutes` (`:314`) independently call
`auth()` — **two session JWT decodes per matched request**.

## Routing — do NOT copy this part

`core/app/[locale]/(default)/[...rest]/page.tsx` is a 5-line `notFound()` stub. Real resolution happens
in `core/proxies/with-routes.ts` (468 lines) on every non-excluded request:

1. Query BigCommerce's `site.route(path: $path, redirectBehavior: FOLLOW)`.
2. Cache in pluggable KV keyed on `pathname + channelId`, 30 min TTL, SWR via `event.waitUntil`
   (`:186-199`). **Authenticated requests bypass the cache entirely** — the KV cache isn't namespaced
   by identity (`:278-286`).
3. `NextResponse.rewrite()` to a fixed segment by node type: `Product`→`/product/{entityId}`,
   `Category`→`/category/{entityId}`, `Brand`→`/brand/{entityId}`, `NormalPage`→`/webpages/{id}/normal/`,
   etc. `RawHtmlPage` skips the app entirely and returns raw HTML from the proxy (`:417-423`).

KV adapters (`core/lib/kv/index.ts:84-99`): Vercel Runtime Cache if `VERCEL === '1'`, else Upstash Redis
if configured, else **in-memory** — which won't share across instances on any non-Vercel multi-instance deploy.

**`generateStaticParams` appears exactly once in the whole `core/app` tree** — `layout.tsx:174-176`, for
locales only. No product or category is ever pre-generated. Catalog pages are never statically served;
every request pays the full proxy chain.

Streaming goes through a homegrown primitive, `core/vibes/soul/lib/streamable.tsx` (116 lines):
`Streamable<T> = T | Promise<T>`, `Streamable.from(thunk)` (via `p-lazy`), `Streamable.all()` a
Suspense-stable `Promise.all` backed by a `WeakRef` cache, and `<Stream value fallback>` wrapping
`<Suspense>` + React 19's `use()`. The product page alone creates ~20 `Streamable.from()` sources.

## Their own docs are wrong about PPR

`core/AGENTS.md` (11KB, written for AI agents) states in two places that Catalyst uses Partial
Prerendering. Repo-wide case-insensitive grep for `ppr`: **zero hits outside that doc**.
`core/next.config.ts`'s only `experimental` key is `optimizePackageImports`. Trust `next.config.ts`.

## i18n / channels / currency

Locales come from the merchant's live Control Panel, not a hardcoded list — `core/next.config.ts:16-33,52-58`
runs a `SettingsQuery` at config-load time and writes gitignored `core/build-config/build-config.json`
(Zod-validated). Routing via `next-intl`. 20 pre-translated message files in `core/messages/`.

Channels are a manual map — `core/channels.config.ts`, the whole file:

```ts
const localeToChannelsMappings: Record<string, string> = {
  // es: '12345',
};
function getChannelIdFromLocale(locale = '') {
  return localeToChannelsMappings[locale] ?? process.env.BIGCOMMERCE_CHANNEL_ID;
}
```

**Multi-channel + multi-locale is broken and BigCommerce knows it.** Issue #1950 (closed, not fixed): the
locale list is filtered only by the *default* channel's locales, "does not take into account any other
channels". A BC contributor points at `next-intl` domain routing as a manual workaround.

Multi-currency is separate and simple — a plain `currencyCode` cookie (`core/lib/currency.ts`, 38 lines),
gated behind cookie consent via `hasConsentFor('functionality')`.

## Lift-ability

One MIT `LICENSE` at root covers everything. Repo-wide grep for `"license"` across every `package.json`
returns **exactly one hit** (root `:12`). No CLA gate — `CONTRIBUTING.md` only notes PRs depending on the
REST Management API are out of scope.

**npm metadata gotcha, precisely characterised:** `npm view @bigcommerce/catalyst-client license` is
empty and npmjs.com shows "Proprietary" as its placeholder, because `packages/client/package.json` has no
`"license"` field. `npm pack @bigcommerce/catalyst-client@1.0.2 --dry-run` shows the tarball **does**
include a 1.1kB `LICENSE` (npm auto-includes it regardless of the `"files"` allowlist). So the MIT text
ships; the SPDX field is missing. Vendor from GitHub — an automated compliance scanner will flag the npm one.

| Component | Verdict | Why |
|---|---|---|
| `packages/client` (GraphQL client) | **Copy** | Zero Next coupling, ~290 lines, deps `@0no-co/graphql.web` + `std-env` |
| gql.tada wiring | **Adapt** | Approach is simple and copyable, but hard-requires a live store + token at dev/build time — no schema checked in |
| `core/lib/cart` | **Adapt** | Sound design (cart ID in session JWT, guest→customer merge) but coupled to their Auth.js scheme |
| `core/auth` | **Study only** | `next-auth@5.0.0-beta.30` still beta; bespoke compliance hacks tied to their consent vendor `@c15t/nextjs` |
| `core/vibes` UI | **Copy, mostly** | Of 136 files, only 7 touch data-fetching/`next/headers`/server actions, 2 import `next/navigation`. Data flows in as `Streamable<T>` props. **Caveat:** `product-detail` and `product-card` import `storefront-kit/callout` — MIT on npm, GitHub source 404s, so you can install but not fork or patch it |

## Known gaps and open issues

- **No `noindex`/robots handling anywhere** — repo-wide grep for `noindex` and `robots:` is empty.
  Issue #2166 (open since 2025-03-28, zero comments) asks for parity with Stencil/Cornerstone's
  canonical/noindex handling on faceted URLs. `core/lib/seo/canonical.ts` builds a canonical link from a
  bare path with no query-string awareness.
- **Multi-channel + multi-locale isn't real** (issue #1950).
- **The proxy chain is structurally expensive** — two `auth()` decodes, a KV `mget`, and on miss (or always,
  for authenticated users) a live `GetRouteQuery` round trip, all before the page starts fetching.
- **Checkout auth handoff was broken for a long time.** Issue #1059 (closed): logged-in customers landed on
  checkout as guests. Fixed via `createCartRedirectUrls` carrying `customerAccessToken`; the older
  Customer Login API workaround survives as `core/auth/customer-login-api.ts`.
- Recent self-disclosed bugs worth knowing — `core/CHANGELOG.md` v1.10.1: product/category/brand content
  fell back to the default language after ISR revalidation, because `generateMetadata` fetched through
  `cache()`-memoized loaders before `setRequestLocale`, so during background regeneration next-intl
  couldn't resolve the locale and the default-locale response poisoned the memoized cache for the whole
  render. A nasty React `cache()` × ISR × next-intl interaction.
- PR #3109 (positive signal): cart +/- buttons used to fire one full server-action round trip per click
  with no debounce, which "could lock up navigation on the cart page". Now a 400ms trailing debounce +
  coalescing dispatcher at `core/vibes/soul/sections/cart/client.tsx:325-339`.

## The CMS seam — real precedent

Non-catalog "web pages" resolve through `with-routes.ts`'s `NormalPage`/`ContactPage`/`RawHtmlPage`
branches into `core/app/[locale]/(default)/webpages/[id]/normal|contact/page.tsx`, rendering
`rewriteWysiwygContentUrls`-processed **raw HTML strings** from BigCommerce's basic page editor. No
structured content model. That is exactly the gap Sanity fills.

The `integrations/makeswift` branch shows what a real page-builder integration costs: a new
`core/proxies/with-makeswift.ts` (**20 lines**) inserted into `composeProxies()` right after `withAuth`,
a `next.config.ts` plugin wrapper (`createWithMakeswift()`), and edits to a handful of `core/vibes`
primitives (`card`, `card-carousel` new; `navigation`, `dynamic-form`, `streamable.tsx` modified).

Notably Makeswift's draft-mode detection rides Next's `unstable_isDraftModeRequest` — **the same primitive
Sanity's Presentation/visual-editing tooling uses.** Structural precedent, not analogy.

## Deploy

`@vercel/analytics`, `@vercel/speed-insights`, `@vercel/otel`, `@vercel/functions` are dependencies, but
the `catalyst` CLI's `deploy` targets BigCommerce's own Commerce Hosting, and
`packages/catalyst/package.json` carries a peer dep on `@opennextjs/cloudflare@1.17.3` with a
`cleanupCloudflareIncompatibilities` helper — Cloudflare via OpenNext is first-class. But the route-cache
KV layer only has Vercel and Upstash adapters, so a Cloudflare/self-hosted deploy without Upstash
silently falls back to per-instance in-memory.
