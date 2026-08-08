# Parity harness — TEMPORARY

Diffs the local BigCommerce storefront against the deployed Shopify reference
(`turbo-start-shopify-web.vercel.app`), route by route: visible text, hrefs,
headings, HTTP status and rendered GBP price strings, with build-hash /
Sanity-project-id / preload noise filtered out by construction.
`interactions.sh` records the interactive flow (variant select, add-to-cart,
search modal, cart) with screenshots, one run per side.

```sh
node scripts/parity/parity.mjs baseline   # capture the reference, once
node scripts/parity/parity.mjs report     # fetch local, diff, write report
scripts/parity/interactions.sh <base-url> <ref|local> <out-dir>
```

State lives outside the repo in `PARITY_DIR`
(default: `<os tmp>/turbo-start-big-commerce/parity`).

**This tool is temporary and will be deleted.** It exists to steer the
Shopify → BigCommerce flip and refers to the Shopify reference site by name,
so it cannot survive ROB-2552, which turns the Shopify grep gate
(`scripts/check-forbidden-refs.sh --strict`) into a hard failure. When the
gate goes strict, delete this directory rather than rewording it.
