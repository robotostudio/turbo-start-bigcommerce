# JSON-LD Structured Data Audit

Generated: 2026-07-14

## Summary

- **Routes scanned**: 10 (9 `page.tsx` + root `layout.tsx`)
- **JSON-LD implementations found**: 5 types (Organization, WebSite, Article, FAQPage, Product) across 4 surfaces
- **Missing implementations**: BreadcrumbList (site-wide), collection/list schemas, blog index schema
- **`schema-dts`**: installed (`^1.1.5`) ✓
- **Coverage**: ~50% of high-value routes have _some_ JSON-LD; **0% have BreadcrumbList**, which is the single biggest gap.

## Current Coverage

| Route | File | Existing JSON-LD | Recommended | Status |
|-------|------|------------------|-------------|--------|
| `/` (root) | `app/layout.tsx` | Organization, WebSite | Organization, WebSite, BreadcrumbList | Partial |
| `/` (home) | `app/page.tsx` | — (inherits layout) | + WebSite `SearchAction` | Partial |
| `/[...slug]` | `app/[...slug]/page.tsx` | FAQPage (via faq blocks) | WebPage, BreadcrumbList, FAQPage | Partial |
| `/blog` | `app/blog/page.tsx` | — | Blog / CollectionPage, BreadcrumbList | Missing |
| `/blog/[slug]` | `app/blog/[slug]/page.tsx` | Article | BlogPosting, BreadcrumbList | Partial |
| `/products/[handle]` | `app/products/[handle]/page.tsx` | Product | Product (+ SKU/rating), BreadcrumbList | Partial |
| `/collections` | `app/collections/page.tsx` | — | CollectionPage, BreadcrumbList | Missing |
| `/collections/[handle]` | `app/collections/[handle]/page.tsx` | — | CollectionPage + ItemList, BreadcrumbList | Missing |
| `/cart` | `app/cart/page.tsx` | — | none (transactional) | N/A |
| `/search` | `app/search/page.tsx` | — | SearchResultsPage (optional) | Low |

## Quality Issues in Existing Implementations

These are correctness/security concerns, not just gaps:

1. **`JsonLdScript` renders JSON as JSX text children** (`json-ld.tsx:67`), not `dangerouslySetInnerHTML`. React entity-escapes `<`, `>`, `&` in script text content; those entities are **not** decoded inside `<script>`, so any FAQ/article/org field containing `&`, `<` or `>` produces **invalid JSON-LD** that Google silently drops. Used by FAQ, Article, Organization, WebSite.
2. **`ProductJsonLd` uses `dangerouslySetInnerHTML` without XSS sanitization** (`product-json-ld.tsx:36`). A product description containing `</script>` breaks out of the tag. Needs `.replace(/</g, "\\u003c")`.
3. **Blog posts use `Article` instead of `BlogPosting`** — `BlogPosting` is the more specific, recommended type for blog content.

Recommended fix: a single hardened `<JsonLd>` primitive using `dangerouslySetInnerHTML` + `.replace(/</g, "\\u003c")`, and route every schema component through it.

## Implementation Plan

Ordered by impact. Each references the skill rule file with the full pattern.

### CRITICAL

1. **Harden the JSON-LD render primitive** (`components/json-ld.tsx`, `product/product-json-ld.tsx`)
   - Switch `JsonLdScript` to `dangerouslySetInnerHTML` + `.replace(/</g, "\\u003c")`; apply same sanitization to `ProductJsonLd`. Fixes silent-drop + XSS.

2. **Add BreadcrumbList site-wide** — highest-ROI missing type; produces the breadcrumb trail in SERPs.
   - `/blog/[slug]`, `/products/[handle]`, `/collections/[handle]`, `/collections`, `/blog`, `/[...slug]`
   - Rule: `nav-breadcrumb-list` → `rules/nav-breadcrumb-list.md`

3. **Add `SearchAction` (sitelinks search box) to WebSite** (`components/json-ld.tsx` `WebSiteJsonLd`)
   - Rule: `nav-website` → `rules/nav-website.md`

### HIGH

4. **Add Blog / CollectionPage to `/blog` index** (`app/blog/page.tsx`)
   - Rule: `content-article` → `rules/content-article.md`

5. **Switch blog post `Article` → `BlogPosting`** (`app/blog/[slug]/page.tsx` + `json-ld.tsx`)
   - Rule: `content-blog-posting` → `rules/content-blog-posting.md`

### MEDIUM

6. **Add CollectionPage + ItemList to `/collections/[handle]`** (product listing) (`app/collections/[handle]/page.tsx`)
   - Rule: `ecom-product` / list patterns → `rules/ecom-product.md`

7. **Enrich Product** — add `sku`, `priceValidUntil`, optional `aggregateRating` (`product/product-json-ld.tsx`)
   - Rule: `ecom-product` → `rules/ecom-product.md`

8. **Add CollectionPage to `/collections` index** (`app/collections/page.tsx`)

### LOW

9. **`/search`** — `SearchResultsPage` (optional, low SEO value)

### N/A
- `/cart` — transactional, no structured data recommended.

## Next Steps

Implement CRITICAL → HIGH → MEDIUM. Items 1, 3, 5, 7 edit shared components; items 2, 4, 6, 8 edit route files and can be parallelized once the primitive (item 1) lands.
