/**
 * Idempotent writes against the REST Catalog API.
 *
 * Every resource is looked up before it is written, keyed on something Shopify
 * controls: categories and products on their storefront URL, variants on SKU,
 * options on display name, images on their source filename, metafields on
 * `namespace:key`. Re-running updates in place instead of appending, and
 * anything in BigCommerce that is no longer in Shopify is deleted, so the two
 * catalogs converge rather than drift.
 */

import { bc, log } from "./client.js";
import type {
  Catalog,
  CategoryDef,
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

/** Ids per bulk delete. Long `id:in=` query strings get rejected. */
const DELETE_CHUNK = 50;

/**
 * Storefront GraphQL only returns metafields whose permission set grants
 * storefront access. Plain `read` is admin-only and reads back as an empty
 * `metafields` connection — a 200 on write and nothing on read.
 */
const METAFIELD_PERMISSION = "read_and_sf_access";

/**
 * The reference storefront links to `/collections/{handle}` and
 * `/products/{handle}`, so both URLs are set explicitly. BigCommerce otherwise
 * derives a category path from its position in the tree and a product path
 * from its name.
 */
export const categoryPath = (slug: string) => `/collections/${slug}/`;
export const productPath = (slug: string) => `/products/${slug}/`;

interface BcCategory {
  category_id: number;
  name: string;
  url: { path: string };
}

interface BcProduct {
  id: number;
  name: string;
  custom_url: { url: string };
}

interface BcOption {
  id: number;
  display_name: string;
  option_values: { id: number; label: string }[];
}

interface BcVariant {
  id: number;
  sku: string;
  image_url?: string;
}

interface BcImage {
  id: number;
  image_file: string;
}

interface BcMetafield {
  id: number;
  namespace: string;
  key: string;
}

// ---------------------------------------------------------------------------
// Listing and pruning
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<BcCategory[]> {
  return await bc<BcCategory[]>(
    "GET",
    `/v3/catalog/trees/categories?limit=${PAGE_MAX}`
  );
}

export async function listProducts(): Promise<BcProduct[]> {
  const all: BcProduct[] = [];

  for (let page = 1; ; page++) {
    const rows = await bc<BcProduct[]>(
      "GET",
      `/v3/catalog/products?limit=${PAGE_MAX}&page=${page}`
    );
    all.push(...rows);
    if (rows.length < PAGE_MAX) return all;
  }
}

async function deleteInChunks(
  path: string,
  param: string,
  ids: number[]
): Promise<void> {
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    const chunk = ids.slice(i, i + DELETE_CHUNK);
    await bc("DELETE", `${path}?${param}:in=${chunk.join(",")}`);
  }
}

/**
 * Deletes every product and category BigCommerce holds that Shopify does not.
 * This is what makes the script a mirror rather than an importer — and it is
 * destructive, so it only ever runs against the store the credentials name.
 */
export async function pruneCatalog(
  catalog: Catalog,
  stats: RunStats
): Promise<void> {
  const wantedProducts = new Set(catalog.products.map((p) => productPath(p.slug)));
  const staleProducts = (await listProducts()).filter(
    (p) => !wantedProducts.has(p.custom_url?.url)
  );

  if (staleProducts.length > 0) {
    log.info(`Deleting ${staleProducts.length} products not in Shopify…`);
    await deleteInChunks(
      "/v3/catalog/products",
      "id",
      staleProducts.map((p) => p.id)
    );
    stats.deleted += staleProducts.length;
  }

  const wantedCategories = new Set(
    catalog.categories.map((c) => categoryPath(c.slug))
  );
  const staleCategories = (await listCategories()).filter(
    (c) => !wantedCategories.has(c.url?.path)
  );

  if (staleCategories.length > 0) {
    log.info(`Deleting ${staleCategories.length} categories not in Shopify…`);
    // Deepest first: a parent cannot be removed while it still has children.
    const ids = staleCategories
      .sort((a, b) => b.url.path.length - a.url.path.length)
      .map((c) => c.category_id);
    await deleteInChunks("/v3/catalog/trees/categories", "category_id", ids);
    stats.deleted += staleCategories.length;
  }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function categoryBody(def: CategoryDef) {
  return {
    tree_id: TREE_ID,
    parent_id: 0,
    name: def.name,
    description: def.description,
    sort_order: def.sortOrder,
    url: { path: categoryPath(def.slug), is_customized: true },
    ...(def.imageUrl === undefined ? {} : { image_url: def.imageUrl }),
    is_visible: true,
  };
}

/**
 * Mirrors the Shopify collections as a flat set of categories. Flat is the
 * point: a nested BigCommerce tree would put the parent segments back into the
 * path and stop `/collections/{handle}/` matching.
 */
export async function upsertCategories(
  defs: CategoryDef[],
  stats: RunStats
): Promise<Map<string, number>> {
  const existing = await listCategories();
  const byPath = new Map(existing.map((c) => [c.url?.path, c.category_id]));

  const updates = defs
    .filter((d) => byPath.has(categoryPath(d.slug)))
    .map((d) => ({
      category_id: byPath.get(categoryPath(d.slug)) as number,
      ...categoryBody(d),
    }));
  const creates = defs.filter((d) => !byPath.has(categoryPath(d.slug)));

  if (updates.length > 0) {
    await bc("PUT", "/v3/catalog/trees/categories", updates);
    stats.updated += updates.length;
  }

  if (creates.length > 0) {
    await bc("POST", "/v3/catalog/trees/categories", creates.map(categoryBody));
    stats.created += creates.length;
    log.info(`Categories created: ${creates.map((c) => c.name).join(", ")}`);
  }

  // Ids come from a fresh list rather than from the create response, so a
  // create that BigCommerce accepted but reported slowly still resolves.
  const created = new Map(
    (await listCategories()).map((c) => [c.url?.path, c.category_id])
  );

  return new Map(
    defs.map((d) => {
      const id = created.get(categoryPath(d.slug));
      if (id === undefined) {
        throw new Error(`Category ${categoryPath(d.slug)} was not created`);
      }
      return [d.slug, id];
    })
  );
}

// ---------------------------------------------------------------------------
// Product sub-resources
// ---------------------------------------------------------------------------

/** Creates missing options and values, and returns ids for every value. */
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
    const found = existing.find((o) => o.display_name === def.name);

    const option =
      found ??
      (await bc<BcOption>("POST", `/v3/catalog/products/${productId}/options`, {
        display_name: def.name,
        type: def.type,
        option_values: def.values.map((v, i) => ({
          label: v.label,
          sort_order: i,
          ...(v.hex === undefined ? {} : { value_data: { colors: [v.hex] } }),
        })),
      }));

    const valueIds = new Map(option.option_values.map((v) => [v.label, v.id]));

    // A colourway added upstream is appended rather than rebuilt: replacing an
    // option's values would orphan every variant already pointing at them.
    for (const [i, value] of def.values.entries()) {
      if (valueIds.has(value.label)) continue;
      const added = await bc<{ id: number; label: string }>(
        "POST",
        `/v3/catalog/products/${productId}/options/${option.id}/values`,
        {
          label: value.label,
          sort_order: i,
          ...(value.hex === undefined ? {} : { value_data: { colors: [value.hex] } }),
        }
      );
      valueIds.set(added.label, added.id);
    }

    index.set(def.name, { optionId: option.id, valueIds });
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
    // A zero sale price is BigCommerce for "not reduced", and sending it is
    // what clears a discount that has since ended upstream.
    const prices = { price: def.price, sale_price: def.salePrice ?? 0 };

    if (found) {
      await bc("PUT", `/v3/catalog/products/${productId}/variants/${found.id}`, {
        ...prices,
        inventory_level: def.inventory,
        ...(def.imageUrl !== undefined && !found.image_url
          ? { image_url: def.imageUrl }
          : {}),
      });
      continue;
    }

    const optionValues = def.optionLabels.map((label, i) => {
      const optionName = optionDefs[i]?.name;
      const entry = optionName === undefined ? undefined : index.get(optionName);
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
      inventory_level: def.inventory,
      ...(def.imageUrl === undefined ? {} : { image_url: def.imageUrl }),
      option_values: optionValues,
    });
  }
}

/**
 * Uploads any image the product does not already have and removes any it
 * should no longer have. The key is the source filename, which BigCommerce
 * keeps inside `image_file`: Shopify's alt text repeats across every shot of
 * one colourway and so cannot tell four images apart.
 */
async function upsertImages(
  productId: number,
  defs: ImageDef[]
): Promise<void> {
  const existing = await bc<BcImage[]>(
    "GET",
    `/v3/catalog/products/${productId}/images`
  );

  const wanted = new Set(defs.map((d) => d.key));
  const stale = existing.filter(
    (image) => ![...wanted].some((key) => image.image_file.includes(key))
  );

  for (const image of stale) {
    await bc("DELETE", `/v3/catalog/products/${productId}/images/${image.id}`);
  }

  for (const [i, def] of defs.entries()) {
    if (existing.some((image) => image.image_file.includes(def.key))) continue;
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
  existing: Map<string, number>,
  stats: RunStats,
  verbose: boolean
): Promise<number> {
  const categories = def.categorySlugs.map((slug) => {
    const id = categoryIds.get(slug);
    if (id === undefined) {
      throw new Error(`Product ${def.slug} — unknown collection ${slug}`);
    }
    return id;
  });

  const body = {
    name: def.name,
    type: "physical",
    description: def.description,
    price: def.price,
    sale_price: def.salePrice ?? 0,
    weight: def.weight,
    categories,
    custom_url: { url: productPath(def.slug), is_customized: true },
    inventory_tracking: def.variants.length > 0 ? "variant" : "none",
    is_visible: true,
    availability: "available",
  };

  const foundId = existing.get(productPath(def.slug));

  const product = foundId
    ? await bc<BcProduct>("PUT", `/v3/catalog/products/${foundId}`, body)
    : await bc<BcProduct>("POST", "/v3/catalog/products", body);

  const index = await upsertOptions(product.id, def.options);
  await upsertVariants(product.id, def.variants, def.options, index);
  await upsertImages(product.id, def.images);
  await upsertMetafields(product.id, def.metafields);

  if (foundId) {
    stats.updated++;
    if (verbose) log.info(`Updated: ${def.slug}`);
  } else {
    stats.created++;
    log.info(`Created: ${def.slug} — ${def.name}`);
  }

  return product.id;
}

/**
 * Binds products to the storefront channel. New products are not assigned
 * automatically, and an unassigned product is invisible to the Storefront API
 * with no error to explain why.
 */
export async function assignToChannel(
  productIds: number[],
  channelId: number
): Promise<void> {
  if (productIds.length === 0) return;

  await bc(
    "PUT",
    "/v3/catalog/products/channel-assignments",
    productIds.map((product_id) => ({ product_id, channel_id: channelId }))
  );
}
