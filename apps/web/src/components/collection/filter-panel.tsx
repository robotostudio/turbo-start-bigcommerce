"use client";

import { cn } from "@workspace/ui/lib/utils";

import { filterPanelState } from "@/components/collection/filter-utils";
import { useListingControls } from "@/components/collection/listing-controls";

type FilterPanelProps = {
  /** Facets the Storefront API returned. Empty on a plan without filtering. */
  filters?: readonly unknown[];
  /**
   * `site.settings.search.productFilteringEnabled`, read server-side. Defaults
   * to false so a caller that has not been updated keeps the honest message
   * rather than promising controls it has no facets for.
   */
  filteringEnabled?: boolean;
};

/**
 * Product filtering is plan-gated, and this panel now says which side of that
 * gate the *store* is on rather than asserting it for everyone. BigCommerce
 * answers HTTP 200 with `filters.edges: []` and no `errors` key, byte-identical
 * to "no facets matched" (captured in
 * `lib/bigcommerce/__fixtures__/search-filters-unavailable.json`) — so the
 * empty list alone cannot tell those apart. `productFilteringEnabled` can, and
 * that is why it is threaded down here.
 *
 * On this store the flag is `false`, so the unavailable message is correct and
 * still what renders. On a plan that includes Product Filtering it is `true`,
 * and the message would be a lie — which is what it was before.
 *
 * What the gate actually covers, measured against the live store rather than
 * read off the docs — every one of these is HTTP 200 with no `errors` key:
 *
 * - `filters` is `[]`. No facet of any kind, so nothing to source controls from.
 * - `price: {minPrice, maxPrice}` on `searchProducts` **does** narrow
 *   server-side and is **not** gated — 12 products down to 4 for 80–100.
 * - `hideOutOfStock`, `rating` and `productAttributes` are accepted and
 *   silently do nothing. Same product count in and out.
 * - `isFeatured` and `isFreeShipping` return zero results rather than
 *   narrowing, which on a catalog with neither flag set is indistinguishable
 *   from working.
 * - `brandEntityIds` is untestable here: every product in the catalog has a
 *   null brand.
 *
 * The working `price` filter is deliberately not wired up. There is no facet to
 * source buckets from, so they would have to be hand-picked, and reaching it
 * means moving the PLP off `Category.products` onto `searchProducts` — which
 * costs about 1000 more complexity per request and gives up the
 * `CategoryProductSort.DEFAULT` member the sort menu depends on. Hand-picked
 * ranges over a real API is a worse answer than an honest "unavailable".
 */
export function FilterPanel({
  filters = [],
  filteringEnabled = false,
}: FilterPanelProps) {
  const { filterOpen } = useListingControls();
  const state = filterPanelState(filteringEnabled, filters.length);

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-300 ease-out",
        filterOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
    >
      <div
        className={cn(
          "overflow-hidden transition-opacity duration-300 ease-out",
          filterOpen ? "opacity-100" : "opacity-0"
        )}
        inert={!filterOpen}
      >
        {/* Centred in the row the facets would have filled, not right-aligned
         * under the Filter button — as a stray line of grey text off to one
         * side it read as a caption someone forgot to delete rather than as
         * the panel's answer. */}
        <p
          className="border-zinc-200 border-t py-6 text-center text-sm text-zinc-600 tracking-[0.24px] dark:border-zinc-800 dark:text-zinc-400"
          data-testid="filter-panel"
        >
          {state === "unavailable" && "Filters are unavailable for this store."}
          {state === "none" && "No filters match these products."}
          {/* `"controls"` renders this too, for now. The facet UI is not built:
           * this store's plan returns no facets, so there is nothing to build
           * it against, and guessing at a shape from the docs is how the last
           * `parseFilterParams` got written against another platform's API and
           * then deleted. The flag is threaded and the branch is here for whoever has a store
           * that can serve facets. */}
          {state === "controls" &&
            `${filters.length} filters available — the facet UI is not built yet.`}
        </p>
      </div>
    </div>
  );
}
