import { sanityFetch } from "@workspace/sanity/live";
import { queryCollectionsIndexPageData } from "@workspace/sanity/query";

import { CollectionsContent } from "@/components/collections/collections-content";
import { BreadcrumbJsonLd, CollectionJsonLd } from "@/components/json-ld";
import {
  flattenCategoryTree,
  getCategoryTree,
} from "@/lib/bigcommerce/catalog";
import { categoryToCardProps } from "@/lib/collection-card";
import { getSEOMetadata } from "@/lib/seo";
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

  return getSEOMetadata({
    title: data?.seoTitle ?? data?.title ?? "Collections",
    description:
      data?.seoDescription ?? data?.subtitle ?? "Browse all collections",
    slug: "/collections",
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

  const baseUrl = getBaseUrl();
  const title = indexData?.title ?? "Collections";
  // Flattened per top-level branch rather than in one pass: only the root level
  // of `categoryTree` selects an image, so mapping the roots directly is what
  // keeps their artwork while still listing every descendant.
  const collections = (treeResult.ok ? treeResult.data : []).flatMap((root) =>
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
