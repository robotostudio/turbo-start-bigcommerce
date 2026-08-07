# Decision 01 — Fork base

**DECIDED 2026-08-07 (Fable): fork `turbo-start-shopify`, swap the provider behind its existing seam.**

Options considered:
- (a) fork turbo-start-shopify, rip out Shopify — **CHOSEN**
- (b) fork turbo-start-sanity, author commerce fresh using Shopify's as spec — rejected
- (c) fork shopify then rebase onto sanity baseline first — rejected

## The number that decided it

~5.6k of ~21k commerce-adjacent LOC is Shopify-shaped. The other ~15k is provider-generic and
consumes a normalized seam that already exists. Reuse under (a) is the majority of the repo.

## Evidence

**The seam is real.** `apps/web/src/components/product/product-card.tsx` (575 LOC) defines its own
canonical `ProductCardProps` (slug, title, numeric priceRange, stockStatus).
`apps/web/src/lib/shopify/product-card.ts:218` (`collectionProductToCardProps`) is the single adapter
from wire types into it. Grepping every import of `@/lib/shopify` across `components/`: the tree pulls
only types (`MoneyV2`, `ShopifyImage = {url,altText,width,height}`, `Cart`, `ShopifyFilter`) and pure
helpers (`getColorHex`, `getOptionType`, `formatMoney`, `variant-utils`). Exactly two components touch
the network layer — `related-products.tsx` and the image loader in gallery/lightbox.

**The cart engine survives whole.** `apps/web/src/lib/cart/` is 1,151 LOC of optimistic-update
engine/controller/classify plus **1,467 LOC of unit tests**. Only Shopify coupling: type imports
(`lib/cart/types.ts:1-6`) and two string constants (`lib/cart/server.ts:6-8`). Its internal `Cart` type
`{id, checkoutUrl, totalQuantity, lines, cost}` (`lib/shopify/types.ts:160-170`) matches the settled
hosted-checkout-redirect constraint exactly.

**Wire shapes rhyme.** BigCommerce Storefront GraphQL is also Relay-style edges/nodes, so
`Connection<T>` (`types.ts:177`) maps 1:1. The real deltas — numeric money values, `entityId` vs GID,
options model — live inside adapter files that get rewritten anyway.

**The sync script does not discriminate.** A BigCommerce→Sanity sync writing the same `store.*` shape
preserves 839 LOC of GROQ, the studio schemas and every page-builder join. That script is net-new work
under all three options equally.

## Premises that were wrong (corrected by counting)

- turbo-start-shopify **does** have Markdown/LLM content negotiation. `apps/web/src/proxy.ts` is a near
  sibling of sanity's, and its `lib/markdown/` is *richer* — covers products and collections in
  `documents.ts`, with tests.
- `tailwind-config` is **6 LOC** (`packages/tailwind-config/utils.ts`). Non-factor.
- `sanity-blocks` (4.8k LOC) is a *packaging refactor of marketing blocks*, not a capability. Shopify
  has more blocks than sanity — collection-banner, explore-categories, layers-showcase,
  editorial-two-up, featured-products — several commerce-aware. sanity-blocks cannot replace them.
- Shared packages barely drifted: `logger` and `typescript-config` byte-identical; `env` differs only
  in the var list; `ui` drifted both ways (shopify has more components, sanity has `base-drawer`).

(b) converts a 5k rewrite into a 20k transcription plus a 5k rewrite. (c) spends a week refactoring 13
working sections into sanity-blocks structure — files the BigCommerce swap never touches — and takes a
breaking `next-sanity` 12→13 major at peak instability.

## Cost

- **Delete ~1.7k LOC:** `apps/studio/scripts/migrate-handoff/` (1,676 LOC — Shopify handoff migration,
  irrelevant to a greenfield BigCommerce store).
- **Rewrite behind the seam ~5.6k LOC:** `lib/shopify/` → `lib/bigcommerce/` (queries 665, types 282,
  adapter 258, mutations 137, client 86 — channel ID becomes an env param here, image-loader 86,
  helpers ~350); `app/cart/actions.ts` (301); `shopify-image.tsx` (37); studio `objects/shopify/` (710),
  `seed-shopify/` (1,389 → BigCommerce seeder that also writes `store.*` docs), `verify-shopify.ts`
  (209), `shopifyUrls.ts` (25), `shopify-document-status.tsx` (84).
- **Upgrade after green, 1–2 days:** Next 16.1.3→16.2.9, pnpm 10.32.1, next-sanity 12→13, port
  `tailwind-config` (6 LOC), adopt sanity's playwright smoke spec
  (`apps/web/tests/e2e/smoke-pages.spec.ts`) and `@sanity/codegen`.
- **Total ~7 working days** to a credible v1: 0.5 fork/rename/delete · 3 lib/bigcommerce + cart actions
  · 1.5 studio schemas + sync/seed · 1 search/filters/verify/green · 1–2 upgrades + polish.
- **Deliberately skipped:** the sanity-blocks refactor. Separable, touches only marketing blocks, not on
  the critical path. Land it later as family-wide alignment.

## First three commits

1. **Fork + amputate.** Clone → rename repo/package identifiers and README; delete
   `apps/studio/scripts/migrate-handoff/`; strip Shopify env vars from `packages/env`, add
   `BIGCOMMERCE_STORE_HASH` / `BIGCOMMERCE_CHANNEL_ID` / storefront token. Builds; commerce routes may
   500 — acceptable on day zero.
2. **The adapter.** `apps/web/src/lib/bigcommerce/` exporting the *same normalized type names and
   function signatures* the component tree imports (`Cart`, `MoneyV2`, image type,
   `collectionProductToCardProps`, `storefrontQuery`), implemented against BigCommerce GraphQL with a
   channel-scoped token. Flip all `@/lib/shopify` imports. **Delete `lib/shopify/` in this same commit**
   so nothing half-lives. `lib/cart` tests stay green.
3. **Cart + checkout round-trip.** Rewrite `app/cart/actions.ts` on BigCommerce cart mutations, map to
   the normalized `Cart`, hosted-checkout redirect via the cart's checkout URL. Adapt
   `lib/cart/classify.ts` error taxonomy. Controller/engine tests pass against the new mapping.

## Tripwire that would flip the decision

During commit 2, if the BigCommerce adapter cannot populate `ShopifyFilter`-equivalent facets or
`quantityAvailable` without touching component code — stop and reassess toward (b). Nothing in
BigCommerce's GraphQL suggests this, but that is the falsifier.

## The trap, and the guardrail

Residual Shopify semantics shipping silently under new names: GID formats in saved-items state,
tag-string badge conventions (`product-card.ts:18`), `custom.*` metafield keys, Shopify CDN URL math in
the image loader, and above all the variant-image fallback heuristic
(`product-card.ts:110-186`, `colorsByImage`) — logic built around a documented *Shopify Storefront
quirk*, which must be re-derived from BigCommerce image semantics, not transliterated. Sanity Connect
copy also lingers in studio descriptions (`documents/product.tsx`).

**Guardrail:** CI grep gate — `git grep -riE 'shopify|sanity connect'` returns zero hits outside
CHANGELOG/attribution before the v1 tag. Plus the commit-2 rule: `lib/bigcommerce` lands and
`lib/shopify` dies together.
