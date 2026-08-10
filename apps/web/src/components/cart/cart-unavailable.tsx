"use client";

import { Button } from "@workspace/ui/components/button";

/**
 * What the cart shows when the first read of it failed.
 *
 * The alternative is what shipped before: a failed read seeded an empty cart,
 * so a shopper with three items was told their bag was empty — the one state
 * that reads as "we lost your things". A refresh is the retry, because the
 * controller keeps its last known cart on a failed refetch and so cannot
 * report a second failure.
 */
export function CartUnavailable() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div>
        <p className="font-medium text-lg">We couldn&apos;t load your bag</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Nothing has been removed. Refresh to try again.
        </p>
      </div>
      <Button onClick={() => window.location.reload()} type="button">
        Refresh
      </Button>
    </div>
  );
}
