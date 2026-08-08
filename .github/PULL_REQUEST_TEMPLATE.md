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

`check-refs` is the one that surprises people. Live-system identifiers, meaning a real project ID,
store hash, or deploy hostname, fail hard. Leftovers from the platform this starter was ported off
only warn, and the planning and research docs are exempt from that list entirely.

- [ ] Branched from `main`, one feature or fix in it
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Sanity schema changes have regenerated types (`pnpm --filter studio type`)
