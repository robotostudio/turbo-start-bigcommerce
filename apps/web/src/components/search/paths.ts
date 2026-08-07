export const SEARCH_PATH = "/search";

const QUERY_PARAM = "q";

/** The search term carried by a `location.search` string, trimmed. */
export function readSearchQuery(search: string): string {
  return new URLSearchParams(search).get(QUERY_PARAM)?.trim() ?? "";
}

/**
 * `SEARCH_PATH` with `q` set to `query` (or removed when it is empty), keeping
 * every other param in `search` intact — callers pass `window.location.search`,
 * which can carry utm_* and anything else the visitor arrived with.
 */
export function searchUrlWithQuery(query: string, search: string): string {
  const params = new URLSearchParams(search);
  const trimmed = query.trim();

  if (trimmed) {
    params.set(QUERY_PARAM, trimmed);
  } else {
    params.delete(QUERY_PARAM);
  }

  const rest = params.toString();
  return rest ? `${SEARCH_PATH}?${rest}` : SEARCH_PATH;
}
