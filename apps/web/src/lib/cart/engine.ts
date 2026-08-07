import { syntheticLineId } from "@/lib/cart/intents";
import { addMoney, multiplyMoney, zeroMoney } from "@/lib/cart/money";
import type { CartIntent, LineMetadata } from "@/lib/cart/types";
import type { Cart, CartLine } from "@/lib/shopify/types";

export function recalcTotals(
  lines: readonly CartLine[],
  fallbackCurrencyCode = "USD"
): Cart["cost"] {
  const currency =
    lines[0]?.cost.totalAmount.currencyCode ?? fallbackCurrencyCode;
  const subtotalAmount = lines.reduce(
    (sum, line) => addMoney(sum, line.cost.totalAmount),
    zeroMoney(currency)
  );
  return {
    subtotalAmount,
    totalAmount: subtotalAmount,
    totalTaxAmount: null,
  };
}

function finalize(cart: Cart, edges: Cart["lines"]["edges"]): Cart {
  const lines = edges.map((e) => e.node);
  return {
    ...cart,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    lines: { ...cart.lines, edges },
    cost: recalcTotals(lines, cart.cost.subtotalAmount.currencyCode),
  };
}

function withQuantity(line: CartLine, quantity: number): CartLine {
  return {
    ...line,
    quantity,
    cost: {
      amountPerQuantity: line.cost.amountPerQuantity,
      totalAmount: multiplyMoney(line.cost.amountPerQuantity, quantity),
    },
  };
}

function syntheticLine(
  variantId: string,
  quantity: number,
  metadata: LineMetadata
): CartLine {
  return {
    id: syntheticLineId(variantId),
    quantity,
    merchandise: {
      id: variantId,
      title: metadata.variantTitle,
      image: metadata.image,
      product: {
        handle: metadata.productHandle,
        title: metadata.productTitle,
      },
      selectedOptions: metadata.selectedOptions,
      price: metadata.price,
    },
    cost: {
      amountPerQuantity: metadata.price,
      totalAmount: multiplyMoney(metadata.price, quantity),
    },
  };
}

function applyAdd(
  cart: Cart,
  variantId: string,
  quantity: number,
  metadata: LineMetadata
): Cart {
  const existing = cart.lines.edges.find(
    (e) => e.node.merchandise.id === variantId
  );
  const edges = existing
    ? cart.lines.edges.map((e) =>
        e.node.id === existing.node.id
          ? { node: withQuantity(e.node, e.node.quantity + quantity) }
          : e
      )
    : [
        ...cart.lines.edges,
        { node: syntheticLine(variantId, quantity, metadata) },
      ];
  return finalize(cart, edges);
}

function applyUpdate(cart: Cart, lineId: string, quantity: number): Cart {
  const edges = cart.lines.edges.map((e) =>
    e.node.id === lineId ? { node: withQuantity(e.node, quantity) } : e
  );
  return finalize(cart, edges);
}

function applySwap(
  cart: Cart,
  lineId: string,
  merchandiseId: string,
  quantity: number,
  metadata?: Partial<LineMetadata>
): Cart {
  const edges = cart.lines.edges.map((e) => {
    if (e.node.id !== lineId) return e;
    const price = metadata?.price ?? e.node.merchandise.price;
    const swapped: CartLine = {
      ...e.node,
      merchandise: {
        ...e.node.merchandise,
        id: merchandiseId,
        title: metadata?.variantTitle ?? e.node.merchandise.title,
        image: metadata?.image ?? e.node.merchandise.image,
        selectedOptions:
          metadata?.selectedOptions ?? e.node.merchandise.selectedOptions,
        price,
      },
      cost: {
        amountPerQuantity: price,
        totalAmount: multiplyMoney(price, quantity),
      },
      quantity,
    };
    return { node: swapped };
  });
  return finalize(cart, edges);
}

function applyRemove(cart: Cart, lineId: string): Cart {
  const edges = cart.lines.edges.filter((e) => e.node.id !== lineId);
  return finalize(cart, edges);
}

export function applyIntent(cart: Cart, intent: CartIntent): Cart {
  switch (intent.kind) {
    case "add":
      return applyAdd(cart, intent.variantId, intent.quantity, intent.metadata);
    case "update":
      return applyUpdate(cart, intent.lineId, intent.quantity);
    case "swap":
      return applySwap(
        cart,
        intent.lineId,
        intent.merchandiseId,
        intent.quantity,
        intent.metadata
      );
    case "remove":
      return applyRemove(cart, intent.lineId);
  }
}

function syntheticCartShell(currencyCode: string): Cart {
  return {
    id: "optimistic-cart",
    checkoutUrl: "",
    totalQuantity: 0,
    lines: {
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    cost: {
      totalAmount: zeroMoney(currencyCode),
      subtotalAmount: zeroMoney(currencyCode),
      totalTaxAmount: null,
    },
  };
}

export function fold(
  serverCart: Cart | null,
  intents: readonly CartIntent[]
): Cart | null {
  let cart = serverCart;
  if (!cart) {
    const firstAdd = intents.find((intent) => intent.kind === "add");
    if (!firstAdd) return null;
    cart = syntheticCartShell(firstAdd.metadata.price.currencyCode);
  }
  return intents.reduce(applyIntent, cart);
}

export function reverseCartLines(cart: Cart): Cart {
  return {
    ...cart,
    lines: { ...cart.lines, edges: [...cart.lines.edges].reverse() },
  };
}

export function normalizeCart(cart: Cart): Cart {
  return reverseCartLines(cart);
}
