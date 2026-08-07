"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { SEARCH_PATH } from "./paths";
import { SearchPanel } from "./search-panel";

/**
 * Fires when Radix unmounts the sheet — i.e. once the exit animation has
 * finished, or immediately if there is none. Cheaper and far more robust than
 * watching `animationend` ourselves: Presence already handles zero-duration
 * animations, `display: none`, and cancellation.
 */
function ExitSignal({ onExit }: { onExit: () => void }) {
  useEffect(() => () => onExit(), [onExit]);
  return null;
}

export function SearchModal({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const onSearchRoute = usePathname() === SEARCH_PATH;

  const [open, setOpen] = useState(true);
  // Set while a dismiss (Close / Esc / overlay) is animating out, so the exit
  // knows to pop the intercepted route. A result click must NOT set it: that
  // has already navigated, and popping would land on the page the drawer was
  // opened over.
  const dismissing = useRef(false);
  // Set from the moment a result is clicked until the new route commits. Next
  // transitions cannot be cancelled, so a dismiss during that window would pop
  // the entry out from under the pending navigation and strand the user on the
  // page they searched from — with neither the product nor the search.
  const navigating = useRef(false);

  // A soft nav does NOT clear this slot: Next keeps an unmatched parallel
  // route's last render, and @modal/default.tsx only applies on a hard load. So
  // clicking a result leaves the drawer sitting over the new page unless we
  // notice the route ourselves. Mirrored both ways — leaving /search animates
  // out, coming back re-opens.
  useEffect(() => {
    if (onSearchRoute) {
      // Both latches are per-close. Clearing them here covers the exit that
      // never completed because the drawer was re-opened mid-animation.
      dismissing.current = false;
      navigating.current = false;
    }
    setOpen(onSearchRoute);
  }, [onSearchRoute]);

  const dismiss = useCallback(() => {
    if (navigating.current) {
      return;
    }
    dismissing.current = true;
    setOpen(false);
  }, []);

  const handleExit = useCallback(() => {
    if (!dismissing.current) {
      return;
    }
    dismissing.current = false;
    router.back();
  }, [router]);

  return (
    <Sheet
      onOpenChange={(next) => {
        if (!next) {
          dismiss();
        }
      }}
      open={open}
    >
      <SheetContent
        className="h-dvh w-full gap-0 border-none p-0 data-[state=open]:duration-300 sm:max-w-none"
        onClickCapture={(event) => {
          // Modified clicks open a new tab and leave this one on /search, so
          // they must not arm the guard.
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          if ((event.target as HTMLElement).closest?.("a[href]")) {
            navigating.current = true;
          }
        }}
        showCloseButton={false}
        side="bottom"
      >
        <ExitSignal onExit={handleExit} />
        <SheetTitle className="sr-only">Search</SheetTitle>
        <SheetDescription className="sr-only">
          Search products and collections
        </SheetDescription>

        <SearchPanel
          initialQuery={initialQuery}
          onClose={dismiss}
          replace
          scrollable
        />
      </SheetContent>
    </Sheet>
  );
}
