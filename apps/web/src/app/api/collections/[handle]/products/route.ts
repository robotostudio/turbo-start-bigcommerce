import { type NextRequest, NextResponse } from "next/server";

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

  // `sort`, `reverse` and `filter.*` params are accepted but ignored for now:
  // the category read has no filter arguments, and faceting is plan-gated on
  // this store. ROB-2546 rebuilds both on `site.search.searchProducts`.
  const result = await getCategoryByPath([handle], { first, after });

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
