import { NextResponse } from "next/server";

import { storefrontQuery } from "@/lib/shopify/client";
import { PRODUCT_BY_HANDLE_QUERY } from "@/lib/shopify/queries";
import type { ProductByHandleResponse } from "@/lib/shopify/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  if (!handle) {
    return NextResponse.json({ product: null }, { status: 400 });
  }

  const result = await storefrontQuery<ProductByHandleResponse>(
    PRODUCT_BY_HANDLE_QUERY,
    { variables: { handle } }
  );

  if (!result.ok) {
    return NextResponse.json({ product: null }, { status: 502 });
  }

  return NextResponse.json({ product: result.data.product });
}
