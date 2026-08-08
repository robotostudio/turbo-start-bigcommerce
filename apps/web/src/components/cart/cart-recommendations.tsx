"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@workspace/ui/components/skeleton";

import { ProductCard } from "@/components/product/product-card";
import type { FeaturedProduct } from "@/lib/bigcommerce/featured";
import { productToCardProps } from "@/lib/bigcommerce/product-card";

async function fetchFeaturedProducts(): Promise<FeaturedProduct[]> {
  const res = await fetch("/api/featured-products");
  if (!res.ok) return [];
  const data: { products: FeaturedProduct[] } = await res.json();
  return data.products;
}

export function CartRecommendations() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["featured-products"],
    queryFn: fetchFeaturedProducts,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="-mr-8 flex gap-4 overflow-hidden">
        {["a", "b"].map((key) => (
          <div className="w-[340px] shrink-0" key={key}>
            <Skeleton className="aspect-56/75 w-full" />
            <Skeleton className="mt-3 h-4 w-3/4" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) return null;

  return (
    <div className="-mr-8 flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {products.map((product) => (
        <div className="w-[340px] shrink-0" key={product.entityId}>
          <ProductCard {...productToCardProps(product)} />
        </div>
      ))}
    </div>
  );
}
