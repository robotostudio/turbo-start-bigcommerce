/**
 * Reads the live Shopify catalog through the Admin GraphQL API and shapes it
 * into the definitions `seed.ts` writes to BigCommerce.
 *
 * Shopify is the source of truth. The only things hardcoded here are the two
 * facts Shopify has no field for: which option renders as a colour swatch, and
 * what hex each colour name means.
 */

import "dotenv/config";

import { log } from "./client.js";
import type {
  Catalog,
  CategoryDef,
  ImageDef,
  OptionDef,
  ProductDef,
  VariantDef,
} from "./types.js";

const API_VERSION = "2026-01";
const PRODUCT_PAGE = 25;

/**
 * BigCommerce refuses an upload over 8 MB and the source PNGs are ~12 MB, so
 * every image URL goes through Shopify's CDN resizer on the way out.
 */
const IMAGE_WIDTH = 1600;

/** The option BigCommerce should render as swatches rather than buttons. */
const SWATCH_OPTION = "Color";

/**
 * Swatch hexes for this catalog's colourways, copied from the storefront's own
 * `lib/shopify/color.ts` so the seeded swatches match what the site renders.
 * Shopify has nowhere to put a hex, so a name that is not listed falls back to
 * neutral grey and logs — a visible swatch beats a failed write.
 */
const SWATCH_HEX: Record<string, string> = {
  black: "#000000",
  "chalk white": "#f2f0ea",
  ecru: "#e2d8c3",
  "ecru multi": "#d9c7a8",
  "faded rose": "#c89aa0",
  indigo: "#37496b",
  "indigo rinse": "#2c3e5d",
  ivory: "#fffff0",
  "oat melange": "#d8c9b4",
  "olive drab": "#6b6b47",
  "undyed ecru": "#ede6d6",
  "warm stone": "#8ca6c4",
  "washed black": "#3a3a3c",
};

const FALLBACK_HEX = "#cccccc";

/** Grams in one unit of each weight unit Shopify and BigCommerce both name. */
const GRAMS_PER_UNIT: Record<string, number> = {
  grams: 1,
  kilograms: 1000,
  ounces: 28.349_523_125,
  pounds: 453.592_37,
};

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

interface ShopifyImage {
  url: string;
  altText: string | null;
}

interface ShopifyVariant {
  sku: string;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  selectedOptions: { name: string; value: string }[];
  image: ShopifyImage | null;
  inventoryItem: {
    measurement: { weight: { value: number; unit: string } | null } | null;
  } | null;
}

interface ShopifyProduct {
  handle: string;
  title: string;
  descriptionHtml: string;
  productType: string;
  tags: string[];
  options: { name: string; optionValues: { name: string }[] }[];
  media: { nodes: { image: ShopifyImage | null }[] };
  variants: { nodes: ShopifyVariant[] };
  collections: { nodes: { handle: string }[] };
}

interface ProductPage {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string };
    nodes: ShopifyProduct[];
  };
}

interface ShopifyCollection {
  handle: string;
  title: string;
  descriptionHtml: string;
  image: ShopifyImage | null;
}

const PRODUCTS_QUERY = `
query SeedProducts($cursor: String, $first: Int!) {
  products(first: $first, after: $cursor, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      handle
      title
      descriptionHtml
      productType
      tags
      options { name optionValues { name } }
      media(first: 50) { nodes { ... on MediaImage { image { url altText } } } }
      variants(first: 100) {
        nodes {
          sku
          price
          compareAtPrice
          inventoryQuantity
          selectedOptions { name value }
          image { url altText }
          inventoryItem { measurement { weight { value unit } } }
        }
      }
      collections(first: 50) { nodes { handle } }
    }
  }
}`;

const COLLECTIONS_QUERY = `
query SeedCollections {
  collections(first: 100, sortKey: TITLE) {
    nodes { handle title descriptionHtml image { url altText } }
  }
}`;

function credentials(): { domain: string; token: string } {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!domain || !token) {
    log.error(
      "SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN must both be set " +
        "in apps/studio/.env. This seed mirrors a Shopify store rather than " +
        "inventing a catalog, so it cannot run without read access to one."
    );
    process.exit(1);
  }

  return { domain, token };
}

async function adminQuery<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const { domain, token } = credentials();

  const res = await fetch(
    `https://${domain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!res.ok) {
    throw new Error(`Shopify Admin API — HTTP ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (body.errors?.length) {
    throw new Error(
      `Shopify Admin API: ${body.errors.map((e) => e.message).join("; ")}`
    );
  }
  if (!body.data) throw new Error("Shopify Admin API returned no data");

  return body.data;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/** Adds Shopify's CDN resize parameter, keeping the existing `?v=` intact. */
function resized(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("width", String(IMAGE_WIDTH));
  return parsed.toString();
}

/** `.../aster-denim-coach-jacket-indigo-rinse-01.png?v=1` → the bare filename. */
function imageKey(url: string): string {
  const file = new URL(url).pathname.split("/").pop() ?? url;
  return file.replace(/\.[^.]+$/, "");
}

function toStoreWeight(variant: ShopifyVariant, storeUnits: string): number {
  const measured = variant.inventoryItem?.measurement?.weight;
  if (!measured) return 0;

  const from = GRAMS_PER_UNIT[measured.unit.toLowerCase()] ?? 1;
  const to = GRAMS_PER_UNIT[storeUnits.toLowerCase()] ?? 1;
  return Number(((measured.value * from) / to).toFixed(2));
}

function toOption(
  option: ShopifyProduct["options"][number],
  missingHex: Set<string>
): OptionDef {
  const isSwatch = option.name === SWATCH_OPTION;

  return {
    name: option.name,
    type: isSwatch ? "swatch" : "rectangles",
    values: option.optionValues.map(({ name }) => {
      if (!isSwatch) return { label: name };

      const hex = SWATCH_HEX[name.toLowerCase()];
      if (hex === undefined) missingHex.add(name);
      return { label: name, hex: hex ?? FALLBACK_HEX };
    }),
  };
}

function toVariant(
  variant: ShopifyVariant,
  optionNames: string[]
): VariantDef {
  const price = Number(variant.price);
  const compareAt =
    variant.compareAtPrice === null ? null : Number(variant.compareAtPrice);
  const selected = new Map(
    variant.selectedOptions.map((o) => [o.name, o.value])
  );

  return {
    sku: variant.sku,
    optionLabels: optionNames.map((name) => selected.get(name) ?? ""),
    // Shopify's compare-at is the was-price, which is BigCommerce's `price`;
    // the live price is what BigCommerce calls `sale_price`.
    price: compareAt ?? price,
    ...(compareAt === null ? {} : { salePrice: price }),
    inventory: variant.inventoryQuantity ?? 0,
    ...(variant.image === null ? {} : { imageUrl: resized(variant.image.url) }),
  };
}

function toImages(product: ShopifyProduct): ImageDef[] {
  return product.media.nodes
    .map((node) => node.image)
    .filter((image): image is ShopifyImage => image !== null)
    .map((image) => ({
      url: resized(image.url),
      alt: image.altText ?? product.title,
      key: imageKey(image.url),
    }));
}

function toProduct(
  product: ShopifyProduct,
  storeUnits: string,
  missingHex: Set<string>
): ProductDef {
  const optionNames = product.options.map((o) => o.name);
  const source = product.variants.nodes[0];

  if (source === undefined) {
    throw new Error(`${product.handle}: Shopify product has no variants`);
  }

  const variants = product.variants.nodes.map((v) => toVariant(v, optionNames));
  // The default the storefront shows before a variant is chosen.
  const first = toVariant(source, optionNames);

  return {
    slug: product.handle,
    name: product.title,
    description: product.descriptionHtml,
    price: first.price,
    ...(first.salePrice === undefined ? {} : { salePrice: first.salePrice }),
    weight: toStoreWeight(source, storeUnits),
    categorySlugs: product.collections.nodes.map((c) => c.handle),
    images: toImages(product),
    options: product.options.map((o) => toOption(o, missingHex)),
    variants,
    // The storefront reads badges and specs off these, and they are the only
    // place Shopify's tags and product type survive the move.
    metafields: [
      { namespace: "turbo_start", key: "product_type", value: product.productType },
      { namespace: "turbo_start", key: "tags", value: product.tags.join(", ") },
    ].filter((m) => m.value !== ""),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Pulls every active product and every collection, then shapes them for the
 * BigCommerce writer. `storeUnits` is the target store's weight unit, so the
 * mirrored weights stay meaningful whatever it is set to.
 */
export async function fetchCatalog(storeUnits: string): Promise<Catalog> {
  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;

  for (;;) {
    const page: ProductPage = await adminQuery<ProductPage>(PRODUCTS_QUERY, {
      cursor,
      first: PRODUCT_PAGE,
    });

    products.push(...page.products.nodes);
    if (!page.products.pageInfo.hasNextPage) break;
    cursor = page.products.pageInfo.endCursor;
  }

  const { collections } = await adminQuery<{
    collections: { nodes: ShopifyCollection[] };
  }>(COLLECTIONS_QUERY);

  const missingHex = new Set<string>();

  const catalog: Catalog = {
    categories: collections.nodes.map((c, i) => ({
      slug: c.handle,
      name: c.title,
      description: c.descriptionHtml,
      ...(c.image === null ? {} : { imageUrl: resized(c.image.url) }),
      sortOrder: i,
    })),
    products: products.map((p) => toProduct(p, storeUnits, missingHex)),
  };

  if (missingHex.size > 0) {
    log.warn(
      `No swatch hex for ${[...missingHex].join(", ")} — using ${FALLBACK_HEX}. ` +
        "Add them to SWATCH_HEX in shopify.ts."
    );
  }

  return catalog;
}

/**
 * Asserts what the writer assumes, before the first BigCommerce call. Breaking
 * one of these would otherwise land as a half-mirrored store: some products
 * written, then a throw partway through.
 */
export function validateCatalog({ categories, products }: Catalog): void {
  if (products.length === 0) throw new Error("Shopify returned no products");

  const slugs = new Set(categories.map((c) => c.slug));
  const skus = new Set<string>();

  for (const product of products) {
    for (const slug of product.categorySlugs) {
      if (!slugs.has(slug)) {
        throw new Error(`${product.slug}: unknown collection ${slug}`);
      }
    }

    for (const variant of product.variants) {
      if (!variant.sku) {
        throw new Error(`${product.slug}: a variant has no SKU to key on`);
      }
      if (skus.has(variant.sku)) {
        throw new Error(`Duplicate variant SKU: ${variant.sku}`);
      }
      skus.add(variant.sku);

      variant.optionLabels.forEach((label, i) => {
        if (!product.options[i]?.values.some((v) => v.label === label)) {
          throw new Error(
            `${variant.sku}: "${label}" is not a value of option ${i}`
          );
        }
      });
    }
  }
}
