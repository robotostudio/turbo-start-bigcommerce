"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import Link from "next/link";

import type { FeaturedProductsSeed } from "@/components/pagebuilder-data";
import {
  ProductCard,
  type ProductCardProps,
} from "@/components/product/product-card";

/**
 * Mirrors FEATURED_FALLBACK_COUNT at featured-cards.ts:10 — that constant sits
 * behind `import "server-only"`, so a client component cannot import it.
 */
const FALLBACK_SKELETON_COUNT = 4;

type FeaturedProductsProps = {
  heading?: string | null;
  /**
   * The block's picked products, straight off the Sanity document. Empty means
   * "whatever is newest", which is what the resolver falls back to.
   */
  productHandles?: (string | null)[] | null;
  /**
   * Cards the server already resolved for this block, so the products are in
   * the HTML rather than behind a fetch the browser has to run. Absent when
   * that read failed, which puts the block back on the client-fetch path.
   */
  seed?: FeaturedProductsSeed;
};

/**
 * One card's worth of skeleton, shaped like what ProductCard actually renders:
 * the aspect-56/75 image, then the vendor eyebrow (text-xs, 18px), title
 * (leading-tight, 20px), subtitle (text-base, 24px), rating row (18px) and
 * price (text-base, 24px). Row heights are pinned so the section keeps its
 * height when the cards land and nothing below it jumps.
 */
function CardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-56/75 w-full" />
      <div className="mt-2 flex flex-col gap-2 px-1">
        <div className="flex flex-col gap-0.5">
          <Skeleton className="h-[18px] w-16" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-[18px] w-12" />
        </div>
        <Skeleton className="h-6 w-1/4" />
      </div>
    </div>
  );
}

export function FeaturedProducts({
  heading,
  productHandles,
  seed,
}: FeaturedProductsProps) {
  const handles = (productHandles ?? []).filter((h): h is string => Boolean(h));
  const handleKey = handles.join(",");

  const { data: cards, isPending } = useQuery({
    queryKey: ["featured-products-cards", handleKey],
    queryFn: async () => {
      const query = handles.length > 0 ? `?handles=${handles.join(",")}` : "";
      const res = await fetch(`/api/featured-products/cards${query}`);
      if (!res.ok) throw new Error("Failed to load featured products");
      const data: { cards: ProductCardProps[] } = await res.json();
      return data.cards;
    },
    // Only seed the key the server actually answered. The seed is built from
    // the same filtered-then-joined handles, so an inequality here means the
    // props moved on and those cards describe some other set of products —
    // attached anyway they would paint the wrong grid until the refetch lands,
    // the trap collection-products.tsx documents at its own initialData.
    // staleTime stays at the default so React Query still revalidates on mount.
    initialData:
      seed !== undefined && seed.queryKey === handleKey
        ? seed.cards
        : undefined,
  });

  // Gated on isPending, not cards.length: a block whose handles all fail must
  // render nothing, not a skeleton that never resolves (the ROB-2561 scenario).
  // A seed keeps that distinction rather than blurring it — initialData settles
  // the query, so an empty seed is "resolved to nothing" and falls through to
  // null here, while an absent seed leaves isPending true and the skeletons are
  // still an honest description of a fetch that is genuinely in flight.
  if (!isPending && !cards?.length) return null;

  const skeletonCount =
    handles.length > 0 ? handles.length : FALLBACK_SKELETON_COUNT;

  return (
    <section className="site-container py-12 md:py-20">
      <div className="mb-8 flex items-end justify-between">
        <h2 className="font-medium text-3xl tracking-tight md:text-4xl">
          {heading || "Featured Products"}
        </h2>
        <Button asChild size="sm" variant="default">
          <Link href="/collections/all-products">Shop All</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1 md:grid-cols-4">
        {isPending
          ? Array.from({ length: skeletonCount }, (_, index) => (
              <CardSkeleton key={index.toString()} />
            ))
          : (cards ?? []).map((product) => (
              <ProductCard key={product.slug} {...product} />
            ))}
      </div>
    </section>
  );
}
