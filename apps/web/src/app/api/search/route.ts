import { NextResponse } from "next/server";

import { getCategoryTree } from "@/lib/bigcommerce/catalog";
import { flattenCategories, searchCatalog, toSearchCategory } from "./query";

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
    searchCatalog(query, LIMIT),
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
