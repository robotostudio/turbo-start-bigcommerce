import type { QueryHomePageDataResult } from "@workspace/sanity/types";

export type PageBuilderBlock = NonNullable<
  NonNullable<QueryHomePageDataResult>["pageBuilder"]
>[number];

/** Blocks stay `unknown`: only their `_key` order is ever read. */
export type OptimisticDocument = {
  pageBuilder?: unknown;
};

export type OptimisticAction = {
  id?: string;
  document?: OptimisticDocument | null;
};

/**
 * Reorders the already-resolved blocks to match the raw document's `_key`
 * sequence. Keys with no resolved block (a just-inserted one) are dropped until
 * revalidation projects them.
 */
function reorderByRawKeys(
  currentBlocks: PageBuilderBlock[],
  rawBlocks: readonly unknown[]
): PageBuilderBlock[] {
  const resolved = new Map(currentBlocks.map((block) => [block._key, block]));
  const reordered: PageBuilderBlock[] = [];

  for (const raw of rawBlocks) {
    const key = (raw as { _key?: string } | null)?._key;
    const block = key ? resolved.get(key) : undefined;
    if (block) {
      reordered.push(block);
    }
  }

  return reordered;
}

/**
 * Applies the mutation as a pure reorder. The action carries the raw document —
 * images as `asset._ref`, references as `_ref` strings — so returning it
 * wholesale strips every field GROQ derived, which is what left images, video
 * and reference-driven sections broken after a shift-drag in Presentation.
 */
export function applyOptimisticPageBuilder(
  currentBlocks: PageBuilderBlock[],
  action: OptimisticAction,
  documentId: string
): PageBuilderBlock[] {
  if (action.id !== documentId) {
    return currentBlocks;
  }

  // Sanity unsets an emptied array, so an absent `pageBuilder` means every
  // block was deleted. A truthy non-array is malformed — keep what we have
  // rather than throwing out of `for...of` mid-render.
  const rawBlocks = action.document?.pageBuilder ?? [];
  if (!Array.isArray(rawBlocks)) {
    return currentBlocks;
  }

  const reordered = reorderByRawKeys(currentBlocks, rawBlocks);

  // Nothing resolved against a non-empty array means every `_key` is new at
  // once (the whole array was replaced). Keep rendering what we have rather
  // than blanking the page until revalidation.
  if (!reordered.length && rawBlocks.length) {
    return currentBlocks;
  }

  // Editing any field replays this reducer with an unchanged key order.
  // Returning a fresh array there would reconcile every section, so hand back
  // the same reference when nothing actually moved.
  const unchanged =
    reordered.length === currentBlocks.length &&
    reordered.every((block, index) => block === currentBlocks[index]);

  return unchanged ? currentBlocks : reordered;
}
