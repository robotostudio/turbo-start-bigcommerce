import type { StorefrontFailureKind } from "@/lib/shopify/client";
import type {
  Cart,
  CartLineInput,
  ShopifyCartUserError,
  ShopifyCartWarning,
} from "@/lib/shopify/types";
import type { CartErrorCode, CartWarning } from "./types";

const CART_GONE_PATTERN =
  /cart\s+(?:does\s?n.t\s+exist|not\s+found|could\s+not\s+be\s+found)/i;
const CART_COMPLETED_PATTERN = /cart.{0,40}(?:complete|purchased)/i;

const VARIANT_UNAVAILABLE_CODES = new Set([
  "MERCHANDISE_NOT_FOUND",
  "MERCHANDISE_OUT_OF_STOCK",
  "PRODUCT_NOT_AVAILABLE",
  "INVALID_MERCHANDISE_LINE",
]);

const CLAMP_WARNING_CODES = new Set([
  "MERCHANDISE_NOT_ENOUGH_STOCK",
  "MERCHANDISE_OUT_OF_STOCK",
]);

export type RequestedLine = {
  key: "lineId" | "merchandiseId";
  id: string;
  quantity: number;
  exact: boolean;
};

export type ExpectedTotal = { merchandiseId: string; quantity: number };

export function classifyTransportError(
  error: string,
  kind: StorefrontFailureKind
): { code: CartErrorCode; message: string } {
  if (kind === "network") return { code: "NETWORK", message: error };
  if (CART_GONE_PATTERN.test(error)) {
    return { code: "CART_NOT_FOUND", message: error };
  }
  return { code: "UNKNOWN", message: error };
}

export function classifyUserErrors(
  userErrors: ShopifyCartUserError[]
): { code: CartErrorCode; message: string } | null {
  const first = userErrors[0];
  if (!first) return null;
  if (CART_GONE_PATTERN.test(first.message)) {
    return { code: "CART_NOT_FOUND", message: first.message };
  }
  if (CART_COMPLETED_PATTERN.test(first.message)) {
    return { code: "CART_COMPLETED", message: first.message };
  }
  if (first.code && VARIANT_UNAVAILABLE_CODES.has(first.code)) {
    return { code: "VARIANT_UNAVAILABLE", message: first.message };
  }
  return { code: "SHOPIFY_USER_ERROR", message: first.message };
}

export function mapShopifyWarning(warning: ShopifyCartWarning): CartWarning {
  return {
    code: CLAMP_WARNING_CODES.has(warning.code) ? "QUANTITY_CLAMPED" : "OTHER",
    lineId: warning.target ?? undefined,
    message: warning.message,
  };
}

/**
 * Adds can merge into an existing line, so the response quantity is the line
 * total, not the requested delta. Callers supply the expected post-merge total
 * per merchandise id where known; otherwise the delta is a lower bound.
 */
export function requestedFromInputs(
  lines: CartLineInput[],
  expectedTotals?: ExpectedTotal[]
): RequestedLine[] {
  const expected = new Map(
    (expectedTotals ?? [])
      .filter((t) => Number.isInteger(t.quantity) && t.quantity > 0)
      .map((t) => [t.merchandiseId, t.quantity])
  );
  return lines.map((line) => ({
    key: "merchandiseId" as const,
    id: line.merchandiseId,
    quantity: expected.get(line.merchandiseId) ?? line.quantity,
    exact: false,
  }));
}

function silentClampWarning(
  cart: Cart,
  request: RequestedLine
): CartWarning | null {
  const line = cart.lines.edges.find((edge) =>
    request.key === "lineId"
      ? edge.node.id === request.id
      : edge.node.merchandise.id === request.id
  )?.node;
  if (!line) {
    return {
      code: "LINE_DROPPED",
      lineId: request.key === "lineId" ? request.id : undefined,
      message: "An item is no longer available and was removed.",
    };
  }
  const clamped = request.exact
    ? line.quantity !== request.quantity
    : line.quantity < request.quantity;
  if (!clamped) return null;
  return {
    code: "QUANTITY_CLAMPED",
    lineId: line.id,
    message: `Only ${line.quantity} available — quantity adjusted.`,
  };
}

export function detectSilentClamps(
  cart: Cart,
  requested: RequestedLine[],
  existing: CartWarning[]
): CartWarning[] {
  const seen = new Set(existing.map((w) => `${w.code}:${w.lineId ?? ""}`));
  const extra: CartWarning[] = [];
  for (const request of requested) {
    const warning = silentClampWarning(cart, request);
    if (!warning) continue;
    const key = `${warning.code}:${warning.lineId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push(warning);
  }
  return extra;
}
