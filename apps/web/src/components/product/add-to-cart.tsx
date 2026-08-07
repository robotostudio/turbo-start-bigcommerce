"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

import { useCartActions } from "@/components/cart/cart-context";
import type { LineMetadata } from "@/lib/cart/types";

type AddToCartProps = {
  variantId: string;
  availableForSale: boolean;
  metadata: LineMetadata;
  optionsSelected?: boolean;
  quantity?: number;
};

export function AddToCart({
  variantId,
  availableForSale,
  metadata,
  optionsSelected = true,
  quantity = 1,
}: AddToCartProps) {
  const { addLine, openCart } = useCartActions();

  const disabled = !(availableForSale && optionsSelected);
  const label = availableForSale
    ? optionsSelected
      ? "Add to cart"
      : "Select Options"
    : "Sold Out";

  // One node across all three states, not three separate returns: swapping the
  // whole element out kills any transition on the enabled/disabled change and
  // resets focus. The label is now the only hard cut.
  return (
    <Button
      className={cn(
        "h-9 w-full rounded-none text-base",
        "transition-[background-color,color,transform] duration-150 ease-out-quint",
        disabled
          ? "uppercase"
          : cn(
              "border-none bg-zinc-900 text-zinc-100 tracking-wide hover:bg-zinc-800 hover:text-white",
              "dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:hover:text-zinc-900",
              // 0.985, not the usual 0.97: this button is ~380px wide, so 1.5%
              // is already ~6px of edge travel — felt, not seen.
              "active:scale-[0.985]"
            )
      )}
      disabled={disabled}
      // iOS Safari doesn't fire :active without a touch listener on the element.
      onClick={
        disabled
          ? undefined
          : () => {
              openCart();
              void addLine(variantId, quantity, metadata);
            }
      }
      onTouchStart={() => {
        // Intentionally empty — presence of the handler is what enables :active.
      }}
      variant="default"
    >
      {label}
    </Button>
  );
}
