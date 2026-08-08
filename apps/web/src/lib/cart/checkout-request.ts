import type { CheckoutRedirect } from "@/lib/cart/types";

/**
 * Asks the server for a fresh checkout URL.
 *
 * A plain `fetch`, not a server action, and that is the whole point: actions
 * share one dispatch queue, so a single wedged action stops checkout ever being
 * sent. See `app/api/checkout/route.ts`.
 *
 * Every failure returns a message rather than throwing, because the caller's
 * only job with a failure is to show it. A button that throws is a button that
 * silently does nothing.
 */
export async function requestCheckoutUrl(): Promise<CheckoutRedirect> {
  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      cache: "no-store",
    });
    return (await response.json()) as CheckoutRedirect;
  } catch {
    return {
      ok: false,
      message: "Checkout is unavailable. Please try again.",
    };
  }
}
