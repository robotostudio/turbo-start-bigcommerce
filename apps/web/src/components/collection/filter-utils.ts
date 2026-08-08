/**
 * Reads `filter.*` URL params back into display chips.
 *
 * There is no writer: product filtering is plan-gated on this store, so
 * `FilterPanel` renders an explicit "unavailable" state instead of controls
 * (see the comment there). What survives here is the read half — a chip list
 * and the two removers — so a `filter.*` param that arrives on a shared or
 * bookmarked URL is still visible and still clearable rather than applying
 * invisibly. The fork's `parseFilterParams` that used to sit above
 * this is gone: it emitted `productVendor`/`tag`/`variantOption` filters,
 * which BigCommerce has no counterpart for.
 */

/**
 * What the filter panel should show, given the store's own setting and the
 * facets the Storefront API actually returned.
 *
 * Separated from the component because the interesting branch is the one this
 * store cannot reach: `site.settings.search.productFilteringEnabled` is `false`
 * on this plan, so rendering alone can never exercise `"controls"`. A pure
 * function can.
 *
 * The three states are genuinely different and collapsing any two of them is
 * how the panel ended up lying in the first place:
 *
 * - `"unavailable"` — the merchant's plan does not include Product Filtering.
 *   Nothing they do in their catalog will produce facets.
 * - `"none"` — filtering is on, but this query matched no facets. A real empty
 *   result, not a capability problem.
 * - `"controls"` — filtering is on and facets came back. Render them.
 */
export function filterPanelState(
  filteringEnabled: boolean,
  facetCount: number
): "unavailable" | "none" | "controls" {
  if (!filteringEnabled) return "unavailable";
  return facetCount > 0 ? "controls" : "none";
}

/** Price bucket labels, e.g. "-50" → "Under $50". */
const PRICE_BUCKET_LABELS: Record<string, string> = {
  "-50": "Under $50",
  "50-100": "$50–$100",
  "100-150": "$100–$150",
  "150-": "$150+",
};

/** Build a description string for an active filter (used in chips). */
export type ActiveFilter = {
  key: string;
  label: string;
  paramKey: string;
  paramValue: string;
  invalid?: boolean;
};

/** Label for a `filter.price` bucket value, e.g. "-50" → "Under $50". */
function priceBucketLabel(value: string): string {
  const preset = PRICE_BUCKET_LABELS[value];
  if (preset) return preset;
  const [minS, maxS] = value.split("-");
  if (minS && maxS) return `$${minS}–$${maxS}`;
  if (maxS) return `Under $${maxS}`;
  if (minS) return `$${minS}+`;
  return value;
}

function buildFilterLabel(key: string, value: string): string {
  if (key === "filter.available") {
    return value === "true" ? "In Stock" : "Out of Stock";
  }
  if (key === "filter.price") return priceBucketLabel(value);
  // Category is stored as "<id>|<label>"; show just the label.
  if (key === "filter.category") return value.split("|")[1] ?? value;
  if (key === "filter.price.min" || key === "filter.price.max") {
    const prefix = key === "filter.price.min" ? "Min" : "Max";
    if (Number.isNaN(Number(value))) return `${prefix}: invalid`;
    return `${prefix}: ${value}`;
  }
  // Variant options / vendor / type / tag: the value is already the label.
  return value;
}

function isInvalidFilter(key: string, value: string): boolean {
  if (key === "filter.price.min" || key === "filter.price.max") {
    return Number.isNaN(Number(value));
  }
  return false;
}

function buildFilterKey(key: string, value: string): string {
  const prefix = key.replace("filter.", "");
  return `${prefix}-${value}`;
}

/** Extract active filters from URL search params for display. */
export function getActiveFilters(sp: URLSearchParams): ActiveFilter[] {
  const active: ActiveFilter[] = [];

  for (const [key, value] of sp.entries()) {
    if (!key.startsWith("filter.")) continue;
    active.push({
      key: buildFilterKey(key, value),
      label: buildFilterLabel(key, value),
      paramKey: key,
      paramValue: value,
      invalid: isInvalidFilter(key, value),
    });
  }

  return active;
}

/** Remove a specific filter param+value from search params and return new string. */
export function removeFilterParam(
  sp: URLSearchParams,
  paramKey: string,
  paramValue: string
): string {
  const next = new URLSearchParams();
  for (const [key, value] of sp.entries()) {
    if (key === paramKey && value === paramValue) continue;
    next.append(key, value);
  }
  next.delete("after");
  return next.toString();
}

/** Remove all filter params from search params. */
export function clearAllFilters(sp: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const [key, value] of sp.entries()) {
    if (key.startsWith("filter.")) continue;
    next.append(key, value);
  }
  next.delete("after");
  return next.toString();
}
