import type { Cart, CartLineInput, CartWarning } from "@/lib/cart/types";

/**
 * Silent-clamp detection: BigCommerce reports no warnings on cart writes, so
 * the only way to notice a clamped quantity or a dropped line is to compare
 * what was requested against the cart that came back. Error classification
 * itself lives in `lib/bigcommerce/classify.ts`.
 */

export type RequestedLine = {
  key: "lineId" | "merchandiseId";
  id: string;
  quantity: number;
  exact: boolean;
};

export type ExpectedTotal = { merchandiseId: string; quantity: number };

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
