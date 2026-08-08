export const DEFAULT_SORT = "COLLECTION_DEFAULT";

/** Parses sort-related search params for collection pages. */
export function parseSortParams(sp: Record<string, string | string[]>): {
  sort: string;
  reverse: boolean;
} {
  const sort = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const reverse = Array.isArray(sp.reverse) ? sp.reverse[0] : sp.reverse;
  return {
    sort: sort ?? DEFAULT_SORT,
    reverse: reverse === "true",
  };
}

/**
 * Same parse off a `URLSearchParams`-shaped object — the client half. The
 * page itself never awaits `searchParams`, which is what keeps the route
 * statically generated; sort state lives in the URL and is read here.
 */
export function sortFromSearchParams(params: {
  get(name: string): string | null;
}): { sort: string; reverse: boolean } {
  return {
    sort: params.get("sort") ?? DEFAULT_SORT,
    reverse: params.get("reverse") === "true",
  };
}
