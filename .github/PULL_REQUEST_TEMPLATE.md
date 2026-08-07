## What changed and why

## Linear ticket

ROB-

Leave this blank if you're contributing from outside Roboto — there won't be a ticket, and that's fine.

## How to test

## Screenshots

Only if this changes UI. Delete this section otherwise.

## Before you open it

CI runs every one of these on the PR. Running them locally first saves a round trip:

```bash
pnpm lint
pnpm format:check
pnpm check-types
pnpm build
pnpm test
pnpm check-refs
```

`check-refs` is the one that surprises people: Shopify references warn and pass, because the tree is
still full of them on purpose. Live-system identifiers — a real project ID, store hash, or deploy
hostname — fail hard.

- [ ] Branched from `main`, one feature or fix in it
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Sanity schema changes have regenerated types (`pnpm --filter studio type`)
