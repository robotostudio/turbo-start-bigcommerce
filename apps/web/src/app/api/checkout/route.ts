import { NextResponse } from "next/server";

import { redirectToCheckout } from "@/lib/cart/checkout";

/**
 * Checkout is a route handler and not a server action, deliberately. Do not
 * move it back (ROB-2559).
 *
 * Next dispatches server actions through a single queue, so one action request
 * that never settles blocks every later action from that client — the request
 * behind it is never even issued. Measured against a production build: with one
 * action request hung, clicking Checkout left the button spinning with no error
 * and `redirectToCheckout` never reached `fetch` at all, and a quantity change
 * made at the same time rendered optimistically and never reached the server.
 * That is the reported hang: spinner forever, no toast, nothing in the console,
 * reload to recover.
 *
 * A plain `fetch` to a route handler is not in that queue. Checkout is the one
 * thing that has to work when the client is unhealthy, which is exactly when it
 * could not. This does not fix whatever wedges a request in the first place —
 * that trigger is still unknown — it stops checkout being coupled to it.
 *
 * POST because it mints a single-use URL, which is a write however it reads,
 * and `no-store` because a cached one works on the first click and fails on the
 * second.
 */
export async function POST() {
  const redirect = await redirectToCheckout();

  return NextResponse.json(redirect, {
    status: redirect.ok ? 200 : 400,
    headers: { "Cache-Control": "no-store" },
  });
}
