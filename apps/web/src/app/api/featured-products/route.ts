import { NextResponse } from "next/server";

import { storefrontQuery } from "@/lib/shopify/client";
import { FEATURED_PRODUCTS_QUERY } from "@/lib/shopify/queries";
import type { FeaturedProductsResponse } from "@/lib/shopify/types";

const DEFAULT_FIRST = 8;
const MAX_FIRST = 20;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const firstParam = Number.parseInt(searchParams.get("first") ?? "", 10);
  const first =
    Number.isFinite(firstParam) && firstParam > 0
      ? Math.min(firstParam, MAX_FIRST)
      : DEFAULT_FIRST;

  const result = await storefrontQuery<FeaturedProductsResponse>(
    FEATURED_PRODUCTS_QUERY,
    { variables: { first } }
  );

  if (!result.ok) {
    return NextResponse.json({ products: [] });
  }

  const products = result.data.products.edges.map((edge) => edge.node);
  return NextResponse.json({ products });
}
