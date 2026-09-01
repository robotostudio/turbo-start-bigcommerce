"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import {
  CollectionCard,
  type CollectionCardProps,
} from "@/components/collection/collection-card";
import {
  CollectionsSortSelector,
  type SortOption,
  sortCollections,
} from "@/components/collections/collections-sort";

type CollectionsContentProps = {
  title: string;
  collections: CollectionCardProps[];
};

function CollectionsGridInner({
  collections,
}: {
  collections: CollectionCardProps[];
}) {
  const searchParams = useSearchParams();
  const sort = (searchParams.get("sort") as SortOption) || "a-z";
  return <Grid collections={sortCollections(collections, sort)} />;
}

function Grid({ collections }: { collections: CollectionCardProps[] }) {
  if (collections.length === 0) {
    return <p className="text-muted-foreground">No collections found.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-x-1 gap-y-10 md:grid-cols-3">
      {collections.map((collection) => (
        <CollectionCard key={collection.handle} {...collection} />
      ))}
    </div>
  );
}

/**
 * A `useSearchParams` consumer suspends during prerender, so anything inside
 * the boundary is missing from the static HTML — with the whole page in there,
 * `/collections` shipped no `<main>` and no `<h1>` at all. Only the sorted grid
 * needs the query string, and its fallback is the A-Z order the server already
 * computed, which is what `?sort` defaults to.
 */
export function CollectionsContent({
  title,
  collections,
}: CollectionsContentProps) {
  return (
    <main className="site-container py-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-medium text-2xl tracking-tight md:text-[32px]">
          {title}
        </h1>
        <Suspense>
          <CollectionsSortSelector />
        </Suspense>
      </div>
      <Suspense
        fallback={<Grid collections={sortCollections(collections, "a-z")} />}
      >
        <CollectionsGridInner collections={collections} />
      </Suspense>
    </main>
  );
}
