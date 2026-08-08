/**
 * Listing sort state, shared by the category pages and the search page.
 *
 * BigCommerce sorts with a single enum member rather than a field-plus-
 * direction pair, so the whole of sort state is one URL param carrying that
 * member verbatim: `?sort=LOWEST_PRICE`.
 *
 * There are two sort enums, not one. `CategoryProductSort` belongs to
 * `Category.products`; `SearchProductsSortInput` belongs to
 * `site.search.searchProducts`, which is the field every listing on this
 * storefront now reads from. They overlap on seven members and differ at the
 * edges — only the category enum has `DEFAULT`, only the search enum has
 * `RELEVANCE` — and every member this menu offers is in both. That is what
 * lets one menu, one param and one validator serve both surfaces.
 */

/**
 * The default view: the *absence* of a sort argument, not an enum member.
 *
 * Sending nothing and sending `FEATURED` are different orders on some fields,
 * and the default a shopper sees depends on the surface — BigCommerce sorts a
 * keyword search by relevance and a category by its own order, from the same
 * omitted argument. A sentinel that never reaches the API is what keeps the
 * hydrated grid in the order the server already painted; map it to a real enum
 * member and the grid reshuffles the moment the page hydrates.
 *
 * The label follows the surface — see `defaultSortLabel`.
 */
export const DEFAULT_SORT = "COLLECTION_DEFAULT";

/**
 * Members this storefront offers, in menu order. Every one is present in both
 * `CategoryProductSort` and `SearchProductsSortInput`; adding a member that is
 * not in both breaks whichever surface lacks it, so keep this list to the
 * intersection.
 */
const SORT_VALUES = [
  "LOWEST_PRICE",
  "HIGHEST_PRICE",
  "A_TO_Z",
  "Z_TO_A",
  "BEST_SELLING",
  "NEWEST",
] as const;

export type ListingSort = (typeof SORT_VALUES)[number];

export const SORT_OPTIONS: readonly {
  label: string;
  value: ListingSort | typeof DEFAULT_SORT;
}[] = [
  { label: "Featured", value: DEFAULT_SORT },
  { label: "Price: Low to High", value: "LOWEST_PRICE" },
  { label: "Price: High to Low", value: "HIGHEST_PRICE" },
  { label: "Title: A-Z", value: "A_TO_Z" },
  { label: "Title: Z-A", value: "Z_TO_A" },
  { label: "Best Selling", value: "BEST_SELLING" },
  { label: "Newest", value: "NEWEST" },
];

/**
 * What omitting the sort argument actually does, which is not the same thing on
 * both surfaces: a keyword search falls back to the store's
 * `defaultSearchProductSort` (`RELEVANCE` on this store, and BigCommerce's own
 * default), a category listing to its configured product order. Labelling the
 * search default "Featured" would name an order the shopper is not looking at.
 */
export function defaultSortLabel(hasSearchTerm: boolean): string {
  return hasSearchTerm ? "Relevance" : "Featured";
}

/**
 * `?sort=` to the enum member BigCommerce takes — `undefined` for the default
 * view, which covers the sentinel, an absent param and an unrecognised one
 * alike. Validating here rather than at the query keeps a hand-edited URL from
 * reaching the API.
 */
export function toListingSort(
  sort: string | null | undefined
): ListingSort | undefined {
  return SORT_VALUES.find((value) => value === sort);
}

/**
 * The same read for the UI, which needs a value for every state including the
 * default. The category page never awaits `searchParams` — that would opt the
 * route out of static generation — so sort state lives in the URL and is read
 * from `useSearchParams` there. `/search` passes its own reader instead,
 * because that page writes the address bar with `replaceState` and the hook
 * does not observe it.
 */
export function sortFromSearchParams(params: {
  get(name: string): string | null;
}): string {
  return toListingSort(params.get("sort")) ?? DEFAULT_SORT;
}
