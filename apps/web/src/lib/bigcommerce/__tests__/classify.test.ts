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
    ).toBe("SHOPIFY_USER_ERROR");
  });

  it("still classifies cart faults when only the joined message survives", () => {
    // `client.ts` folds `errors[]` into one string and drops `path`, so this is
    // what the classifier sees until that changes. The message-keyed rules
    // still fire; only the `path`-keyed one is lost.
    const joined = (fixture: string) =>
      classifyStorefrontFailure({
        kind: "graphql",
        message:
          CASES.find((c) => c.fixture === fixture)?.errors[0]?.message ?? "",
      }).code;
    expect(joined("error-cart-not-found")).toBe("CART_NOT_FOUND");
    expect(joined("error-invalid-quantity")).toBe("INVALID_INPUT");
    expect(joined("error-product-not-found")).toBe("VARIANT_UNAVAILABLE");
    expect(joined("error-login-invalid-credentials")).toBe("UNKNOWN");
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
