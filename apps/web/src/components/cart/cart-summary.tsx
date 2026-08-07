"use client";

import NumberFlow from "@number-flow/react";

import { AnimatedMoney } from "@/components/elements/animated-money";
import type { Cart } from "@/lib/shopify/types";

export function CartSummary({ cart }: { cart: Cart }) {
  const itemLabel = cart.totalQuantity === 1 ? "Item" : "Items";
  const total = cart.cost.totalAmount ?? cart.cost.subtotalAmount;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-border border-t pt-4 pb-2">
        <span className="text-foreground text-sm">
          Subtotal [ <NumberFlow value={cart.totalQuantity} /> {itemLabel} ]
        </span>
        <span className="p-1 font-medium text-foreground text-sm tabular-nums">
          <AnimatedMoney money={cart.cost.subtotalAmount} />
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-foreground text-sm">Delivery</span>
        <span className="p-1 font-medium text-foreground text-sm">FREE</span>
      </div>
      <div className="flex items-center justify-between py-4">
        <span className="text-foreground text-sm">Total incl. Taxes</span>
        <span className="bg-muted p-1 font-medium text-foreground text-sm tabular-nums">
          <AnimatedMoney money={total} />
        </span>
      </div>
    </div>
  );
}
