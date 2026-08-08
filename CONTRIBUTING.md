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

### Replacing a module: build it dark, then flip it in one commit

When new code replaces an existing integration rather than adding to it, build the replacement across as
many commits as it needs while **nothing imports it**. The tree stays green because the old path is still
the only live one. Then one commit — the flip commit — repoints every call site and deletes the module it
replaced, in the same diff.

The rule that makes it worth the bother: **never let two implementations of the same read be live at
once.** A tree with both is a tree where a bug reproduces on one path and not the other, where a reviewer
cannot tell which one served the page they are looking at, and where deleting the old one later turns out
to be a second migration nobody scheduled. This starter was ported that way — `lib/bigcommerce` grew dark
over several commits, then one commit repointed every import and removed its predecessor. Before it,
one platform served every read; after it, the other did. Nothing half-lived.

It also makes the diff honest. A flip commit is large, and it is *supposed* to be: it is the change, and
splitting it into "add the new call sites" and "delete the old module" produces two commits that are each
individually wrong about what the app does.

### Writing about the platform this was ported off

`pnpm check-refs` fails on references to it in shipping code, and that gate is strict — it will catch a
code comment explaining a port decision just as readily as leftover code. Do not weaken the gate or delete
the explanation. Describe the platform without naming it: "the platform this starter came off", "the old
platform's dialect". The comparison is usually the point and it survives the rewording intact.

Two categories are exempt and should stay that way. The decision record — `docs/research/`, `docs/plans/`,
`docs/agents/`, `PLAN.md`, `SPEC.md`, `CONTEXT.md` — is exempt by pathspec, because the gate exists to keep
the old platform out of shipped code rather than to erase how the port was decided. And `gid://shopify`
is exempt line by line, because it appears in tests where rejecting a legacy id *is* the assertion, so
renaming it would delete the test. `scripts/check-forbidden-refs.sh` carries both lists with the reasoning
beside them; extend the exemptions there rather than working around the gate.

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

Five habits, each of which exists because skipping it cost someone an afternoon.

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
your assumptions rather than the API. `apps/web/src/lib/bigcommerce/__fixtures__/` is all captures, and
a payload the API cannot be made to produce — a facet list on a plan without faceted search — belongs
next to the tests as a schema-derived module that says so in its header, not in `__fixtures__` where the
next reader will take it for a capture.

### Count the files in your diff before opening a PR

```bash
git diff origin/main --stat
```

The file count is the tell. If it is larger than the number of files you touched, your commit is
reverting somebody else's work.

`git reset --soft origin/main` is the usual way to squash a branch into one commit, and it is only safe
while `origin/main` is the same commit you last rebased onto. Fetch or push in between — and pushing
updates the ref whether you meant it to or not — and the reset lands on a newer `main` while your tree
is still built on the older one. Git does exactly what you asked: the commit now contains every
difference between the two, which means it silently reverts everything merged in the gap. Nothing
errors, no conflict appears, and the gates all pass, because reverting a merged change leaves a
perfectly consistent tree.

This is not hypothetical and it is not rare when several branches are landing in a day. When the count
looks wrong, diff a specific file you did not touch rather than guessing at the cause:

```bash
git diff origin/main -- .github/workflows/ci.yml
```

Seeing your own commit delete somebody else's lines is unambiguous. The fix is to reset the branch onto
the current `origin/main` and reapply only your own files, after checking they do not overlap what
landed in the gap:

```bash
git diff --name-only <old-base> origin/main   # what landed while you worked
git checkout -B <your-branch> origin/main
git checkout <bad-sha> -- <the files you actually own>
```

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
