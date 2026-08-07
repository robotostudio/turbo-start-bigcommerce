/**
 * One-time BigCommerce → Sanity catalog sync.
 *
 *   pnpm --filter studio sync:bigcommerce
 *
 * Shopify Connect syncs a Shopify store into Sanity `product` / `collection`
 * documents. BigCommerce has no equivalent, so the dataset is empty and both
 * `/collections` and `/products/{handle}` fall through. This script fills that
 * gap once, by hand.
 *
 * It is deliberately temporary. The `product` and `collection` types are
 * Shopify-shaped and are deleted at ROB-2550, when product pages become
 * catalog-required with no Sanity document in the path. Nothing here is a sync
 * framework: no webhooks, no reconcile sweep, no variant documents.
 *
 * The one durable part is the document ids. `bigcommerceProduct-{entityId}`
 * and `bigcommerceCategory-{entityId}` are the scheme SPEC.md fixes for the
 * real sync, so when the proper BigCommerce document types land the ids
 * already line up and no content migration is needed.
 *
 * Runs against apps/web's Storefront client rather than a second HTTP client,
 * which is why the package script needs `--conditions react-server` (that
 * client imports `server-only`) and both env files.
 */

import { createClient } from "@sanity/client";
import { Logger } from "@workspace/logger";

import { storefrontQuery } from "../../web/src/lib/bigcommerce/client";

const logger = new Logger("SyncBigCommerceSanity");

/** Widest CDN rendition worth storing; `next/image` resizes from here. */
const IMAGE_WIDTH = 1200;

/**
 * Products per Storefront page. 25 scores ~3,100 of the client's 10,000
 * complexity budget; 50 scores ~6,300, which is too close to the ceiling for a
 * store with richer option sets than the seeded one.
 */
const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/**
 * BigCommerce credentials are validated by `@workspace/env/server` when the
 * Storefront client is imported, so only the Sanity write side is checked here.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in apps/studio/.env before running the sync.`
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/**
 * BigCommerce paths carry a leading slash, usually a trailing one, and for
 * categories any number of intermediate segments (`/shop/mens/jackets/`).
 * `/collections/{slug}` and `/products/{handle}` are single dynamic segments,
 * so a stored slug containing a slash can never match the route.
 *
 * Strip the outer slashes and join the rest with `-`. For products, whose
 * paths are always one segment, the result is byte-identical to BigCommerce's
 * own handle. For categories it is a lossless, collision-free flattening of
 * the full path — the last segment alone would collide the moment two
 * branches share a leaf name.
 */
function slugFromPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
}

// ---------------------------------------------------------------------------
// BigCommerce reads
// ---------------------------------------------------------------------------

type BigCommerceImage = { url: string } | null;

type CategoryNode = {
  entityId: number;
  name: string;
  path: string;
  description: string;
  image: BigCommerceImage;
  children?: CategoryNode[];
};

const CATEGORY_FIELDS = `
  entityId
  name
  path
  description
  image { url(width: ${IMAGE_WIDTH}) }
`;

// ponytail: four hardcoded levels, because GraphQL has no recursive
// selection. The seeded store's deepest path is three (/shop/mens/jackets/).
// If a fifth level ever appears, its categories are silently skipped — the
// real sync should page `site.categories` instead of walking the tree.
const CATEGORIES_QUERY = `
  query SyncCategories {
    site {
      categoryTree {
        ${CATEGORY_FIELDS}
        children {
          ${CATEGORY_FIELDS}
          children {
            ${CATEGORY_FIELDS}
            children { ${CATEGORY_FIELDS} }
          }
        }
      }
    }
  }
`;

type ProductNode = {
  id: string;
  entityId: number;
  name: string;
  path: string;
  sku: string;
  description: string;
  createdAt: { utc: string };
  defaultImage: BigCommerceImage;
  brand: { name: string } | null;
  categories: { edges: { node: { name: string } }[] | null };
  prices: { priceRange: { min: { value: number }; max: { value: number } } };
  productOptions: {
    edges:
      | {
          node: {
            displayName: string;
            values?: { edges: { node: { label: string } }[] | null };
          };
        }[]
      | null;
  };
};

const PRODUCTS_QUERY = `
  query SyncProducts($cursor: String) {
    site {
      products(first: ${PAGE_SIZE}, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            entityId
            name
            path
            sku
            description
            createdAt { utc }
            defaultImage { url(width: ${IMAGE_WIDTH}) }
            brand { name }
            categories(first: 1) { edges { node { name } } }
            prices { priceRange { min { value } max { value } } }
            productOptions(first: 5) {
              edges {
                node {
                  displayName
                  ... on MultipleChoiceOption {
                    values(first: 20) { edges { node { label } } }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/** Depth-first flatten of the category tree into one list. */
function flattenCategories(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenCategories(node.children ?? []),
  ]);
}

async function fetchCategories(): Promise<CategoryNode[]> {
  const result = await storefrontQuery<{
    site: { categoryTree: CategoryNode[] };
  }>(CATEGORIES_QUERY);

  if (!result.ok) {
    throw new Error(`Category fetch failed (${result.kind}): ${result.error}`);
  }

  return flattenCategories(result.data.site.categoryTree);
}

type ProductsPage = {
  site: {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: { node: ProductNode }[] | null;
    };
  };
};

async function fetchProducts(): Promise<ProductNode[]> {
  const products: ProductNode[] = [];
  let cursor: string | null = null;

  do {
    const result = await storefrontQuery<
      ProductsPage,
      { cursor: string | null }
    >(PRODUCTS_QUERY, { variables: { cursor } });

    if (!result.ok) {
      throw new Error(`Product fetch failed (${result.kind}): ${result.error}`);
    }

    const page: ProductsPage["site"]["products"] = result.data.site.products;
    products.push(...(page.edges ?? []).map((edge) => edge.node));
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  return products;
}

// ---------------------------------------------------------------------------
// Sanity documents
// ---------------------------------------------------------------------------

/**
 * `store` mirrors the `shopifyCollection` object type. `imageUrl` points at
 * BigCommerce's CDN rather than a Sanity asset — no bytes are re-uploaded.
 */
function toCollectionDoc(category: CategoryNode, domain: string) {
  return {
    _id: `bigcommerceCategory-${category.entityId}`,
    _type: "collection",
    store: {
      id: category.entityId,
      gid: `bc/store/category/${category.entityId}`,
      title: category.name,
      slug: { _type: "slug", current: slugFromPath(category.path) },
      descriptionHtml: category.description,
      imageUrl: category.image?.url,
      isDeleted: false,
      shop: { domain },
    },
  };
}

/**
 * `store` mirrors the `shopifyProduct` object type.
 *
 * `status` is always `"active"`: the Storefront API only returns products that
 * are visible on the channel, which is what Shopify's `active` means. Anything
 * else here and both `queryProductByHandle` and `queryProductPaths` drop the
 * document and the page 404s.
 *
 * `store.variants` is intentionally absent. It holds references to
 * `productVariant` documents, nothing in the collection or product queries
 * reads it, and the whole type is deleted at ROB-2550.
 */
function toProductDoc(product: ProductNode, domain: string) {
  const options = (product.productOptions.edges ?? [])
    .filter((edge) => edge.node.values)
    .map((edge, index) => ({
      _key: `option-${index}`,
      _type: "option",
      name: edge.node.displayName,
      values: (edge.node.values?.edges ?? []).map((value) => value.node.label),
    }));

  return {
    _id: `bigcommerceProduct-${product.entityId}`,
    _type: "product",
    store: {
      createdAt: product.createdAt.utc,
      status: "active",
      isDeleted: false,
      title: product.name,
      id: product.entityId,
      gid: product.id,
      slug: { _type: "slug", current: slugFromPath(product.path) },
      descriptionHtml: product.description,
      productType: product.categories.edges?.[0]?.node.name,
      vendor: product.brand?.name,
      priceRange: {
        minVariantPrice: product.prices.priceRange.min.value,
        maxVariantPrice: product.prices.priceRange.max.value,
      },
      previewImageUrl: product.defaultImage?.url,
      options,
      shop: { domain },
    },
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  const client = createClient({
    projectId: requireEnv("SANITY_STUDIO_PROJECT_ID"),
    dataset: requireEnv("SANITY_STUDIO_DATASET"),
    token: requireEnv("SANITY_API_WRITE_TOKEN"),
    apiVersion: process.env.SANITY_STUDIO_API_VERSION ?? "2024-10-01",
    useCdn: false,
  });

  const storeHash = requireEnv("BIGCOMMERCE_STORE_HASH");
  const domain = `store-${storeHash}.mybigcommerce.com`;

  const [categories, products] = await Promise.all([
    fetchCategories(),
    fetchProducts(),
  ]);

  logger.info(
    `Fetched ${categories.length} categories and ${products.length} products`
  );

  const collectionDocs = categories.map((c) => toCollectionDoc(c, domain));
  const productDocs = products.map((p) => toProductDoc(p, domain));

  // `createOrReplace` on deterministic ids: running twice writes the same
  // documents, so counts are stable and no duplicates accumulate.
  const transaction = client.transaction();
  for (const doc of collectionDocs) {
    transaction.createOrReplace(doc);
  }
  for (const doc of productDocs) {
    transaction.createOrReplace(doc);
  }
  await transaction.commit();

  const withImage = collectionDocs.filter((d) => d.store.imageUrl).length;

  logger.info(`Wrote ${collectionDocs.length} collection documents`);
  logger.info(`  ${withImage} of them have a BigCommerce category image`);
  logger.info(`Wrote ${productDocs.length} product documents`);
  logger.info(
    `Sample collection slug: ${collectionDocs.at(-1)?.store.slug.current}`
  );
  logger.info(`Sample product slug: ${productDocs[0]?.store.slug.current}`);
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
