import { sanityFetch } from "@workspace/sanity/live";
import {
  queryAllCollections,
  queryCollectionsIndexPageData,
} from "@workspace/sanity/query";

import { CollectionsContent } from "@/components/collections/collections-content";
import { BreadcrumbJsonLd, CollectionJsonLd } from "@/components/json-ld";
import { getSEOMetadata } from "@/lib/seo";
import { getBaseUrl } from "@/utils";

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
  const [{ data: indexData }, { data: collections }] = await Promise.all([
    sanityFetch({ query: queryCollectionsIndexPageData }),
    sanityFetch({ query: queryAllCollections }),
  ]);

  const baseUrl = getBaseUrl();
  const title = indexData?.title ?? "Collections";
  const allCollections = collections ?? [];

  return (
    <>
      <BreadcrumbJsonLd
        items={[{ name: "Home", url: baseUrl }, { name: title }]}
      />
      <CollectionJsonLd
        description={indexData?.subtitle ?? null}
        items={allCollections.map((c) => ({
          name: c.title ?? "",
          ...(c.slug ? { url: `${baseUrl}/collections/${c.slug}` } : {}),
        }))}
        name={title}
        url={`${baseUrl}/collections`}
      />
      <CollectionsContent collections={allCollections} title={title} />
    </>
  );
}
