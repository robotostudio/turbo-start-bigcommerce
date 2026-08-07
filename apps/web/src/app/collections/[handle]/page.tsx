import { client } from "@workspace/sanity/client";
import { sanityFetch } from "@workspace/sanity/live";
import {
  queryCollectionByHandle,
  queryCollectionPaths,
} from "@workspace/sanity/query";
import type { QueryCollectionByHandleResult } from "@workspace/sanity/types";
import { notFound } from "next/navigation";

import { ActiveFilters } from "@/components/collection/active-filters";
import { CollectionModuleRenderer } from "@/components/collection/collection-module";
import { CollectionProducts } from "@/components/collection/collection-products";
import { FilterPanel } from "@/components/collection/filter-panel";
import { parseFilterParams } from "@/components/collection/filter-utils";
import {
  ListingControls,
  ListingControlsProvider,
} from "@/components/collection/listing-controls";
import { parseSortParams } from "@/components/collection/sort-utils";
import { BreadcrumbJsonLd, CollectionJsonLd } from "@/components/json-ld";
import { fetchOrFallback } from "@/lib/build-guard";
import { getSEOMetadata } from "@/lib/seo";
import { storefrontQuery } from "@/lib/shopify/client";
import { COLLECTION_QUERY } from "@/lib/shopify/queries";
import type { CollectionQueryResponse } from "@/lib/shopify/types";
import { getBaseUrl } from "@/utils";

type PageProps = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
};

export async function generateStaticParams() {
  const paths = await fetchOrFallback(
    "Sanity collection paths",
    "collection pages render on demand instead of being prerendered",
    () => client.fetch(queryCollectionPaths),
    []
  );
  return paths
    .filter((handle): handle is string => handle !== null)
    .map((handle) => ({ handle }));
}

export async function generateMetadata({ params }: PageProps) {
  const { handle } = await params;
  const { data: collection } = await sanityFetch({
    query: queryCollectionByHandle,
    params: { handle },
  });

  if (!collection) return {};

  return getSEOMetadata({
    title: collection.seo?.title || collection.title || "",
    description: collection.seo?.description ?? "",
    slug: `/collections/${handle}`,
    contentId: collection._id,
    contentType: collection._type,
  });
}

export default async function CollectionPage({
  params,
  searchParams,
}: PageProps) {
  const { handle } = await params;
  const sp = await searchParams;
  const { sort, reverse } = parseSortParams(sp);

  // Build URLSearchParams that correctly handles multi-value params
  // (Next.js searchParams returns string[] for duplicate keys)
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        urlParams.append(key, v);
      }
    } else {
      urlParams.append(key, value);
    }
  }
  const filters = parseFilterParams(urlParams);

  const [{ data: sanityCollection }, shopifyResult] = await Promise.all([
    sanityFetch({
      query: queryCollectionByHandle,
      params: { handle },
    }),
    storefrontQuery<CollectionQueryResponse>(COLLECTION_QUERY, {
      variables: {
        handle,
        first: 12,
        after: null,
        sortKey: sort,
        reverse,
        filters: filters.length > 0 ? filters : undefined,
      },
    }),
  ]);

  // The Shopify collection is required; the Sanity editorial doc is optional so
  // a Shopify-only collection (e.g. the catch-all "all products") still renders.
  if (!shopifyResult.ok || !shopifyResult.data.collection) {
    notFound();
  }

  const shopifyCollection = shopifyResult.data.collection;
  const products = shopifyCollection.products.edges.map((e) => e.node);
  const availableFilters = shopifyCollection.products.filters ?? [];

  // Build a stable key that includes filters so components re-mount on filter change
  const filterKey = JSON.stringify(filters);

  const baseUrl = getBaseUrl();

  return (
    <div className="site-container py-8">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: baseUrl },
          { name: "Collections", url: `${baseUrl}/collections` },
          { name: shopifyCollection.title },
        ]}
      />
      <CollectionJsonLd
        description={shopifyCollection.description}
        items={products.map((p) => ({
          name: p.title,
          url: `${baseUrl}/products/${p.handle}`,
        }))}
        name={shopifyCollection.title}
        url={`${baseUrl}/collections/${handle}`}
      />
      <ListingControlsProvider>
        <div className="flex items-start justify-between gap-4">
          <h1 className="min-w-0 text-balance font-medium text-2xl tracking-tight md:text-[32px]">
            {shopifyCollection.title}
          </h1>
          <ListingControls currentReverse={reverse} currentSort={sort} />
        </div>

        <div className="mb-8 flex flex-col gap-4">
          <FilterPanel filters={availableFilters} />
          <ActiveFilters />
        </div>

        <CollectionProducts
          handle={handle}
          initialPageInfo={shopifyCollection.products.pageInfo}
          initialProducts={products}
          key={`${sort}-${reverse}-${filterKey}`}
          reverse={reverse}
          sort={sort}
        />
      </ListingControlsProvider>

      {sanityCollection?.modules && sanityCollection.modules.length > 0 && (
        <div className="mt-12">
          {sanityCollection.modules.map(
            (
              module: NonNullable<
                NonNullable<QueryCollectionByHandleResult>["modules"]
              >[number]
            ) => (
              <CollectionModuleRenderer key={module._key} module={module} />
            )
          )}
        </div>
      )}
    </div>
  );
}
