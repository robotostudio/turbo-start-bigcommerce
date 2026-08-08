import { NextResponse } from "next/server";

import { searchCatalog } from "../query";

const LIMIT = 24;

const EMPTY = { products: [], totalCount: 0 };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json(EMPTY);
  }

  const result = await searchCatalog(query, LIMIT);

  if (!result.ok) {
    return NextResponse.json(EMPTY, { status: 500 });
  }

  return NextResponse.json({
    products: result.data.products,
    totalCount: result.data.totalCount,
  });
}
