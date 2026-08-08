import { describe, expect, it } from "vitest";

import {
  type BigCommerceGraphQLError,
  classifyStorefrontFailure,
} from "@/lib/bigcommerce/classify";
import type { CartErrorCode } from "@/lib/cart/types";
import cartNotFound from "../__fixtures__/error-cart-not-found.json";
import invalidQuantity from "../__fixtures__/error-invalid-quantity.json";
import loginInvalid from "../__fixtures__/error-login-invalid-credentials.json";
import missingOptions from "../__fixtures__/error-missing-required-options.json";
import productNotFound from "../__fixtures__/error-product-not-found.json";
import queryValidation from "../__fixtures__/error-query-validation.json";

/** Every mutation error captured in ticket 05, read unedited. */
const CASES: {
  fixture: string;
  errors: readonly BigCommerceGraphQLError[];
  code: CartErrorCode;
}[] = [
  {
    fixture: "error-product-not-found",
    errors: productNotFound.response.errors,
    code: "VARIANT_UNAVAILABLE",
  },
  {
    fixture: "error-cart-not-found",
    errors: cartNotFound.response.errors,
    code: "CART_NOT_FOUND",
  },
  {
    fixture: "error-missing-required-options",
    errors: missingOptions.response.errors,
    code: "INVALID_INPUT",
  },
  {
    fixture: "error-invalid-quantity",
    errors: invalidQuantity.response.errors,
    code: "INVALID_INPUT",
  },
  {
    fixture: "error-login-invalid-credentials",
    errors: loginInvalid.response.errors,
    code: "UNKNOWN",
  },
  {
    fixture: "error-query-validation",
    errors: queryValidation.response.errors,
    code: "UNKNOWN",
  },
];

describe("classifyStorefrontFailure", () => {
  it.each(CASES)("maps $fixture to $code", ({ errors, code }) => {
    const result = classifyStorefrontFailure({
      kind: "graphql",
      message: errors.map((e) => e.message).join("; "),
      errors,
    });
    expect(result.code).toBe(code);
    expect(result.message).toBe(errors[0]?.message);
  });

  it("classifies a transport failure as the only retryable code", () => {
    expect(
      classifyStorefrontFailure({ kind: "network", message: "fetch failed" })
    ).toEqual({ code: "NETWORK", message: "fetch failed" });
  });

  it("falls back to the catch-all for an unrecognised cart-path error", () => {
    expect(
      classifyStorefrontFailure({
        kind: "graphql",
        message: "Something else went wrong",
        errors: [{ message: "Something else went wrong", path: ["cart"] }],
      }).code
    ).toBe("STOREFRONT_USER_ERROR");
  });

  it("uses `path` to keep a non-cart refusal out of the shopper-facing codes", () => {
    // `client.ts` surfaces the raw `errors` array now, so the `path` rule can
    // fire: a message that no message-keyed rule recognises is UNKNOWN when it
    // is not rooted at `cart`, and the shopper-facing catch-all when it is.
    const refusal = (path?: readonly (string | number)[]) =>
      classifyStorefrontFailure({
        kind: "graphql",
        message: "Internal server error",
        errors: [{ message: "Internal server error", path }],
      }).code;
    expect(refusal(["login"])).toBe("UNKNOWN");
    expect(refusal(["cart", "createCart"])).toBe("STOREFRONT_USER_ERROR");
  });

  it("does not show an infrastructure message as a backend refusal", () => {
    expect(
      classifyStorefrontFailure({
        kind: "unknown",
        message: "No data returned from Storefront API",
      }).code
    ).toBe("UNKNOWN");
  });
});
