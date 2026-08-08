"use client";

import { cn } from "@workspace/ui/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import {
  applyFacetOption,
  type Facet,
  type FacetOption,
  FILTER_PARAMS,
  filterPanelState,
} from "@/components/collection/filter-utils";
import { useListingControls } from "@/components/collection/listing-controls";

type FilterPanelProps = {
  /** Facets for this result set, already flattened out of BigCommerce's union. */
  filters?: readonly Facet[];
  /**
   * `site.settings.search.productFilteringEnabled`, read server-side. Defaults
   * to false so a caller that has not been updated keeps the honest message
   * rather than promising controls it has no facets for.
   */
  filteringEnabled?: boolean;
  /**
   * Current filter state, and where a change goes.
   *
   * Both default to the router, which is right on a listing page. `/search` has
   * to override them: it keeps its own state and syncs the address bar with
   * `history.replaceState` rather than navigating, because a client nav to
   * `/search` re-triggers the intercepting route and opens the search drawer.
   * `useSearchParams` does not observe `replaceState`, so a panel reading the
   * hook there would build every pick from stale params.
   */
  params?: URLSearchParams;
  onNavigate?: (queryString: string) => void;
};

/**
 * The facet panel.
 *
 * It renders `Facet`, not BigCommerce's response. The six-member union
 * (`BrandSearchFilter | CategorySearchFilter | ProductAttributeSearchFilter |
 * RatingSearchFilter | PriceSearchFilter | OtherSearchFilter`) is branched on
 * once, in `lib/bigcommerce/facets.ts`, and arrives here as either a list of
 * options or a price range. Nothing round-trips an opaque blob — every option
 * already knows the URL param it writes, so this file contains no mapping from
 * facet kind to query string at all.
 *
 * Product filtering is plan-gated, and the panel says which side of that gate
 * the *store* is on rather than asserting it for everyone. BigCommerce answers
 * HTTP 200 with `filters.edges: []` and no `errors` key on a plan without it,
 * byte-identical to "no facets matched" (captured in
 * `lib/bigcommerce/__fixtures__/search-filters-unavailable.json`), so the empty
 * list alone cannot tell those apart. `productFilteringEnabled` can, and that is
 * why it is threaded down here.
 *
 * On this store the flag is `false`, so `unavailable` is what renders, and the
 * category listing passes no facets at all — it reads from `Category.products`,
 * which has no filter argument. The search surfaces pass real ones.
 */
export function FilterPanel({
  filters = [],
  filteringEnabled = false,
  params,
  onNavigate,
}: FilterPanelProps) {
  const { filterOpen } = useListingControls();
  const router = useRouter();
  const routerParams = useSearchParams();
  const searchParams = params ?? routerParams;
  const state = filterPanelState(filteringEnabled, filters.length);

  const push = useCallback(
    (qs: string) => {
      if (onNavigate) {
        onNavigate(qs);
        return;
      }
      router.push(qs ? `?${qs}` : "?", { scroll: false });
    },
    [onNavigate, router]
  );

  // One handler for every option, because the transformer already recorded
  // whether a value replaces its param or joins it.
  const onPick = useCallback(
    (option: FacetOption) => push(applyFacetOption(searchParams, option)),
    [push, searchParams]
  );

  const onPriceSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const next = new URLSearchParams(searchParams.toString());

      for (const [field, param] of [
        ["min", FILTER_PARAMS.minPrice],
        ["max", FILTER_PARAMS.maxPrice],
      ] as const) {
        const value = String(form.get(field) ?? "").trim();
        if (value) {
          next.set(param, value);
        } else {
          next.delete(param);
        }
      }
      // The cursor is an offset into the previous result set.
      next.delete("after");
      push(next.toString());
    },
    [push, searchParams]
  );

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
        {state === "controls" ? (
          <div
            className="grid grid-cols-1 gap-x-8 gap-y-6 border-zinc-200 border-t py-6 sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800"
            data-testid="filter-panel"
          >
            {filters.map((facet) =>
              facet.kind === "price" ? (
                <PriceFacet
                  facet={facet}
                  key={facet.id}
                  onSubmit={onPriceSubmit}
                  searchParams={searchParams}
                />
              ) : (
                <OptionsFacet facet={facet} key={facet.id} onPick={onPick} />
              )
            )}
          </div>
        ) : (
          /* Centred in the row the facets would have filled, not right-aligned
           * under the Filter button — as a stray line of grey text off to one
           * side it read as a caption someone forgot to delete rather than as
           * the panel's answer. */
          <p
            className="border-zinc-200 border-t py-6 text-center text-sm text-zinc-600 tracking-[0.24px] dark:border-zinc-800 dark:text-zinc-400"
            data-testid="filter-panel"
          >
            {state === "unavailable"
              ? "Filters are unavailable for this store."
              : "No filters match these products."}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * `<details>` rather than a state-driven accordion: the store tells us which
 * facets start collapsed, and the browser already knows how to open and close a
 * disclosure accessibly. No `useState`, no aria wiring, works before hydration.
 */
function FacetShell({
  name,
  collapsedByDefault,
  children,
}: {
  name: string;
  collapsedByDefault: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group" open={!collapsedByDefault}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-zinc-900 tracking-[0.24px] dark:text-zinc-100">
        {name}
        <span
          aria-hidden="true"
          className="text-zinc-400 transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function OptionsFacet({
  facet,
  onPick,
}: {
  facet: Extract<Facet, { kind: "options" }>;
  onPick: (option: FacetOption) => void;
}) {
  return (
    <FacetShell collapsedByDefault={facet.collapsedByDefault} name={facet.name}>
      <ul className="flex flex-col gap-1.5">
        {facet.options.map((option) => (
          <li key={`${option.paramKey}=${option.paramValue}`}>
            <button
              aria-pressed={option.isSelected}
              className={cn(
                "flex w-full items-center justify-between gap-2 text-left text-sm tracking-[0.24px] transition-colors",
                option.isSelected
                  ? "text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              )}
              onClick={() => onPick(option)}
              type="button"
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {/* `null` means the facet asked for counts to be hidden, which is
               * not the same as a count of zero and must not render as one. */}
              {option.productCount !== null && (
                <span className="shrink-0 text-xs text-zinc-400">
                  {option.productCount}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </FacetShell>
  );
}

/**
 * Price is a range, not buckets. `PriceSearchFilterInput` takes two floats and
 * the facet carries no values to pick from, so hand-picked bands would be a
 * storefront invention rather than anything the store configured.
 *
 * Uncontrolled, submitted as a form: the inputs need no React state, Enter
 * works for free, and `type="number"` gets the right keyboard on a phone.
 */
function PriceFacet({
  facet,
  onSubmit,
  searchParams,
}: {
  facet: Extract<Facet, { kind: "price" }>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  searchParams: URLSearchParams;
}) {
  const inputClass =
    "w-full min-w-0 border-zinc-200 border-b bg-transparent pb-1 text-sm tracking-[0.24px] outline-none placeholder:text-zinc-400 focus:border-zinc-900 dark:border-zinc-800 dark:focus:border-zinc-100";

  return (
    <FacetShell collapsedByDefault={facet.collapsedByDefault} name={facet.name}>
      {/* `key` on the form so a URL change from elsewhere (a chip removed, a
       * shared link opened) resets the uncontrolled inputs to match it. */}
      <form
        className="flex items-end gap-2"
        key={searchParams.toString()}
        onSubmit={onSubmit}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Minimum price</span>
          <input
            className={inputClass}
            defaultValue={searchParams.get(FILTER_PARAMS.minPrice) ?? ""}
            inputMode="decimal"
            min="0"
            name="min"
            placeholder={facet.selected.min?.toString() ?? "Min"}
            step="any"
            type="number"
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Maximum price</span>
          <input
            className={inputClass}
            defaultValue={searchParams.get(FILTER_PARAMS.maxPrice) ?? ""}
            inputMode="decimal"
            min="0"
            name="max"
            placeholder={facet.selected.max?.toString() ?? "Max"}
            step="any"
            type="number"
          />
        </label>
        <button
          className="shrink-0 pb-1 text-sm text-zinc-600 tracking-[0.24px] underline underline-offset-4 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          type="submit"
        >
          Go
        </button>
      </form>
    </FacetShell>
  );
}
