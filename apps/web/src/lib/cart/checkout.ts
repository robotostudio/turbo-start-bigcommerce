import { Logger } from "@workspace/logger";

import { classifyStorefrontFailure } from "@/lib/bigcommerce/classify";
import { storefrontQuery } from "@/lib/bigcommerce/client";
import { graphql } from "@/lib/bigcommerce/graphql";
import { clearCartId, getCartId } from "@/lib/cart/server";
import type { CheckoutRedirect } from "@/lib/cart/types";

const logger = new Logger("Checkout");

/**
 * Only `redirectedCheckoutUrl` is selected. The result also carries
 * `embeddedCheckoutUrl` and `externalCheckoutUrl`, which are for checkout
 * surfaces this starter does not render — asking for them would mint URLs
 * nothing consumes.
 */
const CreateCartRedirectUrlsMutation = graphql(`
  mutation CreateCartRedirectUrls($input: CreateCartRedirectUrlsInput!) {
    cart {
      createCartRedirectUrls(input: $input) {
        redirectUrls {
          redirectedCheckoutUrl
        }
      }
    }
  }
`);

/**
 * Mints a hosted-checkout URL for the current cart.
 *
 * The URL is single-use and BigCommerce's own schema asks for it to be
 * generated within 30s of use, so it is minted on every click and never stored
 * — which is why `Cart` carries no `checkoutUrl` for this to read. Verified
 * against the live store: two mints on the same cart return two different URLs.
 *
 * Returns the URL rather than calling `redirect()`, for two reasons. The caller
 * has to navigate the whole window to leave for BigCommerce's domain anyway,
 * and a failure has to reach the shopper — something that redirects on success
 * and returns nothing on failure is a button that silently does nothing, which
 * is the state this replaces.
 *
 * Deliberately not a server action; see `app/api/checkout/route.ts`.
 */
export async function redirectToCheckout(): Promise<CheckoutRedirect> {
  const cartId = await getCartId();
  if (!cartId) {
    return { ok: false, message: "Your cart is empty." };
  }

  const result = await storefrontQuery(CreateCartRedirectUrlsMutation, {
    variables: { input: { cartEntityId: cartId } },
  });

  if (!result.ok) {
    const classified = classifyStorefrontFailure({
      kind: result.kind,
      message: result.error,
      errors: result.errors,
    });
    // A dead cart id would otherwise fail this way on every future click.
    if (
      classified.code === "CART_NOT_FOUND" ||
      classified.code === "CART_COMPLETED"
    ) {
      await clearCartId();
    }
    logger.error(`redirectToCheckout failed: ${classified.message}`);
    return { ok: false, message: classified.message };
  }

  const url =
    result.data.cart?.createCartRedirectUrls?.redirectUrls
      ?.redirectedCheckoutUrl;

  if (!url) {
    logger.error("redirectToCheckout: BigCommerce returned no checkout URL");
    return { ok: false, message: "Checkout is unavailable. Please try again." };
  }

  return { ok: true, url };
}
