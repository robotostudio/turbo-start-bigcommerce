import { type NextRequest, NextResponse } from "next/server";

import { toCategorySort } from "@/components/collection/sort-utils";
import { getCategoryByPath, nodes } from "@/lib/bigcommerce/catalog";

const DEFAULT_FIRST = 12;
/** `Category.products(first:)` refuses anything larger. */
const MAX_FIRST = 50;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const sp = request.nextUrl.searchParams;

  const after = sp.get("after");
  const firstParam = Number(sp.get("first") ?? DEFAULT_FIRST);
  const first =
    Number.isFinite(firstParam) && firstParam > 0
      ? Math.min(firstParam, MAX_FIRST)
      : DEFAULT_FIRST;

  // `sort` carries a `CategoryProductSort` member; anything else — including no
  // param at all — sorts nothing, which is the category's own order and the one
  // the page renders server-side.
  //
  // Facets stay out of it: product filtering is plan-gated on this store and
  // comes back as an empty connection with no error, so there is nothing to
  // narrow by. `Category.products` has no filter argument either.
  const result = await getCategoryByPath([handle], {
    first,
    after,
    sortBy: toCategorySort(sp.get("sort")),
  });

  if (!result.ok || !result.data.node) {
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }

  const { products } = result.data.node;

  return NextResponse.json({
    products: nodes(products),
    pageInfo: products.pageInfo,
  });
}
