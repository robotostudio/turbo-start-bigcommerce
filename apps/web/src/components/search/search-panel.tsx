"use client";

import { cn } from "@workspace/ui/lib/utils";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SEARCH_PATH, readSearchQuery, searchUrlWithQuery } from "./paths";
import { SearchEmptyState } from "./search-empty-state";
import { SearchResults } from "./search-results";
import { useProductSearch } from "./use-product-search";

type SearchPanelProps = {
  initialQuery?: string;
  /** When provided, renders a "Close" button that calls this handler. */
  onClose?: () => void;
  /** Fill the parent height with an internal scroll area (used inside the drawer). */
  scrollable?: boolean;
  /**
   * Replace the current history entry when a result is opened instead of
   * pushing. Set by the drawer so Back from a product goes to the page the
   * search was opened over, not back into the search.
   */
  replace?: boolean;
};

export function SearchPanel({
  initialQuery = "",
  onClose,
  scrollable = false,
  replace,
}: SearchPanelProps) {
  const pathname = usePathname();
  // The URL can carry a ?q= this render never saw: the sync below uses
  // replaceState, which does not re-run the server component, so a Back or
  // Forward into that entry restores the URL but replays a tree still seeded
  // with the original (empty) initialQuery. Read the live URL once at mount to
  // close that gap — safe on the server, where it resolves to initialQuery, and
  // safe against hydration, because a real render always sees the same URL the
  // server did; only client-side history replays diverge.
  const [seedQuery] = useState(
    () =>
      initialQuery ||
      (typeof window === "undefined"
        ? ""
        : readSearchQuery(window.location.search))
  );
  const {
    query,
    setQuery,
    debouncedQuery,
    products,
    collections,
    related,
    isSearching,
    hasQuery,
  } = useProductSearch(seedQuery);

  // Keep the URL in sync with the query so a refresh / shared link lands on the
  // /search page with the same term. history.replaceState, not router.replace,
  // for the same reason as search-page-content: a router nav here costs an RSC
  // round-trip per keystroke. The pathname check keeps a late debounce from
  // rewriting the URL after the user has already navigated on to a product.
  useEffect(() => {
    if (pathname !== SEARCH_PATH) {
      return;
    }
    const trimmed = debouncedQuery.trim();
    // Writing an identical URL is not free: on the mount that follows a
    // Back/Forward the state is still catching up, and an unconditional write
    // would strip the ?q= the entry was restored with.
    if (readSearchQuery(window.location.search) === trimmed) {
      return;
    }
    window.history.replaceState(
      null,
      "",
      searchUrlWithQuery(trimmed, window.location.search)
    );
  }, [debouncedQuery, pathname]);

  // Focus the input when the panel mounts.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className={cn("flex flex-col", scrollable && "h-full")}>
      <div className="flex items-center gap-4 border-b px-4 py-4 md:px-8">
        <input
          className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing to search…"
          ref={inputRef}
          type="text"
          value={query}
        />
        {onClose && (
          <button
            className="inline-flex items-center gap-1 text-base text-foreground tracking-[0.24px] transition-opacity hover:opacity-70"
            onClick={onClose}
            type="button"
          >
            Close
            <X className="size-4.5" />
          </button>
        )}
      </div>

      <div
        className={cn("bg-muted/30", scrollable && "flex-1 overflow-y-auto")}
      >
        {hasQuery ? (
          <SearchResults
            collections={collections}
            isSearching={isSearching}
            onSelectTerm={setQuery}
            products={products}
            related={related}
            replace={replace}
          />
        ) : (
          <SearchEmptyState onSelectTerm={setQuery} replace={replace} />
        )}
      </div>
    </div>
  );
}
