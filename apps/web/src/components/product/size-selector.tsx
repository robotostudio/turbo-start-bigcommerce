"use client";

import { cn } from "@workspace/ui/lib/utils";

type SizeSelectorProps = {
  values: string[];
  selectedValue: string;
  availability: Record<string, boolean>;
  onSelect: (value: string) => void;
};

export function SizeSelector({
  values,
  selectedValue,
  availability,
  onSelect,
}: SizeSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {values.map((value) => {
        const isAvailable = availability[value] !== false;
        const isSelected = selectedValue === value;

        return (
          <button
            className={cn(
              "border-b px-1 pb-0.5 text-xs tracking-wide",
              "transition-[color,border-color,transform,opacity] duration-150 ease-hover",
              // Press feedback only on available sizes — `active:opacity-70`
              // would otherwise brighten a dimmed-out one on press.
              isAvailable && "active:scale-95 active:opacity-70",
              // Pills are ~20x18px. Grow the hit area to ~36x44 without
              // touching layout; -inset-x-2 exactly consumes the gap-2 between
              // pills, so adjacent targets touch but never overlap.
              "relative before:absolute before:-inset-x-2 before:-inset-y-[13px] before:content-['']",
              isSelected
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
              !isAvailable && "opacity-40 line-through"
            )}
            key={value}
            onClick={() => onSelect(value)}
            type="button"
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
