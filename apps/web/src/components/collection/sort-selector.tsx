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

const SORT_OPTIONS = [
  { label: "Featured", sortKey: "COLLECTION_DEFAULT", reverse: false },
  { label: "Price: Low to High", sortKey: "PRICE", reverse: false },
  { label: "Price: High to Low", sortKey: "PRICE", reverse: true },
  { label: "Title: A-Z", sortKey: "TITLE", reverse: false },
  { label: "Title: Z-A", sortKey: "TITLE", reverse: true },
  { label: "Best Selling", sortKey: "BEST_SELLING", reverse: false },
  { label: "Newest", sortKey: "CREATED", reverse: true },
] as const;

type SortSelectorProps = {
  currentSort: string;
  currentReverse: boolean;
};

export function SortSelector({
  currentSort,
  currentReverse,
}: SortSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSort = useCallback(
    (sortKey: string, reverse: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (sortKey === "COLLECTION_DEFAULT" && reverse === false) {
        params.delete("sort");
        params.delete("reverse");
      } else {
        params.set("sort", sortKey);
        params.set("reverse", String(reverse));
      }
      params.delete("after");
      const qs = params.toString();
      router.push(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex shrink-0 items-center gap-1 whitespace-nowrap text-base text-zinc-900 tracking-[0.24px] transition-colors hover:text-zinc-500 focus-visible:outline-none data-[state=open]:text-zinc-500 dark:text-zinc-100 dark:hover:text-zinc-400">
        Sort by
        <ChevronDown className="size-[18px]" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SORT_OPTIONS.map((option) => {
          const active =
            option.sortKey === currentSort && option.reverse === currentReverse;
          return (
            <DropdownMenuItem
              className="flex items-center justify-between gap-6"
              key={`${option.sortKey}-${option.reverse}`}
              onClick={() => handleSort(option.sortKey, option.reverse)}
            >
              {option.label}
              <Check
                className={cn("size-4", active ? "opacity-100" : "opacity-0")}
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { parseSortParams } from "./sort-utils";
