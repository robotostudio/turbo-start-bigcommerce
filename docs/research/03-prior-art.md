# Finding 03 — Prior art: Sanity × BigCommerce

Read 2026-08-07. Every claim below has a source; low-confidence items marked UNVERIFIED.

## Headline: nothing off-the-shelf syncs BigCommerce into Sanity

**Sanity Connect exists for exactly two platforms.** Shopify (actively developed — changelog entry
2026-07-28, "Import Shopify Metafields Into Sanity") and Salesforce Commerce Cloud (repo
`sanity-io/sanity-sfcc` created 2026-04-21, an SFCC cartridge plus a `@sanity/sfcc` Studio plugin).

That second one matters: Sanity has proven it will build a platform-specific sync product beyond
Shopify. They just haven't chosen BigCommerce. Deliberate gap, not a technical wall.

Confirmations that nothing exists:
- sanity.io/technology-partners/bigcommerce lists no sync tool — only a blog post about using the
  Sanity MCP server to build a product selector.
- sanity.io/exchange/integration=bigcommerce — zero plugins.
- Sanity's own official BigCommerce starter, `sanity-io/sanity-template-bigcommerce-editorial`, is
  **archived** (last push 2022-10-28, 13 stars). It never used live sync — a one-shot
  `sanity exec src/bigCommerceSync.js` wrote an `.ndjson` for manual `sanity dataset import`.
- npm search for `sanity-plugin bigcommerce`: **zero** dedicated packages.
- Every other BigCommerce+Sanity repo on GitHub is a clone of that one dead template.

Adjacent plugins that do exist (and what they say about the ecosystem):

| Plugin | Platform | Last publish | Weekly downloads | Studio version |
|---|---|---|---|---|
| `@multidots/sanity-plugin-woocommerce-sync` | WooCommerce | 2025-08-27 | 13 | `^3 \|\| ^4` — not v5+ |
| `@multidots/sanity-plugin-amazon-product-sync` | Amazon | 2025-08-22 | 0 | `>=3.86 <5` — not v5+ |
| `@commercelayer/sanity-plugin-commerce` | Commerce Layer | 2024-01-23 | 2 | stale |
| `@webriq-pagebuilder/sanity-plugin-schema-commerce` | generic | 2026-06-22 | 242 | `^3` only |

Every closest analog is a sub-300-download package stuck below Studio v5. Nothing to depend on.

## The content-model answer: turbo-start-shopify is "B-shaped storage, A-shaped render"

Verified by reading the sibling repo's PDP route (`apps/web/src/app/products/[handle]/page.tsx`):
it fetches **both** in parallel — `sanityFetch({query: queryProductByHandle})` and a live
`storefrontQuery(PRODUCT_QUERY)` to Shopify. The split is precise:

- Sanity doc gates existence/publish-state and supplies SEO + editorial content.
- **Price, variants, images, stock, options all come from the live Shopify call** — not the synced snapshot.
- The synced `store` field exists so **Studio** can search, reference and preview products in the page
  builder (`featured-products.ts`, `product-hotspots.tsx` all reference the Sanity `product` doc type).

Same pattern as `sanity-io/sanity-shopify-studio` (archived 2024-04-09, 152★) and
`ndimatteo/HULL` (1,448★, last push 2023-11-03).

**The counter-example:** `sanity-io/hydrogen-sanity` (alive, 95★, pushed 2026-07-30) does pure
Pattern A — its example route `products.$handle.tsx` calls `storefront.query(PRODUCT_QUERY)` with
**no Sanity fetch in the critical path at all**. Sanity is overlay content only.

### Pattern trade-offs

| Axis | A (live only) | B (full sync) | C (thin stub + live) |
|---|---|---|---|
| Staleness | none | sync-lag dependent | none |
| Studio preview of commerce fields | weak | strong | weak |
| Studio-side product search/filter | impossible | native GROQ | needs a side index |
| Build times | flat | grows with catalog | flat |
| Editor picks products in Studio | no | yes | needs ID in hand |
| At 50k SKUs | flat | sync/reconcile + doc-count burden (UNVERIFIED ceiling) | flat |

**Pattern C has zero verified prior art for BigCommerce+Sanity.** It is recommended by
headlesscms.guide ("model commerce references—not product copies") but no real repo implements it for
this stack. Choosing C means being first.

## Sync patterns that actually exist

- **Sanity's own archived BigCommerce template**: one-shot GraphQL pull → `.ndjson` → manual import.
- **`sanity-io/syncing-example`** (archived 2024-09-10): the only official reference for the generic
  webhook → function → write-client shape. Needs inverting for our direction.
- **`gosuwtf/ltdesign`** (2021, dead, 0★): real but tiny — Next.js API routes GROQ-query Sanity for
  products missing a `bcId`, POST them to BigCommerce Catalog API, patch the new ID back. Sanity as
  source of truth, pushed *into* BigCommerce — the reverse of what we want.
- Sanity docs describe the shape generally and note you can skip external hosting with **Sanity Functions**.

## Code worth lifting

`bigcommerce/nextjs-commerce` — BigCommerce's own fork of Vercel Commerce v2, created 2023-05-15 right
after Vercel's pivot. **MIT, 144★, Next.js 14.2.35, last push 2025-12-15.** Alive but drifting: 8
months stale, two Next majors behind our 16 target. Its `lib/bigcommerce` layer is the real prize —
functional GraphQL Storefront calls, cart and checkout flows to use as a reference for our adapter.

Context: `vercel/commerce` **did** ship a BigCommerce provider until PR #966 ("Next.js Commerce
refresh", merged 2023-04-18) cut it from 10 providers to Shopify-only. From that PR: *"v2 will be
shifting to be a single provider vs. provider agnostic. Other providers are welcome to fork this
repository and swap out the underlying lib/ implementation."* That is exactly our plan.

## Sanity version reality check

Verified against the npm registry 2026-08-07:
- Studio v5.0.0 shipped 2025-12-16 · v6.0.0 shipped 2026-06-11 · **latest 6.9.1** (2026-08-06).
- `turbo-start-shopify`: `sanity ^5.7.0`, `next-sanity ^12.0.12`, `@sanity/vision ^5.7.0` → **v5**.
- `turbo-start-sanity`: `next-sanity 13.1.0`, `@sanity/vision ^6.1.0`, `@sanity/codegen ^7.0.3` → **v6**.

Forking shopify means starting on Studio v5 and taking the v5→v6 upgrade as separate work.

## Scoreboard

| Repo | License | Last push | Stars | Verdict |
|---|---|---|---|---|
| robotostudio/turbo-start-shopify | MIT | 2026-08-06 | 5 | **fork** — the pattern to port |
| bigcommerce/nextjs-commerce | MIT | 2025-12-15 | 144 | **vendor pieces** — lift `lib/bigcommerce` as reference |
| vercel/commerce (v2 main) | MIT | 2026-06-10 | 14,194 | study — the RSC skeleton its README invites you to fork |
| sanity-io/hydrogen-sanity | MIT | 2026-07-30 | 95 | study — alive, shows Pattern A counter-split |
| sanity-io/sanity-sfcc | none declared | 2026-06-04 | 0 | study — what building a real Connect costs |
| ndimatteo/HULL | MIT | 2023-11-03 | 1,448 | study — same sync-then-overlay at scale |
| sanity-io/sanity-shopify-studio | MIT | 2024-04-09 | 152 | study — archived Connect data model reference |
| sanity-io/syncing-example | none declared | 2024-09-10 | 5 | study — official webhook→function→write shape |
| storyblok/nextjs-bigcommerce-starter | none declared | 2021-02-17 | 15 | study — closest architectural analog, code too old |
| sanity-io/sanity-template-bigcommerce-editorial | UNVERIFIED | 2022-10-28 | 13 | ignore — archived, one-shot pull |
| bigcommerce/netlify-nextjs-starter, storefront-data-hooks | MIT | 2023 | 6 / 164 | ignore — dead |
| Commercial iPaaS (Ekyam, OneTeg, Patchworks, Pivotal) | n/a | n/a | n/a | ignore — paid dependency, wrong for MIT starter |
