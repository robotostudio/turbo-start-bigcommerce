"use client";

import { cn } from "@workspace/ui/lib/utils";

import { useListingControls } from "@/components/collection/listing-controls";

type FilterPanelProps = {
  /** Accepted for call-site compatibility; unused until ROB-2546. */
  filters?: readonly unknown[];
};

/**
 * Facet placeholder — ROB-2546 rebuilds real filters on
 * `site.search.searchProducts`.
 *
 * Product filtering is plan-gated on this store: BigCommerce answers HTTP 200
 * with `filters.edges: []` and no `errors` key, byte-identical to "no facets
 * matched" (captured in
 * `lib/bigcommerce/__fixtures__/search-filters-unavailable.json`). An empty
 * facet list must therefore read as "unavailable", never render as a silently
 * empty sidebar.
 */
export function FilterPanel(_props: FilterPanelProps) {
  const { filterOpen } = useListingControls();

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
        <p
          className="pt-2 text-right text-sm text-zinc-600 tracking-[0.24px] dark:text-zinc-400"
          data-testid="filter-panel"
        >
          Filters are unavailable for this store.
        </p>
      </div>
    </div>
  );
}
