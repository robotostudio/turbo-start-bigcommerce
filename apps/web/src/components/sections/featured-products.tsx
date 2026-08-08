import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

import {
  ProductCard,
  type ProductCardProps,
} from "@/components/product/product-card";

type FeaturedProductsProps = {
  heading?: string | null;
  /**
   * Card props resolved server-side in the page: this block renders inside the
   * client PageBuilder and cannot read the catalog itself.
   */
  products: ProductCardProps[];
};

export function FeaturedProducts({ heading, products }: FeaturedProductsProps) {
  if (products.length === 0) return null;

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
        {products.map((product) => (
          <ProductCard key={product.slug} {...product} />
        ))}
      </div>
    </section>
  );
}
