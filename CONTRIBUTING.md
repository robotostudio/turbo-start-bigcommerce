# Contributing to Turbo Start BigCommerce

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

Follow the [Getting Started](README.md#getting-started) guide in the README to set up your local environment. Once running, you should have:

- Next.js on [http://localhost:3000](http://localhost:3000)
- Sanity Studio on [http://localhost:3333](http://localhost:3333)

## Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting. The rules are pre-configured — just run:

```bash
pnpm format      # Auto-format all files
pnpm lint        # Lint all files
```

Key conventions:

- Double quotes, semicolons, 2-space indent
- Trailing commas (ES5 style)
- Import order is auto-sorted by Biome — don't fight it

## TypeScript

Strict mode is enabled across all packages. Before submitting a PR, run:

```bash
pnpm check-types
```

If you change Sanity schemas, regenerate types:

```bash
pnpm --filter studio type
```

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add wishlist page
fix: resolve cart quantity sync issue
refactor: simplify product variant selection
docs: update deployment guide
chore: bump dependencies
```

Keep commit messages concise and focused on the "why" rather than the "what".

## Pull Request Process

1. **Branch from `main`** using a descriptive name:
   - `feat/wishlist-page`
   - `fix/cart-quantity-sync`
   - `docs/deployment-guide`

2. **Keep PRs focused** — one feature or fix per PR. Smaller PRs get reviewed faster.

3. **Before opening a PR**, make sure:
   ```bash
   pnpm format:check   # Formatting passes
   pnpm lint            # No lint errors
   pnpm check-types     # No type errors
   rm -rf apps/web/.next && pnpm build   # Build succeeds, from a cold cache
   ```

   The `rm -rf` is not superstition. See [Verifying your work](#verifying-your-work).

4. **Write a clear PR description** with:
   - What changed and why
   - How to test the changes
   - Screenshots for UI changes

5. **Address review feedback** promptly. If a suggestion doesn't apply, explain why.

## Verifying your work

Four habits, each of which exists because skipping it cost someone an afternoon.

### Build from a cold cache

`turbo run build --force` is not a clean build. Turbo re-runs the build task, but Next's Data Cache
lives in `.next/cache` and survives it — so the build genuinely executes, resolves its Sanity reads out
of a cache that may be hours old, and bakes stale content into a green build. Every gate passes. The
output is wrong.

```bash
rm -rf apps/web/.next && pnpm build
```

Sanity reads are cached with `revalidate: false` and invalidated by tag, so nothing about them expires
on a timer. BigCommerce reads are POSTs, which Next never caches, so those refresh on their own. A page
can be half fresh and half frozen and look completely normal.

That same cache is why the revalidation webhook is not an optimisation you can defer. Nothing invalidates
the `sanity` tag except `/api/revalidate`, so a deployment without it serves whatever was true at build
time for as long as it runs, and `export const revalidate` on a page does not help, because it re-runs the
render against the same cached read. `SANITY_REVALIDATE_SECRET` is therefore required in
`packages/env/src/server.ts`, alongside the Sanity tokens: a build without it fails validation rather than
succeeding and going quietly stale.

### Kill the old server by port, not by name

A cold build only reaches a browser through a server that restarted. `pkill -f "next start"` matches
nothing — once running, the process renames itself to `next-server (<version>)`, so the pattern you
started it with no longer describes it. The old process survives, the new `pnpm start` exits with
`EADDRINUSE` into a log nobody reads, and port 3000 keeps answering 200 from the build you just deleted.

```bash
kill $(lsof -nP -iTCP:3000 -sTCP:LISTEN -t)   # unquoted: there may be more than one
rm -rf apps/web/.next
npx turbo run build --force
pnpm --filter web start
```

Then read the log for `EADDRINUSE` before believing anything on the page. Two signatures mean you are
talking to a survivor rather than your build: a change you know shipped is absent, or a page 500s with
`ChunkLoadError` — the old server asking for chunks out of the `.next` you removed. Neither is a bug in
your work.

### A test that would pass with the fix reverted is not testing the fix

Before trusting a check, ask what it would do against the broken code. If the answer is "pass", it is
measuring something else.

Most of the time this means manufacturing the failure state rather than waiting for it. Verifying a
cache fix straight after a rebuild proves nothing, because the page is already correct before the fix
runs — you have to cache the page first, then change the data underneath it, then look. Verifying a sort
by reading the URL proves nothing either; read the rendered order.

The related discipline for mappers is fixture-first: capture the real API response, commit it, then
write the code that consumes it. A mapper tested against a fixture you wrote from memory passes against
your assumptions rather than the API.

### When a repo fact and a runtime fact disagree, suspect the cache before the data

Committed seed files, live datasets and rendered pages are three different things, and they drift in
that order. If the dataset says one thing and the page says another, the page is stale far more often
than the dataset is wrong — check what is cached between them before you go looking for a bug in the
data.

## Project Structure

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

## Adding New Features

For common extension patterns (page builder blocks, Sanity schemas, Shadcn components), see the [Customization](README.md#customization) section in the README.

## Reporting Bugs

Open a [GitHub issue](https://github.com/robotostudio/turbo-start-bigcommerce/issues) with:

- A clear title describing the problem
- Steps to reproduce
- Expected vs. actual behavior
- Environment details (Node version, OS, browser)
- Error messages or screenshots if applicable

## Questions?

If you're unsure about something, open an issue and we'll point you in the right direction.
