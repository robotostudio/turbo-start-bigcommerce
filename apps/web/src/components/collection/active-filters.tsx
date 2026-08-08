"use client";

import { cn } from "@workspace/ui/lib/utils";
import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import {
  clearAllFilters,
  type Facet,
  getActiveFilters,
  removeFilterParam,
} from "@/components/collection/filter-utils";
import { useListingControls } from "@/components/collection/listing-controls";

type ActiveFiltersProps = {
  /**
   * Facets for this result set, used only to turn a param value into a label —
   * `filter.brand=12` into "Aster". Optional because the listing page has none
   * to give, where a chip falls back to the raw id.
   */
  facets?: readonly Facet[];
  /**
   * Same override as `FilterPanel` takes, and for the same reason: `/search`
   * writes the address bar with `replaceState`, which `useSearchParams` does not
   * observe. Both default to the router.
   */
  params?: URLSearchParams;
  onNavigate?: (queryString: string) => void;
};

export function ActiveFilters({
  facets = [],
  params,
  onNavigate,
}: ActiveFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const routerParams = useSearchParams();
  const searchParams = params ?? routerParams;
  const { filterOpen } = useListingControls();
  const active = getActiveFilters(searchParams, facets);

  const go = useCallback(
    (qs: string) => {
      if (onNavigate) {
        onNavigate(qs);
        return;
      }
      router.push(qs ? `?${qs}` : pathname, { scroll: false });
    },
    [onNavigate, router, pathname]
  );

  const handleRemove = useCallback(
    (paramKey: string, paramValue: string) => {
      go(removeFilterParam(searchParams, paramKey, paramValue));
    },
    [go, searchParams]
  );

  const handleClearAll = useCallback(() => {
    go(clearAllFilters(searchParams));
  }, [go, searchParams]);

  // Selections are shown as underlines inside the open panel; chips appear
  // only once the panel is collapsed.
  if (filterOpen || active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {active.map((filter) => (
        <button
          className={cn(
            "flex items-center justify-center gap-0.5 px-0.5 text-sm tracking-[0.24px] transition-colors",
            filter.invalid
              ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
              : "bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          )}
          key={filter.key}
          onClick={() => handleRemove(filter.paramKey, filter.paramValue)}
          type="button"
        >
          <X className="size-3 shrink-0" strokeWidth={1.75} />
          {filter.label}
          <span className="sr-only">Remove {filter.label} filter</span>
        </button>
      ))}
      <button
        className="ml-1 text-xs text-zinc-500 tracking-[0.24px] underline-offset-2 transition-colors hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
        onClick={handleClearAll}
        type="button"
      >
        Clear all
      </button>
    </div>
  );
}
