import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * A failed first cart read used to seed an empty cart, so a shopper with three
 * items in their bag was told the bag was empty — on both surfaces that render
 * a cart, with nothing logged to their screen. `loadFailed` is what separates
 * the two, and both surfaces are asserted because either one still saying
 * "empty" is the whole bug.
 *
 * The empty cases are here for the same reason as everywhere else in this
 * suite: an empty cart is a legitimate state and must keep reading as one.
 */

const cartState = {
  cart: null as unknown,
  confirmedCart: null as unknown,
  isLoading: false,
  isMutating: false,
  isCreatingCart: false,
  hasPendingAdds: false,
  isCartOpen: false,
  cartError: null,
  warnings: [],
  loadFailed: false,
};

vi.mock("@/components/cart/cart-context", () => ({
  useCart: () => ({ ...cartState, settle: vi.fn() }),
  useCartState: () => cartState,
  useCartActions: () => ({ closeCart: vi.fn(), openCart: vi.fn() }),
}));
vi.mock("@/components/cart/cart-recommendations", () => ({
  CartRecommendations: () => null,
}));
vi.mock("@/components/cart/cart-line-item", () => ({
  CartLineItem: () => null,
}));
vi.mock("@/components/cart/cart-summary", () => ({ CartSummary: () => null }));
vi.mock("@/lib/cart/checkout-request", () => ({
  requestCheckoutUrl: vi.fn(),
}));

const { CartEmptyState } = await import("../cart-empty-state");
// The client half, not the route: `app/cart/page.tsx` is now a server
// component whose only job is `generateMetadata`, and importing it pulls in
// server env validation this test has no use for.
const { CartPageContent: CartPage } = await import("../cart-page-content");

describe("cart with a failed first read", () => {
  it("tells a shopper on the cart page that the bag could not be loaded", () => {
    cartState.loadFailed = true;

    const markup = renderToStaticMarkup(createElement(CartPage));

    expect(markup).toContain("couldn&#x27;t load your bag");
    expect(markup).not.toContain("Your cart is empty");
  });

  it("tells them the same thing in the drawer", () => {
    cartState.loadFailed = true;

    const markup = renderToStaticMarkup(createElement(CartEmptyState));

    expect(markup).toContain("couldn&#x27;t load your bag");
    expect(markup).not.toContain("Shop all products");
  });

  it("leaves a genuinely empty cart reading as empty", () => {
    cartState.loadFailed = false;

    expect(renderToStaticMarkup(createElement(CartPage))).toContain(
      "Your cart is empty"
    );
    expect(renderToStaticMarkup(createElement(CartEmptyState))).toContain(
      "Shop all products"
    );
  });
});
