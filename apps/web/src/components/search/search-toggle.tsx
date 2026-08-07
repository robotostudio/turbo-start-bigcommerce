"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SearchIcon } from "../icons";
import { SEARCH_PATH } from "./paths";

const TOGGLE_CLASS =
  "inline-flex items-center justify-center transition-colors hover:text-foreground";

export function SearchToggle() {
  const pathname = usePathname();

  // On the search page itself, focus the existing input instead of navigating
  // to /search again — a client nav would re-trigger the intercepting route and
  // pop the drawer over the page.
  if (pathname === SEARCH_PATH) {
    return (
      <button
        aria-label="Search"
        className={TOGGLE_CLASS}
        onClick={() => {
          document.getElementById("search-page-input")?.focus();
        }}
        type="button"
      >
        <SearchIcon className="size-5" />
      </button>
    );
  }

  return (
    <Link aria-label="Search" className={TOGGLE_CLASS} href={SEARCH_PATH}>
      <SearchIcon className="size-5" />
    </Link>
  );
}
