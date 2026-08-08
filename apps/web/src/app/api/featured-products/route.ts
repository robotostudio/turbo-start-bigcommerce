import { NextResponse } from "next/server";

import { getFeaturedProducts } from "@/lib/bigcommerce/featured";

export async function GET() {
  // Best sellers, card-shaped. The one consumer (cart recommendations) takes
  // the default count; a `first` param can return when something needs it.
  const products = await getFeaturedProducts();
  return NextResponse.json({ products });
}
