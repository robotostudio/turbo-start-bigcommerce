"use client";

import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

/**
 * The boundary every route falls back to when nothing closer catches a throw.
 *
 * Two routes throw on purpose rather than degrading — `/collections` and
 * `/collections/[...slug]`, both prerendered, both with a comment explaining
 * why a baked "no products" page is worse. Until this file existed, that
 * decision reached a shopper as Next's built-in error page: white, chrome-less,
 * "Application error: a server-side exception has occurred" and a digest hash.
 *
 * Rendered inside the root layout, so the navbar, promo banner and footer stay
 * on screen and a shopper can leave this page by any of the routes they arrived
 * with. `reset()` re-renders the segment, which is the whole fix for the
 * transient storefront failure this mostly catches.
 */
export default function RootError({ reset }: { reset: () => void }) {
  return (
    <div className="site-container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="font-light text-3xl tracking-tight md:text-4xl">
        This page couldn&apos;t be loaded
      </h1>
      <p className="max-w-prose text-muted-foreground text-sm tracking-wide">
        Something went wrong at our end. Nothing is missing — try again in a
        moment.
      </p>
      <div className="mt-4 flex gap-3">
        <Button
          className="uppercase tracking-wider"
          onClick={reset}
          size="lg"
          type="button"
        >
          Try again
        </Button>
        <Button
          asChild
          className="uppercase tracking-wider"
          size="lg"
          variant="secondary"
        >
          <Link href="/collections">Back to Shop</Link>
        </Button>
      </div>
    </div>
  );
}
