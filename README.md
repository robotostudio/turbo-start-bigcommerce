# Turbo Start BigCommerce

A headless commerce starter: BigCommerce, Sanity, and Next.js 16 in a Turborepo monorepo. Visual editing, generated types, and a page builder your content team can actually use.

Built by [Roboto Studio](https://robotostudio.com).

[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.28-orange)](https://pnpm.io/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Sanity](https://img.shields.io/badge/Sanity-v5-red)](https://www.sanity.io/)
[![BigCommerce](https://img.shields.io/badge/BigCommerce-GraphQL%20Storefront-blue)](https://developer.bigcommerce.com/docs/storefront/graphql)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- **Turborepo monorepo** with shared packages and one `pnpm dev` to run everything
- **Next.js 16 App Router** with React Server Components, the React Compiler, Turbopack, and dynamic OG images
- **Sanity Studio v5** with visual editing, live preview, a page builder, and auto-redirects when a slug changes
- **BigCommerce GraphQL Storefront API** for products, categories, cart, and search
- **Types end to end** — generated Sanity types, Zod-validated env, strict TypeScript
- **Tailwind CSS v4** with CSS-first config, OKLCH tokens, dark mode, and Shadcn components
- **SEO** — dynamic metadata, OG images, sitemap, JSON-LD

It also builds with no store and no CMS attached. Every content fetch degrades to its empty state and warns rather than failing, so you can clone this and run `pnpm build` before you have signed up for anything.

## Architecture

### Data flow

```
BigCommerce (products, categories, cart)
    ↕ GraphQL Storefront API
Next.js 16 (App Router, RSC)
    ↕ GROQ queries via sanityFetch()
Sanity CMS (pages, blog, navigation, SEO)
```

### Monorepo structure

```
apps/
  web/              → Next.js 16 frontend
  studio/           → Sanity Studio v5

packages/
  env/              → T3 env validation (Zod)
  sanity/           → Client, GROQ queries, live preview, generated types
  ui/               → Shadcn + Tailwind v4 primitives
  logger/           → Structured logger
  typescript-config/ → Shared TypeScript presets
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) 10.28+
- A [Sanity](https://www.sanity.io/) account (free)
- A [BigCommerce](https://developer.bigcommerce.com/docs/start/sandbox) store. A free partner sandbox is enough for everything here except faceted search, which is plan-gated.

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/robotostudio/turbo-start-bigcommerce.git
cd turbo-start-bigcommerce
pnpm install
```

### 2. Copy the environment files

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/studio/.env.example apps/studio/.env
```

The examples ship with dummy values that pass validation, so `pnpm build` works right now. Nothing will have content in it. Replace the values as you connect each service.

One thing to know: env validation treats a blank `KEY=` as an error, not as "unset". Delete a line rather than emptying it, or the default never fires.

### 3. Set up Sanity

1. Create a project at [sanity.io/manage](https://www.sanity.io/manage)
2. Note the project ID and the dataset name (`production` by default)
3. Under **API > Tokens**, create a read token and a write token
4. Put those four values in `apps/web/.env.local`, and the same project ID and dataset in `apps/studio/.env`

### 4. Set up BigCommerce

1. Create a store, or a free [partner sandbox](https://developer.bigcommerce.com/docs/start/sandbox)
2. In the control panel: **Settings > API accounts > Create API account**, type **V2/V3 API token**
3. Give it the `store_storefront_api` scope ("Create GraphQL Storefront API bearer tokens"), then copy the access token and the store hash out of the credentials file it hands you

That API account is only for minting. What the app actually reads is a **private** storefront token, which you mint once with the account above:

```bash
curl -X POST "https://api.bigcommerce.com/stores/{STORE_HASH}/v3/storefront/api-token-private" \
  -H "X-Auth-Token: {YOUR_API_ACCOUNT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "channel_ids": [1],
    "expires_at": '"$(($(date +%s) + 31536000))"',
    "allowed_cors_origins": []
  }'
```

The `expires_at` above is a year out. BigCommerce documents no maximum and would happily mint an immortal token, but a dated secret you re-mint annually beats one that lives forever in a repo people fork. There is no refresh endpoint — when it expires you run the same command again. `channel_ids` is required for a private token; `1` is the default channel and matches `BIGCOMMERCE_CHANNEL_ID`.

Use a private token, not a vanilla one. Vanilla tokens (`POST /v3/storefront/api-token`) are the ones every pre-2026 tutorial shows, and BigCommerce is retiring them for server-to-server use with a hard stop on **2027-03-31**. Their CORS allowlist also caps at two origins, and this app needs three: localhost, production, and preview deployments. Private tokens are rejected outright if the request comes from a browser, which is the right shape here — every GraphQL call in this starter runs on the server.

The GraphQL schema is committed at `apps/web/src/lib/bigcommerce/schema.graphql`, so a fresh clone typechecks with no store and no credentials. Once you have your own store, `pnpm bigcommerce:schema` introspects it and rewrites that file plus the generated `graphql-env.d.ts` beside it. Nothing runs it for you: it is not wired into `dev` or `build`, so run it when the store changes shape and commit what it writes. `pnpm bigcommerce:smoke` prints the connected store's name, which is the quickest way to find out whether your token works.

### 5. Seed the demo content

Three commands, and the order matters:

```bash
pnpm seed:bigcommerce   # catalog into BigCommerce
pnpm seed:sanity        # content into Sanity — destructive, wipes the dataset
pnpm sync:bigcommerce   # catalog back out of BigCommerce, into Sanity
```

The sync is not optional. `reference-dataset.ndjson` carries no product or category documents at all — it holds weak references to the ones the sync writes. Seed the content without syncing and the navbar, the promo banner, and the homepage's featured product all point at documents that do not exist.

`pnpm seed:bigcommerce` reads nothing live. No second storefront account, no source store to copy from. The catalog is a committed 57.6 KB fixture — 12 products, 61 variants, 10 categories — and all 132 of its images resolve from BigCommerce's own CDN.

[apps/studio/seed/README.md](apps/studio/seed/README.md) has the full contract: what each file holds, why the references are weak, and how to regenerate either one.

### 6. Start developing

```bash
pnpm dev
```

The app runs on [localhost:3000](http://localhost:3000), the Studio on [localhost:3333](http://localhost:3333).

## Environment variables

### Web (`apps/web/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | Yes | Sanity project ID |
| `NEXT_PUBLIC_SANITY_DATASET` | Yes | Dataset name, e.g. `production` |
| `NEXT_PUBLIC_SANITY_API_VERSION` | Yes | API version date |
| `NEXT_PUBLIC_SANITY_STUDIO_URL` | Yes | Studio URL, absolute. `http://localhost:3333` in dev |
| `SANITY_API_READ_TOKEN` | Yes | Sanity token with read access |
| `SANITY_API_WRITE_TOKEN` | Yes | Sanity token with write access |
| `BIGCOMMERCE_STORE_HASH` | Yes | Store hash from the API path |
| `BIGCOMMERCE_STOREFRONT_TOKEN` | Yes | Private storefront token, minted as above |
| `BIGCOMMERCE_CHANNEL_ID` | No | Storefront channel, defaults to `1` |
| `BIGCOMMERCE_API_URL` | No | Endpoint override. Derived from the hash and channel if unset |
| `BIGCOMMERCE_PRERENDER_LIMIT` | No | How many catalog paths to prerender at build, defaults to `100`. The rest render on demand |
| `NEXT_PUBLIC_STORE_CURRENCY` | No | ISO 4217 code, defaults to `GBP` |
| `SANITY_REVALIDATE_SECRET` | In production | Shared with the Sanity webhook that publishes content changes. See [Wiring up content revalidation](#wiring-up-content-revalidation). Without it `/api/revalidate` answers 503 and published edits never reach the site |

### Studio (`apps/studio/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SANITY_STUDIO_PROJECT_ID` | Yes | Same project ID as web |
| `SANITY_STUDIO_DATASET` | Yes | Same dataset as web |
| `SANITY_STUDIO_TITLE` | No | Display title |
| `SANITY_STUDIO_PRESENTATION_URL` | Prod | Frontend URL for live preview. Falls back to `localhost:3000` in dev |
| `SANITY_STUDIO_PRODUCTION_HOSTNAME` | Deploy | Hostname for the deployed Studio |
| `SANITY_STUDIO_API_VERSION` | No | Sanity API version |
| `SANITY_API_WRITE_TOKEN` | No | Match the web value. Not needed to build |
| `BIGCOMMERCE_STORE_HASH` | Seeds | Same hash as web. Only for the seed and sync scripts |
| `BIGCOMMERCE_ADMIN_TOKEN` | Seeds | API account token with catalog write scopes, only for the seed and sync scripts |

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start everything (web on :3000, studio on :3333) |
| `pnpm dev:web` | Next.js only |
| `pnpm dev:studio` | Sanity Studio only |
| `pnpm build` | Build both apps |
| `pnpm lint` | Lint with Biome |
| `pnpm format` | Format with Biome |
| `pnpm check-types` | Typecheck every package |
| `pnpm test` | Run the Vitest suite |
| `pnpm check-refs` | Scan for conversion leftovers and live-system identifiers |
| `pnpm seed:bigcommerce` | Load the committed catalog fixture into your store |
| `pnpm seed:sanity` | Import the demo content. Wipes the target dataset first |
| `pnpm sync:bigcommerce` | Mirror the catalog into Sanity. Run it after both seeds |
| `pnpm bigcommerce:schema` | Re-introspect your own store and rewrite the committed GraphQL schema |
| `pnpm bigcommerce:smoke` | Print the connected BigCommerce store's name |

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`. It copies the example env files, then runs lint, typecheck, build, tests, and `check-refs`. No secrets involved, which is the point: if the examples drift out of sync with the env schema, the build fails and says so.

`check-refs` has two lists. Live-system identifiers fail hard: nothing that belongs to a real project (a project ID, a store hash, a deploy hostname) may appear as a literal, and no script may fall back to one. A half-configured contributor should get an error, not silent access to somebody else's production data.

The second list catches leftovers from the platform this starter was ported off. Those still warn rather than fail while the last of them are cleared. The planning and research documents are exempt by pathspec: they are the record of how the port was decided, and rewriting history to satisfy a grep would be the wrong trade. The gate goes strict once shipping code is clear.

## Deployment

### Next.js on Vercel

1. Push to GitHub
2. Create a Vercel project pointed at the repo
3. Set the root directory to `apps/web`
4. Add the web environment variables
5. Deploy

### Wiring up content revalidation

**Do this before you call a deployment finished.** Without it, editors publish into a void: the Content
Lake takes the change instantly and the deployed site keeps serving the old page indefinitely.

`sanityFetch` caches every Sanity read with `revalidate: false` in production and tags it `sanity`, so
nothing expires on a timer — a named tag has to be invalidated. `/api/revalidate` does that, and a Sanity
webhook is what calls it. This is not a freshness optimisation you can defer. With no webhook wired,
Sanity content on a statically generated route is never refreshed rather than slowly refreshed, and
`export const revalidate` will not save you: it re-runs the render without touching the Data Cache the
read comes from.

Catalog data behaves differently, which is what makes a half-stale page so confusing. BigCommerce reads
are POSTs and Next never serves a POST from the fetch cache, so products and categories refresh on their
own schedule. A hidden product can therefore disappear from the site within one regeneration window
while a page edit published minutes earlier is still nowhere to be seen. Same page, two caches, one of
which nobody invalidated. [CONTRIBUTING.md](CONTRIBUTING.md#build-from-a-cold-cache) has the build-time
half of this and the command that gives you a genuinely clean build.

1. Generate a secret and add it to the deployment as `SANITY_REVALIDATE_SECRET`:

   ```bash
   openssl rand -hex 24
   ```

2. In [sanity.io/manage](https://sanity.io/manage) → your project → **API** → **Webhooks**, create one:

   | Field | Value |
   |-------|-------|
   | URL | `https://your-site.com/api/revalidate` |
   | Dataset | the one the site reads, e.g. `production` |
   | Trigger on | Create, Update, Delete |
   | Filter | `!(_id in path("drafts.**"))` |
   | Projection | `{_id, _type}` |
   | HTTP method | `POST` |
   | API version | `v2025-05-08` |
   | Secret | the value from step 1 |

   The filter keeps drafts from firing the hook — they cannot affect a published page, and every
   keystroke in the Studio saves a draft. The projection is only used for the log line; the route
   revalidates the same tag whatever the payload says, so keep it small.

3. Publish something and reload the page. It should change on the first request.

The route rejects anything without a valid signature, so an unset or mismatched secret shows up as
`401`s in the Sanity webhook log rather than as silent staleness. A missing secret answers `503`.

One deliberate limitation: the `sanity` tag is invalidated wholesale, because Sanity's sync tags are
content hashes rather than document ids and a webhook payload cannot be mapped to them. One publish
therefore refreshes all Sanity-backed content, not just the document that changed. For per-route
precision, give the route's own `sanityFetch` call an extra tag and invalidate that instead.

### Sanity Studio

```bash
cd apps/studio
npx sanity deploy
```

There is no deploy workflow in this repo. The one inherited from upstream fired on every branch and needed five secrets that no fork has, so it went. Add your own if you want automatic Studio deploys.

## Customization

### Adding a page builder block

1. Create a schema in `apps/studio/schemaTypes/blocks/`
2. Register it in `apps/studio/schemaTypes/blocks/index.ts`
3. Add a GROQ fragment in `packages/sanity/src/query.ts` and include it in `pageBuilderFragment`
4. Regenerate types: `pnpm --filter studio type`
5. Create the React component in `apps/web/src/components/sections/`
6. Register it in `BLOCK_COMPONENTS` in `apps/web/src/components/pagebuilder.tsx`
7. Add the type to `PageBuilderBlockTypes` in `apps/web/src/types.ts`

### Extending Sanity schemas

Document types live in `apps/studio/schemaTypes/documents/`, objects in `apps/studio/schemaTypes/objects/`. Register new types in `apps/studio/schemaTypes/index.ts`, then run `pnpm --filter studio type`.

### Adding Shadcn components

`npx shadcn add <name>` into `packages/ui`, then import via `@workspace/ui/components/<name>`. Unused primitives were stripped from this fork, so expect to add a few back.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Env validation fails on a variable you did set | You probably wrote `KEY=` with no value. Blank is not the same as unset. Delete the line. |
| "Module not found" | Run `pnpm install` from the root. Check the path aliases in `tsconfig.json`. |
| Sanity types out of date | `pnpm --filter studio type` |
| Build warns "Content Lake unreachable" | Your Sanity credentials are wrong or missing. The build finishes anyway with empty content, which is deliberate. |
| Visual editing does nothing | Allow third-party cookies. Check `SANITY_STUDIO_PRESENTATION_URL`. |
| Products not loading | Run `pnpm bigcommerce:smoke`. If it can't name your store, `BIGCOMMERCE_STORE_HASH` or `BIGCOMMERCE_STOREFRONT_TOKEN` is wrong, or the token has expired. |
| GraphQL rejects the token | You minted a vanilla storefront token instead of a private one, or minted it for a different channel than `BIGCOMMERCE_CHANNEL_ID`. |
| Navbar and homepage link to nothing | You ran `pnpm seed:sanity` without `pnpm sync:bigcommerce` after it. Run the sync. |
| Seed script fails | `BIGCOMMERCE_ADMIN_TOKEN` is missing a catalog write scope. |
| Text looks corrupted — hundreds of invisible characters inside an eight-character nav label | That is Sanity's stega watermark, not damaged content. Leave preview mode using the bar at the bottom of the page. A browser profile can sit in preview mode from a session days ago and quietly watermark everything you test in it, so check that before you go looking at the data. |
| A published edit never appears on the deployed site | The revalidation webhook is not wired. See [Wiring up content revalidation](#wiring-up-content-revalidation) — without it the page is never refreshed, not slowly refreshed. |
| A build shipped stale content and every check passed | Next's Data Cache lives in `.next` and outlives `turbo run build --force`. Build from a cold cache: `rm -rf apps/web/.next && pnpm build`. |
| You rebuilt, the page is unchanged — or 500s with `ChunkLoadError` | The old server is still on the port, serving the build you deleted. `pkill -f "next start"` misses it: the process renames itself to `next-server (<version>)`. Kill it by port instead — `kill $(lsof -nP -iTCP:3000 -sTCP:LISTEN -t)`, unquoted so more than one PID still works — and check the new server's log for `EADDRINUSE`. |
| Redirects not applying | They are fetched from Sanity at build time. Redeploy after adding one. |
| Tailwind styles missing | Check `@import "tailwindcss"` is in your CSS entry point and the `@workspace/ui` transpile config. |

## Tech stack

| Technology | Version | Purpose |
|------------|---------|---------|
| [Next.js](https://nextjs.org/) | 16 | React framework (App Router, RSC, Turbopack) |
| [React](https://react.dev/) | 19 | UI library |
| [Sanity](https://www.sanity.io/) | 5 | Headless CMS with visual editing |
| [BigCommerce Storefront API](https://developer.bigcommerce.com/docs/storefront/graphql) | GraphQL | Commerce engine |
| [Turborepo](https://turbo.build/) | 2 | Monorepo build orchestration |
| [Tailwind CSS](https://tailwindcss.com/) | 4 | CSS framework |
| [Shadcn UI](https://ui.shadcn.com/) | — | Component primitives |
| [Biome](https://biomejs.dev/) | 2 | Linter and formatter |
| [Vitest](https://vitest.dev/) | 4 | Test runner |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type safety |
| [Zod](https://zod.dev/) | 4 | Runtime env validation |
| [pnpm](https://pnpm.io/) | 10 | Package manager |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) &copy; [Roboto Studio](https://robotostudio.com)
