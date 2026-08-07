import type { CartIntent, LineMetadata } from "@/lib/cart/types";

export const SYNTHETIC_LINE_PREFIX = "optimistic-";

export const CART_CONFLICT_KEY = "cart";

export function syntheticLineId(variantId: string): string {
  return `${SYNTHETIC_LINE_PREFIX}${variantId}`;
}

export function isSyntheticLineId(lineId: string): boolean {
  return lineId.startsWith(SYNTHETIC_LINE_PREFIX);
}

export function variantIdFromSyntheticLineId(lineId: string): string {
  return lineId.slice(SYNTHETIC_LINE_PREFIX.length);
}

export function conflictKeyFor(intent: CartIntent): string {
  if (intent.kind === "add") return `add:${intent.variantId}`;
  return `line:${intent.lineId}`;
}

export function addIntent(
  variantId: string,
  quantity: number,
  metadata: LineMetadata
): CartIntent {
  return { kind: "add", variantId, quantity, metadata };
}

export function updateIntent(lineId: string, quantity: number): CartIntent {
  return { kind: "update", lineId, quantity };
}

export function swapIntent(
  lineId: string,
  merchandiseId: string,
  quantity: number,
  metadata?: Partial<LineMetadata>
): CartIntent {
  return { kind: "swap", lineId, merchandiseId, quantity, metadata };
}

export function removeIntent(lineId: string): CartIntent {
  return { kind: "remove", lineId };
}
