import { NextResponse } from "next/server";

import { getProductByPath } from "@/lib/bigcommerce/catalog";

const HANDLE_PATTERN = /^[a-z0-9-]+$/;
const MAX_HANDLES = 50;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const handles = searchParams.get("handles");

  if (!handles) {
    return NextResponse.json({ products: [] });
  }

  const handleList = handles
    .split(",")
    .filter((handle) => handle && HANDLE_PATTERN.test(handle))
    .slice(0, MAX_HANDLES);

  if (handleList.length === 0) {
    return NextResponse.json({ products: [] });
  }

  const results = await Promise.all(
    handleList.map((handle) => getProductByPath([handle]))
  );

  const products = results.flatMap((result) =>
    result.ok && result.data.node ? [result.data.node] : []
  );

  return NextResponse.json({ products });
}
