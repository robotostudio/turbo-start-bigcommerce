/**
 * PLP sort state. BigCommerce sorts a category with a single enum
 * (`CategoryProductSort`), so the Shopify-era `sort` + `reverse` pair collapses
 * to one URL param carrying the enum member verbatim: `?sort=LOWEST_PRICE`.
 */

/**
 * "Featured" is the *absence* of a sort, not the `DEFAULT` enum member — and
 * not `FEATURED` either, despite the label. All three are different orders on
 * the wire. Verified live against the store: omitting `sortBy` returns products
 * ascending by entity id, while both `DEFAULT` and `FEATURED` return them
 * descending. The category page renders server-side without a sort, so a
 * sentinel that never reaches BigCommerce is what keeps the hydrated grid in
 * the order SSR already painted. Map this to a real enum member and the grid
 * reshuffles the moment the page hydrates.
 */
export const DEFAULT_SORT = "COLLECTION_DEFAULT";

/** `CategoryProductSort` members this storefront offers, in menu order. */
const SORT_VALUES = [
  "LOWEST_PRICE",
  "HIGHEST_PRICE",
  "A_TO_Z",
  "Z_TO_A",
  "BEST_SELLING",
  "NEWEST",
] as const;

export type CategorySort = (typeof SORT_VALUES)[number];

export const SORT_OPTIONS: readonly {
  label: string;
  value: CategorySort | typeof DEFAULT_SORT;
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
 * `?sort=` to the value BigCommerce takes — `undefined` for the default view,
 * which covers both an absent param and an unrecognised one. Validating here
 * rather than at the query keeps a hand-edited URL from reaching the API.
 */
export function toCategorySort(
  sort: string | null | undefined
): CategorySort | undefined {
  return SORT_VALUES.find((value) => value === sort);
}

/**
 * The same read for the UI, which needs a value for every state including the
 * default. The page itself never awaits `searchParams` — that would opt the
 * route out of static generation — so sort state lives in the URL and is read
 * from `useSearchParams` here.
 */
export function sortFromSearchParams(params: {
  get(name: string): string | null;
}): string {
  return toCategorySort(params.get("sort")) ?? DEFAULT_SORT;
}
