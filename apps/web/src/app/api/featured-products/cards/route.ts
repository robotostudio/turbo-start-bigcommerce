import { type NextRequest, NextResponse } from "next/server";

import { featuredCards } from "@/components/product/featured-cards";

/**
 * Live cards for one Featured Products block.
 *
 * Separate from `/api/featured-products`, which serves best-sellers to the cart
 * recommendations and returns raw products for the client to map. This one
 * returns the same resolved `ProductCardProps` the home page renders server-side,
 * so the block can replace its prerendered cards without the shape changing
 * under it.
 *
 * The home page is statically generated with a 300s revalidate, and ISR serves
 * the stale copy while it regenerates — so a product hidden in BigCommerce kept
 * its card, linking to a page that had already started 404ing. The category grid
 * never had that problem because it refetches on mount; this gives the block the
 * same treatment.
 */
export async function GET(request: NextRequest) {
  const handles = (request.nextUrl.searchParams.get("handles") ?? "")
    .split(",")
    .map((handle) => handle.trim())
    .filter(Boolean);

  return NextResponse.json({ cards: await featuredCards(handles) });
}
