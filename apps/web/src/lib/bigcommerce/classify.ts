import type {
  StorefrontFailureKind,
  StorefrontGraphQLError,
} from "@/lib/bigcommerce/client";
import type { CartErrorCode } from "@/lib/cart/types";

/**
 * BigCommerce mutation errors -> the internal `CartErrorCode` the cart
 * controller already branches on. The output enum is unchanged; only the input
 * taxonomy is BigCommerce's.
 *
 * BigCommerce has no `userErrors` field, so this is one entry point rather
 * than separate transport and user-error classifiers. It also emits no
 * `extensions` on any error, so there is nothing machine-readable to switch
 * on — the signals are the message prefix and `path`.
 */

export type BigCommerceGraphQLError = StorefrontGraphQLError;

export type StorefrontFailure = {
  kind: StorefrontFailureKind;
  /** Transport-level message, and the fallback when `errors` is unavailable. */
  message: string;
  errors?: readonly BigCommerceGraphQLError[];
};

/**
 * Message prefixes, in precedence order. `Not Found: ` covers both a missing
 * cart and a missing product, so the rest of the message is what separates
 * them. `quantity: 0` reports as a missing field rather than an invalid value.
 *
 * No rule maps to `CART_COMPLETED`: a converted cart 404s like any other
 * missing cart, and the controller handles both codes identically.
 */
const RULES: readonly { match: RegExp; code: CartErrorCode }[] = [
  { match: /^Not Found: Cart\b/i, code: "CART_NOT_FOUND" },
  {
    match: /^Not Found: Provided (?:product|variant) ID\b/i,
    code: "VARIANT_UNAVAILABLE",
  },
  { match: /^Missing required fields\.: /, code: "INVALID_INPUT" },
  { match: /\bvariant ID is required\b/i, code: "INVALID_INPUT" },
];

export function classifyStorefrontFailure(failure: StorefrontFailure): {
  code: CartErrorCode;
  message: string;
} {
  if (failure.kind === "network") {
    return { code: "NETWORK", message: failure.message };
  }

  const first = failure.errors?.[0];
  const message = first?.message ?? failure.message;

  // Anything not rooted at `cart` never was a cart failure: `login` nulls the
  // whole `data` object, and a query validation error is a 400 carrying
  // `locations` but no `path` at all.
  if (first && first.path?.[0] !== "cart") {
    return { code: "UNKNOWN", message };
  }

  const rule = RULES.find((candidate) => candidate.match.test(message));
  if (rule) return { code: rule.code, message };
  // `STOREFRONT_USER_ERROR` is the controller's catch-all for "the backend
  // said no" and gets shown to the shopper verbatim, so it is only right when
  // there is a real GraphQL error to show. With no `errors` array the message
  // is an infrastructure string from `client.ts`, which is `UNKNOWN`.
  return { code: first ? "STOREFRONT_USER_ERROR" : "UNKNOWN", message };
}
