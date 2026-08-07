/**
 * Idempotent writes against the REST Catalog API.
 *
 * Every resource is looked up before it is written, keyed on something the
 * seed controls: categories on their full path, products and variants on SKU,
 * images on their alt text, metafields on `namespace:key`. Re-running updates
 * in place instead of appending, which is what makes the seed safe to leave in
 * a developer's loop.
 */

import { CATEGORIES } from "./catalog.js";
import { bc, log } from "./client.js";
import type {
  ImageDef,
  MetafieldDef,
  OptionDef,
  OptionIndex,
  ProductDef,
  RunStats,
  VariantDef,
} from "./types.js";

const TREE_ID = 1;
const PAGE_MAX = 250;

/**
 * Storefront GraphQL only returns metafields whose permission set grants
 * storefront access. Plain `read` is admin-only and reads back as an empty
 * `metafields` connection — the exact silent gap ticket 09 would inherit.
 */
const METAFIELD_PERMISSION = "read_and_sf_access";

interface BcCategory {
  category_id: number;
  name: string;
  url: { path: string };
}

interface BcProduct {
  id: number;
  sku: string;
  name: string;
}

interface BcOption {
  id: number;
  display_name: string;
  option_values: Array<{ id: number; label: string }>;
}

interface BcVariant {
  id: number;
  sku: string;
  image_url?: string;
}

interface BcImage {
  id: number;
  description: string;
}

interface BcMetafield {
  id: number;
  namespace: string;
  key: string;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** `/shop/mens/jackets/` → `/shop/mens/`; a top-level path → null. */
function parentPath(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 1) return null;
  return `/${segments.slice(0, -1).join("/")}/`;
}

/**
 * Creates any missing category, keyed on its full path. Relies on CATEGORIES
 * listing parents before children.
 */
export async function upsertCategories(
  stats: RunStats,
  verbose: boolean
): Promise<Map<string, number>> {
  // ponytail: one page of categories. A store with >250 would need paging.
  const existing = await bc<BcCategory[]>(
    "GET",
    `/v3/catalog/trees/categories?limit=${PAGE_MAX}`
  );

  const byPath = new Map(existing.map((c) => [c.url.path, c.category_id]));

  for (const def of CATEGORIES) {
    if (byPath.has(def.path)) {
      if (verbose) log.info(`Category exists: ${def.path}`);
      continue;
    }

    const parent = parentPath(def.path);
    const parentId = parent === null ? 0 : byPath.get(parent);

    if (parentId === undefined) {
      throw new Error(
        `Category ${def.path} needs parent ${parent}, which does not exist. ` +
          "List parents before children in CATEGORIES."
      );
    }

    const [created] = await bc<BcCategory[]>(
      "POST",
      "/v3/catalog/trees/categories",
      [
        {
          tree_id: TREE_ID,
          parent_id: parentId,
          name: def.name,
          description: def.description,
          url: { path: def.path, is_customized: true },
          is_visible: true,
        },
      ]
    );

    if (!created) throw new Error(`Category ${def.path} — no row returned`);

    byPath.set(def.path, created.category_id);
    stats.created++;
    log.info(`Category created: ${def.path}`);
  }

  return byPath;
}

// ---------------------------------------------------------------------------
// Product sub-resources
// ---------------------------------------------------------------------------

/** Creates missing options and returns BigCommerce ids for every option value. */
async function upsertOptions(
  productId: number,
  defs: OptionDef[]
): Promise<OptionIndex> {
  const index: OptionIndex = new Map();
  if (defs.length === 0) return index;

  const existing = await bc<BcOption[]>(
    "GET",
    `/v3/catalog/products/${productId}/options`
  );

  for (const def of defs) {
    const option =
      existing.find((o) => o.display_name === def.name) ??
      (await bc<BcOption>("POST", `/v3/catalog/products/${productId}/options`, {
        display_name: def.name,
        type: def.type,
        option_values: def.values.map((v, i) => ({
          label: v.label,
          sort_order: i,
          ...(v.hex === undefined ? {} : { value_data: { colors: [v.hex] } }),
        })),
      }));

    index.set(def.name, {
      optionId: option.id,
      valueIds: new Map(option.option_values.map((v) => [v.label, v.id])),
    });
  }

  return index;
}

/**
 * Creates or updates one variant per definition, keyed on SKU. An existing
 * variant that already has an image keeps it — re-sending the source URL would
 * make BigCommerce re-download the file on every run.
 */
async function upsertVariants(
  productId: number,
  defs: VariantDef[],
  optionDefs: OptionDef[],
  index: OptionIndex
): Promise<void> {
  if (defs.length === 0) return;

  const existing = await bc<BcVariant[]>(
    "GET",
    `/v3/catalog/products/${productId}/variants?limit=${PAGE_MAX}`
  );
  const bySku = new Map(existing.map((v) => [v.sku, v]));

  for (const def of defs) {
    const found = bySku.get(def.sku);
    const prices = {
      ...(def.price === undefined ? {} : { price: def.price }),
      ...(def.salePrice === undefined ? {} : { sale_price: def.salePrice }),
    };

    if (found) {
      await bc(
        "PUT",
        `/v3/catalog/products/${productId}/variants/${found.id}`,
        {
          ...prices,
          ...(def.imageUrl !== undefined && !found.image_url
            ? { image_url: def.imageUrl }
            : {}),
        }
      );
      continue;
    }

    const optionValues = def.optionLabels.map((label, i) => {
      const optionName = optionDefs[i]?.name;
      const entry =
        optionName === undefined ? undefined : index.get(optionName);
      const valueId = entry?.valueIds.get(label);

      if (entry === undefined || valueId === undefined) {
        throw new Error(
          `Variant ${def.sku} references option value "${label}" which does ` +
            `not exist on option "${optionName}"`
        );
      }

      return { option_id: entry.optionId, id: valueId };
    });

    await bc("POST", `/v3/catalog/products/${productId}/variants`, {
      sku: def.sku,
      ...prices,
      ...(def.imageUrl === undefined ? {} : { image_url: def.imageUrl }),
      option_values: optionValues,
    });
  }
}

/** Attaches any image whose alt text is not already on the product. */
async function upsertImages(
  productId: number,
  defs: ImageDef[]
): Promise<void> {
  if (defs.length === 0) return;

  const existing = await bc<BcImage[]>(
    "GET",
    `/v3/catalog/products/${productId}/images`
  );
  const seen = new Set(existing.map((i) => i.description));

  for (const [i, def] of defs.entries()) {
    if (seen.has(def.alt)) continue;
    await bc("POST", `/v3/catalog/products/${productId}/images`, {
      image_url: def.url,
      description: def.alt,
      is_thumbnail: i === 0,
      sort_order: i,
    });
  }
}

/** Creates or rewrites metafields, keyed on `namespace:key`. */
async function upsertMetafields(
  productId: number,
  defs: MetafieldDef[]
): Promise<void> {
  if (defs.length === 0) return;

  const existing = await bc<BcMetafield[]>(
    "GET",
    `/v3/catalog/products/${productId}/metafields?limit=${PAGE_MAX}`
  );
  const byKey = new Map(existing.map((m) => [`${m.namespace}:${m.key}`, m.id]));

  for (const def of defs) {
    const id = byKey.get(`${def.namespace}:${def.key}`);

    if (id === undefined) {
      await bc("POST", `/v3/catalog/products/${productId}/metafields`, {
        namespace: def.namespace,
        key: def.key,
        value: def.value,
        permission_set: METAFIELD_PERMISSION,
      });
      continue;
    }

    await bc("PUT", `/v3/catalog/products/${productId}/metafields/${id}`, {
      value: def.value,
      permission_set: METAFIELD_PERMISSION,
    });
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/** Creates or updates one product and all of its sub-resources. */
export async function upsertProduct(
  def: ProductDef,
  categoryIds: Map<string, number>,
  stats: RunStats,
  verbose: boolean
): Promise<void> {
  const categoryId = categoryIds.get(def.categoryPath);
  if (categoryId === undefined) {
    throw new Error(
      `Product ${def.sku} — unknown category ${def.categoryPath}`
    );
  }

  const body = {
    name: def.name,
    type: "physical",
    sku: def.sku,
    description: def.description,
    price: def.price,
    ...(def.salePrice === undefined ? {} : { sale_price: def.salePrice }),
    ...(def.retailPrice === undefined ? {} : { retail_price: def.retailPrice }),
    weight: def.weight,
    categories: [categoryId],
    is_visible: true,
    availability: "available",
  };

  const [found] = await bc<BcProduct[]>(
    "GET",
    `/v3/catalog/products?sku=${encodeURIComponent(def.sku)}&limit=1`
  );

  const product = found
    ? await bc<BcProduct>("PUT", `/v3/catalog/products/${found.id}`, body)
    : await bc<BcProduct>("POST", "/v3/catalog/products", body);

  const index = await upsertOptions(product.id, def.options);
  await upsertVariants(product.id, def.variants, def.options, index);
  await upsertImages(product.id, def.images);
  await upsertMetafields(product.id, def.metafields);

  if (found) {
    stats.updated++;
    if (verbose) log.info(`Updated: ${def.sku} ${def.name}`);
  } else {
    stats.created++;
    log.info(`Created: ${def.sku} ${def.name}`);
  }
}
