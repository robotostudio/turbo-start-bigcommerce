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

const CartExistsQuery = graphql(`
  query CartExists($entityId: String!) {
    site {
      cart(entityId: $entityId) {
        entityId
      }
    }
  }
`);

/**
 * Whether BigCommerce has really lost the cart, asked directly.
 *
 * `site.cart` answers null for a cart that does not exist, which is the one
 * unambiguous signal available — the redirect mutation gives none. A request
 * that fails for any other reason is not evidence of anything, so it reads as
 * "still there" and nothing gets thrown away.
 */
async function cartIsGone(cartId: string): Promise<boolean> {
  const result = await storefrontQuery(CartExistsQuery, {
    variables: { entityId: cartId },
  });
  return result.ok && result.data.site.cart === null;
}

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
    // A cart that no longer exists is the common reason, and BigCommerce does
    // not say so: measured against the live store, `createCartRedirectUrls`
    // against a deleted or made-up cart id answers 200 with `redirectUrls:
    // null` and no GraphQL error at all, so the classified CART_NOT_FOUND
    // above never fires for it. The stale id then survives until some later
    // cart read happens to clear it, which is why a checkout straight after
    // the previous one converted the cart fails once and works on the retry.
    //
    // Asking whether the cart is really gone costs a request only on this
    // path, and it has to be asked: clearing on a null URL alone would throw
    // away a live cart whenever BigCommerce answers oddly for any other
    // reason.
    if (await cartIsGone(cartId)) {
      await clearCartId();
      logger.error("redirectToCheckout: cart no longer exists, id cleared");
      return { ok: false, message: "Your cart is empty." };
    }
    logger.error("redirectToCheckout: BigCommerce returned no checkout URL");
    return { ok: false, message: "Checkout is unavailable. Please try again." };
  }

  return { ok: true, url };
}
