import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

import {
  type CatalogProduct,
  type CatalogProductCard,
  getCategoryByPath,
  nodes,
  toSegments,
} from "@/lib/bigcommerce/catalog";
import { productToCardProps } from "@/lib/bigcommerce/product-card";
import { ProductCard } from "./product-card";

const RELATED_COUNT = 4;

/** Siblings of `product` in `path`, minus the product itself. */
async function siblings(
  path: string,
  entityId: number
): Promise<CatalogProductCard[]> {
  const result = await getCategoryByPath(toSegments(path), {
    first: RELATED_COUNT + 1,
  });
  if (!(result.ok && result.data.node)) return [];
  return nodes(result.data.node.products).filter(
    (sibling) => sibling.entityId !== entityId
  );
}

/**
 * Products from the same category.
 *
 * BigCommerce has a first-class `relatedProducts` field, but the catalog
 * module's PDP query doesn't select it, so this reads the categories the
 * product already came back with. They arrive broadest-first, so the last is
 * the tightest fit and the first is the catch-all — start with the tight one
 * and top up from the catch-all, because a category holding two products would
 * otherwise leave a rail of one.
 *
 * ponytail: up to two requests, and a rail that is "same category" rather than
 * genuine recommendations — BigCommerce's `relatedProducts` is the real answer
 * and costs nothing extra once the PDP query selects it.
 */
export async function RelatedProducts({
  product,
}: {
  product: CatalogProduct;
}) {
  const categories = nodes(product.categories);
  const sources = [categories.at(-1), categories[0]].filter(
    (category) => category !== undefined
  );

  const picked = new Map<number, CatalogProductCard>();
  for (const source of sources) {
    if (picked.size >= RELATED_COUNT) break;
    for (const sibling of await siblings(source.path, product.entityId)) {
      if (picked.size >= RELATED_COUNT) break;
      picked.set(sibling.entityId, sibling);
    }
  }

  const products = [...picked.values()];
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
        {products.map((related) => (
          <ProductCard
            key={related.entityId}
            {...productToCardProps(related)}
            productId={String(related.entityId)}
          />
        ))}
      </div>
    </section>
  );
}
