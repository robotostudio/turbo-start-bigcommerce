"use client";

import { useState } from "react";

import type { LineMetadata } from "@/lib/cart/types";
import { AddToCart } from "./add-to-cart";
import { QuantitySelector } from "./quantity-selector";

type ProductPurchaseProps = {
  variantId: string;
  availableForSale: boolean;
  optionsSelected: boolean;
  quantityAvailable: number | null;
  metadata: LineMetadata;
};

/**
 * Add-to-cart row: quantity stepper + button sharing a single quantity state.
 * The stepper is hidden until options are selected and the variant is buyable
 * (mirrors the button's own gating).
 */
export function ProductPurchase({
  variantId,
  availableForSale,
  optionsSelected,
  quantityAvailable,
  metadata,
}: ProductPurchaseProps) {
  const [quantity, setQuantity] = useState(1);

  const showStepper = availableForSale && optionsSelected;

  return (
    <div className="flex max-w-sm items-stretch gap-2">
      {/* Soften the stepper's arrival: opacity + scale from 0.95 (never 0).
       * The CTA's width still reflows in one frame — that's a layout change and
       * no motion makes it free. Reserving the slot permanently was worse: it
       * left a hole beside the full-width "Sold Out" / "Select Options" CTA. */}
      {showStepper && (
        <div className="fade-in-0 zoom-in-95 animate-in duration-200 ease-out-quint">
          <QuantitySelector
            max={quantityAvailable}
            onChange={setQuantity}
            value={quantity}
          />
        </div>
      )}
      <div className="flex-1">
        <AddToCart
          availableForSale={availableForSale}
          key={variantId}
          metadata={metadata}
          optionsSelected={optionsSelected}
          quantity={quantity}
          variantId={variantId}
        />
      </div>
    </div>
  );
}
