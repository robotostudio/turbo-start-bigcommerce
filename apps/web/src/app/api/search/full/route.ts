import { type NextRequest, NextResponse } from "next/server";

import {
  parseFilterParams,
  toSearchFilters,
} from "@/components/collection/filter-utils";
import { searchCatalog } from "../query";

const LIMIT = 24;

/**
 * No query means no result set, so there is nothing to derive facets from —
 * `searchProducts` needs a search to filter. `facets: []` with
 * `filteringEnabled: false` puts the panel in its "unavailable" state, which is
 * the same thing it shows before a shopper has typed anything.
 */
const EMPTY = {
  products: [],
  totalCount: 0,
  facets: [],
  filteringEnabled: false,
};

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const query = sp.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json(EMPTY);
  }

  // `URLSearchParams` already satisfies the reader the codec takes, so the
  // `filter.*` params the client forwarded need no adapting. Anything the codec
  // does not recognise, or cannot parse, is dropped here rather than sent on.
  const selection = toSearchFilters(parseFilterParams(sp));

  const result = await searchCatalog(query, LIMIT, selection);

  if (!result.ok) {
    return NextResponse.json(EMPTY, { status: 500 });
  }

  return NextResponse.json({
    products: result.data.products,
    totalCount: result.data.totalCount,
    facets: result.data.facets,
    filteringEnabled: result.data.filteringEnabled,
  });
}
