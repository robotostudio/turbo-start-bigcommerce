"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { ProductCard } from "@/components/product/product-card";
import { collectionProductToCardProps } from "@/lib/shopify/product-card";
import { SavedEmptyState } from "./saved-empty-state";
import { useSavedItems } from "./saved-items-context";
import { useSavedProducts } from "./use-saved-products";

export function SavedItemsDrawer() {
  const { count, isSavedOpen, closeSaved } = useSavedItems();
  const { products, isLoading } = useSavedProducts();

  // Opening a product left the drawer sitting over the new page. Mirror the
  // route into the open state rather than threading an onClick through
  // ProductCard: the card has two separate links plus swatches that rewrite the
  // href, so a per-link handler is easy to add and easy to miss one of.
  const pathname = usePathname();
  const lastPathname = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPathname.current) return;
    lastPathname.current = pathname;
    closeSaved();
  }, [pathname, closeSaved]);

  const isEmpty = count === 0;

  return (
    <Sheet onOpenChange={(open) => !open && closeSaved()} open={isSavedOpen}>
      <SheetContent
        // 750px at lg is the Figma width (node 1797:7613): with p-8 and the
        // 4px grid gap that lands each card on exactly 341px, matching the
        // design's card. Held at 540 below lg so the drawer doesn't swallow a
        // tablet viewport whole; cards are still ~236px there, well clear of
        // the width where the add-to-cart bar starts to crowd.
        className="w-full gap-8 p-8 sm:max-w-[540px] lg:max-w-[750px]"
        showCloseButton={false}
        side="right"
      >
        <SheetHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <SheetTitle className="font-medium text-[32px] leading-tight">
            Wishlist
          </SheetTitle>
          <SheetDescription className="sr-only">
            Your saved items
          </SheetDescription>
          <button
            className="inline-flex items-center gap-1 text-base text-foreground tracking-[0.24px] transition-opacity hover:opacity-70"
            onClick={closeSaved}
            type="button"
          >
            Close
            <X className="size-[18px]" />
          </button>
        </SheetHeader>

        {/* The scroller hides its scrollbar (same idiom as cart-recommendations):
         * it ate 8px of the grid, putting cards at 333px instead of the 341 the
         * design specifies. */}
        {isEmpty ? (
          <SavedEmptyState />
        ) : (
          <div className="-mx-8 flex-1 overflow-y-auto px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="grid grid-cols-2 gap-x-1 gap-y-6">
              {isLoading
                ? Array.from({ length: count }).map((_, index) => (
                    <div className="flex flex-col gap-2" key={index.toString()}>
                      <Skeleton className="aspect-56/75 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-4 w-1/4" />
                    </div>
                  ))
                : products.map((product) => (
                    <ProductCard
                      key={product.id}
                      {...collectionProductToCardProps(product)}
                    />
                  ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
