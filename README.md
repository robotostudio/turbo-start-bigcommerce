# Turbo Start BigCommerce

A headless commerce starter: BigCommerce, Sanity, and Next.js 16 in a Turborepo monorepo. Visual editing, generated types, and a page builder your content team can actually use.

Built by [Roboto Studio](https://robotostudio.com).

[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.28-orange)](https://pnpm.io/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Sanity](https://img.shields.io/badge/Sanity-v5-red)](https://www.sanity.io/)
[![BigCommerce](https://img.shields.io/badge/BigCommerce-GraphQL%20Storefront-blue)](https://developer.bigcommerce.com/docs/storefront/graphql)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Where this is up to

This is a fork of [turbo-start-shopify](https://github.com/robotostudio/turbo-start-shopify), mid-conversion. Read this before you file a bug:

The commerce layer is still Shopify's. `lib/shopify` serves the storefront today. `lib/bigcommerce` is being built next to it and replaces it in a single commit, so the tree never carries two half-wired backends. Until that lands, the `SHOPIFY_*` environment variables are required and the `BIGCOMMERCE_*` ones are read by nothing.

Everything above the commerce layer is real and works: the monorepo, the Studio, the page builder, SEO, the whole content side.

[SPEC.md](SPEC.md) has the plan and [PLAN.md](PLAN.md) has the phase breakdown.

## Features

- **Turborepo monorepo** with shared packages and one `pnpm dev` to run everything
- **Next.js 16 App Router** with React Server Components, the React Compiler, Turbopack, and dynamic OG images
- **Sanity Studio v5** with visual editing, live preview, a page builder, and auto-redirects when a slug changes
- **BigCommerce GraphQL Storefront API** for products, categories, cart, and search (in progress, see above)
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
- A [BigCommerce](https://developer.bigcommerce.com/docs/start/sandbox) sandbox store, once the commerce layer lands. A Shopify development store until then.

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

### 4. Set up commerce

Until the BigCommerce flip lands, this is a Shopify step:

1. Create a [development store](https://help.shopify.com/en/partners/dashboard/managing-stores/development-stores) in your Shopify Partner dashboard
2. In the store admin: **Settings > Apps and sales channels > Develop apps**
3. Create a custom app with Storefront API access scopes
4. Copy the Storefront access token and the store domain

For BigCommerce, `BIGCOMMERCE_STOREFRONT_TOKEN` takes a **private** storefront token. Vanilla tokens are not supported: server-to-server use of them sunsets on 2027-03-31, and their CORS allowlist caps at two origins, which is one short of localhost plus production plus preview.

### 5. Start developing

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
| `SHOPIFY_STORE_DOMAIN` | Yes | Store domain, e.g. `your-store.myshopify.com`. Dies at the flip |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Yes | Storefront API token. Dies at the flip |
| `SHOPIFY_API_VERSION` | No | Defaults to `2025-01` |
| `BIGCOMMERCE_STORE_HASH` | Yes | Store hash from the API path. Read by nothing yet |
| `BIGCOMMERCE_STOREFRONT_TOKEN` | Yes | Private storefront token. Read by nothing yet |
| `BIGCOMMERCE_CHANNEL_ID` | No | Storefront channel, defaults to `1` |
| `BIGCOMMERCE_API_URL` | No | Endpoint override. Derived from the hash if unset |
| `NEXT_PUBLIC_STORE_CURRENCY` | No | ISO 4217 code, defaults to `GBP` |

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
| `SHOPIFY_STORE_DOMAIN` | Seeds | Only for `pnpm seed:shopify` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Seeds | Admin API token, only for the seed scripts |

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
| `pnpm check-refs` | Scan for Shopify leftovers and live-system identifiers |
| `pnpm seed:shopify` | Seed a Shopify store with test products |
| `pnpm verify:shopify` | Print a Shopify store health report |

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`. It copies the example env files, then runs lint, typecheck, build, tests, and `check-refs`. No secrets involved, which is the point: if the examples drift out of sync with the env schema, the build fails and says so.

`check-refs` has two lists. Shopify references warn and pass, because the tree is still full of them by design. Live-system identifiers fail hard. Nothing that belongs to a real project (a project ID, a store hash, a deploy hostname) may appear as a literal, and no script may fall back to one. A half-configured contributor should get an error, not silent access to somebody else's production data.

## Deployment

### Next.js on Vercel

1. Push to GitHub
2. Create a Vercel project pointed at the repo
3. Set the root directory to `apps/web`
4. Add the web environment variables
5. Deploy

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
| Products not loading | Check `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_STOREFRONT_ACCESS_TOKEN`. |
| Seed script fails | `SHOPIFY_ADMIN_ACCESS_TOKEN` is missing an Admin API scope. |
| Redirects not applying | They are fetched from Sanity at build time. Redeploy after adding one. |
| Tailwind styles missing | Check `@import "tailwindcss"` is in your CSS entry point and the `@workspace/ui` transpile config. |

## Tech stack

| Technology | Version | Purpose |
|------------|---------|---------|
| [Next.js](https://nextjs.org/) | 16 | React framework (App Router, RSC, Turbopack) |
| [React](https://react.dev/) | 19 | UI library |
| [Sanity](https://www.sanity.io/) | 5 | Headless CMS with visual editing |
| [BigCommerce Storefront API](https://developer.bigcommerce.com/docs/storefront/graphql) | GraphQL | Commerce engine (in progress) |
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
