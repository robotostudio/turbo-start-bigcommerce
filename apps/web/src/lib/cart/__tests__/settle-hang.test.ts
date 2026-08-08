import { describe, expect, it, vi } from "vitest";

import { type CartActions, CartController } from "@/lib/cart/controller";
import { recalcTotals } from "@/lib/cart/engine";
import type { Cart, CartActionResult, CartLine } from "@/lib/cart/types";

/**
 * The checkout hang. `settle()` loops until its chains empty and cannot tell a
 * slow request from one that will never come back, so anything it waits on can
 * stop checkout forever with no error and nothing in the console.
 *
 * It used to wait on `refetch()`, which writes nothing. The provider fires one
 * on every `visibilitychange` to visible, which is what a bfcache restore does,
 * which is the browser-Back path the hang was seen on.
 */

const usd = (amount: string) => ({ amount, currencyCode: "USD" });

function makeLine(quantity: number): CartLine {
  return {
    id: "line-1",
    quantity,
    merchandise: {
      id: "190:232",
      title: "M",
      image: null,
      product: { handle: "jacket", title: "Jacket" },
      selectedOptions: [],
      price: usd("89.00"),
    },
    cost: {
      amountPerQuantity: usd("89.00"),
      totalAmount: usd((89 * quantity).toFixed(2)),
    },
  };
}

function makeCart(quantity: number, version = 1): Cart {
  const line = makeLine(quantity);
  return {
    id: "cart-1",
    version,
    totalQuantity: quantity,
    lines: {
      edges: [{ node: line }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    cost: recalcTotals([line]),
  };
}

const never = <T>(): Promise<T> => new Promise<T>(() => {});

function controllerWith(overrides: Partial<CartActions>) {
  const cart = makeCart(2);
  const actions: CartActions = {
    getCart: () => Promise.resolve(cart),
    addLines: () =>
      Promise.resolve<CartActionResult>({ ok: true, cart, warnings: [] }),
    updateLine: () =>
      Promise.resolve<CartActionResult>({ ok: true, cart, warnings: [] }),
    removeLine: () =>
      Promise.resolve<CartActionResult>({ ok: true, cart, warnings: [] }),
    ...overrides,
  };
  const controller = new CartController(actions);
  controller.seed(cart);
  return controller;
}

/** Resolves to "hung" if settle has not returned by the deadline. */
async function settleWithin(
  controller: CartController,
  ms: number
): Promise<"settled" | "hung"> {
  return Promise.race([
    controller.settle().then(() => "settled" as const),
    new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), ms)),
  ]);
}

describe("settle() and a request that never comes back", () => {
  it("is not blocked by a refetch that never settles", async () => {
    const controller = controllerWith({ getCart: never });
    controller.refetch();

    expect(await settleWithin(controller, 50)).toBe("settled");
  });

  it("does not wait on a refetch at all, even a fast one", async () => {
    const getCart = vi.fn(() => Promise.resolve(makeCart(2)));
    const controller = controllerWith({ getCart });
    controller.refetch();

    // The read is still issued. Checkout just no longer depends on it: the
    // redirect is minted from BigCommerce's own state, so a pending local read
    // changes nothing about what the shopper checks out with.
    await controller.settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getCart).toHaveBeenCalled();
  });

  it("still waits on a write that never settles", async () => {
    // Deliberate. Checking out before a quantity change lands would check out
    // the wrong cart, which is worse than a spinner. A write that never
    // returns is a different failure with different evidence.
    const controller = controllerWith({ updateLine: never });
    controller.updateLine("line-1", 3);

    expect(await settleWithin(controller, 50)).toBe("hung");
  });

  it("returns normally when every request comes back", async () => {
    const controller = controllerWith({});
    controller.updateLine("line-1", 3);

    expect(await settleWithin(controller, 2000)).toBe("settled");
  });
});

describe("a read that lands after a write", () => {
  it("does not put the older cart back", async () => {
    // Reads no longer share a chain with writes, so nothing serialises them.
    // A read issued first can return after a write that started later, and its
    // cart is the older one however the two were ordered.
    let releaseRead: (cart: Cart) => void = () => {};
    const controller = controllerWith({
      getCart: () =>
        new Promise<Cart>((resolve) => {
          releaseRead = resolve;
        }),
      updateLine: () =>
        Promise.resolve<CartActionResult>({
          ok: true,
          cart: makeCart(5, 2),
          warnings: [],
        }),
    });

    controller.refetch();
    controller.updateLine("line-1", 5);
    await controller.settle();
    expect(controller.getSnapshot().cart?.totalQuantity).toBe(5);

    // The read finally answers, with the cart as it was before the write.
    releaseRead(makeCart(2));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(controller.getSnapshot().cart?.totalQuantity).toBe(5);
  });
});
