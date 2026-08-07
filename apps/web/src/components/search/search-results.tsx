"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";

import { CollectionCard } from "@/components/collection/collection-card";
import { shopifyCollectionToCardProps } from "@/lib/collection-card";
import type {
  ShopifyCollectionLite,
  ShopifyCollectionProduct,
} from "@/lib/shopify/types";
import { SearchProductGrid } from "./search-product-grid";

type Tab = "products" | "collections";

type SearchResultsProps = {
  related: string[];
  products: ShopifyCollectionProduct[];
  collections: ShopifyCollectionLite[];
  isSearching: boolean;
  onSelectTerm: (term: string) => void;
  /** Forwarded to `next/link`: replace the current history entry, don't push. */
  replace?: boolean;
};

function CollectionsGrid({
  collections,
  isLoading,
  replace,
}: {
  collections: ShopifyCollectionLite[];
  isLoading: boolean;
  replace?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-x-1 gap-y-8 md:grid-cols-3">
        {["a", "b", "c"].map((key) => (
          <div className="flex flex-col gap-2" key={key}>
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (collections.length === 0) {
    return <p className="py-8 text-muted-foreground">No collections found.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-x-1 gap-y-8 md:grid-cols-3">
      {collections.map((collection) => (
        <CollectionCard
          key={collection.id}
          {...shopifyCollectionToCardProps(collection)}
          replace={replace}
        />
      ))}
    </div>
  );
}

export function SearchResults({
  related,
  products,
  collections,
  isSearching,
  onSelectTerm,
  replace,
}: SearchResultsProps) {
  const [tab, setTab] = useState<Tab>("products");

  const tabClass = (active: boolean) =>
    cn(
      "pb-2 font-medium text-xl tracking-[0.24px] transition-colors",
      active
        ? "border-foreground border-b-2 text-foreground"
        : "text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="flex flex-col gap-6 site-container py-8">
      {related.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-medium text-foreground text-xl tracking-[0.24px]">
            Related
          </h2>
          <div className="flex flex-wrap gap-2">
            {related.map((term) => (
              <button
                className="bg-zinc-200 px-1 text-base text-zinc-900 tracking-[0.24px] transition-colors hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                key={term}
                onClick={() => onSelectTerm(term)}
                type="button"
              >
                {term}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center border-b">
        <div className="flex gap-6">
          <button
            className={tabClass(tab === "products")}
            onClick={() => setTab("products")}
            type="button"
          >
            Products [{products.length}]
          </button>
          <button
            className={tabClass(tab === "collections")}
            onClick={() => setTab("collections")}
            type="button"
          >
            Collections [{collections.length}]
          </button>
        </div>
      </div>

      {tab === "products" ? (
        <SearchProductGrid
          isLoading={isSearching}
          products={products}
          replace={replace}
        />
      ) : (
        <CollectionsGrid
          collections={collections}
          isLoading={isSearching}
          replace={replace}
        />
      )}
    </div>
  );
}
