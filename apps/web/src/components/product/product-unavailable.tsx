import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

/**
 * What a shopper sees when the product read fails.
 *
 * The alternatives are all worse: `notFound()` tells a shopper that a product
 * which exists does not, and a bare throw renders Next's unstyled "Internal
 * Server Error" with no way back into the shop.
 *
 * Markup only, no `"use client"`, so both the page and the error boundary can
 * render it — the boundary is a client component and pulls this into the
 * client bundle with it.
 */
export function ProductUnavailable() {
  return (
    <div className="site-container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="font-light text-3xl tracking-tight md:text-4xl">
        This product couldn&apos;t be loaded
      </h1>
      <p className="max-w-prose text-muted-foreground text-sm tracking-wide">
        Our product catalogue didn&apos;t answer just now. The product is still
        there — try again in a moment.
      </p>
      <Button asChild className="mt-4 uppercase tracking-wider" size="lg">
        <Link href="/collections">Back to Shop</Link>
      </Button>
    </div>
  );
}
