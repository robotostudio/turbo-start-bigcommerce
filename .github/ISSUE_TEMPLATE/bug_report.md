---
name: Bug report
about: Something in the starter is broken
labels: bug
---

Read [Where this is up to](https://github.com/robotostudio/turbo-start-bigcommerce#where-this-is-up-to)
first. The commerce layer is still Shopify's — `lib/shopify` serves the storefront, and the
`BIGCOMMERCE_*` variables are read by nothing until the flip commit lands. Missing BigCommerce data
is not a bug yet.

## What happened

## What you expected instead

## Steps to reproduce

1.
2.

## Which part

- [ ] `apps/web` — the Next.js storefront
- [ ] `apps/studio` — Sanity Studio, schemas, page builder
- [ ] A package under `packages/`
- [ ] Build, CI, or tooling

## Environment

- `node -v`:
- `pnpm -v`:
- OS:
- Browser, if this is a frontend bug:

## Credentials

- [ ] A real Sanity project and a real store
- [ ] The dummy values from `.env.example`, unchanged

On the dummy values, "Content Lake unreachable", empty pages, and no products are all expected. The
starter is built to install and build with nothing attached. If something else is wrong, file it —
just say which path you're on.

## Logs or screenshots

```
paste output here
```
