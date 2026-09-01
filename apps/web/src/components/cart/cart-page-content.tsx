"use client";

import { Button } from "@workspace/ui/components/button";
import { toast } from "@workspace/ui/components/sonner";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useCart } from "@/components/cart/cart-context";
import { CartLineItem } from "@/components/cart/cart-line-item";
import { CartSummary } from "@/components/cart/cart-summary";
import { CartUnavailable } from "@/components/cart/cart-unavailable";
import { BagIcon } from "@/components/icons";
import { requestCheckoutUrl } from "@/lib/cart/checkout-request";

export function CartPageContent() {
  const { cart, isLoading, loadFailed, settle } = useCart();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const lines = cart?.lines.edges.map((e) => e.node) ?? [];

  async function handleCheckout() {
    setIsCheckingOut(true);
    // Settle first, so an in-flight quantity change is not lost on redirect.
    const confirmed = await settle();
    if (!confirmed) {
      setIsCheckingOut(false);
      return;
    }

    // Single-use URL, minted per click and never read off the cart. Goes
    // through a route handler rather than a server action so a wedged action
    // elsewhere cannot stop checkout being sent at all.
    const redirect = await requestCheckoutUrl();
    if (!redirect.ok) {
      toast.error(redirect.message);
      setIsCheckingOut(false);
      return;
    }

    // Left disabled on purpose: the window is leaving for BigCommerce, and
    // re-arming the button would let a second click burn a URL already spent.
    window.location.href = redirect.url;
  }

  if (isLoading && !cart) {
    return (
      <main className="px-4 py-16">
        <h1 className="mb-8 font-semibold text-3xl">Cart</h1>
        <div className="flex items-center justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      </main>
    );
  }

  // Before the empty state, not inside it: the cart read failing is not the
  // cart being empty, and telling a shopper their bag is empty when it is not
  // is the worst thing this page can say.
  if (loadFailed && lines.length === 0) {
    return (
      <main className="px-4 py-16">
        <h1 className="mb-8 font-semibold text-3xl">Cart</h1>
        <div className="flex flex-col items-center justify-center gap-6 py-16">
          <CartUnavailable />
        </div>
      </main>
    );
  }

  if (lines.length === 0) {
    return (
      <main className="px-4 py-16">
        <h1 className="mb-8 font-semibold text-3xl">Cart</h1>
        <div className="flex flex-col items-center justify-center gap-6 py-16">
          <BagIcon className="size-16 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium text-lg">Your cart is empty</p>
            <p className="mt-1 text-muted-foreground text-sm">
              Add some items to get started.
            </p>
          </div>
          <Button asChild>
            <Link href="/collections">Continue Shopping</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-16">
      <h1 className="mb-8 font-semibold text-3xl">Cart</h1>
      <div className="grid gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="divide-y">
            {lines.map((line) => (
              <CartLineItem key={line.id} line={line} />
            ))}
          </div>
          <div className="mt-6">
            <Button asChild variant="default">
              <Link href="/collections">Continue Shopping</Link>
            </Button>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-xl border bg-card p-6">
            <h2 className="mb-4 font-semibold text-lg">Order Summary</h2>
            {cart && (
              <>
                <CartSummary cart={cart} />
                <Button
                  className="mt-4 w-full"
                  disabled={isCheckingOut}
                  onClick={handleCheckout}
                  size="lg"
                >
                  {isCheckingOut && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Checkout
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
