import "server-only";

import { env } from "@workspace/env/server";
import { cookies } from "next/headers";

/**
 * Where the signed-in customer lives, as three functions with no BigCommerce
 * and no React in them.
 *
 * Deliberately the same shape as `lib/cart/server.ts`: get, set, clear, and
 * nothing else. Everything that needs the customer goes through here, so the
 * storage swaps in one file. That matters while the framework question on
 * ROB-2545 is open — an Auth.js session and this cookie both satisfy this
 * interface, and no caller can tell them apart.
 */

const CUSTOMER_COOKIE = "bigcommerce-customer-token";

export async function getCustomerToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CUSTOMER_COOKIE)?.value ?? null;
}

/**
 * Stored with no `maxAge`, so it is a session cookie and closing the browser
 * signs the shopper out. That is the deliberate half of the decision: it is
 * the privacy-preserving default, and it is what BigCommerce's own storefront
 * settles on — Catalyst carries a `patchSessionTokenCookies()` helper whose
 * whole job is stripping the `Expires` that Auth.js adds, to keep this cookie
 * classifiable as strictly necessary.
 *
 * The cart cookie next door is persistent for 30 days on purpose, and the
 * asymmetry is the point: losing a session means signing in again, losing a
 * cart means losing the basket. Note also that BigCommerce's own token expires
 * seven days out regardless, so a longer cookie would only promise a session
 * the API has already stopped honouring.
 */
export async function setCustomerToken(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // The cart cookie next door omits this; a bearer credential should not.
    secure: env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearCustomerToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_COOKIE);
}
