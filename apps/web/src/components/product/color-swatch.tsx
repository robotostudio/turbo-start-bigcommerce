"use client";

import { cn } from "@workspace/ui/lib/utils";

import { getColorHex } from "@/lib/shopify/color";

type ColorSwatchProps = {
  values: string[];
  selectedValue: string;
  availability: Record<string, boolean>;
  onSelect: (value: string) => void;
};

export function ColorSwatch({
  values,
  selectedValue,
  availability,
  onSelect,
}: ColorSwatchProps) {
  return (
    <div className="flex flex-wrap items-start gap-0.5">
      {values.map((value) => {
        const hex = getColorHex(value);
        const isAvailable = availability[value] !== false;
        const isSelected = selectedValue === value;

        if (!hex) {
          // Fallback to text button if no matching color
          return (
            <button
              className={cn(
                "mr-1.5 border-b pb-1 text-sm transition-[color,border-color,transform] duration-150 ease-hover active:scale-95",
                isSelected
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
                !isAvailable && "opacity-40"
              )}
              key={value}
              onClick={() => onSelect(value)}
              title={value}
              type="button"
            >
              {value}
            </button>
          );
        }

        return (
          <button
            aria-label={value}
            aria-pressed={isSelected}
            className={cn(
              // Swatches sit at a 26px pitch (w-6 + gap-0.5), so a centred 44px
              // hitbox would overlap its neighbours by 18px and steal their
              // clicks. This gives a 26x44 target instead — full 44px on the
              // vertical axis, full pitch horizontally. Clears WCAG 2.2 Target
              // Size (Minimum) 24x24; a true 44x44 needs a wider pitch, which
              // is a design decision.
              "group relative flex cursor-pointer flex-col gap-0.5",
              "before:absolute before:-inset-x-px before:-inset-y-[15px] before:content-['']",
              !isAvailable && "opacity-40"
            )}
            key={value}
            onClick={() => onSelect(value)}
            title={value}
            type="button"
          >
            {/* 1-2% of a 24px swatch is half a pixel — invisible. A 1px lift is
             * transform-only and reads clearly at this size. */}
            <span
              className="block h-3 w-6 origin-center transition-transform duration-150 ease-out-quint group-hover:-translate-y-px group-active:scale-90"
              style={{ backgroundColor: hex }}
            />
            {/* Grow the rule from the centre rather than hard-flipping its
             * colour: transform-only, and 150ms in / 100ms out keeps the exit
             * shorter than the entry. */}
            <span
              className={cn(
                "block h-px w-full origin-center bg-foreground transition-[transform,opacity] ease-out-quint",
                isSelected
                  ? "scale-x-100 opacity-100 duration-150"
                  : "scale-x-0 opacity-0 duration-100"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
