type ProductFilter = Record<string, unknown>;

/**
 * Preset price buckets shown in the filter panel. The URL stores the bucket
 * `value` under `filter.price` (e.g. `?filter.price=100-150`) and it round-trips
 * back into a Shopify `{ price: { min, max } }` ProductFilter.
 *
 * Value format is `<min>-<max>` where an empty side is open-ended:
 *   "-50" → Under $50 · "50-100" → $50–$100 · "150-" → $150+
 */
export const PRICE_BUCKETS = [
  { value: "-50", label: "Under $50", min: undefined, max: 50 },
  { value: "50-100", label: "$50–$100", min: 50, max: 100 },
  { value: "100-150", label: "$100–$150", min: 100, max: 150 },
  { value: "150-", label: "$150+", min: 150, max: undefined },
] as const;

type ParamSource = URLSearchParams | Record<string, string | string[]>;

function spGet(sp: ParamSource, key: string): string | null {
  if (sp instanceof URLSearchParams) return sp.get(key);
  const val = sp[key];
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

function spGetAll(sp: ParamSource, key: string): string[] {
  if (sp instanceof URLSearchParams) return sp.getAll(key);
  const val = sp[key];
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function spEntries(sp: ParamSource): [string, string][] {
  if (sp instanceof URLSearchParams) return Array.from(sp.entries());
  const out: [string, string][] = [];
  for (const [key, val] of Object.entries(sp)) {
    if (Array.isArray(val)) {
      for (const v of val) out.push([key, v]);
    } else {
      out.push([key, val]);
    }
  }
  return out;
}

function readAvailability(sp: ParamSource): ProductFilter | null {
  const available = spGet(sp, "filter.available");
  if (available === "true") return { available: true };
  if (available === "false") return { available: false };
  return null;
}

/** Price: preset bucket takes precedence, then legacy min/max inputs. */
function readPrice(sp: ParamSource): ProductFilter | null {
  const bucket = spGet(sp, "filter.price");
  const price: { min?: number; max?: number } = {};
  if (bucket) {
    const [minS, maxS] = bucket.split("-");
    if (minS) price.min = Number(minS);
    if (maxS) price.max = Number(maxS);
  } else {
    const min = Number(spGet(sp, "filter.price.min"));
    const max = Number(spGet(sp, "filter.price.max"));
    if (!Number.isNaN(min) && spGet(sp, "filter.price.min")) price.min = min;
    if (!Number.isNaN(max) && spGet(sp, "filter.price.max")) price.max = max;
  }
  if (price.min === undefined && price.max === undefined) return null;
  return { price };
}

/** Variant options (Color, Size, ...): filter.option.<Name>=<value> */
function readOptions(sp: ParamSource): ProductFilter[] {
  const out: ProductFilter[] = [];
  for (const [key, value] of spEntries(sp)) {
    if (!key.startsWith("filter.option.")) continue;
    const name = key.slice("filter.option.".length);
    if (name && value) out.push({ variantOption: { name, value } });
  }
  return out;
}

/** Standard taxonomy category: filter.category=<id>|<label> → { category: { id } } */
function readCategories(sp: ParamSource): ProductFilter[] {
  const out: ProductFilter[] = [];
  for (const value of spGetAll(sp, "filter.category")) {
    const id = value.split("|")[0];
    if (id) out.push({ category: { id } });
  }
  return out;
}

/**
 * Parse URL search params into Shopify ProductFilter array.
 *
 * URL format:
 *   ?filter.available=true
 *   &filter.price=100-150            (preset bucket, see PRICE_BUCKETS)
 *   &filter.price.min=10&filter.price.max=100  (legacy min/max, still parsed)
 *   &filter.vendor=Nike&filter.vendor=Adidas
 *   &filter.type=Shoes
 *   &filter.tag=sale
 *   &filter.option.Color=Indigo&filter.option.Size=M  (variant options)
 */
export function parseFilterParams(sp: ParamSource): ProductFilter[] {
  const filters: ProductFilter[] = [];

  const availability = readAvailability(sp);
  if (availability) filters.push(availability);

  const price = readPrice(sp);
  if (price) filters.push(price);

  for (const vendor of spGetAll(sp, "filter.vendor")) {
    filters.push({ productVendor: vendor });
  }
  for (const type of spGetAll(sp, "filter.type")) {
    filters.push({ productType: type });
  }
  for (const tag of spGetAll(sp, "filter.tag")) {
    filters.push({ tag });
  }
  filters.push(...readOptions(sp));
  filters.push(...readCategories(sp));

  return filters;
}

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
  const preset = PRICE_BUCKETS.find((b) => b.value === value);
  if (preset) return preset.label;
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
