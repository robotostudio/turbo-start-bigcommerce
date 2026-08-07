# turbo-start-bigcommerce

Status: `ready-for-agent`. No open decisions.

Tracked as [ROB-2526](https://linear.app/roboto/issue/ROB-2526) in the
[Turbo Start BigCommerce](https://linear.app/roboto/project/turbo-start-bigcommerce-722a1acc2da0)
project. That issue holds the same content — edit both, or edit the issue and re-export.

Broken down into 28 tickets, ROB-2527 to ROB-2554, filed as sub-issues of ROB-2526 with Linear native
blocking relations. ROB-2527 (fork, rename, amputate) is the only ticket with no blockers.

Sources: `docs/research/00-decisions.md` (settled decisions), `docs/research/01`–`08` (evidence), `PLAN.md`
(phasing, file-level detail, estimates). This spec is the behavioural contract; PLAN.md is the map.

## Problem Statement

Roboto publishes starters for Next.js + Sanity paired with a commerce backend: one for Shopify, one
for Contentful, one for Sanity on its own. There is no BigCommerce one, and a client wants that stack.

The gap is bigger than a missing template. Everything that makes the Shopify starter work rests on
Sanity Connect, a hosted service that mirrors the Shopify catalog into Sanity documents. Sanity Connect
supports Shopify and Salesforce Commerce Cloud. It does not support BigCommerce, and nothing else does
either. So a developer who picks Next.js + Sanity + BigCommerce today finds:

- No template. Sanity's own BigCommerce starter was archived in 2022.
- No catalog sync, and no obvious place to put one.
- BigCommerce's reference storefront, Catalyst, which is worth reading and has no CMS in it at all.

The two halves each have a home and neither knows about the other. Someone has to decide how a
page-builder block points at a product when no product documents exist to point at. Today every team
that tries this decides it again from scratch, and usually discovers the BigCommerce-specific traps
after building around the wrong assumption: the hosted checkout URL is single-use, faceted search is
plan-gated and fails silently, and there are no webhooks for variants at all.

A second, quieter problem: the Shopify starter is the best available base, but a straight find-and-replace
port produces something worse than either parent. Shopify semantics survive under BigCommerce names.
The variant-image fallback is built around a documented Shopify quirk that BigCommerce doesn't have.
The filter panel round-trips an opaque JSON blob that BigCommerce never sends. A rename hides all of it.

## Solution

An MIT-licensed starter published at `github.com/robotostudio/turbo-start-bigcommerce`, forked from
`turbo-start-shopify`, where every commerce read and write runs on BigCommerce and Sanity owns
everything editorial.

Everything else hangs off one decision: **the page builder points at products with a denormalised stub,
not a Sanity reference.** A stub is four fields stored inline on the block: `entityId`, `slug`, `title`,
`imageUrl`. `entityId` is the fetch key and is immutable. `slug` is the href key. `title` and `imageUrl`
are a display cache for Studio previews, never trusted at render time. Every runtime read verifies the
stub against live BigCommerce, so a stub is a claim, not a truth.

That choice falls out of three obligations that only the stub satisfies together: hrefs are built inside
GROQ so the slug has to exist as stored data at query time; Studio previews are synchronous selects over
document paths so the title has to be stored too; and renames need the immutable key, because a
slug-only pointer silently 404s with no way to tell "same product, new URL."

The stub is also the read side of the sync we are not running yet. A future synced product document
lands at a deterministic id, `bigcommerceProduct-{entityId}`, which means GROQ can join a stub to its
document later without migrating a single stored page. Stubs and synced documents are not alternatives.

The sync itself ships **dark**: the write client, the upsert semantics and the reconcile sweep are built
and tested, invoked by nothing. Turning it on later is wiring, not building.

Checkout is BigCommerce-hosted. The starter mints a redirect URL per click inside a server action,
because that URL is single-use and caching it is the kind of bug that only shows up on the second click.

## User Stories

### Developer cloning the starter

1. As a developer evaluating the stack, I want to clone the repo and run a typecheck with no BigCommerce
   credentials at all, so that I can read the code before deciding whether to sign up for anything.
2. As a developer cloning the starter, I want the GraphQL schema committed in the repo, so that my editor
   gives me typed queries on a fresh clone without hitting BigCommerce first.
3. As a developer, I want a single command that refreshes the committed schema from my own store, so that
   I can pick up BigCommerce API changes without hand-editing a generated file.
4. As a developer, I want `.env.example` files that list every variable the app actually reads, so that I
   don't discover a missing variable from a runtime crash three pages in.
5. As a developer, I want a smoke script that proves my credentials work before I run the app, so that a
   blank homepage doesn't send me debugging the wrong layer.
6. As a developer, I want a seed script that populates my own sandbox with a realistic catalog, so that I
   can see the starter render something other than empty states on day one.
7. As a developer, I want the seed catalog to include a nested category path, so that multi-segment URLs
   are exercised locally rather than discovered in production.
8. As a developer, I want the README to tell me exactly how to mint a private storefront token, so that I
   don't use a vanilla token that stops working server-to-server in 2027.
9. As a developer, I want the commerce client to return a discriminated result rather than throw, so that
   every call site handles failure explicitly and a dead API degrades the page instead of the process.
10. As a developer, I want the client to log the GraphQL complexity header, so that I get an early warning
    before a query hits BigCommerce's limit rather than a hard failure at build time.
11. As a developer, I want prerendering of catalog pages capped by an environment variable, so that a
    30,000-product store doesn't make my build unusable.
12. As a developer upgrading to Sanity v6, I want that upgrade to be its own commit with its own green
    test run, so that a v6 regression is distinguishable from a BigCommerce regression.

### Content editor in Sanity Studio

13. As a content editor, I want to search the live BigCommerce catalog from inside a page-builder block,
    so that I can pick a product without leaving Studio to look up an ID.
14. As a content editor, I want a picked product to show its own image and title in the block preview, so
    that a page of five product blocks doesn't read as five rows of "Untitled".
15. As a content editor, I want to pick a specific variant of a product, so that a featured block can show
    the blue shirt rather than whichever variant happens to be first.
16. As a content editor, I want the variant dropdown to only offer variants of the product I picked, so
    that an invalid combination isn't something I can save.
17. As a content editor, I want a visible badge when a product I linked no longer exists in BigCommerce,
    so that I find out at edit time rather than from a 404 report.
18. As a content editor, I want a refresh control that re-pulls the stored title, slug and image from
    BigCommerce, so that I can fix a stale preview without deleting and re-picking.
19. As a content editor, I want to keep editing content when BigCommerce is unreachable, so that an
    upstream outage doesn't stop editorial work. The block falls back to plain input fields.
20. As a content editor, I want to link a navigation item or button to a product or category, so that the
    same link picker covers commerce and editorial destinations.
21. As a content editor, I want product hotspots on images in blog posts to actually work, so that the
    feature I can see in the schema is one I can ship. (Today they render nothing.)
22. As a content editor, I want the Studio not to show me a "Products" list that is permanently empty, so
    that the navigation reflects what I can actually edit.
23. As a content editor, I want category-driven blocks to reflect the live BigCommerce category tree, so
    that a category I add in BigCommerce shows up on the site without a content change.

### Shopper

24. As a shopper, I want product and category pages to render from the live catalog, so that price and
    stock are what BigCommerce currently says, not a cached mirror.
25. As a shopper, I want a product page to work whether or not a marketer has written editorial content
    for it, so that the newest product in the catalog is buyable immediately.
26. As a shopper following an old link after a URL change, I want to land on the product anyway, so that a
    shared link or a search result doesn't dead-end. BigCommerce's own redirects are followed.
27. As a shopper, I want to add items to a cart without an account, so that I can shop before deciding to
    register.
28. As a shopper, I want my cart to survive a page reload and a browser restart, so that I don't rebuild
    it every visit.
29. As a shopper, I want cart quantity changes to appear instantly and reconcile with the server, so that
    the UI doesn't feel like it's waiting on a network round trip.
30. As a shopper, I want checkout to hand me off to BigCommerce's hosted checkout, so that payment happens
    somewhere PCI-compliant.
31. As a shopper who clicks checkout twice, or clicks back and clicks checkout again, I want it to work
    both times, so that a single-use URL is not my problem.
32. As a shopper who registers or logs in with a cart already going, I want that cart to carry over, so
    that logging in doesn't cost me my basket.
33. As a shopper, I want to search products by keyword, so that I can find something without browsing the
    category tree.
34. As a shopper, I want typeahead suggestions as I type in the search box, so that I get to the product
    in fewer steps.
35. As a shopper, I want to narrow a category by brand, price, rating, attributes and stock, so that a
    large category is navigable.
36. As a shopper, I want filter and sort state in the URL, so that I can share or bookmark a filtered view.
37. As a shopper on a store where the merchant hasn't enabled filtering, I want the page to say filters
    aren't available, so that I'm not staring at an empty sidebar wondering if it's broken.
38. As a shopper, I want a facet with many values to show all of them, so that a brand list isn't silently
    cut off partway through.
39. As a shopper with an account, I want to see my past orders, so that I can check what I bought.
40. As a shopper with an account, I want to manage my saved addresses, so that checkout is faster next time.
41. As a shopper with an account, I want to change my password and update my details, so that I don't need
    to contact support for routine account changes.
42. As a shopper sharing a product link on social, I want a rich preview card with the product image and
    current price, so that the link is worth clicking.

### Merchant / store admin

43. As a merchant, I want to rename a product's URL in BigCommerce without breaking links placed by
    editors in Sanity, so that SEO work and content work don't block each other.
44. As a merchant, I want to delete a product and have the site degrade cleanly — the block hides, the
    grid skips it — so that a catalog change doesn't take down a landing page.
45. As a merchant on a lower plan, I want the storefront to work without faceted search, so that the
    starter isn't unusable below a specific price tier.

### OSS contributor

46. As a contributor, I want no feature in the starter to depend on a sales conversation with BigCommerce,
    so that I can build, run and review every code path from a free developer sandbox.
47. As a contributor, I want CI to fail the build if Shopify names survive anywhere outside the changelog,
    so that fork residue can't be merged by accident.
48. As a contributor reading the diff that swaps commerce backends, I want it to be one commit where the
    old module is deleted and the new one wired in, so that I never have to reason about a half-migrated
    tree.
49. As a contributor, I want commerce adapters tested against payloads captured from a real BigCommerce
    store, so that a passing test means something about the real API rather than about my fixture.
50. As a contributor, I want documentation for the sync we deliberately did not build, so that the next
    person extends a design rather than inventing one.

### Roboto engineer on the client build

51. As the engineer taking this to a client, I want the shipped-but-unwired sync package to be genuinely
    tested, so that turning it on is a wiring task with a known shape.
52. As the engineer, I want stub-to-document joins to work by construction when the sync turns on, so that
    enabling it is not a content migration.
53. As the engineer, I want no client-specific decision baked into the starter, so that the open-source
    repo and the client fork don't diverge on day one.
54. As the engineer, I want the known risks written down with their early-warning signal, so that I find
    out on day one of a phase rather than at the end of it.

## Implementation Decisions

### Fork base and the flip

Fork `turbo-start-shopify`. Roughly 5.6k of its ~21k commerce lines are Shopify-shaped; the rest sits
behind seams that already exist. It also carries the Markdown content negotiation, the page builder, the
cart engine and its test suites, none of which the plain Sanity starter has.

The BigCommerce commerce module is built dark across several commits — nothing imports it — and then one
**flip commit** repoints every import and deletes the Shopify module in the same diff. Before the flip
Shopify is the only live path. After it, BigCommerce is. Nothing half-lives, so no reviewer and no
bisect ever lands in a tree with two commerce backends.

### The commerce client

Vendor BigCommerce's own `catalyst-client` from GitHub rather than npm; the published tarball omits its
SPDX license field. It is around 290 lines, has no Next.js imports, and handles the GraphQL transport,
channel routing and complexity headers.

Wrap it in a module that preserves the fork base's existing result contract exactly:

```ts
type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: "network" | "graphql" | "unknown" };
```

This is not a new interface. It is the one every existing call site already handles, and keeping it is
what makes the flip commit a repoint instead of a rewrite.

Typed queries use gql.tada against a schema file committed to the repo, refreshed by a script. A fresh
clone typechecks with no store and no credentials.

Authentication uses a **private storefront token** sent server-side. Vanilla tokens are excluded: their
server-to-server use sunsets in March 2027, and their CORS allowlist caps at two origins, which is one
short of localhost plus production plus preview.

### Product and category references in Sanity

Replace every weak Sanity reference to a product or collection with a denormalised inline object. The
field set is the decision, so it is written out here:

```
productReference {
  entityId  number   required, positive integer   — immutable BigCommerce key; every live fetch uses it
  slug      string   required                     — BigCommerce URL path, no slashes; GROQ builds hrefs from it
  title     string                                — display cache, Studio previews only
  imageUrl  url                                   — display cache, Studio previews only
}
```

`categoryReference` is the same shape. `productWithVariant` becomes a `productReference` plus a numeric
variant id and a variant label; the storefront falls back to the first variant when the id doesn't
resolve, which is the behaviour the old schema already documented.

The old cross-document validation rule dies with the documents it queried. The variant dropdown enforces
variant-belongs-to-product structurally, by only offering the picked product's variants.

Staleness is contained by construction. Data fetches key on `entityId`, which never changes. Hrefs
resolve through BigCommerce's route lookup with redirects followed, so a renamed slug 301s to canonical.
Only `title` and `imageUrl` can go stale and neither is trusted at render.

### Deterministic document ids

A future synced document lands at `bigcommerceProduct-{entityId}`, with siblings for variants and
categories. This mirrors the id convention the fork base already uses for Shopify. It costs nothing today
and it is what lets a stub join its document later:

```groq
"doc": *[_id == "bigcommerceProduct-" + string(^.entityId)][0]
```

Never cut this, even under deadline pressure. It is the difference between turning the sync on and
running a content migration.

### The Studio input components

The Studio is a static SPA with no server context, so any token given to it ships to the browser. No
token goes in it.

Product search inside Studio calls the storefront app's own search API route, which returns public
catalog data any shopper can already query. That route gains a permissive CORS header for the Studio
origin; it is read-only and the data is public. The Studio locates the storefront through a new
environment variable.

Category picking reuses the existing search-defaults route and filters client-side, because category
counts are small. Variant picking reuses the existing per-product API route.

If the environment variable is unset or the storefront is unreachable, every input renders Sanity's
default field UI under a one-line warning. The schema is plain fields; the input is sugar. Content
editing never hard-depends on BigCommerce being up.

### Render paths

Product and category pages become **catalog-required, Sanity-none**: BigCommerce is the only source, and
a missing Sanity document is not an error because no such document exists. Metadata comes from
BigCommerce's native SEO fields, so page titles and descriptions don't regress.

Both routes take catch-all segments. BigCommerce category paths are multi-segment by default, and joining
the segments before the route lookup removes that entire bug class rather than special-casing it.

`generateStaticParams` fetches the catalog at build time, capped by an environment variable, with the
remainder served on demand. Catalyst's fully dynamic proxy resolution was rejected because it never
serves a catalog page statically.

Open Graph images fetch live from BigCommerce with a one-hour revalidate. The existing bespoke product
card — price, compare-at price, colour swatches — survives unchanged, because all its inputs come from
that one fetch. A cached snapshot in Sanity was rejected as a sync by another name.

The href-building select is currently duplicated eight times across GROQ. Extract it once during the
rewrite.

### Cart, checkout and sessions

Cart identity moves into the session. The existing `getCartId` / `setCartId` / `clearCartId` functions
are the seam, so their signatures do not change and no caller changes with them.

Guests get an anonymous session token; customers get an Auth.js session. Both carry the cart id. This is
the only shape where a guest-to-customer cart merge works, because BigCommerce's login mutation takes the
guest cart id as an argument for exactly this purpose.

**`checkoutUrl` is removed from the cart type.** It becomes a server action that mints a fresh redirect
URL on each click. The URL is single-use; leaving it as a field is an invitation for a future contributor
to cache it. Removing it from the type makes that mistake a compile error.

Auth.js v5 is pinned to the exact beta Catalyst uses. If it fights Next 16, the fallback is a hand-rolled
httpOnly cookie, and that call gets made on day one of the phase rather than drifting.

### Faceted search

One search field serves the search page, category pages, brand pages and typeahead. There is no separate
predictive-search endpoint; typeahead is the same query with a small page size and client-side grouping.

The filter panel is a rewrite, not an adaptation, because the two APIs invert who carries filter
semantics. Shopify hands the client an opaque JSON blob to echo back, so one generic component handles
any filter Shopify adds. BigCommerce returns a typed union that the client must branch on to build a
hand-typed filter input:

```
BrandSearchFilter | CategorySearchFilter | ProductAttributeSearchFilter
| RatingSearchFilter | PriceSearchFilter | OtherSearchFilter
```

The presentational shell survives. The query, the transformer and the URL codec are new.

Two BigCommerce specifics drive behaviour here. First, facets are plan-gated, and on a lower plan the
filter list returns empty while products load normally — silent degradation. The starter renders an
explicit "filters unavailable" state and logs one server-side warning; it never renders an empty array as
nothing. Second, facet value lists are themselves paginated connections, and Catalyst omits the page-size
argument and silently truncates long lists. Pass it.

Shopify's `productType` and `tag` filters have no BigCommerce counterpart and are dropped. Modelling them
as custom product attributes is plausible and unverified; it is a merchant-catalog decision, not a code one.

### The sync, shipped dark

A separate package containing a Sanity write client with its own write token, upsert functions, a
reconcile script and the schema types. Nothing in either app imports it.

Two upsert rules, both of which cost real editor data if rediscovered late, and neither of which is
written down anywhere in the fork base:

1. **Patch the `store` subtree only. Never replace the whole document.** Body, hero, modules and SEO are
   editor-owned siblings on the same document. A whole-document overwrite destroys editorial work on
   every sync run.
2. **Soft-delete with a flag. Never remove the document.** Skipping this is exactly why the fork base
   needed a separate manual cleanup script.

The reconcile sweep is the primary mechanism, not a fallback. BigCommerce has no CRUD webhooks for
variants, none for brands, and most product image changes don't fire an update event. Payloads are
id-only, unordered, and can duplicate. A webhook-only sync is structurally incomplete.

The webhook receiver is deliberately not built. Building the transport before the write logic is proven
leaves a live endpoint writing nothing, which rots unnoticed. Its design is documented instead, including
the detail that the hash field on a webhook payload is an unkeyed SHA-1 for deduplication and **not a
signature**; authentication goes in the optional headers object set at hook creation.

Schema types ship exported but **not registered**. Registering them early gives editors a permanently
blank Products list, which is worse than absent. Registration is the flip that turns the sync on.

### Sanity v6

The upgrade lands after the BigCommerce swap is green, as its own commit with its own test run. One
variable at a time.

### Settled: category pages live at `/collections`

Category is BigCommerce's noun and collection is Shopify's, so `/categories` reads more natively. It
was rejected anyway. The rename touches every public URL, the sitemap, the LLM-facing text routes, the
Markdown content-negotiation paths and the Sanity index singleton — and keeping the fork's URLs is
reversible where renaming public URLs is not. PLAN.md P2 proposes the rename; that proposal does not
apply.

The Sanity type is still called `categoryReference`, because it points at a BigCommerce category. The
route it builds is `/collections/{slug}`. The mismatch is deliberate and neither side gets renamed to
match the other.

## Testing Decisions

### What makes a good test here

Test the shape a module hands to its callers, not how it computed it. A test that names an internal
helper, asserts on the number of fetches, or breaks when a private function is renamed is testing
implementation. For this project the useful assertion is almost always: **given this BigCommerce
response, what internal value comes out?**

One rule matters more than the rest: **capture fixtures from a live sandbox before porting the mapper,
not after.** Writing the adapter first and then writing fixtures that match it produces a green suite
that proves nothing, and it is the failure mode that lets Shopify semantics survive under BigCommerce
names. Fixtures are committed alongside the tests.

### Seams

Two, and only two. Both already exist in the fork base.

**Seam 1, pure functions fed committed fixtures.** Every commerce adapter, reducer and transformer is a
plain function from a payload to an internal type, tested with no network and no framework. This is the
fork base's existing pattern, and it is stricter than it sounds: none of its eight test files touch the
client, and the only place a tested module names the client at all is a type-only import of the failure
union, which the compiler erases. The seam stays because it is already platform-agnostic. The cart engine
and controller suites, about 1,200 lines, are coupled to Shopify by type imports alone.

The higher seam was considered and rejected. Testing at the client's result contract would be one seam
instead of two, but the vendored BigCommerce client calls global `fetch` directly rather than accepting
an injectable transport, and the client module is server-only with module-scope environment reads.
Reaching it from a test means a fetch stub, a server-only alias and a fake environment, all to cover
about thirty lines of error classification that the lower seam already exercises through captured error
payloads. New infrastructure, no new coverage.

**Seam 2, Playwright against a seeded sandbox.** Reserved for facts that are only true across the
network and cannot be faked at seam 1:

- Checkout clicked twice in a row succeeds twice, which is what proves the redirect URL is minted per
  click rather than cached.
- A guest cart survives login and merges into the customer's cart.
- A stale slug resolves through BigCommerce's redirect to the canonical product page.
- The account flow end to end: register, log in, empty orders state, address create/edit/delete, password
  change, log out.

The Sanity side gets a **typecheck gate rather than a test**: the Studio typechecks and the generated
Sanity types contain zero `store` fields. A GROQ projection is a type, and a type is checked, not
asserted. There is no third seam and no Studio test runner.

### Modules under test

Carried over from the fork base with fixture changes only: the money helpers (unchanged — the internal
money shape stays a string amount plus a currency code, and BigCommerce's numeric money is stringified
once in the adapter, which saves touching every price display), the cart engine and the cart controller.
Their folding, debounce, retry and optimistic-update assertions are platform-agnostic and stay untouched.

Rewritten: the error classifier, whose input taxonomy is Shopify-shaped. BigCommerce's typed mutation
errors map onto the **same** internal error enum, so the controller suite never notices the backend
changed. Table-driven from payloads captured in the sandbox.

Rewritten from live fixtures, keeping its twenty existing case names as the behavioural spec: the product
card mapper. Keeping the names is deliberate — they are the only written record of what the card is
supposed to do, and rewriting them alongside the code would lose it.

New: cart normalisation, which must cover BigCommerce splitting a cart into physical and digital item
lists that merge into one internal line list. The facet transformer, covering union parsing and the case
where an empty filter list means "unavailable" rather than "none". The featured-products resolver,
covering restoration of editor-chosen order after an id-keyed fetch. The checkout action, covering two
invocations producing two distinct URLs. The Markdown adapters, on BigCommerce fixtures.

### Prior art

The fork base's cart tests are the model: table-driven, fixture-in / value-out, no mocking framework, no
network. The Markdown tests are the model for the content-negotiation work. Catalyst's transformer is the
size anchor for the facet work — roughly 190 lines — and its end-to-end specs are the model for the search
and account flows.

## Out of Scope

Running the catalog sync is out. The write path and the reconcile sweep are built and tested, and nothing
invokes them. The webhook receiver is designed and not built. Schema types ship unregistered.

B2B Edition is out: companies, quotes, invoices, net terms, the Buyer Portal. It needs multi-storefront,
which contradicts the settled single-channel decision. It needs a support ticket to provision, which
makes the whole code path unbuildable and unreviewable by anyone who clones the repo without a sales
relationship. And BigCommerce calls its own Catalyst integration experimental, which is not something a
starter should be where people find out. The native customer-group and price-list pricing seam is
documented as the v2 path instead.

One channel, one currency, one region in v1. The channel id stays an environment parameter rather than a
constant, so adding channels later is configuration, not surgery.

Checkout is hosted only. No embedded, no custom.

Shopify's `productType` and `tag` filters are dropped; there is no BigCommerce counterpart. So is the
shared page-builder-blocks packaging refactor, which has nothing to do with commerce.

## Further Notes

### Hard constraints

The checkout URL is single-use and must be minted inside a server action on click. Storefront tokens must
be private, not vanilla. The BigCommerce module lands and the Shopify module dies in the same commit. CI
greps for Shopify names and fails outside the changelog. The variant-image fallback in the fork base is
built around a documented Shopify quirk and must be re-derived from BigCommerce's image model rather than
transliterated — most of it is expected to be deleted rather than ported.

### Known risks, each with its early warning

Facets are plan-gated on a tier that is unconfirmed, and the failure is silent. The signal is the first
sandbox query returning an empty filter list, on day one of the search phase — which also answers whether
partner sandboxes have filtering at all. Keyword search and sort never depend on it.

Auth.js v5 beta against Next 16 may not cooperate. The signal is session callback type errors or cookies
not setting in dev, again on day one. The fallback is agreed in advance and the call is made that day.

Shopify semantics surviving under BigCommerce names is the risk the CI grep cannot catch, because grep
sees names and not behaviour. The mitigation is the fixture-capture discipline above.

The build-time catalog fetch may scale badly against BigCommerce's per-query complexity limit. The signal
is the complexity header climbing in the paginated paths fetch, which the client logs for free.

### Stated assumptions

The BigCommerce plan tier is unconfirmed and resolves on the first sandbox query. Credentials arrive at
implementation time. The working directory is currently `turbo-start-big-commerce` and the repo is
`turbo-start-bigcommerce`; the research documents move in under `docs/research/` at the first commit.

### Sequencing

Ten phases, roughly 14.5 engineer-days, range 12.5 to 17. If the deadline halves, cut in this order:
customer accounts and Auth.js entirely (guests still check out), the sync infrastructure (keeping the
design document and the deterministic ids), the facet panel (keyword search and sort still ship), the
Sanity v6 upgrade (ship on v5, the fork's native version), then the bespoke product OG card.

Never cut: the stub schema and the GROQ rewrite, which are the starter's identity; the deterministic id
scheme; the flip-commit discipline; per-click checkout minting; the seed script; the CI grep gate. Each
is either the product itself or a one-way door.
