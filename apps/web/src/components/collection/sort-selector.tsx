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

import { DEFAULT_SORT, SORT_OPTIONS, sortFromSearchParams } from "./sort-utils";

export function SortSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read, not passed in: the server component stays `searchParams`-free so
  // the route can be statically generated.
  const currentSort = sortFromSearchParams(searchParams);

  const handleSort = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === DEFAULT_SORT) {
        params.delete("sort");
      } else {
        params.set("sort", value);
      }
      // The cursor is an offset into the *previous* order — reusing it across a
      // sort change pages into the wrong slice, and returns short.
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
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            className="flex items-center justify-between gap-6"
            key={option.value}
            onClick={() => handleSort(option.value)}
          >
            {option.label}
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
