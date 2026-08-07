"use client";

import NumberFlow from "@number-flow/react";
import { cn } from "@workspace/ui/lib/utils";

import { BookmarkIcon } from "../icons";
import { useSavedItems } from "./saved-items-context";

type SavedItemsToggleProps = {
  variant?: "icon" | "text";
};

export function SavedItemsToggle({ variant = "icon" }: SavedItemsToggleProps) {
  const { count, openSaved } = useSavedItems();

  if (variant === "text") {
    return (
      <button
        aria-label={`Wishlist${count > 0 ? ` (${count} items)` : ""}`}
        className="text-foreground font-medium text-sm transition-colors hover:text-foreground/70"
        onClick={openSaved}
        type="button"
      >
        Wishlist{count > 0 && ` (${count > 99 ? "99+" : count})`}
      </button>
    );
  }

  return (
    <button
      aria-label={`Saved items${count > 0 ? ` (${count} items)` : ""}`}
      className="relative inline-flex items-center justify-center transition-colors hover:text-foreground"
      onClick={openSaved}
      type="button"
    >
      <BookmarkIcon className="size-5" />
      {/* Mirrors CartToggle's badge exactly — same offset, size, type scale and
       * scale/fade. Always mounted rather than gated on `count > 0`, so going
       * from 0 to 1 animates instead of popping, and NumberFlow can roll the
       * digits on every subsequent change. */}
      <span
        aria-hidden
        className={cn(
          "-top-2 -right-2 absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground leading-none tabular-nums",
          "transition-[opacity,scale] duration-300 ease-out motion-reduce:transition-none",
          count > 0 ? "scale-100 opacity-100" : "scale-50 opacity-0"
        )}
      >
        <NumberFlow
          suffix={count > 99 ? "+" : undefined}
          value={Math.min(count, 99)}
        />
      </span>
    </button>
  );
}
