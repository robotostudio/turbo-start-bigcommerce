"use client";

import NumberFlow from "@number-flow/react";
import { cn } from "@workspace/ui/lib/utils";
import { Minus, Plus } from "lucide-react";

const MAX_QUANTITY = 99;

type QuantitySelectorProps = {
  value: number;
  onChange: (value: number) => void;
  /** Upper bound (e.g. available inventory). Always capped at 99. */
  max?: number | null;
  disabled?: boolean;
};

export function QuantitySelector({
  value,
  onChange,
  max,
  disabled,
}: QuantitySelectorProps) {
  const effectiveMax = Math.min(max ?? MAX_QUANTITY, MAX_QUANTITY);
  const canDecrement = !disabled && value > 1;
  const canIncrement = !disabled && value < effectiveMax;

  // The icon is only 16px, so `scale-0.97` would be sub-pixel — press feedback
  // is dialled up here for the same reason it's dialled down on the wide CTA.
  // The `::before` grows the hit area to a full 44px without touching layout;
  // the two steppers' centres sit ~56px apart, so the boxes never overlap.
  const stepButton = cn(
    "relative flex items-center justify-center",
    "before:absolute before:top-1/2 before:left-1/2 before:size-11",
    "before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
    "text-muted-foreground transition-[color,transform] duration-150 ease-out-quint",
    "hover:text-foreground active:scale-90",
    "disabled:pointer-events-none disabled:opacity-40"
  );

  return (
    <div className="flex h-9 items-center gap-4 border border-border px-2">
      <button
        aria-label="Decrease quantity"
        className={stepButton}
        disabled={!canDecrement}
        onClick={() => onChange(value - 1)}
        type="button"
      >
        <Minus className="size-4" />
      </button>
      <span
        aria-live="polite"
        className="min-w-4 text-center text-base tabular-nums"
      >
        <NumberFlow value={value} />
      </span>
      <button
        aria-label="Increase quantity"
        className={stepButton}
        disabled={!canIncrement}
        onClick={() => onChange(value + 1)}
        type="button"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
