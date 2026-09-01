import { sanityFetch } from "@workspace/sanity/live";
import { queryCollectionsIndexPageData } from "@workspace/sanity/query";
import { connection } from "next/server";

import { CollectionsContent } from "@/components/collections/collections-content";
import { BreadcrumbJsonLd, CollectionJsonLd } from "@/components/json-ld";
import {
  flattenCategoryTree,
  getCategoryTree,
} from "@/lib/bigcommerce/catalog";
import { categoryToCardProps } from "@/lib/collection-card";
import { seoFromDocument } from "@/lib/seo";
import { getBaseUrl } from "@/utils";

/**
 * The category tree is a BigCommerce read, and BigCommerce reads are POSTs that
 * Next never serves from the fetch cache — so without this the index freezes at
 * build time and a category the merchant creates never appears. Matched to the
 * category pages it links to; both are browse surfaces.
 */
export const revalidate = 300;

export async function generateMetadata() {
  const { data } = await sanityFetch({
    query: queryCollectionsIndexPageData,
  });

  // `subtitle` is this document's stand-in for `description`, so it is passed
  // as the fallback rather than read by `seoFromDocument`, which only knows
  // the fields every Sanity-backed route shares.
  return seoFromDocument(data, {
    slug: "/collections",
    title: "Collections",
    description: data?.subtitle ?? "Browse all collections",
  });
}

export default async function CollectionsPage() {
  // The index heading is editorial and stays in Sanity; the categories
  // themselves come from the catalog, so a new one appears here the moment the
  // merchant creates it, with no document to author.
  const [{ data: indexData }, treeResult] = await Promise.all([
    sanityFetch({ query: queryCollectionsIndexPageData }),
    getCategoryTree(),
  ]);

  // Throwing rather than degrading to an empty list, because this page is
  // prerendered and held for the `revalidate` window above: a transient failure
  // that rendered "no collections" would be baked and served for five minutes,
  // and a shopper cannot tell it apart from a store with no categories.
  // Throwing leaves the last good page in place through a revalidation, and is
  // the verdict the category listing page and `/collections.md` already reached
  // on the same failure.
  if (!treeResult.ok) {
    // `connection()` first, so a build that cannot reach the store leaves this
    // page to render on demand rather than failing the whole build. That is
    // what the category routes already get for free: their
    // `generateStaticParams` degrades to no paths, so nothing prerenders and
    // every category renders on first request. This route has no params to
    // enumerate, so the bail has to be explicit. At request time `connection()`
    // resolves and the throw below is a live 5xx.
    await connection();
    throw new Error(`Category tree read failed: ${treeResult.error}`);
  }

  const baseUrl = getBaseUrl();
  const title = indexData?.title ?? "Collections";
  // Flattened per top-level branch rather than in one pass: only the root level
  // of `categoryTree` selects an image, so mapping the roots directly is what
  // keeps their artwork while still listing every descendant.
  const collections = treeResult.data.flatMap((root) =>
    [root, ...flattenCategoryTree(root.children ?? [])].map(categoryToCardProps)
  );

  return (
    <>
      <BreadcrumbJsonLd
        items={[{ name: "Home", url: baseUrl }, { name: title }]}
      />
      <CollectionJsonLd
        description={indexData?.subtitle ?? null}
        items={collections.map((collection) => ({
          name: collection.title,
          url: `${baseUrl}/collections/${collection.handle}`,
        }))}
        name={title}
        url={`${baseUrl}/collections`}
      />
      <CollectionsContent collections={collections} title={title} />
    </>
  );
}
