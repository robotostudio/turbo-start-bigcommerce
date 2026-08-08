import type { StorefrontFailureKind } from "@/lib/bigcommerce/client";
import type { CustomerError } from "@/lib/customer/types";

/**
 * BigCommerce auth failures -> the codes the login and registration forms
 * branch on.
 *
 * Deliberately separate from `lib/bigcommerce/classify.ts`. That one maps onto
 * `CartErrorCode` and short-circuits anything whose `path` is not rooted at
 * `cart`, which is every error on this page. The two taxonomies do not
 * overlap, so folding them together would mean one function with two unrelated
 * halves.
 *
 * The two failure styles are not interchangeable either, which is why there
 * are two entry points below: `login` reports a bad password as a GraphQL
 * error with a null `data`, while `registerCustomer` answers 200 with a typed
 * error union inside the payload.
 */

type AuthFailure = {
  kind: StorefrontFailureKind;
  error: string;
  errors?: readonly { message: string; path?: readonly (string | number)[] }[];
};

/**
 * A wrong email and a wrong password are the same answer on purpose.
 * BigCommerce says only `Invalid credentials`, and telling a stranger which
 * half they got right turns the login form into a way to find out whether an
 * address has an account here.
 */
const INVALID_CREDENTIALS = "Your email or password is not correct.";

export function classifyAuthFailure(failure: AuthFailure): CustomerError {
  if (failure.kind === "network") {
    return {
      code: "NETWORK",
      message: "We could not reach the store. Please try again.",
    };
  }

  const message = failure.errors?.[0]?.message ?? failure.error;

  if (/invalid credentials/i.test(message)) {
    return { code: "INVALID_CREDENTIALS", message: INVALID_CREDENTIALS };
  }

  // Anything else is a shape we have not seen. BigCommerce's raw wording here
  // describes its own internals, so it is logged rather than shown.
  return { code: "UNKNOWN", message: "Could not sign you in." };
}

/**
 * `RegisterCustomerError` is a union of four members, and `__typename` is the
 * only machine-readable thing about it — BigCommerce emits no `extensions` and
 * the messages are prose. Matching on the typename rather than the text means
 * a reworded message does not silently become `UNKNOWN`.
 */
export function classifyRegisterErrors(
  errors: readonly { __typename: string; message?: string }[]
): CustomerError {
  const first = errors[0];

  switch (first?.__typename) {
    case "EmailAlreadyInUseError":
      return {
        code: "EMAIL_IN_USE",
        message: "An account with that email already exists.",
      };
    case "AccountCreationDisabledError":
      return {
        code: "REGISTRATION_DISABLED",
        message: "This store is not accepting new accounts right now.",
      };
    case "ValidationError":
      // The only member whose message is both specific and safe to repeat:
      // it names the field the shopper got wrong, e.g. "Invalid email
      // address". Showing it saves them guessing.
      return {
        code: "INVALID_INPUT",
        message: first.message ?? "Please check the details you entered.",
      };
    default:
      return {
        code: "UNKNOWN",
        message: "Could not create your account. Please try again.",
      };
  }
}
