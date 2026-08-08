import { type NextRequest, NextResponse } from "next/server";

import {
  parseFilterParams,
  toSearchFilters,
} from "@/components/collection/filter-utils";
import { toListingSort } from "@/components/collection/sort-utils";
import { SEARCH_PAGE_LIMIT, searchCatalog } from "@/lib/bigcommerce/search";

const DEFAULT_FIRST = 12;

/**
 * The handle stays in the path so a request is self-describing in a log or a
 * cache key, but the read is by entity id, which the page resolved once and
 * forwards. Resolving the path again per "Load more" would spend a whole round
 * trip learning something the caller already knows — and it is what used to
 * break paging on nested categories, whose real path has more segments than
 * this single-segment route could carry.
 *
 * A hand-edited id returns that category's products, which is what navigating
 * to that category does anyway. Anything that is not a positive integer is
 * rejected rather than sent — including an absent param, which `Number` turns
 * into a perfectly valid-looking 0 that BigCommerce answers with an empty list
 * and no error.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const raw = sp.get("categoryEntityId");
  const categoryEntityId = Number(raw);
  if (!(raw && Number.isInteger(categoryEntityId) && categoryEntityId > 0)) {
    return NextResponse.json(
      { error: "Missing or invalid categoryEntityId" },
      { status: 400 }
    );
  }

  const after = sp.get("after");
  const firstParam = Number(sp.get("first") ?? DEFAULT_FIRST);
  const first =
    Number.isFinite(firstParam) && firstParam > 0
      ? Math.min(firstParam, SEARCH_PAGE_LIMIT)
      : DEFAULT_FIRST;

  // `sort` carries a `SearchProductsSortInput` member; anything else — including
  // no param at all — leaves the argument off, which is the category's own
  // order and the one the page renders server-side.
  const result = await searchCatalog({
    categoryEntityId,
    first,
    after,
    sort: toListingSort(sp.get("sort")),
    filters: toSearchFilters(parseFilterParams(sp)),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    products: result.data.products,
    pageInfo: result.data.pageInfo,
    facets: result.data.facets,
    filteringEnabled: result.data.filteringEnabled,
  });
}
