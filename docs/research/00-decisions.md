# turbo-start-bigcommerce — settled decisions

Design interview completed 2026-08-07. Five rounds. Every item below is a decision, not an assumption.

## Product / business

| # | Decision |
|---|---|
| Q1 | BigCommerce **sandbox** available. Credentials handed over at coding time, not now. Plan tier to confirm. |
| Q2 → Q16 | **B2C only.** Originally B2C+B2B; reversed once research showed B2B Edition requires multi-storefront and a support ticket (see `07-bigcommerce-b2b.md`). |
| Q3 | **Greenfield** BigCommerce store. |
| Q4 | **Single channel, single currency, single region** for v1. Channel ID stays an env parameter, never a constant. |
| Q5 | **BigCommerce hosted checkout** (redirect off-domain). No embedded, no custom. |
| Q6 | **Open-source repo first.** The client project forks it afterwards. No client-specific decisions land in the starter. |
| Q11 | **All routes in v1** — `[...slug]`, blog, products, collections, cart, search, plus `.md` content negotiation. |

## Repo

| # | Decision |
|---|---|
| Q7 | **Fork `turbo-start-shopify`.** Decided by Fable on evidence: ~5.6k of ~21k commerce LOC is Shopify-shaped; the rest sits behind an existing seam. See `02-decision-fork-base.md`. |
| Q9 | Repo name **`turbo-start-bigcommerce`** — one word, matching `turbo-start-shopify` / `turbo-start-contentful`. |
| Q10 | **Seed script** that creates demo products in the user's own sandbox, same pattern as `scripts/seed-shopify/`. |
| Q15 | **Sanity v6.** The fork starts on `sanity ^5.7.0` + `next-sanity ^12`; v6 is a deliberate upgrade. |
| Q21 | v6 upgrade lands **after the BigCommerce swap is green**, as its own commit with its own test run. One variable at a time. |

## Architecture

| # | Decision |
|---|---|
| Q12–Q14 | **The BigCommerce → Sanity sync does not run in v1.** Consequence: the PDP render path flips to catalog-required / Sanity-none, matching what the Shopify starter already does for collections. |
| Q22 | **Revises Q12–Q14: the sync's infrastructure ships, dark.** `packages/sanity-sync/` lands real and tested — write client, upsert semantics, reconcile sweep — invoked by nothing. Turning the sync on later is wiring, not building. The webhook receiver is deliberately not built; its design is written up instead. See `PLAN.md` P7. |
| — | **Deterministic `_id` scheme, decided with Q22 and free today.** A future synced document lands at `bigcommerceProduct-{entityId}` (siblings `bigcommerceProductVariant-`, `bigcommerceCategory-`), so GROQ can join a stub to its document with `*[_id == "bigcommerceProduct-" + string(^.entityId)][0]` **without migrating a single stored page.** Every stub written in v1 becomes joinable the day the sync runs. |
| Q17 | **gql.tada**, Catalyst's approach — but **commit the generated schema**. `bigcommerce.graphql` goes in the repo with a `pnpm schema:pull` refresh script, so a fresh clone typechecks without a BigCommerce store. |
| Q18 | **Catalyst's session shape** — cart ID inside the session JWT, Auth.js with `authjs.session-token` for customers and an anonymous session token for guests. The only design where guest→customer cart merge works; BigCommerce's `login` mutation takes `guestCartEntityId` for exactly this. |
| Q19 | **Delegated to Fable** — how the page builder references a product now that no product documents exist. |
| Q20 | **`generateStaticParams` fetches the catalog from BigCommerce at build time.** Not Catalyst's fully-dynamic proxy resolution — that never serves a catalog page statically. Escape hatch if build time hurts: prerender only Sanity-referenced products. |
| — | Vendor **`@bigcommerce/catalyst-client`** (MIT, ~290 lines, zero Next.js imports). Copy from GitHub, not npm — the npm package omits its `license` field. |

## Out of scope for v1, documented not built

- **Running** the catalog sync. Its write path and reconcile sweep are built and tested in P7 but wired
  to nothing; the webhook receiver is designed in `docs/sync-design.md` and not built. The Sanity
  `product` / `productVariant` / `collection` document types ship in `packages/sanity-sync/schema/`
  **unregistered** — registering them is the flip that turns the sync on. Registering them early would
  give editors a permanently blank "Products" list, which is worse than absent.
- B2B Edition — companies, quotes, invoices, net terms, Buyer Portal.
- Native B2B pricing seam (customer groups + price lists). Document as the v2 path.
- Multi-channel, multi-currency, multi-region.
- Embedded or custom checkout.
- The `sanity-blocks` packaging refactor.

## Hard constraints carried into the build

1. **The checkout URL is single-use.** `createCartRedirectUrls` must be called on click. `Cart.checkoutUrl` cannot remain a field on the cart type — it becomes a server action.
2. **Use private storefront tokens** (`POST /v3/storefront/api-token-private`), not vanilla ones. Server-to-server use of vanilla tokens sunsets 2027-03-31.
3. **`components/collection/filter-panel.tsx:26-72` is the highest-risk file.** It `JSON.parse()`s Shopify's opaque filter `input` string. A mismatched filter shape parses to `null`, is caught silently, and renders no filters with no error.
4. **CI grep gate:** `git grep -riE 'shopify|sanity connect'` must return zero hits outside CHANGELOG before tagging v1.
5. **`lib/bigcommerce` lands and `lib/shopify` dies in the same commit.** Nothing half-lives.
6. **The variant-image fallback heuristic** (`lib/shopify/product-card.ts:110-186`) is built around a documented Shopify quirk. Re-derive from BigCommerce image semantics; do not transliterate.

## Research index

| File | Contents |
|---|---|
| `01-shopify-studio-join.md` | How turbo-start-shopify joins Sanity to Shopify. Sanity Connect does the sync; there is no code. |
| `02-decision-fork-base.md` | Fable's fork-base decision with LOC counts and the first three commits. |
| `03-prior-art.md` | No Sanity Connect for BigCommerce. Scoreboard of every adjacent repo. |
| `04-bigcommerce-api-semantics.md` | Checkout, tokens, GraphQL vs REST, cart, auth, channels, plan gates, rate limits, webhooks. |
| `05-shopify-web-port-surface.md` | File-by-file port map of `apps/web`, and every Shopify-only assumption. |
| `06-catalyst.md` | BigCommerce's own Next.js storefront. What to lift, what to avoid. |
| `07-bigcommerce-b2b.md` | Why B2B Edition is out of scope for an open-source starter. |
