# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BigCommerce + Sanity headless commerce starter — pnpm monorepo with Turborepo orchestration.

Every commerce read and write runs on BigCommerce, through `apps/web/src/lib/bigcommerce`. Sanity owns
everything editorial. The catalog reaches Sanity as synced documents — `packages/sanity-sync` writes
them at deterministic ids (`bigcommerceProduct-{entityId}` and siblings), and page-builder blocks
reference those documents. The Studio itself never calls BigCommerce.

## Commands

```bash
# Development (web :3000, studio :3333)
pnpm dev              # all apps
pnpm dev:web          # Next.js only
pnpm dev:studio       # Sanity Studio only

# Build
pnpm build            # all
pnpm build:web        # web only
pnpm build:studio     # studio only

# Quality
pnpm lint             # biome lint
pnpm format           # biome format --write
pnpm format:check     # biome format (check only)
pnpm check-types      # tsc --noEmit across all packages, plus gql.tada check
pnpm test             # vitest run
pnpm check-refs       # scan tracked files for references that must not survive

# Seed — all four steps, in the order they have to run
pnpm seed --yes       # DESTRUCTIVE. Without --yes it prints its targets and stops
pnpm verify           # credentials, channel, catalog and content agree

# The steps, if you need one on its own
pnpm seed:bigcommerce # catalog into BigCommerce, from a committed fixture
pnpm seed:sanity      # content into Sanity — DESTRUCTIVE, wipes the dataset
pnpm sync:bigcommerce # catalog back out of BigCommerce, into Sanity
pnpm seed:refs --write # repoint the content at the ids this store minted; dry run without --write

# Studio schema tooling (run from apps/studio)
npx sanity schema extract --enforce-required-fields --force # --force since v6: extract refuses to overwrite schema.json without it
npx sanity typegen generate
npx sanity deploy
```

Neither the sync nor `seed:refs` is optional. `apps/studio/seed/reference-dataset.ndjson`
carries no catalog documents — it holds **weak** references to the ones the sync writes,
named by slug (`bigcommerceProduct-wren-washed-cap`) rather than by id, because every
store mints its own `entityId`s. `seed:refs` swaps each slug for the real id. Skip either
step and the navbar, promo banner and homepage featured products point at documents that
do not exist, which renders as nothing rather than as an error. See
`apps/studio/seed/README.md` for the full contract.

## Architecture

```
apps/
  web/          → Next.js 16 (App Router, Turbopack, React Compiler, RSC)
  studio/       → Sanity Studio v6 (custom structure, plugins, blueprints)
packages/
  env/          → @workspace/env — T3 env validation (Zod v4), client.ts + server.ts
  sanity/       → @workspace/sanity — Sanity client, GROQ queries, live preview, generated types
  ui/           → @workspace/ui — Shadcn (new-york style) + Tailwind v4 primitives
  logger/       → @workspace/logger — Logger class on top of evlog; drain seam in apps/web/src/instrumentation.ts
  typescript-config/ → shared tsconfig presets
```

### Data Flow

1. **GROQ queries** defined with `defineQuery` in `packages/sanity/src/query.ts` — composable fragments for images, links, rich text, page builder blocks
2. **`sanityFetch()`** from `packages/sanity/src/live.ts` (via `next-sanity/defineLive`) — used in RSC pages for data fetching with live preview support
3. **Page Builder** (`apps/web/src/components/pagebuilder.tsx`) — client component mapping `_type` → React section component via `BLOCK_COMPONENTS` record. Uses `useOptimistic` from `@sanity/visual-editing` for live editing
4. **Section components** in `apps/web/src/components/sections/` — `hero`, `cta`, `faq-accordion`, `feature-cards-with-icon`, `subscribe-newsletter`, `image-link-cards`
5. **Types** auto-generated: run `pnpm --filter studio type` → outputs to `packages/sanity/src/sanity.types.ts`

### Adding a New Page Builder Block

1. Create Sanity schema in `apps/studio/schemaTypes/blocks/`
2. Register it in `apps/studio/schemaTypes/index.ts`
3. Add GROQ fragment in `packages/sanity/src/query.ts` and include in `pageBuilderFragment`
4. Run `pnpm --filter studio type` to regenerate types
5. Create React component in `apps/web/src/components/sections/`
6. Register in `BLOCK_COMPONENTS` map in `apps/web/src/components/pagebuilder.tsx`
7. Add type to `PageBuilderBlockTypes` union in `apps/web/src/types.ts`
8. If the block carries structured data, add a case to
   `apps/web/src/components/page-builder-json-ld.tsx` — **not** to the block
   component. `pagebuilder.tsx` is `"use client"`, so a `<script
   type="application/ld+json">` rendered inside a block is built in the browser
   bundle; and a component that hard-codes its own `id` collides with itself
   when an editor adds the block twice. Key the script on the block's `_key`.

### Sanity Studio Structure

- **Documents**: `blog`, `page`, `faq`, `author`, `redirect`
- **Singletons**: `homePage`, `blogIndex`, `settings`, `footer`, `navbar`
- **Synced catalog**: `bigcommerceProduct`, `bigcommerceProductVariant`, `bigcommerceCategory` — written by `packages/sanity-sync`, never by hand. Their schema lives in that package, not in `apps/studio`
- **Blueprint** (`sanity.blueprint.ts`): auto-redirect function — creates redirect documents on slug change

### Key Patterns

- **Env validation**: `@workspace/env/client` and `@workspace/env/server` — validated imports, never raw `process.env`
- **Path aliases**: `@/*` → `apps/web/src/*`, `@workspace/ui/*` → `packages/ui/src/*`
- **SEO**: `seoFromDocument()` in `apps/web/src/lib/seo.ts` is what a Sanity-backed
  route's `generateMetadata` calls; `getSEOMetadata()` underneath it is for the
  BigCommerce-backed routes, which have no document. Social cards resolve in
  order: an explicit `ogImage`, then the generated `/api/og` card when the page
  has a `contentType`/`contentId`, then `settings.ogImage`, then
  `public/opengraph.png`
- **Structured data**: `page-builder-json-ld.tsx` (per-block, server-rendered)
  and `combined-json-ld.tsx` (site-wide), both reading settings through
  `lib/json-ld-data.ts`. `components/json-ld.tsx` takes its data as props so it
  stays importable from client components
- **Visual editing**: `VisualEditingLayer` (`VisualEditing` from `next-sanity` plus this app's overlay components) + `createDataAttribute` per block, draft mode via `/api/presentation-draft`
- **Redirects**: fetched from Sanity at Next.js build time via `queryRedirects` in `next.config.ts`

### Double-click to type (custom Presentation overlay)

`apps/web/src/components/overlay-components.tsx` is the resolver handed to
`<VisualEditing components={...} />` through `visual-editing-layer.tsx` (its own
client component, because a function cannot cross the server/client boundary).
It returns `InlineText` when `isInlineEditable` in `inline-text.tsx` allows it:
the element holds a single text node, sits outside any link, button, summary
or label (the click capture would swallow their handlers), and either

- **Plain strings**: carries the bare `data-inline-edit` flag over a `string` field. Never flag a multi-line `text` field: nothing at runtime can tell the two apart, Enter saves, and a paste collapses newlines. Each section's own plain-string eyebrows (the `Badge`s included) and titles carry it. Opt-in, because the resolver also sees every nav link, button label and badge
- **Rich text**: has a Portable Text span path (`…children[_key=="s"].text`). The words in a one-span paragraph, or in the bold/italic run inside one, can be typed over. Plain runs in a paragraph that also has marks, and marks, links and new paragraphs themselves, stay in the Studio form

Never flag commerce text: product titles, prices, anything read from the
BigCommerce API, and anything projected from a synced catalog document
(`collection->store.title` and the like). The sync owns those documents and
overwrites them, so an inline save there would be lost on the next run.

`inline-text.tsx` makes the element `contentEditable="plaintext-only"` on
double-click and saves once on blur through `useDocuments()`, to the overlay
node's own `id` and `path`. Sanity ships nothing official for inline typing;
this is custom on that documented API. The rules that keep typing and page
updates from trampling each other (strip stega first, save only on blur, put
typed text back over a render, rewrite React's text node in place, restore on
cancel, empty or a locally rejected patch (the Studio's own write is
fire-and-forget, so a server rejection is not reported back), end without
saving if React restructures the text mid-edit, clean up if the element is
removed) live as comments in `inline-text.tsx`. No real click on an editable
element reaches the overlay: a click opening the field makes the Studio focus
its input, which ends an edit mid-word. A single click is replayed after the
double-click window, and Enter opens the field with the saved value. Saving is
last-write-wins, as in the Studio form. Inline editing is on only when the
preview's perspective is drafts: the root layout reads it with
`resolvePerspectiveFromCookies` and passes that to `VisualEditingLayer`,
because saves always write `drafts.<id>`, which a published or release preview
never shows. In a drafts preview, text from the published document stays
editable, because a page with no draft renders from it and the first save
creates the draft.

Visitors never mount any of it: `VisualEditingLayer` renders only in draft
mode, the layout reads the perspective cookie only inside that branch, and the
`data-inline-edit` attribute is inert outside Presentation.

## Tooling

- **Node**: >=24.0.0
- **Package manager**: pnpm 11.24.0 (workspace protocol, catalog for shared versions in `pnpm-workspace.yaml`)
- **Formatter/Linter**: Biome 2.5.10 — double quotes, semicolons, 2-space indent, 80 char width, trailing commas es5
- **Import order** (Biome): URL/Node → packages → blank line → aliases/paths
- **TypeScript**: strict, `noUncheckedIndexedAccess`, module NodeNext, target ES2022
- **Tailwind CSS v4**: CSS-first config via `@import "tailwindcss"`, OKLCH color tokens, dark mode via `@custom-variant`
- **React Compiler**: enabled via `babel-plugin-react-compiler` in Next.js config
- **Tests**: Vitest in `apps/web`

## Environment Variables

**Web** (`apps/web/.env.local`):
- `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `NEXT_PUBLIC_SANITY_API_VERSION`, `NEXT_PUBLIC_SANITY_STUDIO_URL`
- `SANITY_API_READ_TOKEN`, `SANITY_API_WRITE_TOKEN`
- `BIGCOMMERCE_STORE_HASH`, `BIGCOMMERCE_STOREFRONT_TOKEN`, `BIGCOMMERCE_CHANNEL_ID`, `BIGCOMMERCE_PRERENDER_LIMIT`
- `NEXT_PUBLIC_SITE_URL` — canonical origin, no trailing slash. Checked *before* the
  `VERCEL_*` vars, so it also overrides the generated `*.vercel.app` URL. Required off
  Vercel: `getBaseUrl()` otherwise falls back to `localhost:3000` and every canonical, OG
  URL and sitemap entry ships pointing there

The storefront token must be a **private** one. A vanilla token stops working
server-to-server on 2027-03-31 and its CORS allowlist caps at two origins — one short
of localhost plus production plus preview. The README gives the mint command.

**Studio** (`apps/studio/.env`):
- `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET`, `SANITY_STUDIO_TITLE`, `SANITY_STUDIO_PRESENTATION_URL`
- `BIGCOMMERCE_STORE_HASH`, `BIGCOMMERCE_ADMIN_TOKEN` — used by `pnpm seed:bigcommerce` only. Deliberately separate from the storefront token, which cannot write catalog data

Both `.env.example` files are the source of truth. Env validation hard-throws on a missing or
empty-string value — `KEY=` is not the same as absent, and only absent lets a `.default()` fire.

## Agent skills

### Issue tracker

Linear — the `Roboto studio` team, `Turbo Start BigCommerce` project, via the Linear MCP tools.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, despite the monorepo layout.
See `docs/agents/domain.md`.
