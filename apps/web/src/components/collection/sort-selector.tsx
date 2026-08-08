"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import {
  DEFAULT_SORT,
  defaultSortLabel,
  SORT_OPTIONS,
  sortFromSearchParams,
} from "./sort-utils";

type SortSelectorProps = {
  /**
   * Same override the facet panel takes, for the same reason: `/search` writes
   * its address bar with `replaceState`, which `useSearchParams` does not
   * observe, and a client navigation there would re-trigger the intercepting
   * route and open the drawer. Both default to the router, which is what every
   * ordinary listing route wants.
   */
  params?: URLSearchParams;
  onNavigate?: (queryString: string) => void;
  /**
   * Whether this listing has a keyword behind it. Only the default option's
   * label depends on it — omitting the sort argument means relevance on a
   * keyword search and the category's own order on a category page.
   */
  hasSearchTerm?: boolean;
};

export function SortSelector({
  params,
  onNavigate,
  hasSearchTerm = false,
}: SortSelectorProps = {}) {
  const router = useRouter();
  const routerParams = useSearchParams();
  // Read, not passed in: the server component stays `searchParams`-free so
  // the route can be statically generated.
  const searchParams = params ?? routerParams;
  const currentSort = sortFromSearchParams(searchParams);

  const handleSort = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === DEFAULT_SORT) {
        next.delete("sort");
      } else {
        next.set("sort", value);
      }
      // The cursor is an offset into the *previous* order — reusing it across a
      // sort change pages into the wrong slice, and returns short. BigCommerce
      // encodes the sort key into the cursor itself, so a stale one is not even
      // meaningful against the new order.
      next.delete("after");
      const qs = next.toString();

      if (onNavigate) {
        onNavigate(qs);
        return;
      }
      router.push(qs ? `?${qs}` : "?", { scroll: false });
    },
    [onNavigate, router, searchParams]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex shrink-0 items-center gap-1 whitespace-nowrap text-base text-zinc-900 tracking-[0.24px] transition-colors hover:text-zinc-500 focus-visible:outline-none data-[state=open]:text-zinc-500 dark:text-zinc-100 dark:hover:text-zinc-400">
        Sort by
        <ChevronDown className="size-[18px]" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            className="flex items-center justify-between gap-6"
            key={option.value}
            onClick={() => handleSort(option.value)}
          >
            {option.value === DEFAULT_SORT
              ? defaultSortLabel(hasSearchTerm)
              : option.label}
            <Check
              className={cn(
                "size-4",
                option.value === currentSort ? "opacity-100" : "opacity-0"
              )}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
