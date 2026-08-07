# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating
them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

Neither exists yet. Until they do, `docs/research/00-decisions.md` is the closest thing to a decision
record and `SPEC.md` carries the vocabulary — read those instead.

## Layout: single-context

```
/
├── CONTEXT.md
├── SPEC.md                       ← the behavioural contract
├── PLAN.md                       ← phasing, file-level detail, estimates
├── docs/
│   ├── adr/
│   ├── agents/                   ← this directory
│   └── research/                 ← the eight research findings
├── apps/{web,studio}
└── packages/*
```

This is a Turborepo monorepo, but it is **one context, not many**. Two apps and a handful of small
packages that make up a single product. There is no `CONTEXT-MAP.md` and there should not be one; a
per-package `CONTEXT.md` would fragment a glossary that is genuinely shared — `stub`, `entityId`,
`flip commit`, `reconcile sweep` mean the same thing in the storefront, the Studio and the sync package.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test
name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

Until `CONTEXT.md` exists, the working vocabulary lives in `SPEC.md` and `docs/research/`. The terms that
carry weight, and the ones worth not paraphrasing:

- **stub** — the denormalised `{entityId, slug, title, imageUrl}` object the page builder stores instead
  of a Sanity reference. Not a "reference", not a "pointer", not a "snapshot".
- **`entityId`** — BigCommerce's immutable product/category/variant key. Every live fetch keys on it.
- **flip commit** — the single commit where the BigCommerce module is wired in and the Shopify module is
  deleted. Not a "migration" and not a "cutover" spread across commits.
- **reconcile sweep** — the paginated catalog resync. It is the sync's primary mechanism, not a fallback
  for missed webhooks.
- **dark / unwired** — built, tested, and invoked by nothing. Not "stubbed out", not "scaffolded".
- **catalog-required / Sanity-none** — the product and category render path. BigCommerce is the only
  source; there is no Sanity document to be missing.
- **facet gate** — BigCommerce returning an empty filter list on lower plans while products load
  normally. Silent degradation, not an error.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the
project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

The settled decisions in `docs/research/00-decisions.md` carry the same weight as ADRs until real ADRs
exist. Contradicting one is allowed; doing it quietly is not.
