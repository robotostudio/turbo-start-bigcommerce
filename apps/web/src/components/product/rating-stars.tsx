import { cn } from "@workspace/ui/lib/utils";
import { Star } from "lucide-react";

import type { CardRating } from "@/lib/bigcommerce/product-card";

/**
 * Five stars filled to the nearest whole, with the review count.
 *
 * Only ever rendered for a product that has reviews: `cardRating` returns null
 * at zero rather than a zero score, and every caller checks. An empty five-star
 * row would read as a badly-rated product instead of an unreviewed one, which
 * is the opposite of the truth.
 *
 * Its own module rather than a local in `product-card.tsx` because the PDP
 * needs it too, and that file is a `"use client"` entry — importing the card
 * from a server page to reach twenty lines of stars would pull its swatches,
 * size picker and quick-add into the PDP's bundle. Nothing here uses state, so
 * this module needs no directive and both sides can import it.
 */
export function RatingStars({ rating }: { rating: CardRating }) {
  const filled = Math.round(rating.average);

  return (
    // `role="img"` so the five icons and the count are announced as one label
    // rather than five meaningless graphics. A bare `aria-label` on a `p` is
    // ignored — a paragraph has no role that accepts a name.
    <p
      aria-label={`Rated ${rating.average} out of 5 from ${rating.count} review${rating.count === 1 ? "" : "s"}`}
      className="flex items-center gap-0.5 text-muted-foreground"
      role="img"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          aria-hidden="true"
          className={cn("size-3.5", star <= filled && "fill-current")}
          key={star}
          strokeWidth={1.5}
        />
      ))}
      <span className="ml-1 text-xs">({rating.count})</span>
    </p>
  );
}
