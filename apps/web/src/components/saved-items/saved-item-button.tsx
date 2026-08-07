"use client";

import { cn } from "@workspace/ui/lib/utils";

import { BookmarkIcon } from "../icons";
import { useSavedItems } from "./saved-items-context";

type SavedItemButtonProps = {
  handle: string;
  className?: string;
};

export function SavedItemButton({ handle, className }: SavedItemButtonProps) {
  const { toggle, isInSavedItems } = useSavedItems();
  const isSaved = isInSavedItems(handle);

  return (
    <button
      aria-label={isSaved ? "Remove from saved items" : "Save for later"}
      aria-pressed={isSaved}
      className={cn(
        // Every transition this button needs is declared HERE, in one property
        // list. Do NOT pass a `transition-*` utility from a call site:
        // tailwind-merge treats all of them as a single group, so a call-site
        // `transition-opacity` or `transition-colors` REPLACES this list
        // wholesale and silently kills the scale response. That is exactly what
        // both call sites used to do — the scale had never animated anywhere.
        //
        // 5%, not 10%: on a 32px icon 10% is 3.2px, which inflates. The general
        // 1-2% hover ceiling can't apply literally at this size (2% of 32px is
        // 0.6px, invisible), so icon buttons take the smallest value that reads.
        "flex size-8 items-center justify-center text-foreground",
        "transition-[color,opacity,scale] duration-150 ease-hover",
        // The hover lift is ambient motion, so reduced motion drops it. The
        // press is not: it is a direct response to the user's own tap, and
        // globals.css already argues that killing press feedback is what makes
        // the blanket reduced-motion reset wrong. Colour still carries hover.
        "hover:scale-105 active:scale-95 motion-reduce:hover:scale-100",
        className
      )}
      data-saved={isSaved}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(handle);
      }}
      type="button"
    >
      <BookmarkIcon
        className={cn(
          // 22, not 18: BookmarkIcon's viewBox was normalised from 13x16 to
          // 18x18, which changes what a given `size-*` draws. 22px reproduces
          // the ~15.6px of ink this button rendered before, so the card is
          // visually unchanged.
          "size-[22px] transition-colors",
          isSaved ? "fill-foreground text-foreground" : "fill-transparent"
        )}
      />
    </button>
  );
}
