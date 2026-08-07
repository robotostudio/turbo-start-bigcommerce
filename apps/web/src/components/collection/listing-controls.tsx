"use client";

import { Minus, Plus } from "lucide-react";
import { createContext, useContext, useState } from "react";

import { SortSelector } from "@/components/collection/sort-selector";

type ListingControlsContextType = {
  filterOpen: boolean;
  toggleFilter: () => void;
};

const ListingControlsContext = createContext<ListingControlsContextType>({
  filterOpen: false,
  toggleFilter: () => {},
});

export function useListingControls() {
  return useContext(ListingControlsContext);
}

export function ListingControlsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <ListingControlsContext
      value={{ filterOpen, toggleFilter: () => setFilterOpen((p) => !p) }}
    >
      {children}
    </ListingControlsContext>
  );
}

/*
 * Grid density toggle — the "dense" view renders a >4-column (brutalist) grid.
 * Commented out until we ship the brutalist grid. To restore: uncomment the
 * imports below, the DenseGridIcon component, the setView logic in
 * ListingControls, and the toggle markup in the returned JSX. The grid itself
 * already honors ?view=dense via ProductGrid's `density` prop.
 *
 * import { cn } from "@workspace/ui/lib/utils";
 * import { LayoutGrid } from "lucide-react";
 * import { usePathname, useRouter, useSearchParams } from "next/navigation";
 * import { useCallback } from "react";
 *
 * function DenseGridIcon({ className }: { className?: string }) {
 *   return (
 *     <svg
 *       aria-hidden="true"
 *       className={className}
 *       fill="currentColor"
 *       viewBox="0 0 18 18"
 *       xmlns="http://www.w3.org/2000/svg"
 *     >
 *       {[0, 7, 14].map((y) =>
 *         [0, 7, 14].map((x) => (
 *           <rect height="4" key={`${x}-${y}`} rx="0.5" width="4" x={x} y={y} />
 *         ))
 *       )}
 *     </svg>
 *   );
 * }
 */

const controlTextClass =
  "flex shrink-0 items-center gap-1 whitespace-nowrap text-base text-zinc-900 tracking-[0.24px] transition-colors hover:text-zinc-500 focus-visible:outline-none dark:text-zinc-100 dark:hover:text-zinc-400";

type ListingControlsProps = {
  currentSort: string;
  currentReverse: boolean;
};

export function ListingControls({
  currentSort,
  currentReverse,
}: ListingControlsProps) {
  const { filterOpen, toggleFilter } = useListingControls();

  // Grid density toggle disabled for now (see brutalist note above).
  // const router = useRouter();
  // const pathname = usePathname();
  // const searchParams = useSearchParams();
  // const dense = searchParams.get("view") === "dense";
  // const setView = useCallback(
  //   (next: "comfortable" | "dense") => {
  //     const params = new URLSearchParams(searchParams.toString());
  //     if (next === "dense") {
  //       params.set("view", "dense");
  //     } else {
  //       params.delete("view");
  //     }
  //     const qs = params.toString();
  //     router.push(qs ? `?${qs}` : pathname, { scroll: false });
  //   },
  //   [router, pathname, searchParams]
  // );

  return (
    <div className="flex shrink-0 items-center gap-4">
      {/* Grid density toggle — disabled until the brutalist grid ships.
      <div className="hidden items-center gap-3 sm:flex">
        <button
          aria-label="Comfortable grid"
          aria-pressed={!dense}
          className={cn(
            "transition-colors",
            dense
              ? "text-zinc-400 hover:text-zinc-600"
              : "text-zinc-900 dark:text-zinc-100"
          )}
          onClick={() => setView("comfortable")}
          type="button"
        >
          <LayoutGrid className="size-[18px]" strokeWidth={1.75} />
        </button>
        <button
          aria-label="Dense grid"
          aria-pressed={dense}
          className={cn(
            "transition-colors",
            dense
              ? "text-zinc-900 dark:text-zinc-100"
              : "text-zinc-400 hover:text-zinc-600"
          )}
          onClick={() => setView("dense")}
          type="button"
        >
          <DenseGridIcon className="size-[18px]" />
        </button>
      </div>
      <div className="hidden h-4 w-px bg-zinc-200 sm:block dark:bg-zinc-700" />
      */}

      {/* Filter toggle */}
      <button
        aria-expanded={filterOpen}
        className={controlTextClass}
        onClick={toggleFilter}
        type="button"
      >
        Filter
        {filterOpen ? (
          <Minus className="size-[18px]" strokeWidth={1.75} />
        ) : (
          <Plus className="size-[18px]" strokeWidth={1.75} />
        )}
      </button>

      {/* Sort */}
      <SortSelector currentReverse={currentReverse} currentSort={currentSort} />
    </div>
  );
}
