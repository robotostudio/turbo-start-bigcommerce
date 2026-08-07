"use client";

import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

import { CartRecommendations } from "@/components/cart/cart-recommendations";
import { useSavedItems } from "./saved-items-context";

export function SavedEmptyState() {
  const { closeSaved } = useSavedItems();

  return (
    <div className="-mx-8 flex flex-1 flex-col overflow-y-auto px-8">
      <div className="flex flex-col items-start gap-4">
        <p className="text-base text-muted-foreground">
          Tap the bookmark icon to effortlessly add your favorite items to your
          wishlist!
        </p>
        <Button asChild>
          <Link href="/collections/all-products" onClick={closeSaved}>
            Shop all products
          </Link>
        </Button>
      </div>

      {/* Spacer pushes the "Must haves" section to the bottom of the drawer.
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
