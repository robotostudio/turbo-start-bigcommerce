"use client";

import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

import { useCartActions } from "./cart-context";
import { CartRecommendations } from "./cart-recommendations";

export function CartEmptyState() {
  const { closeCart } = useCartActions();

  return (
    <div className="-mx-8 flex flex-1 flex-col overflow-y-auto px-8">
      <div className="flex flex-col items-start gap-4">
        <p className="text-base text-muted-foreground">
          Explore our complete range of products or easily find exactly what you
          need!
        </p>
        <Button asChild>
          <Link href="/collections/all-products" onClick={closeCart}>
            Shop all products
          </Link>
        </Button>
      </div>

      {/* Spacer pushes the "Must haves" section to the bottom of the cart.
          Collapses to allow scroll when the section is tall. */}
      <div className="min-h-12 flex-1" />

      <div className="flex flex-col gap-6">
        <h3 className="font-medium text-foreground text-xl tracking-[0.24px]">
          Must haves
        </h3>
        <CartRecommendations />
      </div>
    </div>
  );
}
