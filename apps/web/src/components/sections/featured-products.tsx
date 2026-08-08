"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

import {
  ProductCard,
  type ProductCardProps,
} from "@/components/product/product-card";

type FeaturedProductsProps = {
  heading?: string | null;
  /**
   * The block's picked products, straight off the Sanity document. Empty means
   * "whatever is newest", which is what the resolver falls back to.
   */
  productHandles?: (string | null)[] | null;
  /**
   * Card props resolved server-side in the page: this block renders inside the
   * client PageBuilder and cannot read the catalog itself.
   */
  products: ProductCardProps[];
};

export function FeaturedProducts({
  heading,
  productHandles,
  products,
}: FeaturedProductsProps) {
  const handles = (productHandles ?? []).filter((h): h is string => Boolean(h));

  /**
   * The server props are the first paint; this refetch is what keeps them
   * honest. The home page is statically generated with a 300s revalidate, and
   * ISR hands the stale copy to the first visitor after expiry too — so without
   * this, a product hidden in BigCommerce keeps its card here, linking to a page
   * that has already started 404ing. The category grid never had that problem
   * because it refetches the same way.
   */
  const { data: cards } = useQuery({
    queryKey: ["featured-products-cards", handles.join(",")],
    queryFn: async () => {
      const query = handles.length > 0 ? `?handles=${handles.join(",")}` : "";
      const res = await fetch(`/api/featured-products/cards${query}`);
      if (!res.ok) throw new Error("Failed to load featured products");
      const data: { cards: ProductCardProps[] } = await res.json();
      return data.cards;
    },
    initialData: products,
    // Not `staleTime: 0` by accident — the whole point is to revalidate on
    // mount. On a fresh, non-stale page this costs one request and changes
    // nothing on screen.
  });

  if (cards.length === 0) return null;

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
        {cards.map((product) => (
          <ProductCard key={product.slug} {...product} />
        ))}
      </div>
    </section>
  );
}
