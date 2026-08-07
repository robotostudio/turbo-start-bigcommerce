"use client";

import NumberFlow from "@number-flow/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { Check, ChevronDown } from "lucide-react";

export type VariantOption = {
  value: string;
  available: boolean;
  hex?: string | null;
};

/** Numeric values (Qty, numeric sizes) tween via NumberFlow; text stays static. */
function SelectedValue({ value }: { value: string }) {
  if (/^\d+$/.test(value)) {
    return (
      <span className="tabular-nums">
        <NumberFlow value={Number(value)} />
      </span>
    );
  }
  return value;
}

/** A 16×8 color rectangle with an optional selected underline. */
function Swatch({
  hex,
  selected,
}: {
  hex?: string | null;
  selected?: boolean;
}) {
  return (
    <span className="flex shrink-0 flex-col items-start gap-0.5">
      <span
        className={cn("block h-2 w-4", !hex && "border border-border bg-muted")}
        style={hex ? { backgroundColor: hex } : undefined}
      />
      {selected && <span className="block h-px w-4 bg-zinc-400" />}
    </span>
  );
}

/**
 * A single Color/Size selector for a cart line, rendered as a dropdown. The
 * label ("Color:" / "Size:") sits inline before the trigger. Unavailable
 * values are shown disabled so a swap is never fired for an out-of-stock
 * variant. Falls back to static text when there is only one value.
 */
export function CartLineVariantSelect({
  label,
  type,
  options,
  value,
  onSelect,
  disabled,
}: {
  label: string;
  type: "color" | "size" | "default";
  options: VariantOption[];
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  const selected = options.find((option) => option.value === value);
  const isSingle = options.length <= 1;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-foreground">{label}:</span>
      {isSingle ? (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {type === "color" && <Swatch hex={selected?.hex} selected />}
          <SelectedValue value={value} />
        </span>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1 text-muted-foreground outline-none transition-opacity hover:opacity-70 disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
          >
            {type === "color" && <Swatch hex={selected?.hex} selected />}
            <SelectedValue value={value} />
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            {options.map((option) => (
              <DropdownMenuItem
                className={cn("gap-2", !option.available && "line-through")}
                disabled={!option.available || option.value === value}
                key={option.value}
                onSelect={() => onSelect(option.value)}
              >
                {type === "color" && <Swatch hex={option.hex} />}
                <span className="flex-1">{option.value}</span>
                {option.value === value && <Check className="size-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
