import { afterEach, describe, expect, it } from "vitest";

import {
  type CartActions,
  CART_CONFLICT_MESSAGE,
  CartController,
} from "@/lib/cart/controller";
import { recalcTotals } from "@/lib/cart/engine";
import type { Cart, CartActionResult, CartLine } from "@/lib/cart/types";

/**
 * Two tabs on one cart.
 *
 * The controller tests mock the backend per call; these do not. One store
 * stands in for BigCommerce and both controllers write to it, because the bug
 * only exists between two clients that disagree about the same line. A mock
 * that answers each tab separately cannot express it.
 *
 * The store models the two platform behaviours the fix turns on, both measured
 * against the live store: writes are absolute, which is why a stale tab lowers
 * a quantity instead of raising it, and a write carrying a `version` that is no
 * longer current is refused outright. Revert the controller's `expectedVersion`
 * wiring and the first test here ends with the line at 3 instead of 4.
 */

const usd = (amount: string) => ({ amount, currencyCode: "USD" });

function makeLine(id: string, merchandiseId: string, quantity: number) {
  const line: CartLine = {
    id,
    quantity,
    merchandise: {
      id: merchandiseId,
      title: "M",
      image: null,
      product: { handle: "shirt", title: "Shirt" },
      selectedOptions: [{ name: "Size", value: "M" }],
      price: usd("89.00"),
    },
    cost: {
      amountPerQuantity: usd("89.00"),
      totalAmount: usd((89 * quantity).toFixed(2)),
    },
  };
  return line;
}

type SharedStore = {
  actions: CartActions;
  /** Quantity as the backend holds it, which is the only thing money follows. */
  quantityOf(lineId: string): number | null;
  merchandiseOf(lineId: string): string | null;
  /** What a tab loading the page right now would be seeded with. */
  read(): Cart;
  /**
   * Suspends update writes between composing the request and serving it, so a
   * test can land another write in the gap. Returns the release.
   */
  holdUpdates(): () => void;
};

function createSharedStore(
  lines: CartLine[],
  { versioned = true }: { versioned?: boolean } = {}
): SharedStore {
  let cart: Cart = {
    id: "cart-1",
    version: versioned ? 1 : null,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    lines: {
      edges: lines.map((node) => ({ node })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    cost: recalcTotals(lines),
  };

  // Every write bumps the version, which is what makes a version anyone else
  // is still holding stale.
  const commit = (next: CartLine[]) => {
    cart = {
      ...cart,
      version: cart.version === null ? null : cart.version + 1,
      totalQuantity: next.reduce((sum, line) => sum + line.quantity, 0),
      lines: { ...cart.lines, edges: next.map((node) => ({ node })) },
      cost: recalcTotals(next),
    };
  };

  let hold: Promise<void> | null = null;
  const nodes = () => cart.lines.edges.map((edge) => edge.node);
  const find = (lineId: string) =>
    nodes().find((node) => node.id === lineId) ?? null;
  // Neither tab may hold a reference into the store, or a write in one would
  // show up in the other's "stale" view for free.
  const snapshot = (): Cart => structuredClone(cart);

  const actions: CartActions = {
    getCart: () => Promise.resolve(snapshot()),

    // Adds send no version, matching the action. They still bump it.
    addLines: (inputs) => {
      commit([
        ...nodes(),
        ...inputs.map((input, index) =>
          makeLine(`line-added-${index}`, input.merchandiseId, input.quantity)
        ),
      ]);
      return Promise.resolve<CartActionResult>({
        ok: true,
        cart: snapshot(),
        warnings: [],
      });
    },

    updateLine: async (lineId, quantity, merchandiseId, expectedVersion) => {
      // The version travels with the request and is checked when the request
      // is served, not when it is composed. `hold` is where another write gets
      // in between the two, which is the whole of the in-flight hazard.
      await hold;

      // BigCommerce refuses the write outright when the version has moved on,
      // and leaves the cart exactly as it was.
      if (
        expectedVersion !== undefined &&
        expectedVersion !== null &&
        expectedVersion !== cart.version
      ) {
        return {
          ok: false as const,
          error: {
            code: "CART_CONFLICT" as const,
            message: "Request conflict: the cart has moved on.",
          },
        };
      }
      // The write is absolute. Nothing here consults the line's current
      // quantity, which is exactly the platform behaviour under test.
      commit(
        nodes().map((node) =>
          node.id === lineId
            ? {
                ...node,
                quantity,
                merchandise: {
                  ...node.merchandise,
                  id: merchandiseId ?? node.merchandise.id,
                },
                cost: {
                  amountPerQuantity: node.cost.amountPerQuantity,
                  totalAmount: usd(
                    (
                      Number.parseFloat(node.cost.amountPerQuantity.amount) *
                      quantity
                    ).toFixed(2)
                  ),
                },
              }
            : node
        )
      );
      return Promise.resolve<CartActionResult>({
        ok: true,
        cart: snapshot(),
        warnings: [],
      });
    },

    removeLine: (lineId) => {
      commit(nodes().filter((node) => node.id !== lineId));
      return Promise.resolve<CartActionResult>({
        ok: true,
        cart: nodes().length > 0 ? snapshot() : null,
        warnings: [],
      });
    },
  };

  return {
    actions,
    quantityOf: (lineId) => find(lineId)?.quantity ?? null,
    merchandiseOf: (lineId) => find(lineId)?.merchandise.id ?? null,
    read: snapshot,
    holdUpdates: () => {
      let release = () => {};
      hold = new Promise<void>((resolve) => {
        release = () => {
          hold = null;
          resolve();
        };
      });
      return release;
    },
  };
}

const openTabs: CartController[] = [];

/** A tab that loaded the page at whatever the store held at this moment. */
function openTab(store: SharedStore): CartController {
  const tab = new CartController(store.actions);
  tab.seed(store.read());
  openTabs.push(tab);
  return tab;
}

function lineIn(cart: Cart | null, lineId: string): CartLine | undefined {
  return cart?.lines.edges.find((edge) => edge.node.id === lineId)?.node;
}

afterEach(() => {
  for (const tab of openTabs.splice(0)) {
    tab.dispose();
  }
});

describe("two tabs on one cart", () => {
  it("refuses a stale tab's write instead of lowering the quantity", async () => {
    const store = createSharedStore([makeLine("line-1", "variant-1", 2)]);
    const tabA = openTab(store);
    const tabB = openTab(store);

    // Tab B raises the line to 4. Tab A is not told and does not ask.
    tabB.updateLine("line-1", 4);
    await tabB.settle();
    expect(store.quantityOf("line-1")).toBe(4);
    expect(lineIn(tabA.getSnapshot().cart, "line-1")?.quantity).toBe(2);

    // The shopper clicks plus in tab A. Believing 2, the stepper sends 3.
    tabA.updateLine("line-1", 3);
    await tabA.settle();

    // Without the guard this is 3: tab B's change, silently destroyed.
    expect(store.quantityOf("line-1")).toBe(4);

    const error = tabA.getSnapshot().error;
    expect(error?.code).toBe("CART_CONFLICT");
    expect(error?.lineId).toBe("line-1");
    expect(error?.retryable).toBe(false);
    // Not BigCommerce's "Request conflict", which means nothing to a shopper.
    expect(error?.message).toBe(CART_CONFLICT_MESSAGE);

    // Refused, then resynced, so the next click starts from the truth.
    expect(lineIn(tabA.getSnapshot().cart, "line-1")?.quantity).toBe(4);
  });

  it("refuses a stale tab's variant swap, which writes a quantity too", async () => {
    const store = createSharedStore([makeLine("line-1", "variant-1", 2)]);
    const tabA = openTab(store);
    const tabB = openTab(store);

    tabB.updateLine("line-1", 4);
    await tabB.settle();

    // The in-cart colour selector passes the quantity it can see, which is 2.
    tabA.swapLineVariant("line-1", "variant-2", 2);
    await tabA.settle();

    expect(store.quantityOf("line-1")).toBe(4);
    expect(store.merchandiseOf("line-1")).toBe("variant-1");
    expect(tabA.getSnapshot().error?.code).toBe("CART_CONFLICT");
  });

  it("lets a tab write once it has caught up", async () => {
    const store = createSharedStore([makeLine("line-1", "variant-1", 2)]);
    const tabA = openTab(store);
    const tabB = openTab(store);

    tabB.updateLine("line-1", 4);
    await tabB.settle();

    tabA.refetch();
    await tabA.settle();
    tabA.updateLine("line-1", 5);
    await tabA.settle();

    expect(store.quantityOf("line-1")).toBe(5);
    expect(tabA.getSnapshot().error).toBeNull();
  });

  it("does not blame another tab when this tab's own add moved the version", async () => {
    const store = createSharedStore([makeLine("line-1", "variant-1", 2)]);
    const tab = openTab(store);

    // Adds run on the `add:` chain and line writes on `line:`, so nothing
    // serialises them against each other. The version is cart-wide, so an add
    // landing mid-flight leaves this tab's own update holding a stale one and
    // BigCommerce refuses it. Refusing the shopper's own edit here would be
    // both a lie and a lost change.
    const release = store.holdUpdates();
    tab.updateLine("line-1", 3);
    await tab.addLine("variant-2", 1, {
      productTitle: "Other",
      productHandle: "other",
      variantTitle: "L",
      price: usd("20.00"),
      image: null,
      selectedOptions: [],
    });
    release();
    await tab.settle();

    expect(store.quantityOf("line-1")).toBe(3);
    expect(tab.getSnapshot().error).toBeNull();
  });

  it("still refuses a stale write when the retry would overwrite a moved line", async () => {
    const store = createSharedStore([makeLine("line-1", "variant-1", 2)]);
    const tabA = openTab(store);
    const tabB = openTab(store);

    tabB.updateLine("line-1", 4);
    await tabB.settle();

    // Tab A adds something of its own, so its version moves too. The line it
    // is about to write has still moved under it, and that is what decides.
    const release = store.holdUpdates();
    tabA.updateLine("line-1", 3);
    await tabA.addLine("variant-2", 1, {
      productTitle: "Other",
      productHandle: "other",
      variantTitle: "L",
      price: usd("20.00"),
      image: null,
      selectedOptions: [],
    });
    release();
    await tabA.settle();

    expect(store.quantityOf("line-1")).toBe(4);
    expect(tabA.getSnapshot().error?.code).toBe("CART_CONFLICT");
  });

  it("refuses the retry when another tab moved the variant, not the quantity", async () => {
    const store = createSharedStore([makeLine("line-1", "variant-1", 2)]);
    const tabA = openTab(store);
    const tabB = openTab(store);

    // Tab B swaps to a third variant and leaves the quantity alone, so the
    // line has moved in a way a quantity check cannot see.
    tabB.swapLineVariant("line-1", "variant-3", 2);
    await tabB.settle();
    expect(store.merchandiseOf("line-1")).toBe("variant-3");

    // Tab A swaps to its own variant and adds something, so its own version
    // moves too and the retry becomes eligible on the version test alone.
    const release = store.holdUpdates();
    tabA.swapLineVariant("line-1", "variant-2", 2);
    await tabA.addLine("variant-9", 1, {
      productTitle: "Other",
      productHandle: "other",
      variantTitle: "L",
      price: usd("20.00"),
      image: null,
      selectedOptions: [],
    });
    release();
    await tabA.settle();

    expect(store.merchandiseOf("line-1")).toBe("variant-3");
    expect(tabA.getSnapshot().error?.code).toBe("CART_CONFLICT");
  });

  it("writes unconditionally against a cart that reports no version", async () => {
    const store = createSharedStore([makeLine("line-1", "variant-1", 2)], {
      versioned: false,
    });
    const tab = openTab(store);

    tab.updateLine("line-1", 3);
    await tab.settle();

    expect(store.quantityOf("line-1")).toBe(3);
    expect(tab.getSnapshot().error).toBeNull();
  });

  it("does not refuse a single tab's own run of quick clicks", async () => {
    const store = createSharedStore([makeLine("line-1", "variant-1", 2)]);
    const tab = openTab(store);

    // First click sends straight away; the rest ride the debounce.
    tab.updateLine("line-1", 3);
    tab.updateLine("line-1", 4);
    tab.updateLine("line-1", 5);
    await tab.settle();

    expect(store.quantityOf("line-1")).toBe(5);
    expect(tab.getSnapshot().error).toBeNull();
  });
});
