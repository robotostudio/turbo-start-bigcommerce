import { fold } from "@/lib/cart/engine";
import {
  CART_CONFLICT_KEY,
  isSyntheticLineId,
  variantIdFromSyntheticLineId,
} from "@/lib/cart/intents";
import type {
  CartActionResult,
  CartError,
  CartIntent,
  CartSnapshot,
  CartWarning,
  LineMetadata,
} from "@/lib/cart/types";
import type { Cart, CartLineInput } from "@/lib/shopify/types";

export type ExpectedTotal = { merchandiseId: string; quantity: number };

export type CartActions = {
  getCart(): Promise<Cart | null>;
  addLines(
    lines: CartLineInput[],
    expectedTotals?: ExpectedTotal[]
  ): Promise<CartActionResult>;
  updateLine(
    lineId: string,
    quantity: number,
    merchandiseId?: string
  ): Promise<CartActionResult>;
  removeLine(lineId: string): Promise<CartActionResult>;
};

export type CartControllerOptions = {
  updateDebounceMs?: number;
  addDebounceMs?: number;
};

export type AddLineResult = { ok: boolean; warnings: CartWarning[] };

type AddIntent = Extract<CartIntent, { kind: "add" }>;
type UpdateIntent = Extract<CartIntent, { kind: "update" }>;

type Timer = ReturnType<typeof setTimeout>;

type UpdateState = {
  intent: UpdateIntent;
  timer: Timer | null;
  lastSent: number | null;
};

type AddState = {
  intent: AddIntent;
  timer: Timer | null;
  resolvers: Array<(result: AddLineResult) => void>;
};

export const MAX_LINE_QUANTITY = 99;

const EMPTY_SNAPSHOT: CartSnapshot = {
  cart: null,
  cartWithPending: null,
  isMutating: false,
  isCreatingCart: false,
  hasPendingAdds: false,
  pendingQuantity: 0,
  error: null,
  warnings: [],
};

export class CartController {
  private readonly actions: CartActions;
  private readonly updateDebounceMs: number;
  private readonly addDebounceMs: number;

  private serverTruth: Cart | null = null;
  private intents: CartIntent[] = [];
  private snapshot: CartSnapshot = EMPTY_SNAPSHOT;

  private nextSeq = 1;
  private lastAcceptedSeq = 0;
  private seeded = false;

  private inFlight = 0;
  private creating = false;
  private creationQueued = false;

  private error: CartError | null = null;
  private warnings: CartWarning[] = [];

  private readonly chains = new Map<string, Promise<void>>();
  private readonly updateStates = new Map<string, UpdateState>();
  private readonly addStates = new Map<string, AddState>();
  private readonly listeners = new Set<() => void>();

  constructor(actions: CartActions, opts?: CartControllerOptions) {
    this.actions = actions;
    this.updateDebounceMs = opts?.updateDebounceMs ?? 400;
    this.addDebounceMs = opts?.addDebounceMs ?? 300;
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = (): CartSnapshot => this.snapshot;

  seed(cart: Cart | null): void {
    if (this.seeded || this.lastAcceptedSeq > 0) return;
    this.seeded = true;
    this.serverTruth = cart;
    this.refold();
  }

  addLine(
    variantId: string,
    quantity: number,
    metadata: LineMetadata
  ): Promise<AddLineResult> {
    this.error = null;
    let state = this.addStates.get(variantId);
    if (state) {
      state.intent.quantity = Math.min(
        MAX_LINE_QUANTITY,
        state.intent.quantity + quantity
      );
      if (state.timer) clearTimeout(state.timer);
    } else {
      const intent: AddIntent = {
        kind: "add",
        variantId,
        quantity: Math.min(MAX_LINE_QUANTITY, quantity),
        metadata,
      };
      state = { intent, timer: null, resolvers: [] };
      this.addStates.set(variantId, state);
      this.intents.push(intent);
    }
    const settled = state;
    const promise = new Promise<AddLineResult>((resolve) => {
      settled.resolvers.push(resolve);
    });
    settled.timer = setTimeout(() => {
      settled.timer = null;
      this.flushAdd(variantId);
    }, this.addDebounceMs);
    this.refold();
    return promise;
  }

  updateLine(lineId: string, quantity: number): void {
    this.error = null;
    if (isSyntheticLineId(lineId)) {
      this.updateSyntheticLine(lineId, quantity);
      return;
    }
    const state = this.updateStates.get(lineId);
    if (state) {
      state.intent.quantity = quantity;
      this.refold();
      this.armUpdateTimer(lineId);
      return;
    }
    const intent: UpdateIntent = { kind: "update", lineId, quantity };
    this.updateStates.set(lineId, { intent, timer: null, lastSent: null });
    this.intents.push(intent);
    this.refold();
    this.sendUpdate(lineId);
    this.armUpdateTimer(lineId);
  }

  swapLineVariant(
    lineId: string,
    merchandiseId: string,
    quantity: number,
    metadata?: Partial<LineMetadata>
  ): void {
    this.error = null;
    if (isSyntheticLineId(lineId)) return;
    this.cancelLineIntents(lineId);
    const intent: CartIntent = {
      kind: "swap",
      lineId,
      merchandiseId,
      quantity,
      metadata,
    };
    this.intents.push(intent);
    this.refold();
    this.enqueue(`line:${lineId}`, async () => {
      const seq = this.nextSeq++;
      this.inFlight++;
      this.refold();
      const result = await this.callWithRetry(() =>
        this.actions.updateLine(lineId, quantity, merchandiseId)
      );
      this.inFlight--;
      this.removeIntent(intent);
      if (result.ok) {
        this.acceptCart(result.cart, seq);
        this.pushWarnings(result.warnings);
      } else {
        this.setFailure("swap", lineId, result.error);
      }
      this.refold();
    });
  }

  removeLine(lineId: string): void {
    this.error = null;
    if (isSyntheticLineId(lineId)) {
      this.cancelSyntheticAdd(lineId);
      return;
    }
    this.cancelLineIntents(lineId);
    const intent: CartIntent = { kind: "remove", lineId };
    this.intents.push(intent);
    this.refold();
    this.enqueue(`line:${lineId}`, async () => {
      const seq = this.nextSeq++;
      this.inFlight++;
      this.refold();
      const result = await this.callWithRetry(() =>
        this.actions.removeLine(lineId)
      );
      this.inFlight--;
      this.removeIntent(intent);
      if (result.ok) {
        this.acceptCart(result.cart, seq);
        this.pushWarnings(result.warnings);
      } else {
        this.setFailure("remove", lineId, result.error);
      }
      this.refold();
    });
  }

  refetch(): void {
    this.enqueue(CART_CONFLICT_KEY, async () => {
      const seq = this.nextSeq++;
      try {
        const cart = await this.actions.getCart();
        this.acceptCart(cart, seq);
        this.refold();
      } catch {
        // keep current truth on failed refetch
      }
    });
  }

  clearError(): void {
    if (!this.error) return;
    this.error = null;
    this.refold();
  }

  clearWarnings(): void {
    if (this.warnings.length === 0) return;
    this.warnings = [];
    this.refold();
  }

  dispose(): void {
    for (const state of this.updateStates.values()) {
      if (state.timer) clearTimeout(state.timer);
    }
    for (const state of this.addStates.values()) {
      if (state.timer) clearTimeout(state.timer);
    }
    this.updateStates.clear();
    this.addStates.clear();
  }

  private updateSyntheticLine(lineId: string, quantity: number): void {
    if (quantity <= 0) {
      this.cancelSyntheticAdd(lineId);
      return;
    }
    const variantId = variantIdFromSyntheticLineId(lineId);
    const state = this.addStates.get(variantId);
    if (!state) return;
    state.intent.quantity = Math.min(MAX_LINE_QUANTITY, quantity);
    this.refold();
  }

  private cancelSyntheticAdd(lineId: string): void {
    const variantId = variantIdFromSyntheticLineId(lineId);
    const state = this.addStates.get(variantId);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    this.addStates.delete(variantId);
    this.removeIntent(state.intent);
    for (const resolve of state.resolvers) {
      resolve({ ok: true, warnings: [] });
    }
    this.refold();
  }

  private armUpdateTimer(lineId: string): void {
    const state = this.updateStates.get(lineId);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = null;
      if (state.intent.quantity !== state.lastSent) {
        this.sendUpdate(lineId);
      }
    }, this.updateDebounceMs);
  }

  private sendUpdate(lineId: string): void {
    const state = this.updateStates.get(lineId);
    if (!state) return;
    const target = state.intent.quantity;
    state.lastSent = target;
    this.enqueue(`line:${lineId}`, async () => {
      if (this.updateStates.get(lineId) !== state) return;
      const seq = this.nextSeq++;
      this.inFlight++;
      this.refold();
      const result = await this.callWithRetry(() =>
        this.actions.updateLine(lineId, target)
      );
      this.inFlight--;
      if (result.ok) {
        this.acceptCart(result.cart, seq);
        this.pushWarnings(result.warnings);
        const current = this.updateStates.get(lineId);
        if (current && current.intent.quantity === target) {
          this.clearUpdateState(lineId);
        }
      } else {
        this.clearUpdateState(lineId);
        this.setFailure("update", lineId, result.error);
      }
      this.refold();
    });
  }

  private flushUpdateDebounces(): void {
    for (const [lineId, state] of this.updateStates) {
      if (!state.timer) continue;
      clearTimeout(state.timer);
      state.timer = null;
      if (state.intent.quantity !== state.lastSent) {
        this.sendUpdate(lineId);
      }
    }
  }

  /**
   * Flushes every pending debounce and waits for all in-flight mutations to
   * drain, then resolves with the confirmed cart. Lets checkout defer until
   * the cart is settled instead of disabling while adds are pending.
   */
  async settle(): Promise<Cart | null> {
    this.flushUpdateDebounces();
    for (const variantId of Array.from(this.addStates.keys())) {
      this.flushAdd(variantId);
    }
    while (this.chains.size > 0) {
      await Promise.all(Array.from(this.chains.values()));
    }
    return this.getSnapshot().cart;
  }

  private expectedTotalFor(variantId: string, delta: number): ExpectedTotal {
    const serverLine = this.serverTruth?.lines.edges.find(
      (edge) => edge.node.merchandise.id === variantId
    )?.node;
    return {
      merchandiseId: variantId,
      quantity: (serverLine?.quantity ?? 0) + delta,
    };
  }

  private flushAdd(variantId: string): void {
    this.flushUpdateDebounces();
    if (this.serverTruth === null) {
      this.flushAddsOnCartKey();
      return;
    }
    const state = this.addStates.get(variantId);
    if (!state) return;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    this.addStates.delete(variantId);
    const { intent, resolvers } = state;
    this.enqueue(`add:${variantId}`, async () => {
      const seq = this.nextSeq++;
      this.inFlight++;
      this.refold();
      const result = await this.callWithRetry(() =>
        this.actions.addLines(
          [{ merchandiseId: variantId, quantity: intent.quantity }],
          [this.expectedTotalFor(variantId, intent.quantity)]
        )
      );
      this.inFlight--;
      this.removeIntent(intent);
      this.settleAddResult(result, seq, [resolvers]);
      this.refold();
    });
  }

  private flushAddsOnCartKey(): void {
    if (this.creationQueued) return;
    this.creationQueued = true;
    this.enqueue(CART_CONFLICT_KEY, async () => {
      this.creationQueued = false;
      const gathered: AddState[] = [];
      for (const [variantId, state] of this.addStates) {
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        this.addStates.delete(variantId);
        gathered.push(state);
      }
      if (gathered.length === 0) return;
      const lines = gathered.map((state) => ({
        merchandiseId: state.intent.variantId,
        quantity: state.intent.quantity,
      }));
      const seq = this.nextSeq++;
      this.creating = this.serverTruth === null;
      this.inFlight++;
      this.refold();
      const result = await this.callWithRetry(() =>
        this.actions.addLines(
          lines,
          lines.map((line) =>
            this.expectedTotalFor(line.merchandiseId, line.quantity)
          )
        )
      );
      this.inFlight--;
      this.creating = false;
      for (const state of gathered) {
        this.removeIntent(state.intent);
      }
      this.settleAddResult(
        result,
        seq,
        gathered.map((state) => state.resolvers)
      );
      this.refold();
    });
  }

  private settleAddResult(
    result: CartActionResult,
    seq: number,
    resolverGroups: Array<Array<(r: AddLineResult) => void>>
  ): void {
    if (result.ok) {
      this.acceptCart(result.cart, seq);
      this.pushWarnings(result.warnings);
      for (const resolvers of resolverGroups) {
        for (const resolve of resolvers) {
          resolve({ ok: true, warnings: result.warnings });
        }
      }
      return;
    }
    this.setFailure("add", undefined, result.error);
    for (const resolvers of resolverGroups) {
      for (const resolve of resolvers) {
        resolve({ ok: false, warnings: [] });
      }
    }
  }

  private cancelLineIntents(lineId: string): void {
    const state = this.updateStates.get(lineId);
    if (state) {
      if (state.timer) clearTimeout(state.timer);
      this.updateStates.delete(lineId);
    }
    this.intents = this.intents.filter(
      (intent) =>
        !(
          (intent.kind === "update" || intent.kind === "swap") &&
          intent.lineId === lineId
        )
    );
  }

  private clearUpdateState(lineId: string): void {
    const state = this.updateStates.get(lineId);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    this.updateStates.delete(lineId);
    this.removeIntent(state.intent);
  }

  private removeIntent(intent: CartIntent): void {
    this.intents = this.intents.filter((candidate) => candidate !== intent);
  }

  private acceptCart(cart: Cart | null, seq: number): void {
    if (seq <= this.lastAcceptedSeq) return;
    this.lastAcceptedSeq = seq;
    this.serverTruth = cart;
    this.reap();
  }

  private reap(): void {
    const validIds = new Set(
      this.serverTruth?.lines.edges.map((edge) => edge.node.id) ?? []
    );
    this.intents = this.intents.filter((intent) => {
      if (intent.kind === "add") return true;
      return validIds.has(intent.lineId);
    });
    for (const [lineId, state] of this.updateStates) {
      if (validIds.has(lineId)) continue;
      if (state.timer) clearTimeout(state.timer);
      this.updateStates.delete(lineId);
    }
  }

  private setFailure(
    intentKind: CartIntent["kind"],
    lineId: string | undefined,
    error: { code: CartError["code"]; message: string }
  ): void {
    this.error = {
      intentKind,
      lineId,
      code: error.code,
      message: error.message,
      retryable: error.code === "NETWORK",
    };
    if (error.code === "CART_NOT_FOUND" || error.code === "CART_COMPLETED") {
      this.serverTruth = null;
      this.lastAcceptedSeq = this.nextSeq++;
      this.reap();
    }
  }

  private async callWithRetry(
    fn: () => Promise<CartActionResult>
  ): Promise<CartActionResult> {
    const first = await this.attempt(fn);
    if (!first.ok && first.error.code === "NETWORK") {
      return this.attempt(fn);
    }
    return first;
  }

  private async attempt(
    fn: () => Promise<CartActionResult>
  ): Promise<CartActionResult> {
    try {
      return await fn();
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "NETWORK",
          message: error instanceof Error ? error.message : "Network error",
        },
      };
    }
  }

  private pushWarnings(warnings: CartWarning[]): void {
    if (warnings.length === 0) return;
    this.warnings = [...this.warnings, ...warnings];
  }

  private enqueue(key: string, task: () => Promise<void>): Promise<void> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(task)
      .catch(() => {});
    this.chains.set(key, next);
    next.finally(() => {
      if (this.chains.get(key) === next) {
        this.chains.delete(key);
      }
    });
    return next;
  }

  private refold(): void {
    const confirmedIntents = this.intents.filter(
      (intent) => intent.kind !== "add"
    );
    const cart = fold(this.serverTruth, confirmedIntents);
    const cartWithPending = fold(this.serverTruth, this.intents);
    this.snapshot = {
      cart,
      cartWithPending,
      isMutating: this.inFlight > 0,
      isCreatingCart: this.creating,
      hasPendingAdds:
        this.addStates.size > 0 ||
        this.intents.some((intent) => intent.kind === "add"),
      pendingQuantity: cartWithPending?.totalQuantity ?? 0,
      error: this.error,
      warnings: this.warnings,
    };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
