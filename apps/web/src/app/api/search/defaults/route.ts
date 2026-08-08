import { NextResponse } from "next/server";

import { getCategoryTree } from "@/lib/bigcommerce/catalog";
import { getFeaturedProducts } from "@/lib/bigcommerce/featured";
import { toSearchCategory } from "@/lib/bigcommerce/search";

const COLLECTIONS_LIMIT = 8;

export async function GET() {
  const [treeResult, bestSellers] = await Promise.all([
    getCategoryTree(),
    // No editor picks here: the empty search state wants plain best sellers.
    getFeaturedProducts(),
  ]);

  // Top-level categories only — they are the ones that carry an image.
  const collections = treeResult.ok
    ? treeResult.data.slice(0, COLLECTIONS_LIMIT).map(toSearchCategory)
    : [];

  return NextResponse.json({ collections, bestSellers });
}
