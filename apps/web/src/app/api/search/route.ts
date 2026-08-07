import { NextResponse } from "next/server";

import { storefrontQuery } from "@/lib/shopify/client";
import { PREDICTIVE_SEARCH_QUERY } from "@/lib/shopify/queries";
import { toStorefrontSearchQuery } from "@/lib/shopify/search-query";
import type { PredictiveSearchResponse } from "@/lib/shopify/types";

const LIMIT = 10;

const EMPTY = { products: [], collections: [], related: [] };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  const searchQuery = toStorefrontSearchQuery(query);

  if (!searchQuery) {
    return NextResponse.json(EMPTY);
  }

  const result = await storefrontQuery<PredictiveSearchResponse>(
    PREDICTIVE_SEARCH_QUERY,
    { variables: { query: searchQuery, limit: LIMIT } }
  );

  if (!result.ok) {
    return NextResponse.json(EMPTY);
  }

  const { products, collections, queries } = result.data.predictiveSearch;

  // "Related" should surface catalog names that closely match the query. Prefer
  // real collection + product titles (Shopify's `queries` suggestions are often
  // empty on low-traffic stores), then top up with any query suggestions.
  const normalizedQuery = query.toLowerCase();
  const titleSuggestions = [
    ...collections.map((collection) => collection.title),
    ...products.map((product) => product.title),
  ].filter(
    (title): title is string =>
      Boolean(title) && title.toLowerCase() !== normalizedQuery
  );

  const related = Array.from(
    new Set([...titleSuggestions, ...queries.map((q) => q.text)])
  ).slice(0, 8);

  return NextResponse.json({ products, collections, related });
}
