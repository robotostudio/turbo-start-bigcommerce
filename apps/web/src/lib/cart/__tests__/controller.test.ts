import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type CartActions,
  CartController,
  type ExpectedTotal,
} from "@/lib/cart/controller";
import { recalcTotals } from "@/lib/cart/engine";
import type {
  CartActionResult,
  CartErrorCode,
  CartWarning,
  LineMetadata,
} from "@/lib/cart/types";
import type {
  Cart,
  CartLine,
  CartLineInput,
  MoneyV2,
} from "@/lib/shopify/types";

const usd = (amount: string): MoneyV2 => ({ amount, currencyCode: "USD" });

function makeLine(
  id: string,
  variantId: string,
  quantity: number,
  unitPrice: string
): CartLine {
  return {
    id,
    quantity,
    merchandise: {
      id: variantId,
      title: "Default",
      image: null,
      product: { handle: "product", title: "Product" },
      selectedOptions: [{ name: "Size", value: "M" }],
      price: usd(unitPrice),
    },
    cost: {
      amountPerQuantity: usd(unitPrice),
      totalAmount: usd((Number.parseFloat(unitPrice) * quantity).toFixed(2)),
    },
  };
}

function makeCart(lines: CartLine[], id = "gid://shopify/Cart/1"): Cart {
  return {
    id,
    checkoutUrl: "https://shop.example/checkout",
    totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
    lines: {
      edges: lines.map((node) => ({ node })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    cost: recalcTotals(lines),
  };
}

function makeMetadata(overrides?: Partial<LineMetadata>): LineMetadata {
  return {
    productTitle: "Product",
    productHandle: "product",
    variantTitle: "Default",
    price: usd("10.00"),
    image: null,
    selectedOptions: [{ name: "Size", value: "M" }],
    ...overrides,
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolveFn: ((value: T) => void) | undefined;
  let rejectFn: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  if (!resolveFn || !rejectFn) {
    throw new Error("executor did not run synchronously");
  }
  return { promise, resolve: resolveFn, reject: rejectFn };
}

type MutationCall =
  | {
      type: "addLines";
      lines: CartLineInput[];
      expectedTotals: ExpectedTotal[] | undefined;
    }
  | {
      type: "updateLine";
      lineId: string;
      quantity: number;
      merchandiseId: string | undefined;
    }
  | { type: "removeLine"; lineId: string };

type MockActions = {
  actions: CartActions;
  mutationCalls: MutationCall[];
  mutations: Deferred<CartActionResult>[];
  gets: Deferred<Cart | null>[];
};

function createMockActions(): MockActions {
  const mutationCalls: MutationCall[] = [];
  const mutations: Deferred<CartActionResult>[] = [];
  const gets: Deferred<Cart | null>[] = [];
  const pushMutation = (call: MutationCall): Promise<CartActionResult> => {
    mutationCalls.push(call);
    const d = createDeferred<CartActionResult>();
    mutations.push(d);
    return d.promise;
  };
  const actions: CartActions = {
    getCart() {
      const d = createDeferred<Cart | null>();
      gets.push(d);
      return d.promise;
    },
    addLines(lines, expectedTotals) {
      return pushMutation({ type: "addLines", lines, expectedTotals });
    },
    updateLine(lineId, quantity, merchandiseId) {
      return pushMutation({
        type: "updateLine",
        lineId,
        quantity,
        merchandiseId,
      });
    },
    removeLine(lineId) {
      return pushMutation({ type: "removeLine", lineId });
    },
  };
  return { actions, mutationCalls, mutations, gets };
}

function resolveMutation(
  mock: MockActions,
  index: number,
  result: CartActionResult
): void {
  const d = mock.mutations[index];
  if (!d) throw new Error(`no mutation call at index ${index}`);
  d.resolve(result);
}

function resolveGet(mock: MockActions, index: number, cart: Cart | null): void {
  const d = mock.gets[index];
  if (!d) throw new Error(`no getCart call at index ${index}`);
  d.resolve(cart);
}

function rejectGet(mock: MockActions, index: number, reason: unknown): void {
  const d = mock.gets[index];
  if (!d) throw new Error(`no getCart call at index ${index}`);
  d.reject(reason);
}

const ok = (cart: Cart, warnings: CartWarning[] = []): CartActionResult => ({
  ok: true,
  cart,
  warnings,
});

const fail = (
  code: CartErrorCode,
  message: string = code
): CartActionResult => ({
  ok: false,
  error: { code, message },
});

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
}

function lineQty(cart: Cart | null, lineId: string): number | undefined {
  return cart?.lines.edges.find((e) => e.node.id === lineId)?.node.quantity;
}

function lineIds(cart: Cart | null): string[] {
  return cart?.lines.edges.map((e) => e.node.id) ?? [];
}

function updateCalls(mock: MockActions): MutationCall[] {
  return mock.mutationCalls.filter((c) => c.type === "updateLine");
}

function addCalls(mock: MockActions): MutationCall[] {
  return mock.mutationCalls.filter((c) => c.type === "addLines");
}

describe("CartController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("1. spam updateLine 1→15 sends exactly 2 requests with no snap-back", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(makeCart([makeLine("line-1", "variant-1", 1, "10.00")]));

    const seen: Array<number | undefined> = [];
    controller.subscribe(() => {
      seen.push(lineQty(controller.getSnapshot().cartWithPending, "line-1"));
    });

    controller.updateLine("line-1", 2);
    await flush();
    expect(mock.mutationCalls).toEqual([
      {
        type: "updateLine",
        lineId: "line-1",
        quantity: 2,
        merchandiseId: undefined,
      },
    ]);

    for (let qty = 3; qty <= 15; qty++) {
      controller.updateLine("line-1", qty);
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(mock.mutationCalls).toHaveLength(1);
    expect(lineQty(controller.getSnapshot().cartWithPending, "line-1")).toBe(
      15
    );

    resolveMutation(
      mock,
      0,
      ok(makeCart([makeLine("line-1", "variant-1", 2, "10.00")]))
    );
    await flush();
    expect(lineQty(controller.getSnapshot().cartWithPending, "line-1")).toBe(
      15
    );

    await vi.advanceTimersByTimeAsync(400);
    expect(mock.mutationCalls).toHaveLength(2);
    expect(mock.mutationCalls[1]).toEqual({
      type: "updateLine",
      lineId: "line-1",
      quantity: 15,
      merchandiseId: undefined,
    });

    resolveMutation(
      mock,
      1,
      ok(makeCart([makeLine("line-1", "variant-1", 15, "10.00")]))
    );
    await flush();
    expect(lineQty(controller.getSnapshot().cartWithPending, "line-1")).toBe(
      15
    );
    expect(lineQty(controller.getSnapshot().cart, "line-1")).toBe(15);

    const first15 = seen.indexOf(15);
    expect(first15).toBeGreaterThan(-1);
    expect(seen.slice(first15).every((qty) => qty === 15)).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.mutationCalls).toHaveLength(2);
    controller.dispose();
  });

  it("2. add during pending update debounce flushes the update first", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(makeCart([makeLine("line-1", "variant-1", 1, "10.00")]));

    controller.updateLine("line-1", 2);
    await flush();
    controller.updateLine("line-1", 5);
    resolveMutation(
      mock,
      0,
      ok(makeCart([makeLine("line-1", "variant-1", 2, "10.00")]))
    );
    await flush();
    expect(lineQty(controller.getSnapshot().cartWithPending, "line-1")).toBe(5);

    await vi.advanceTimersByTimeAsync(50);
    const addPromise = controller.addLine("variant-2", 1, makeMetadata());
    await vi.advanceTimersByTimeAsync(300);

    expect(mock.mutationCalls).toEqual([
      {
        type: "updateLine",
        lineId: "line-1",
        quantity: 2,
        merchandiseId: undefined,
      },
      {
        type: "updateLine",
        lineId: "line-1",
        quantity: 5,
        merchandiseId: undefined,
      },
      {
        type: "addLines",
        lines: [{ merchandiseId: "variant-2", quantity: 1 }],
        expectedTotals: [{ merchandiseId: "variant-2", quantity: 1 }],
      },
    ]);

    resolveMutation(
      mock,
      1,
      ok(makeCart([makeLine("line-1", "variant-1", 5, "10.00")]))
    );
    resolveMutation(
      mock,
      2,
      ok(
        makeCart([
          makeLine("line-1", "variant-1", 5, "10.00"),
          makeLine("line-2", "variant-2", 1, "10.00"),
        ])
      )
    );
    await flush();
    await expect(addPromise).resolves.toEqual({ ok: true, warnings: [] });
    expect(lineIds(controller.getSnapshot().cartWithPending)).toEqual([
      "line-1",
      "line-2",
    ]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.mutationCalls).toHaveLength(3);
    controller.dispose();
  });

  it("3. remove mid-burst cancels timers and strips update intents", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(makeCart([makeLine("line-1", "variant-1", 1, "10.00")]));

    controller.updateLine("line-1", 2);
    await flush();
    controller.updateLine("line-1", 7);
    controller.removeLine("line-1");
    expect(lineIds(controller.getSnapshot().cartWithPending)).toEqual([]);

    await flush();
    expect(mock.mutationCalls).toHaveLength(1);

    resolveMutation(
      mock,
      0,
      ok(makeCart([makeLine("line-1", "variant-1", 2, "10.00")]))
    );
    await flush();
    expect(lineIds(controller.getSnapshot().cartWithPending)).toEqual([]);
    expect(mock.mutationCalls).toHaveLength(2);
    expect(mock.mutationCalls[1]).toEqual({
      type: "removeLine",
      lineId: "line-1",
    });

    resolveMutation(mock, 1, ok(makeCart([])));
    await flush();
    expect(lineIds(controller.getSnapshot().cartWithPending)).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(updateCalls(mock)).toHaveLength(1);
    expect(mock.mutationCalls).toHaveLength(2);
    controller.dispose();
  });

  it("4. clamp warning surfaces and display settles to clamped quantity", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(makeCart([makeLine("line-1", "variant-1", 2, "10.00")]));

    controller.updateLine("line-1", 10);
    await flush();
    expect(mock.mutationCalls).toHaveLength(1);

    const warning: CartWarning = {
      code: "QUANTITY_CLAMPED",
      lineId: "line-1",
      message: "Only 3 available",
    };
    resolveMutation(
      mock,
      0,
      ok(makeCart([makeLine("line-1", "variant-1", 3, "10.00")]), [warning])
    );
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.warnings).toEqual([warning]);
    expect(lineQty(snapshot.cartWithPending, "line-1")).toBe(3);
    expect(lineQty(snapshot.cart, "line-1")).toBe(3);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.mutationCalls).toHaveLength(1);

    controller.clearWarnings();
    expect(controller.getSnapshot().warnings).toEqual([]);
    controller.dispose();
  });

  it("5. failed update rolls back only its own line", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(
      makeCart([
        makeLine("line-1", "variant-1", 1, "10.00"),
        makeLine("line-2", "variant-2", 1, "5.00"),
      ])
    );

    controller.updateLine("line-1", 5);
    controller.updateLine("line-2", 4);
    await flush();
    expect(mock.mutationCalls).toHaveLength(2);

    resolveMutation(
      mock,
      1,
      ok(
        makeCart([
          makeLine("line-1", "variant-1", 1, "10.00"),
          makeLine("line-2", "variant-2", 4, "5.00"),
        ])
      )
    );
    await flush();
    expect(lineQty(controller.getSnapshot().cartWithPending, "line-2")).toBe(4);
    expect(lineQty(controller.getSnapshot().cartWithPending, "line-1")).toBe(5);

    resolveMutation(mock, 0, fail("SHOPIFY_USER_ERROR", "cannot update"));
    await flush();

    const snapshot = controller.getSnapshot();
    expect(lineQty(snapshot.cartWithPending, "line-1")).toBe(1);
    expect(lineQty(snapshot.cartWithPending, "line-2")).toBe(4);
    expect(snapshot.error).toEqual({
      intentKind: "update",
      lineId: "line-1",
      code: "SHOPIFY_USER_ERROR",
      message: "cannot update",
      retryable: false,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.mutationCalls).toHaveLength(2);
    controller.dispose();
  });

  it("6. seq guard discards out-of-order responses but still confirms intents", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(
      makeCart([
        makeLine("line-1", "variant-1", 1, "10.00"),
        makeLine("line-2", "variant-2", 1, "5.00"),
      ])
    );

    controller.updateLine("line-1", 3);
    await flush();
    controller.removeLine("line-2");
    await flush();
    expect(mock.mutationCalls).toEqual([
      {
        type: "updateLine",
        lineId: "line-1",
        quantity: 3,
        merchandiseId: undefined,
      },
      { type: "removeLine", lineId: "line-2" },
    ]);

    resolveMutation(
      mock,
      1,
      ok(makeCart([makeLine("line-1", "variant-1", 3, "10.00")]))
    );
    await flush();
    expect(lineIds(controller.getSnapshot().cartWithPending)).toEqual([
      "line-1",
    ]);

    resolveMutation(
      mock,
      0,
      ok(
        makeCart([
          makeLine("line-1", "variant-1", 3, "10.00"),
          makeLine("line-2", "variant-2", 1, "5.00"),
        ])
      )
    );
    await flush();

    const snapshot = controller.getSnapshot();
    expect(lineIds(snapshot.cartWithPending)).toEqual(["line-1"]);
    expect(lineQty(snapshot.cartWithPending, "line-1")).toBe(3);
    expect(snapshot.cartWithPending?.totalQuantity).toBe(3);
    expect(lineIds(snapshot.cart)).toEqual(["line-1"]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.mutationCalls).toHaveLength(2);
    controller.dispose();
  });

  it("7. concurrent first adds on different variants trigger a single create", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(null);

    const p1 = controller.addLine("variant-1", 1, makeMetadata());
    const p2 = controller.addLine(
      "variant-2",
      2,
      makeMetadata({ price: usd("5.00") })
    );

    let snapshot = controller.getSnapshot();
    expect(lineIds(snapshot.cartWithPending)).toEqual([
      "optimistic-variant-1",
      "optimistic-variant-2",
    ]);
    expect(snapshot.pendingQuantity).toBe(3);
    expect(snapshot.isCreatingCart).toBe(false);

    await vi.advanceTimersByTimeAsync(300);
    expect(addCalls(mock)).toHaveLength(1);
    expect(mock.mutationCalls[0]).toEqual({
      type: "addLines",
      lines: [
        { merchandiseId: "variant-1", quantity: 1 },
        { merchandiseId: "variant-2", quantity: 2 },
      ],
      expectedTotals: [
        { merchandiseId: "variant-1", quantity: 1 },
        { merchandiseId: "variant-2", quantity: 2 },
      ],
    });
    snapshot = controller.getSnapshot();
    expect(snapshot.isCreatingCart).toBe(true);
    expect(snapshot.isMutating).toBe(true);

    resolveMutation(
      mock,
      0,
      ok(
        makeCart(
          [
            makeLine("line-1", "variant-1", 1, "10.00"),
            makeLine("line-2", "variant-2", 2, "5.00"),
          ],
          "gid://shopify/Cart/new"
        )
      )
    );
    await flush();
    await expect(p1).resolves.toEqual({ ok: true, warnings: [] });
    await expect(p2).resolves.toEqual({ ok: true, warnings: [] });

    snapshot = controller.getSnapshot();
    expect(snapshot.isCreatingCart).toBe(false);
    expect(snapshot.cartWithPending?.id).toBe("gid://shopify/Cart/new");
    expect(lineIds(snapshot.cartWithPending)).toEqual(["line-1", "line-2"]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.mutationCalls).toHaveLength(1);
    controller.dispose();
  });

  it("8. CART_NOT_FOUND resets server truth and the next add recreates", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(makeCart([makeLine("line-1", "variant-1", 1, "10.00")]));

    controller.updateLine("line-1", 3);
    await flush();
    resolveMutation(mock, 0, fail("CART_NOT_FOUND", "cart gone"));
    await flush();

    let snapshot = controller.getSnapshot();
    expect(snapshot.cart).toBeNull();
    expect(snapshot.cartWithPending).toBeNull();
    expect(snapshot.error?.code).toBe("CART_NOT_FOUND");

    const addPromise = controller.addLine("variant-9", 1, makeMetadata());
    snapshot = controller.getSnapshot();
    expect(snapshot.cartWithPending?.id).toBe("optimistic-cart");
    expect(lineIds(snapshot.cartWithPending)).toEqual(["optimistic-variant-9"]);

    await vi.advanceTimersByTimeAsync(300);
    expect(mock.mutationCalls).toHaveLength(2);
    expect(mock.mutationCalls[1]).toEqual({
      type: "addLines",
      lines: [{ merchandiseId: "variant-9", quantity: 1 }],
      expectedTotals: [{ merchandiseId: "variant-9", quantity: 1 }],
    });
    expect(controller.getSnapshot().isCreatingCart).toBe(true);

    resolveMutation(
      mock,
      1,
      ok(
        makeCart(
          [makeLine("line-9", "variant-9", 1, "10.00")],
          "gid://shopify/Cart/recreated"
        )
      )
    );
    await flush();
    await expect(addPromise).resolves.toEqual({ ok: true, warnings: [] });

    snapshot = controller.getSnapshot();
    expect(snapshot.cartWithPending?.id).toBe("gid://shopify/Cart/recreated");
    expect(snapshot.isCreatingCart).toBe(false);
    controller.dispose();
  });

  it("9. reaper drops intents for vanished lines but keeps pending adds", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(
      makeCart([
        makeLine("line-1", "variant-1", 1, "10.00"),
        makeLine("line-2", "variant-2", 2, "5.00"),
      ])
    );

    controller.updateLine("line-2", 5);
    await flush();
    expect(mock.mutationCalls).toHaveLength(1);

    controller.addLine("variant-3", 1, makeMetadata());
    controller.refetch();
    await flush();
    expect(mock.gets).toHaveLength(1);

    resolveGet(
      mock,
      0,
      makeCart([makeLine("line-1", "variant-1", 1, "10.00")])
    );
    await flush();

    let snapshot = controller.getSnapshot();
    expect(lineIds(snapshot.cartWithPending)).toEqual([
      "line-1",
      "optimistic-variant-3",
    ]);
    expect(lineQty(snapshot.cartWithPending, "line-2")).toBeUndefined();

    resolveMutation(
      mock,
      0,
      ok(
        makeCart([
          makeLine("line-1", "variant-1", 1, "10.00"),
          makeLine("line-2", "variant-2", 5, "5.00"),
        ])
      )
    );
    await flush();
    snapshot = controller.getSnapshot();
    expect(lineIds(snapshot.cartWithPending)).toEqual([
      "line-1",
      "optimistic-variant-3",
    ]);

    await vi.advanceTimersByTimeAsync(400);
    expect(updateCalls(mock)).toHaveLength(1);
    expect(addCalls(mock)).toHaveLength(1);
    expect(mock.mutationCalls[1]).toEqual({
      type: "addLines",
      lines: [{ merchandiseId: "variant-3", quantity: 1 }],
      expectedTotals: [{ merchandiseId: "variant-3", quantity: 1 }],
    });
    controller.dispose();
  });

  it("10a. update on a synthetic line mutates the add intent with no server call", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(null);

    controller.addLine("variant-1", 2, makeMetadata());
    controller.updateLine("optimistic-variant-1", 5);
    expect(mock.mutationCalls).toHaveLength(0);
    expect(
      lineQty(controller.getSnapshot().cartWithPending, "optimistic-variant-1")
    ).toBe(5);

    await vi.advanceTimersByTimeAsync(300);
    expect(mock.mutationCalls).toEqual([
      {
        type: "addLines",
        lines: [{ merchandiseId: "variant-1", quantity: 5 }],
        expectedTotals: [{ merchandiseId: "variant-1", quantity: 5 }],
      },
    ]);
    expect(updateCalls(mock)).toHaveLength(0);
    controller.dispose();
  });

  it("10b. remove on a synthetic line cancels the add with zero server calls", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(null);

    const addPromise = controller.addLine("variant-1", 2, makeMetadata());
    controller.removeLine("optimistic-variant-1");

    expect(controller.getSnapshot().cartWithPending).toBeNull();
    await expect(addPromise).resolves.toEqual({ ok: true, warnings: [] });

    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.mutationCalls).toHaveLength(0);
    expect(mock.gets).toHaveLength(0);
    controller.dispose();
  });

  // Finding: a rejected getCart() during refetch must keep server truth and
  // pending intents instead of accepting null and reaping everything.
  it("11. failed refetch keeps server truth and pending intents", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(makeCart([makeLine("line-1", "variant-1", 3, "10.00")]));

    controller.updateLine("line-1", 5);
    await flush();
    controller.updateLine("line-1", 7);
    controller.refetch();
    await flush();
    expect(mock.gets).toHaveLength(1);

    rejectGet(mock, 0, new Error("network down"));
    await flush();

    let snapshot = controller.getSnapshot();
    expect(snapshot.cartWithPending).not.toBeNull();
    expect(lineQty(snapshot.cartWithPending, "line-1")).toBe(7);

    resolveMutation(
      mock,
      0,
      ok(makeCart([makeLine("line-1", "variant-1", 5, "10.00")]))
    );
    await flush();
    await vi.advanceTimersByTimeAsync(400);
    expect(updateCalls(mock)).toHaveLength(2);
    expect(mock.mutationCalls[1]).toEqual({
      type: "updateLine",
      lineId: "line-1",
      quantity: 7,
      merchandiseId: undefined,
    });

    resolveMutation(
      mock,
      1,
      ok(makeCart([makeLine("line-1", "variant-1", 7, "10.00")]))
    );
    await flush();
    snapshot = controller.getSnapshot();
    expect(lineQty(snapshot.cart, "line-1")).toBe(7);
    controller.dispose();
  });

  // Finding: a trailing update enqueued behind a failing leading request must
  // not resurrect the rolled-back quantity after the error is shown.
  it("12. rollback cancels a trailing update queued behind the failure", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(makeCart([makeLine("line-1", "variant-1", 2, "10.00")]));

    controller.updateLine("line-1", 5);
    await flush();
    controller.updateLine("line-1", 9);
    await vi.advanceTimersByTimeAsync(400);
    expect(updateCalls(mock)).toHaveLength(1);

    resolveMutation(mock, 0, fail("SHOPIFY_USER_ERROR", "cannot update"));
    await flush();

    const snapshot = controller.getSnapshot();
    expect(lineQty(snapshot.cartWithPending, "line-1")).toBe(2);
    expect(snapshot.error?.code).toBe("SHOPIFY_USER_ERROR");
    expect(updateCalls(mock)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.mutationCalls).toHaveLength(1);
    controller.dispose();
  });

  // Finding: accumulated rapid adds could exceed the server's 99 cap and get
  // the whole mutation rejected; the controller clamps instead.
  it("13. add accumulation clamps at 99 before hitting the server", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(makeCart([]));

    controller.addLine("variant-1", 60, makeMetadata());
    controller.addLine("variant-1", 60, makeMetadata());
    expect(
      lineQty(controller.getSnapshot().cartWithPending, "optimistic-variant-1")
    ).toBe(99);

    await vi.advanceTimersByTimeAsync(300);
    expect(mock.mutationCalls).toEqual([
      {
        type: "addLines",
        lines: [{ merchandiseId: "variant-1", quantity: 99 }],
        expectedTotals: [{ merchandiseId: "variant-1", quantity: 99 }],
      },
    ]);
    controller.dispose();
  });

  // Finding: the totalQuantity proxy for pending adds goes blind when a qty
  // update on the same line masks the add's delta; hasPendingAdds must not.
  it("14. hasPendingAdds stays true when an update masks the add's delta", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(makeCart([makeLine("line-1", "variant-1", 2, "10.00")]));
    expect(controller.getSnapshot().hasPendingAdds).toBe(false);

    controller.addLine("variant-1", 1, makeMetadata());
    expect(controller.getSnapshot().hasPendingAdds).toBe(true);

    controller.updateLine("line-1", 1);
    await flush();
    let snapshot = controller.getSnapshot();
    expect(snapshot.cartWithPending?.totalQuantity).toBe(
      snapshot.cart?.totalQuantity
    );
    expect(snapshot.hasPendingAdds).toBe(true);

    await vi.advanceTimersByTimeAsync(300);
    expect(addCalls(mock)).toHaveLength(1);

    resolveMutation(
      mock,
      0,
      ok(makeCart([makeLine("line-1", "variant-1", 1, "10.00")]))
    );
    await flush();
    expect(controller.getSnapshot().hasPendingAdds).toBe(true);

    resolveMutation(
      mock,
      1,
      ok(makeCart([makeLine("line-1", "variant-1", 2, "10.00")]))
    );
    await flush();
    snapshot = controller.getSnapshot();
    expect(snapshot.hasPendingAdds).toBe(false);
    expect(lineQty(snapshot.cartWithPending, "line-1")).toBe(2);
    controller.dispose();
  });

  it("15. add to an existing line passes the expected post-merge total", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(makeCart([makeLine("line-1", "variant-1", 5, "10.00")]));

    void controller.addLine("variant-1", 3, makeMetadata());
    await vi.advanceTimersByTimeAsync(300);

    const calls = addCalls(mock);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      lines: [{ merchandiseId: "variant-1", quantity: 3 }],
      expectedTotals: [{ merchandiseId: "variant-1", quantity: 8 }],
    });
    controller.dispose();
  });

  it("16. settle flushes pending mutations and resolves with the confirmed cart", async () => {
    const mock = createMockActions();
    const controller = new CartController(mock.actions);
    controller.seed(makeCart([makeLine("line-1", "variant-1", 1, "10.00")]));

    controller.updateLine("line-1", 3);
    void controller.addLine("variant-2", 1, makeMetadata());

    let settled: Cart | null | undefined;
    const settling = controller.settle().then((cart) => {
      settled = cart;
    });
    await flush();

    expect(updateCalls(mock)).toHaveLength(1);
    expect(addCalls(mock)).toHaveLength(1);
    expect(settled).toBeUndefined();

    resolveMutation(
      mock,
      0,
      ok(makeCart([makeLine("line-1", "variant-1", 3, "10.00")]))
    );
    resolveMutation(
      mock,
      1,
      ok(
        makeCart([
          makeLine("line-1", "variant-1", 3, "10.00"),
          makeLine("line-2", "variant-2", 1, "10.00"),
        ])
      )
    );
    await flush();
    await settling;

    expect(settled?.totalQuantity).toBe(4);
    expect(controller.getSnapshot().hasPendingAdds).toBe(false);
    controller.dispose();
  });
});
