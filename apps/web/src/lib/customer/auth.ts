import "server-only";

import { Logger } from "@workspace/logger";

import { storefrontQuery } from "@/lib/bigcommerce/client";
import { graphql } from "@/lib/bigcommerce/graphql";
import { clearCartId, getCartId, setCartId } from "@/lib/cart/server";
import {
  classifyAuthFailure,
  classifyRegisterErrors,
} from "@/lib/customer/classify";
import {
  clearCustomerToken,
  getCustomerToken,
  setCustomerToken,
} from "@/lib/customer/server";
import type { Customer, CustomerActionResult } from "@/lib/customer/types";

const logger = new Logger("CustomerAuth");

/**
 * `login` scores 9999 against BigCommerce's 10,000 per-request complexity
 * budget on its own — measured, and with selection sets of quite different
 * sizes, so it reads as a flat cost rather than one this query drives. The
 * client logs a warning on every login as a result, which is accurate: there
 * is no headroom here, and anything added to this selection is what tips it
 * over.
 */
const LoginMutation = graphql(`
  mutation Login($email: String!, $password: String!, $cartEntityId: String) {
    login(email: $email, password: $password, guestCartEntityId: $cartEntityId) {
      customer {
        entityId
        firstName
        lastName
        email
      }
      cart {
        entityId
      }
    }
  }
`);

const LogoutMutation = graphql(`
  mutation Logout($cartEntityId: String) {
    logout(cartEntityId: $cartEntityId) {
      result
      cartUnassignResult {
        cart {
          entityId
        }
      }
    }
  }
`);

const RegisterMutation = graphql(`
  mutation Register($input: RegisterCustomerInput!) {
    customer {
      registerCustomer(input: $input) {
        customer {
          entityId
          firstName
          lastName
          email
        }
        errors {
          __typename
          ... on Error {
            message
          }
        }
      }
    }
  }
`);

const CustomerQuery = graphql(`
  query CurrentCustomer {
    customer {
      entityId
      firstName
      lastName
      email
    }
  }
`);

/**
 * The signed-in customer, or null.
 *
 * Asks BigCommerce rather than reading anything out of the cookie, because the
 * cookie holds an opaque token and not a claim — there is nothing in it to
 * trust or to decode. A token that has expired or been revoked answers null
 * here, which is the only way to find out.
 */
export async function getCustomer(): Promise<Customer | null> {
  const customerToken = await getCustomerToken();
  if (!customerToken) return null;

  const result = await storefrontQuery(CustomerQuery, { customerToken });

  if (!result.ok) {
    // `X-Bc-Error-On-Invalid-Customer-Access-Token` turns a dead token into an
    // error instead of a silent anonymous answer, so this is the expected
    // shape once a session ages out rather than an anomaly.
    logger.info("customer lookup failed; treating the session as signed out");
    return null;
  }

  return result.data.customer ?? null;
}

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

/**
 * Signs a customer in and carries their guest cart across.
 *
 * The merge is BigCommerce's, done server-side in this one call:
 * `guestCartEntityId` hands it the basket the shopper built while anonymous.
 * There is no second request and no client involvement, which is the whole
 * reason ROB-2541 put the cart id somewhere the server could reach.
 */
export async function login(input: LoginInput): Promise<CustomerActionResult> {
  const guestCartId = await getCartId();

  const result = await storefrontQuery(LoginMutation, {
    variables: {
      email: input.email,
      password: input.password,
      cartEntityId: guestCartId,
    },
  });

  if (!result.ok) {
    const error = classifyAuthFailure(result);
    logger.error(`login failed: ${error.code}`);
    return { ok: false, error };
  }

  const customer = result.data.login.customer;

  if (!customer) {
    // Belt and braces: BigCommerce reports bad credentials as a GraphQL error,
    // which the branch above catches. A null customer with no error would be
    // a shape we have not seen, and signing nobody in beats signing in a
    // shopper we cannot name.
    logger.error("login returned no customer and no error");
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "Could not sign you in." },
    };
  }

  if (!result.customerToken) {
    // The token arrives as a Set-Cookie, so a login that authenticates but
    // issues nothing leaves us with a customer we cannot make any further
    // request as. Better to fail the sign-in than to hand back a session that
    // is already inert.
    logger.error("login succeeded but issued no customer token");
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "Could not sign you in." },
    };
  }

  await setCustomerToken(result.customerToken);
  await adoptCart(result.data.login.cart?.entityId, guestCartId);

  return { ok: true, customer };
}

/**
 * Creates the account. It does **not** sign anybody in.
 *
 * `registerCustomer` takes no `guestCartEntityId` and `RegisterCustomerResult`
 * carries no access token, so registration can neither authenticate nor merge
 * a cart. The caller has to follow it with `login`, which is where both of
 * those actually happen.
 */
export async function register(
  input: RegisterInput
): Promise<CustomerActionResult> {
  const result = await storefrontQuery(RegisterMutation, {
    variables: { input },
  });

  if (!result.ok) {
    const error = classifyAuthFailure(result);
    logger.error(`register failed: ${error.code}`);
    return { ok: false, error };
  }

  const payload = result.data.customer.registerCustomer;

  // Registration reports its failures inside the payload as a typed union,
  // not as GraphQL errors, so a 200 with no `errors` array is not success.
  if (payload.errors.length > 0) {
    const error = classifyRegisterErrors(payload.errors);
    logger.error(`register rejected: ${error.code}`);
    return { ok: false, error };
  }

  if (!payload.customer) {
    logger.error("register returned no customer and no errors");
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "Could not create your account." },
    };
  }

  return { ok: true, customer: payload.customer };
}

/**
 * Signs the customer out and leaves them holding their basket.
 *
 * Passing `cartEntityId` is what makes that true, and it is not optional in
 * practice. A cart assigned to a customer is invisible to an anonymous read —
 * measured against this store, `site.cart` on an assigned cart answers null
 * without the customer token and answers normally with it. So a logout that
 * does not hand the cart back leaves it alive, owned, and unreachable by the
 * shopper who was just looking at it. Nothing is deleted and the basket is
 * gone anyway, which is the exact failure AC 6 is about.
 */
export async function logout(): Promise<void> {
  const customerToken = await getCustomerToken();
  const cartId = await getCartId();

  // The session goes first and unconditionally. If BigCommerce is unreachable
  // the shopper still expects to be signed out, and a sign-out that fails
  // because a network call failed is worse than an orphaned cart.
  await clearCustomerToken();

  if (!customerToken) return;

  const result = await storefrontQuery(LogoutMutation, {
    variables: { cartEntityId: cartId },
    customerToken,
  });

  if (!result.ok) {
    logger.error(`logout: BigCommerce rejected the unassign: ${result.error}`);
    return;
  }

  const unassigned = result.data.logout.cartUnassignResult.cart?.entityId;

  if (unassigned) {
    // Usually the same id, but it is BigCommerce's answer to "which cart do
    // they keep", so it is taken rather than assumed.
    await setCartId(unassigned);
    return;
  }

  // No cart came back. The id we hold is still assigned to the customer we
  // just signed out of, so it will read as null from here on. Dropping it
  // gives the shopper a fresh cart instead of a permanently empty one.
  if (cartId) await clearCartId();
}

/**
 * Points the cart cookie at whichever cart BigCommerce says the shopper now
 * owns.
 *
 * Two cases, and the second is the one that bites. When a guest cart was sent,
 * the merged cart usually comes back under the same id. When the customer
 * already had a saved cart, or the store has persistent cart switched on,
 * BigCommerce can answer with a different id — and then the cookie still
 * points at the pre-merge cart, which is now assigned to the customer and
 * reads as null. The shopper signs in and watches their basket empty.
 *
 * Measured on this store: persistent cart is off, so login returns the id it
 * was given and returns null when it was given nothing. The write-back is
 * still what makes the other configuration correct, and it costs one
 * comparison.
 */
async function adoptCart(
  loggedInCartId: string | undefined,
  guestCartId: string | null
): Promise<void> {
  if (!loggedInCartId || loggedInCartId === guestCartId) return;
  await setCartId(loggedInCartId);
}
