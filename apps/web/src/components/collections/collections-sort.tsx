"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import type { CollectionCardProps } from "@/components/collection/collection-card";

/**
 * "Newest" is gone: a BigCommerce category carries no creation date on the
 * storefront API, and sorting by something the catalog doesn't report is a
 * label that lies.
 */
export type SortOption = "a-z" | "z-a";

const SORT_LABELS: Record<SortOption, string> = {
  "a-z": "A-Z",
  "z-a": "Z-A",
};

export function sortCollections(
  collections: CollectionCardProps[],
  sort: SortOption
): CollectionCardProps[] {
  const sorted = [...collections];
  return sort === "z-a"
    ? sorted.sort((a, b) => b.title.localeCompare(a.title))
    : sorted.sort((a, b) => a.title.localeCompare(b.title));
}

export function CollectionsSortSelector() {
  const searchParams = useSearchParams();
  const router = useRouter();
  function handleSort(option: SortOption) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", option);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex shrink-0 items-center gap-1 whitespace-nowrap text-base text-foreground tracking-wide">
        Sort by
        <ChevronDown className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-none">
        {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(
          ([value, label]) => (
            <DropdownMenuItem key={value} onSelect={() => handleSort(value)}>
              {label}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
