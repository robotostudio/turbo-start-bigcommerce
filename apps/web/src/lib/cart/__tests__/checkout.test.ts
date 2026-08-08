import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted, so all four run before the module is evaluated. It is server-only
// and reaches `next/headers` through `lib/cart/server`; none of that is what
// these assertions are about.
vi.mock("server-only", () => ({}));
vi.mock("@workspace/env/server", () => ({
  env: {
    BIGCOMMERCE_STORE_HASH: "testhash",
    BIGCOMMERCE_CHANNEL_ID: "1",
    BIGCOMMERCE_STOREFRONT_TOKEN: "test-token",
    BIGCOMMERCE_API_URL: undefined,
  },
}));

const cartId = vi.fn<() => Promise<string | null>>();
const clearCartId = vi.fn();
vi.mock("@/lib/cart/server", () => ({
  getCartId: () => cartId(),
  setCartId: vi.fn(),
  clearCartId: () => clearCartId(),
}));

// Checkout carries the signed-in customer now: an assigned cart mints no
// redirect URL without it, and reads back as null.
const customerToken = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/customer/server", () => ({
  getCustomerToken: () => customerToken(),
}));

const storefrontQuery = vi.fn();
vi.mock("@/lib/bigcommerce/client", () => ({
  storefrontQuery: (...args: unknown[]) => storefrontQuery(...args),
}));

const { redirectToCheckout } = await import("@/lib/cart/checkout");

/** The mutation's shape, with the URL the fake BigCommerce hands back. */
const minted = (url: string) => ({
  ok: true as const,
  data: {
    cart: {
      createCartRedirectUrls: { redirectUrls: { redirectedCheckoutUrl: url } },
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  cartId.mockResolvedValue("cart-1");
  customerToken.mockResolvedValue(null);
});

describe("redirectToCheckout", () => {
  it("mints a fresh URL on every call rather than reusing one", async () => {
    // BigCommerce's URL is single-use, so a cached one works on the first click
    // and fails on the second — the path a real shopper takes when they go back
    // and check out again. Two calls have to produce two URLs.
    storefrontQuery
      .mockResolvedValueOnce(minted("https://store.example/cart.php?t=first"))
      .mockResolvedValueOnce(minted("https://store.example/cart.php?t=second"));

    const one = await redirectToCheckout();
    const two = await redirectToCheckout();

    expect(one).toEqual({
      ok: true,
      url: "https://store.example/cart.php?t=first",
    });
    expect(two).toEqual({
      ok: true,
      url: "https://store.example/cart.php?t=second",
    });
    expect(one).not.toEqual(two);
    expect(storefrontQuery).toHaveBeenCalledTimes(2);
  });

  it("sends the current cart id, so the URL is for the cart being viewed", async () => {
    cartId.mockResolvedValue("cart-42");
    storefrontQuery.mockResolvedValue(minted("https://store.example/cart.php"));

    await redirectToCheckout();

    expect(storefrontQuery).toHaveBeenCalledWith(expect.anything(), {
      variables: { input: { cartEntityId: "cart-42" } },
      customerToken: null,
    });
  });

  it("reports an empty cart without calling BigCommerce", async () => {
    cartId.mockResolvedValue(null);

    expect(await redirectToCheckout()).toEqual({
      ok: false,
      message: "Your cart is empty.",
    });
    expect(storefrontQuery).not.toHaveBeenCalled();
  });

  it("returns a message when BigCommerce answers without a URL", async () => {
    // The failure this replaces was silent. Every path has to give the caller
    // something to show, or the button is a no-op again.
    storefrontQuery
      .mockResolvedValueOnce({
        ok: true,
        data: { cart: { createCartRedirectUrls: { redirectUrls: null } } },
      })
      // The cart is still there, so the null URL was something else.
      .mockResolvedValueOnce({
        ok: true,
        data: { site: { cart: { entityId: "cart-1" } } },
      });

    const result = await redirectToCheckout();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBeTruthy();
    expect(clearCartId).not.toHaveBeenCalled();
  });

  it("clears a dead cart id, which BigCommerce reports as no URL rather than an error", async () => {
    // Measured live: the redirect mutation answers 200 with `redirectUrls:
    // null` for a cart that does not exist, so the id would otherwise survive
    // and fail the next click too.
    storefrontQuery
      .mockResolvedValueOnce({
        ok: true,
        data: { cart: { createCartRedirectUrls: { redirectUrls: null } } },
      })
      .mockResolvedValueOnce({ ok: true, data: { site: { cart: null } } });

    expect(await redirectToCheckout()).toEqual({
      ok: false,
      message: "Your cart is empty.",
    });
    expect(clearCartId).toHaveBeenCalledTimes(1);
  });

  it("keeps the cart id when the existence check itself fails", async () => {
    // A failed request is not evidence the cart is gone. Throwing away a live
    // cart on a transport blip would lose the shopper their basket.
    storefrontQuery
      .mockResolvedValueOnce({
        ok: true,
        data: { cart: { createCartRedirectUrls: { redirectUrls: null } } },
      })
      .mockResolvedValueOnce({ ok: false, kind: "network", error: "boom" });

    await redirectToCheckout();

    expect(clearCartId).not.toHaveBeenCalled();
  });

  it("returns a message when the request itself fails", async () => {
    storefrontQuery.mockResolvedValue({
      ok: false,
      kind: "network",
      error: "fetch failed",
    });

    const result = await redirectToCheckout();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBeTruthy();
  });
});
