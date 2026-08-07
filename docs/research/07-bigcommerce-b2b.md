# Finding 07 — BigCommerce B2B

Primary sources only, read 2026-08-07. `developer.bigcommerce.com` 301s to `docs.bigcommerce.com`.

## VERDICT: exclude B2B Edition from v1. Ship native customer-group pricing instead.

Three reasons, most decisive first.

**1. It contradicts the v1 spec.** Single channel is a settled v1 decision. B2B Edition headless
**requires multi-storefront plus a dedicated channel and Site** — stated twice, in the non-Catalyst
guide and the Catalyst guide. You cannot ship B2B Edition *and* single-channel v1. One has to move.

**2. No contributor can reproduce it.** B2B Edition needs an app install **and a support ticket** to
provision — "contact the support team to start the process." For an open-source starter that makes
the B2B code path unbuildable, untestable and unreviewable by anyone who clones the repo without a
sales relationship. Disqualifying for OSS in a way it would not be for a client build.

**3. BigCommerce calls their own reference integration experimental:** *"The integration of BigCommerce
B2B Edition with Catalyst is experimental and subject to change."* A starter should not be where people
discover that.

## What "B2B on BigCommerce" actually means — three distinct things

### a) B2B Edition — the paid add-on

Company accounts, sales quotes, invoice management for net terms, user roles, sales-agent assignment,
the Buyer Portal. **An app install plus a support ticket** — not a plan tier, not self-serve. Developer
sandbox is free.

Price and plan gate: **UNVERIFIED.** BigCommerce's own plan comparison has no B2B Edition row. The app
listing page is JS-rendered and returns nothing to a fetch. Treat as sales-gated custom pricing.

BundleB2B lineage: no doc mentions the rename. The only hard evidence is the CDN hostname the headless
portal still loads from — `https://cdn.bundleb2b.net/b2b/production/storefront/headless.js`.

### b) Native B2B — no B2B Edition needed

| Feature | Without B2B Edition | Plan gate (2026 names) |
|---|---|---|
| Customer groups | Yes | **Growth ($79/mo)** and up — not Core |
| Price lists | Yes | **Performance only (from $1,499/mo)** |
| Tax-exempt code on customer | Yes | not gated |
| Check / Purchase Order payment method | Yes — native BigCommerce payment method | not gated |
| Company accounts, quotes, invoices, buyer roles, approvals | **No** — B2B Edition only | — |

Note the **2026 plan rename**: Core / Growth / Scale / Performance replaced Standard / Plus / Pro /
Enterprise. Older support articles still use the old names.

Price lists are variant-level price overrides assigned to a customer group, or via Price List
Assignment to a channel / customer group / both.

### c) Legacy Stencil experience — being phased out

The modified-theme experience is deprecated in favour of the Buyer Portal, which is *"automatically
enabled on new B2B Edition stores by default."* REST Management V2 (`/api/v2/io/`) is also deprecated —
*"does not support many of B2B Edition's newer features."* No formal deprecation dates; the changelog
index 404s.

## Headless support — it works, but it's bolted on

Four API surfaces, all on a **second host** `api-b2b.bigcommerce.com`, entirely separate from
`api.bigcommerce.com`:

| Surface | Base URL | Auth |
|---|---|---|
| GraphQL Storefront | `https://api-b2b.bigcommerce.com/graphql` | Storefront `authToken` (Bearer) |
| REST Management V3 | `.../api/v3/io/` | `X-Auth-Token` + `X-Store-Hash` |
| REST Storefront (legacy) | `.../api/v2/` | Storefront `authToken` |
| REST Management V2 (deprecated) | `.../api/v2/io/` | `authToken` |

Playground at `https://api-b2b.bigcommerce.com/graphql/playground`.

**Auth is a three-hop chain.** B2B tokens are not the Storefront GraphQL token:

1. Core login → **Customer Access Token** (core GraphQL Storefront API)
2. Exchange via B2B REST → **B2B storefront authToken**. Catalyst's own words: *"The existing login
   produces a customer access token for the GraphQL Storefront API, then the B2B REST API is used to
   exchange this for a B2B storefront token."*
3. Or the `authorization` mutation using a Current Customer API JWT with hardcoded B2B client ID
   `dl7c39mdpul6hyc489yk0vzxl6jesyx`

**B2B storefront authTokens expire after 1 day.** S2S tokens don't expire by default.

### The setup preconditions are the real scope-killer

- Multi-storefront enabled **plus available seats**
- A dedicated new channel created via API, plus a Site record
- **Two separate API accounts** — TOKEN_A (channel listings, channel settings, sites & routes),
  TOKEN_B (carts, storefront API tokens, impersonation tokens)
- Script tag from `cdn.bundleb2b.net`
- Control panel: Storefronts → Headless Storefronts → Activate B2B
- Manual product distribution to the new channel

### The Buyer Portal, and what it costs

A **client-side-rendered React app**: Turborepo, TypeScript, React 18, Vite, **MUI 5, Redux, React
Router 6**. MIT, Node ≥22.16.0, Yarn 1.22.17. `github.com/bigcommerce/b2b-buyer-portal`.

It *"replaces the default BigCommerce account area."* In a headless Next.js app **there is no default
account area to replace** — you get your App Router routes plus a foreign CSR app with its own router
mounted over them, styled in MUI over your design system.

**The sharpest cost citation:** Catalyst modifies `proxy.ts` to **exclude `/b2b/` URLs from the Next.js
proxy**. The portal claims a URL namespace and Next.js has to be told to stay out of it. Catalyst also
adds `b2b/loader.tsx`, `b2b/use-b2b-auth.tsx`, `b2b/use-b2b-cart.tsx`, `b2b/script-production-custom.tsx`.

The portal exposes a `window.b2b.utils` bridge — `user.getProfile()`, `user.getB2BToken()`,
`user.setMasqueradeCompany()`, `quote.addProducts()`, `shoppingList.createNewShoppingList()` — a
global-window handshake, which in App Router means client components and effects only.

## B2B checkout works under hosted checkout

Verified. The invoice payment flow calls `invoiceCreateBcCart`, which returns a **`checkoutUrl` and
cart ID** — *"Redirecting a user to the `checkoutUrl` will initiate a BigCommerce checkout with the
invoice payment loaded into the 'cart.'"*

**Net terms / PO:** payment terms are applied post-order as an invoice behaviour, not a checkout payment
method. Buyers pay with the native **Check/Purchase Order** method, then settle the invoice later.
Company credit caps the PO amount; credit hold blocks all non-invoice transactions.

**Quote-to-order: UNVERIFIED.** Docs say only that you can *"View, submit, and generate carts from sales
quotes"* — no mutation is named. Three searches returned "consult the playground." Specifically
unverified: **whether a negotiated quote price survives the redirect into hosted checkout.**

**One hard constraint:** a B2B order record is auto-created for all orders, but manual enrichment
(e.g. `poNumber`) must happen *"within 10 seconds of order creation."* A 10-second webhook race.

## Company model

- **Company** — the "customer" in B2B. Status pending/approved/active. Own address book, separate from
  BigCommerce customer addresses. Has available credit, credit hold, payment terms (Due on receipt → Net 60).
- **Company User (buyer)** — creating one **auto-creates a BigCommerce customer account**. *"If the user
  is an existing BigCommerce customer, the customer group, company, and name will be overridden."*
- **Roles** — Junior Buyer (submits shopping lists, cannot purchase), Senior Buyer (approves, orders),
  Admin (users, addresses, invoices). Custom roles supported.
- **Sales Staff** — backend users scoped to a set of companies.

**Critical for pricing: companies are NOT automatically assigned to customer groups.** The link is
manual and optional.

To answer "which company does this user belong to" takes **two token exchanges across two API hosts**.
`companyCreditConfig` takes no company argument — it *"requires only a valid Bearer token after a
`login` operation."*

Ambiguity worth flagging: **two company-creation paths on two different APIs** — `registerCompany` on
the *core* GraphQL Storefront API, and `companyCreate` (anonymous) on the B2B GraphQL API. The docs
don't reconcile them.

## Customer-specific pricing DOES work server-side — the good news

| Token | Header | Browser-safe? |
|---|---|---|
| Storefront token | `Authorization: Bearer` | Yes, but CORS-scoped, max 2 origins |
| **Private token + customer access token** | `X-Bc-Customer-Access-Token` | **No — server only** |
| **Customer impersonation token** | `X-Bc-Customer-Id` | **No** — rejected from browsers |

*"Customer-specific data, such as product pricing and availability"* is returned with customer scopes
via `X-Bc-Customer-Access-Token`. **So B2B pricing can render in a server component.** No client-side
fetch is forced.

**INFERENCE (not a doc claim):** because the response is customer-scoped, every price-bearing fetch
becomes a **per-customer cache key**. Anonymous/list pricing stays fully static; anything showing a
logged-in buyer's price becomes per-user. That is the real caching cost, and it follows from the auth
mechanism, not from any stated limitation.

**INFERENCE, needs sandbox verification:** the chain "price list → assigned to customer group →
member queries core GraphQL with a customer access token → gets the overridden price" joins two docs
across a gap neither closes. The price-lists page does **not** mention GraphQL — it only says price
lists *"provide overridden price values to the Stencil storefront."* High confidence, but verify in
the sandbox rather than by reading more docs.

## Rate limits and webhooks

- **150 API requests per minute**, store-wide across *all* B2B integrations — one shared budget.
- Stricter per-endpoint quotas (Add a Company Attachment: **15/min**).
- **Cascading:** B2B requests that trigger BigCommerce API calls are charged against **both** limits.
- **No custom B2B webhooks.** Nothing fires for company creation or quote conversion. The documented
  workaround is to subscribe to standard webhooks (`store/customer/created`) and then call the B2B API
  to check whether the record is B2B-associated.

Architecture consequence: every B2B state change is **poll-only**, against a 150/min shared ceiling,
alongside a 10-second order-enrichment window. Any B2B sync is a polling loop on a tight budget.

## What to ship in v1 instead

Customer groups (Growth+) + price lists assigned to groups + tax-exempt code + Check/Purchase Order
payment method. None of it needs B2B Edition, multi-storefront, an extra channel, or a support ticket,
and it all works under hosted checkout. Incremental code ≈ **one customer-scoped pricing fetch** —
private token plus `X-Bc-Customer-Access-Token`, server-side.

**README caveat to write:** price lists are Performance-plan-only ($1,499/mo). On Growth/Scale the
customer-group mechanism exists but the per-group price override does not. The starter must degrade
cleanly, not assume price lists are present.

## Surface B2B Edition would add

| Surface | Added |
|---|---|
| API hosts | +1 (`api-b2b.bigcommerce.com`) |
| API surfaces | +4 |
| Auth paths | +2 token types, +1 exchange hop, 1-day TTL refresh logic |
| API accounts | +2 (TOKEN_A, TOKEN_B) with 6 distinct scopes |
| Channels / Sites | +1 each, plus an MSF seat |
| Frontend | A second CSR React app (MUI 5 + Redux + React Router 6) owning `/b2b/*`, excluded from the Next proxy |
| Files (per Catalyst) | +4 `b2b/*.tsx` + a `proxy.ts` change |
| Deploy | +1 pipeline (CDN or WebDAV) if the portal is forked |
| Sanity | Channel-scoped content model if a second channel exists |

## Verification queue — sandbox, not docs

1. Does a price list assigned to a customer group surface through core GraphQL with a customer access token?
2. Quote → order: what mutation, and does the negotiated price survive the redirect to hosted checkout?
3. B2B Edition list price and plan gate.
4. Whether MSF is itself plan-gated.

## Failed verification paths

- `docs.bigcommerce.com/llms.txt` — returns no B2B URLs.
- `support.bigcommerce.com/*` — JS-rendered, unfetchable. All support claims above sourced from
  `docs.bigcommerce.com` instead.
- `docs.bigcommerce.com/developer/changelog` — 404. This is why the plan-rename finding rests on the
  pricing page rather than a changelog entry.
