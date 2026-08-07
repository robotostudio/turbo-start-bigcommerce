import { NextResponse } from "next/server";

import { storefrontQuery } from "@/lib/shopify/client";
import {
  ALL_COLLECTIONS_QUERY,
  BEST_SELLING_PRODUCTS_QUERY,
} from "@/lib/shopify/queries";
import type {
  AllCollectionsResponse,
  BestSellingProductsResponse,
} from "@/lib/shopify/types";

const COLLECTIONS_LIMIT = 8;
const BEST_SELLERS_LIMIT = 4;

export async function GET() {
  const [collectionsResult, bestSellersResult] = await Promise.all([
    storefrontQuery<AllCollectionsResponse>(ALL_COLLECTIONS_QUERY, {
      variables: { first: COLLECTIONS_LIMIT },
    }),
    storefrontQuery<BestSellingProductsResponse>(BEST_SELLING_PRODUCTS_QUERY, {
      variables: { first: BEST_SELLERS_LIMIT },
    }),
  ]);

  const collections = collectionsResult.ok
    ? collectionsResult.data.collections.edges.map((edge) => edge.node)
    : [];
  const bestSellers = bestSellersResult.ok
    ? bestSellersResult.data.products.edges.map((edge) => edge.node)
    : [];

  return NextResponse.json({ collections, bestSellers });
}
