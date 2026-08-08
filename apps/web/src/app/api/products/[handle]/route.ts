import { NextResponse } from "next/server";

import { getProductByPath } from "@/lib/bigcommerce/catalog";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  if (!handle) {
    return NextResponse.json({ product: null }, { status: 400 });
  }

  const result = await getProductByPath([handle]);

  if (!result.ok) {
    return NextResponse.json({ product: null }, { status: 502 });
  }

  return NextResponse.json({ product: result.data.node });
}
