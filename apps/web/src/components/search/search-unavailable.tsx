/**
 * What a failed search looks like.
 *
 * Without it, `data ?? EMPTY` rendered `0 results for "jacket"` and "No
 * products found." — byte-identical to a search that genuinely matched
 * nothing, so a shopper looking for a product the store sells was told it does
 * not sell it. The search box stays above this, so retyping is the retry.
 */
export function SearchUnavailable() {
  return (
    <div className="site-container py-16 text-center" role="alert">
      <p className="font-medium text-base">Search isn&apos;t available</p>
      <p className="mt-1 text-muted-foreground text-sm tracking-wide">
        Our catalogue didn&apos;t answer just now. Try again in a moment.
      </p>
    </div>
  );
}
