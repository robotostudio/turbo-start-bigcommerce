"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Loader2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useCart } from "./cart-context";
import { CartEmptyState } from "./cart-empty-state";
import { CartLineItem } from "./cart-line-item";
import { CartSummary } from "./cart-summary";

export function CartDrawer() {
  const { cart, isCartOpen, closeCart, settle } = useCart();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Line items call closeCart on their own links, but the recommendation
  // ProductCards below them don't — so opening one left the drawer over the new
  // page. Mirror the route instead of threading a handler through ProductCard,
  // matching SavedItemsDrawer. The pathname guard makes this safe even though
  // closeCart is not a stable reference.
  //
  // Deliberately pathname ONLY — do not fold in useSearchParams. VariantSelector
  // calls router.replace("?Color=…") on every swatch click, so keying on the
  // query would close the cart each time the user changes a variant. The cost is
  // that opening the product you are already viewing won't close the drawer;
  // that is rare and harmless next to closing the cart mid-selection.
  const pathname = usePathname();
  const lastPathname = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPathname.current) return;
    lastPathname.current = pathname;
    closeCart();
  }, [pathname, closeCart]);

  const lines = cart?.lines.edges.map((e) => e.node) ?? [];
  const isEmpty = lines.length === 0;

  async function handleCheckout() {
    setIsCheckingOut(true);
    const confirmed = await settle();
    if (confirmed?.checkoutUrl) {
      window.location.href = confirmed.checkoutUrl;
      return;
    }
    setIsCheckingOut(false);
  }

  return (
    <Sheet onOpenChange={(open) => !open && closeCart()} open={isCartOpen}>
      <SheetContent
        className="w-full gap-8 p-8 sm:max-w-[540px]"
        showCloseButton={false}
        side="right"
      >
        <SheetHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <SheetTitle className="font-medium text-[32px] leading-tight">
            Cart
          </SheetTitle>
          <SheetDescription className="sr-only">
            Your shopping cart
          </SheetDescription>
          <button
            className="inline-flex items-center gap-1 text-base text-foreground tracking-[0.24px] transition-opacity hover:opacity-70"
            onClick={closeCart}
            type="button"
          >
            Close
            <X className="size-[18px]" />
          </button>
        </SheetHeader>

        {isEmpty ? (
          <CartEmptyState />
        ) : (
          <>
            <div className="-mx-8 flex-1 overflow-y-auto px-8">
              <div className="divide-y divide-border">
                {lines.map((line) => (
                  <CartLineItem key={line.id} line={line} />
                ))}
              </div>
            </div>

            {cart && (
              <SheetFooter className="gap-4 p-0">
                <CartSummary cart={cart} />
                <Button
                  className="w-full"
                  disabled={isCheckingOut}
                  onClick={handleCheckout}
                  size="lg"
                >
                  {isCheckingOut && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Go to checkout
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
