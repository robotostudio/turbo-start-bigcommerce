# Seed data

`reference-dataset.ndjson` is the content this starter ships with: 133 documents
copied from the dataset behind <https://turbo-start-shopify-web.vercel.app>. Run
`pnpm seed:sanity` to load it into your own project.

You need a write token for your own project and nothing else. Images are not in
this directory — every image reference in the file is a `_sanityAsset` pointing
at Sanity's public image CDN, and the importer downloads each one and re-uploads
it into your project on the way through. That keeps 30 MB of photography out of
git while still giving a fresh clone the real pages.

## Refreshing it

Maintainer job. It needs read access to the reference project, which lives in
Roboto Studio's Sanity org.

1. Export the reference dataset as NDJSON.
2. Drop every `sanity.imageAsset`, `sanity.fileAsset` and `system.*` document.
3. Replace each `asset: { _type: "reference", _ref: "image-<hash>-<dims>-<ext>" }`
   with `_sanityAsset: "image@https://cdn.sanity.io/images/<project>/<dataset>/<hash>-<dims>.<ext>"`,
   keeping any sibling `hotspot`, `crop` and `alt` on the image object.
4. Write the result here and run `pnpm seed:sanity` against a scratch dataset
   before you commit it.

Step 3 is not optional. The importer refuses an asset document that names a
different project — it fails with "references a different project ID than the
specified target" — and rewriting the reference to a URL is the documented way
round it.

Only 11 of the reference project's 22 image assets are reachable from a
document. The other 11 are orphans and are deliberately not carried over.
