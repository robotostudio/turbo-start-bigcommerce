import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

import { storefrontQuery } from "@/lib/shopify/client";
import { collectionProductToCardProps } from "@/lib/shopify/product-card";
import { RELATED_PRODUCTS_QUERY } from "@/lib/shopify/queries";
import type { CardSourceProduct } from "@/lib/shopify/types";
import { ProductCard } from "./product-card";

type RelatedProductsResponse = {
  productRecommendations: CardSourceProduct[];
};

type RelatedProductsProps = {
  productId: string;
};

export async function RelatedProducts({ productId }: RelatedProductsProps) {
  const result = await storefrontQuery<RelatedProductsResponse>(
    RELATED_PRODUCTS_QUERY,
    { variables: { productId } }
  );

  if (!result.ok) return null;

  const products = result.data.productRecommendations.slice(0, 4);

  if (products.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="font-medium text-2xl tracking-tight md:text-3xl">
          Related Products
        </h2>
        <Button
          asChild
          className="shrink-0 font-normal tracking-[0.24px]"
          size="sm"
        >
          <Link href="/collections">Shop All</Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-x-1 gap-y-6 md:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            {...collectionProductToCardProps(product)}
          />
        ))}
      </div>
    </section>
  );
}
