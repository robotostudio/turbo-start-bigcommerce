import { NextResponse } from "next/server";

import { getCategoryTree } from "@/lib/bigcommerce/catalog";
import {
  flattenCategories,
  searchCatalog,
  toSearchCategory,
} from "@/lib/bigcommerce/search";

/**
 * Typeahead is the shared listing read with a small page size — BigCommerce
 * publishes no predictive-search endpoint, and this needs none. The grouping
 * into products, collections and related terms happens below, on the results.
 */
const LIMIT = 10;
const RELATED_LIMIT = 8;

const EMPTY = { products: [], collections: [], related: [] };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json(EMPTY);
  }

  const [searchResult, treeResult] = await Promise.all([
    // Typeahead renders products and related terms only, so it leaves the
    // facet list and the plan flag out of the request it pays for per keystroke.
    searchCatalog({ searchTerm: query, first: LIMIT, facets: false }),
    getCategoryTree(),
  ]);

  if (!searchResult.ok) {
    return NextResponse.json(EMPTY);
  }

  const { products, suggestions } = searchResult.data;

  // BigCommerce's search covers products only; categories are matched by name
  // against the (small, one-request) tree so the Collections tab stays alive.
  const normalizedQuery = query.toLowerCase();
  const collections = treeResult.ok
    ? flattenCategories(treeResult.data)
        .filter((category) =>
          category.name.toLowerCase().includes(normalizedQuery)
        )
        .slice(0, LIMIT)
        .map(toSearchCategory)
    : [];

  // "Related" surfaces catalog names close to the query: real category and
  // product names first, topped up with BigCommerce's own suggestions.
  const titleSuggestions = [
    ...collections.map((collection) => collection.name),
    ...products.map((product) => product.name),
  ].filter((name) => name.toLowerCase() !== normalizedQuery);

  const related = Array.from(
    new Set([...titleSuggestions, ...suggestions])
  ).slice(0, RELATED_LIMIT);

  return NextResponse.json({ products, collections, related });
}
