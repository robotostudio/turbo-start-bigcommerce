/**
 * The PLP filter codec: URL params in, a typed selection out, and a
 * `SearchProductsFiltersInput` payload for BigCommerce.
 *
 * Every param this file understands maps onto a field that actually exists on
 * `SearchProductsFiltersInput`, read off the introspected schema in
 * `lib/bigcommerce/graphql-env.d.ts`:
 *
 *   searchTerm, price {minPrice maxPrice}, rating {minRating maxRating},
 *   categoryEntityId(s), searchSubCategories, brandEntityIds,
 *   productAttributes [{attribute values}], isFreeShipping, isFeatured,
 *   hideOutOfStock, topLevelOnly
 *
 * What used to be here spoke the old platform's dialect. `filter.price` carried
 * bucket labels like
 * `-50` and `100-150`, which BigCommerce has no equivalent of — its price facet
 * is a range (`PriceSearchFilterInput` takes two floats), not a set of buckets
 * someone picked. `filter.category` encoded `<id>|<label>` so a chip could show
 * a name without the facet list; that put display text in the URL, where a
 * hand-edited link could make a chip say anything. And there were branches for
 * vendor, product type and tag, none of which BigCommerce models at all.
 *
 * Labels now come from the facet list instead, and a param whose facet has not
 * loaded shows its raw value rather than a label the URL asserted.
 */

/** The `filter.` prefix namespaces filter state away from `sort` and `after`. */
const PREFIX = "filter.";

/** Repeatable id params. */
const BRAND_PARAM = "filter.brand";
const CATEGORY_PARAM = "filter.category";
/** `filter.attr.<filterKey>`, repeatable per key. */
const ATTRIBUTE_PREFIX = "filter.attr.";
const MIN_PRICE_PARAM = "filter.minPrice";
const MAX_PRICE_PARAM = "filter.maxPrice";
const MIN_RATING_PARAM = "filter.rating";
/** Booleans, spelled as words so the URL reads rather than decodes. */
const STOCK_PARAM = "filter.stock";
const SHIPPING_PARAM = "filter.shipping";
const FEATURED_PARAM = "filter.featured";

export const FILTER_PARAMS = {
  brand: BRAND_PARAM,
  category: CATEGORY_PARAM,
  attributePrefix: ATTRIBUTE_PREFIX,
  minPrice: MIN_PRICE_PARAM,
  maxPrice: MAX_PRICE_PARAM,
  minRating: MIN_RATING_PARAM,
  stock: STOCK_PARAM,
  shipping: SHIPPING_PARAM,
  featured: FEATURED_PARAM,
} as const;

/**
 * The `filter.*` subset of a URL, which is the whole of what the panel owns.
 * Both listing surfaces need it to key a cache and to build a request; `sort`,
 * `after`, `view` and whatever a campaign appended belong to somebody else and
 * forwarding them to the API would be guessing.
 */
export function filterParamsOnly(
  search: string | URLSearchParams
): URLSearchParams {
  const filters = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search).entries()) {
    if (key.startsWith(PREFIX)) filters.append(key, value);
  }
  return filters;
}

/** `filter.stock=in` is the only value that means anything. */
export const IN_STOCK_VALUE = "in";
/** `filter.shipping=free` likewise. */
export const FREE_SHIPPING_VALUE = "free";
/** `filter.featured=1`. */
export const FEATURED_VALUE = "1";

// ---------------------------------------------------------------------------
// The normalised facet model
// ---------------------------------------------------------------------------

/**
 * One selectable value, already carrying the param it writes to.
 *
 * Pre-resolving the param here is what keeps the UI from re-deriving it per
 * facet kind, and it is why "other" facets (in stock, free shipping, featured)
 * need no special case: each is a one-option list pointing at its own boolean
 * param.
 */
export type FacetOption = {
  paramKey: string;
  paramValue: string;
  label: string;
  /** `null` when the facet asked for counts not to be displayed. */
  productCount: number | null;
  isSelected: boolean;
  /**
   * Whether picking this value replaces the param rather than adding to it.
   *
   * Brands and attributes accumulate — three brands means three
   * `filter.brand` params and `brandEntityIds: [a, b, c]`. Rating does not:
   * `rating` on the input is one range, so "4 stars & up" then "3 stars & up"
   * has to mean 3, not both. The transformer knows which member it came from,
   * so it says so here rather than leaving the click handler to special-case a
   * param name.
   */
  single?: true;
};

/**
 * A facet as the panel renders it. Two shapes, not six: everything BigCommerce
 * returns is either a list of values to pick from or a price range to bound.
 * The six-member union is branched on once, in the transformer, and does not
 * leak into the UI.
 */
export type Facet =
  | {
      kind: "options";
      /** Stable key for React and for the collapse state. */
      id: string;
      name: string;
      collapsedByDefault: boolean;
      options: FacetOption[];
    }
  | {
      kind: "price";
      id: string;
      name: string;
      collapsedByDefault: boolean;
      /** What the store echoes back as currently applied, if anything. */
      selected: { min: number | null; max: number | null };
    };

/**
 * What the panel should show, given the store's own setting and the facets the
 * Storefront API actually returned.
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

// ---------------------------------------------------------------------------
// URL → selection
// ---------------------------------------------------------------------------

/** Decoded filter state. Absent means "not filtering on this". */
export type FilterSelection = {
  brandEntityIds: number[];
  categoryEntityIds: number[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  attributes: { attribute: string; values: string[] }[];
  inStockOnly: boolean;
  freeShippingOnly: boolean;
  featuredOnly: boolean;
};

type ParamReader = {
  getAll(name: string): string[];
  get(name: string): string | null;
  entries(): IterableIterator<[string, string]>;
};

/** Positive integers only, so `?filter.brand=-1` or `abc` is dropped rather than sent. */
function toEntityIds(values: string[]): number[] {
  const ids: number[] = [];
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) ids.push(parsed);
  }
  return ids;
}

/** Finite non-negative numbers only. `undefined` for anything else. */
function toBound(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

/**
 * Attribute params keep BigCommerce's own `filterKey` in the param name, so a
 * store that adds a facet needs no code change here. Values are grouped per
 * key because `productAttributes` takes one entry per attribute with all of
 * its selected values.
 */
function readAttributes(
  params: ParamReader
): { attribute: string; values: string[] }[] {
  const grouped = new Map<string, string[]>();

  for (const [key, value] of params.entries()) {
    if (!key.startsWith(ATTRIBUTE_PREFIX)) continue;
    const attribute = key.slice(ATTRIBUTE_PREFIX.length);
    if (!attribute || !value) continue;
    const existing = grouped.get(attribute);
    if (existing) {
      existing.push(value);
    } else {
      grouped.set(attribute, [value]);
    }
  }

  return [...grouped].map(([attribute, values]) => ({ attribute, values }));
}

export function parseFilterParams(params: ParamReader): FilterSelection {
  const minPrice = toBound(params.get(MIN_PRICE_PARAM));
  const maxPrice = toBound(params.get(MAX_PRICE_PARAM));

  return {
    brandEntityIds: toEntityIds(params.getAll(BRAND_PARAM)),
    categoryEntityIds: toEntityIds(params.getAll(CATEGORY_PARAM)),
    // Swapped bounds would return nothing at all rather than erroring, so the
    // pair is dropped and the shopper sees an unfiltered list they can fix.
    ...(minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice
      ? {}
      : { minPrice, maxPrice }),
    minRating: toBound(params.get(MIN_RATING_PARAM)),
    attributes: readAttributes(params),
    inStockOnly: params.get(STOCK_PARAM) === IN_STOCK_VALUE,
    freeShippingOnly: params.get(SHIPPING_PARAM) === FREE_SHIPPING_VALUE,
    featuredOnly: params.get(FEATURED_PARAM) === FEATURED_VALUE,
  };
}

// ---------------------------------------------------------------------------
// Selection → BigCommerce
// ---------------------------------------------------------------------------

/**
 * The subset of `SearchProductsFiltersInput` this codec produces.
 *
 * Declared structurally rather than imported, because the query that owns the
 * real type is `server-only` and this module runs in the browser. The server
 * module assigns the result of `toSearchFilters` to gql.tada's generated input
 * type, so a field that drifts out of the schema fails `check-types` there
 * rather than at runtime.
 */
export type SearchFiltersPayload = {
  searchTerm?: string;
  categoryEntityId?: number;
  categoryEntityIds?: number[];
  brandEntityIds?: number[];
  price?: { minPrice?: number; maxPrice?: number };
  rating?: { minRating?: number };
  productAttributes?: { attribute: string; values: string[] }[];
  hideOutOfStock?: boolean;
  isFreeShipping?: boolean;
  isFeatured?: boolean;
};

/**
 * Only set keys are emitted. BigCommerce treats an explicit `null` as a value
 * on some of these inputs, so omitting is not the same as nulling and a codec
 * that sent `{price: {minPrice: null}}` would not mean "no price filter".
 */
export function toSearchFilters(
  selection: FilterSelection,
  base: { searchTerm?: string; categoryEntityId?: number } = {}
): SearchFiltersPayload {
  const payload: SearchFiltersPayload = {};

  if (base.searchTerm) payload.searchTerm = base.searchTerm;
  if (base.categoryEntityId !== undefined) {
    payload.categoryEntityId = base.categoryEntityId;
  }
  if (selection.categoryEntityIds.length > 0) {
    payload.categoryEntityIds = selection.categoryEntityIds;
  }
  if (selection.brandEntityIds.length > 0) {
    payload.brandEntityIds = selection.brandEntityIds;
  }
  if (selection.minPrice !== undefined || selection.maxPrice !== undefined) {
    payload.price = {
      ...(selection.minPrice !== undefined && { minPrice: selection.minPrice }),
      ...(selection.maxPrice !== undefined && { maxPrice: selection.maxPrice }),
    };
  }
  if (selection.minRating !== undefined) {
    payload.rating = { minRating: selection.minRating };
  }
  if (selection.attributes.length > 0) {
    payload.productAttributes = selection.attributes;
  }
  // Only the `true` side is sent. `hideOutOfStock: false` is a different
  // request from omitting it, and "show everything" is the unfiltered default.
  if (selection.inStockOnly) payload.hideOutOfStock = true;
  if (selection.freeShippingOnly) payload.isFreeShipping = true;
  if (selection.featuredOnly) payload.isFeatured = true;

  return payload;
}

/** True when the selection would narrow anything at all. */
export function hasActiveSelection(selection: FilterSelection): boolean {
  return (
    selection.brandEntityIds.length > 0 ||
    selection.categoryEntityIds.length > 0 ||
    selection.minPrice !== undefined ||
    selection.maxPrice !== undefined ||
    selection.minRating !== undefined ||
    selection.attributes.length > 0 ||
    selection.inStockOnly ||
    selection.freeShippingOnly ||
    selection.featuredOnly
  );
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

/**
 * Paging is cursor-based, so any cursor in the URL belongs to the previous
 * result set. Every writer drops it — keeping it asks BigCommerce to continue
 * from a position in a list that no longer exists.
 */
function withoutCursor(params: URLSearchParams): URLSearchParams {
  params.delete("after");
  return params;
}

/**
 * Add or remove one value of a repeatable param, leaving its siblings alone.
 *
 * `URLSearchParams.delete(key, value)` would be the one-liner, but it is Node
 * 20+ and browser-recent, and this runs in whatever a shopper brought. The
 * rebuild is explicit for that reason.
 */
export function toggleFilterParam(
  sp: URLSearchParams,
  paramKey: string,
  paramValue: string
): string {
  const next = new URLSearchParams();
  let removed = false;

  for (const [key, value] of sp.entries()) {
    if (key === paramKey && value === paramValue) {
      removed = true;
      continue;
    }
    next.append(key, value);
  }

  if (!removed) next.append(paramKey, paramValue);

  return withoutCursor(next).toString();
}

/**
 * Apply a facet option, whichever kind it is. One call site in the UI.
 *
 * A `single` option replaces its param and clicking the selected one clears it,
 * so a rating never accumulates. Everything else toggles alongside its siblings.
 */
export function applyFacetOption(
  sp: URLSearchParams,
  option: Pick<FacetOption, "paramKey" | "paramValue" | "single">
): string {
  if (option.single) {
    const alreadySet = sp.get(option.paramKey) === option.paramValue;
    return setFilterParam(
      sp,
      option.paramKey,
      alreadySet ? null : option.paramValue
    );
  }
  return toggleFilterParam(sp, option.paramKey, option.paramValue);
}

/** Set or clear a single-valued param, e.g. a price bound. */
export function setFilterParam(
  sp: URLSearchParams,
  paramKey: string,
  paramValue: string | null
): string {
  const next = new URLSearchParams(sp);
  if (paramValue === null || paramValue === "") {
    next.delete(paramKey);
  } else {
    next.set(paramKey, paramValue);
  }
  return withoutCursor(next).toString();
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

export type ActiveFilter = {
  key: string;
  label: string;
  paramKey: string;
  paramValue: string;
  /** Present in the URL but dropped by the parser, so nothing is narrowed. */
  invalid?: boolean;
};

/**
 * Whether a param pair survives `parseFilterParams`.
 *
 * The chip list reads the raw URL, so without this a hand-edited
 * `?filter.minPrice=abc` would render a chip claiming a filter that the parser
 * silently threw away — the shopper sees "Min abc" over an unfiltered grid.
 * Marking it keeps the chip honest and still removable. Deliberately mirrors the
 * parse rules rather than restating them: the shared helpers below are the same
 * ones the parser uses, so the two cannot drift apart.
 */
function isUsableParam(paramKey: string, paramValue: string): boolean {
  if (paramKey === BRAND_PARAM || paramKey === CATEGORY_PARAM) {
    return toEntityIds([paramValue]).length === 1;
  }
  if (
    paramKey === MIN_PRICE_PARAM ||
    paramKey === MAX_PRICE_PARAM ||
    paramKey === MIN_RATING_PARAM
  ) {
    return toBound(paramValue) !== undefined;
  }
  if (paramKey === STOCK_PARAM) return paramValue === IN_STOCK_VALUE;
  if (paramKey === SHIPPING_PARAM) return paramValue === FREE_SHIPPING_VALUE;
  if (paramKey === FEATURED_PARAM) return paramValue === FEATURED_VALUE;
  if (paramKey.startsWith(ATTRIBUTE_PREFIX)) {
    return paramKey.length > ATTRIBUTE_PREFIX.length && paramValue !== "";
  }
  // A `filter.*` param this codec does not know. Not applied, so not silent.
  return false;
}

/** Every option across every facet, keyed by the param pair it writes. */
function labelIndex(facets: readonly Facet[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const facet of facets) {
    if (facet.kind !== "options") continue;
    for (const option of facet.options) {
      index.set(`${option.paramKey}=${option.paramValue}`, option.label);
    }
  }
  return index;
}

/** Human label for a param pair the facet list does not cover. */
function fallbackLabel(paramKey: string, paramValue: string): string {
  if (paramKey === MIN_PRICE_PARAM) return `Min ${paramValue}`;
  if (paramKey === MAX_PRICE_PARAM) return `Max ${paramValue}`;
  if (paramKey === MIN_RATING_PARAM) return `${paramValue} stars & up`;
  if (paramKey === STOCK_PARAM) return "In stock";
  if (paramKey === SHIPPING_PARAM) return "Free shipping";
  if (paramKey === FEATURED_PARAM) return "Featured";
  // A brand or category id with no facet loaded. Showing the id is honest and
  // still removable; inventing a name would be the `<id>|<label>` mistake.
  return paramValue;
}

/**
 * Active filters as chips.
 *
 * Facets are optional because the chips render on a statically generated route
 * that has not fetched them yet, and on a store whose plan never will. Without
 * them a brand chip reads as its id, which is worse to look at and better than
 * a label the URL could have lied about.
 */
export function getActiveFilters(
  sp: ParamReader,
  facets: readonly Facet[] = []
): ActiveFilter[] {
  const labels = labelIndex(facets);
  const active: ActiveFilter[] = [];

  for (const [paramKey, paramValue] of sp.entries()) {
    if (!paramKey.startsWith(PREFIX)) continue;
    const usable = isUsableParam(paramKey, paramValue);
    active.push({
      key: `${paramKey}=${paramValue}`,
      label:
        labels.get(`${paramKey}=${paramValue}`) ??
        fallbackLabel(paramKey, paramValue),
      paramKey,
      paramValue,
      ...(usable ? {} : { invalid: true }),
    });
  }

  return active;
}

/** Remove a specific filter param+value, keeping every other param. */
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
  return withoutCursor(next).toString();
}

/** Remove every `filter.*` param, keeping sort and density. */
export function clearAllFilters(sp: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const [key, value] of sp.entries()) {
    if (key.startsWith(PREFIX)) continue;
    next.append(key, value);
  }
  return withoutCursor(next).toString();
}
