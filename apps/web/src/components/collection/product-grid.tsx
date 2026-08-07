import { cn } from "@workspace/ui/lib/utils";

import { ProductCard } from "@/components/product/product-card";
import { collectionProductToCardProps } from "@/lib/shopify/product-card";
import type { ShopifyCollectionProduct } from "@/lib/shopify/types";

type ProductGridProps = {
  products: ShopifyCollectionProduct[];
  /** "comfortable" = 4-col (default), "dense" = 6-col on large screens. */
  density?: "comfortable" | "dense";
};

export function ProductGrid({
  products,
  density = "comfortable",
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        No products found.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-x-1 gap-y-4 lg:gap-y-6",
        density === "dense"
          ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
          : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      )}
    >
      {products.map((product) => (
        <ProductCard
          key={product.id}
          {...collectionProductToCardProps(product)}
        />
      ))}
    </div>
  );
}
