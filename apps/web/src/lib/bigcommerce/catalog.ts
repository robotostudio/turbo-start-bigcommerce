import "server-only";

import { env } from "@workspace/env/server";
import type { ResultOf } from "gql.tada";

import { storefrontQuery, type StorefrontQueryResult } from "./client";
import { graphql } from "./graphql";

/**
 * BigCommerce catalog reads: products, categories, and the path enumeration
 * that feeds `generateStaticParams`, the sitemap and llms.txt.
 *
 * Nothing imports this yet. It is the expand half of the commerce swap — the
 * PDP and category routes repoint at it in ROB-2537.
 *
 * Two behaviours here are load-bearing and easy to get wrong later:
 *
 * 1. `site.route` is asked for `redirectBehavior: FOLLOW`, not the schema
 *    default of `IGNORE`. BigCommerce auto-creates a 301 whenever a merchant
 *    renames a URL, so a stale link resolves to the live entity instead of
 *    404ing. `redirectTo` takes precedence over `node` — see `CatalogRoute`.
 * 2. Category paths are multi-segment by default. Every lookup joins the whole
 *    segment array into one path before calling `route`, so there is no
 *    single-segment special case to forget.
 */

const PRODUCT_PREFIX = "products";
const CATEGORY_PREFIX = "collections";

/** `site.products(first:)` refuses anything larger. */
const BATCH_LIMIT = 50;
const CATEGORY_PAGE_SIZE = 12;
const PATHS_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

/** Grid/PLP shape. Deliberately small: this runs 12-50 times per request. */
const ProductCard = graphql(`
  fragment ProductCard on Product {
    entityId
    name
    path
    brand {
      entityId
      name
    }
    defaultImage {
      url(width: 320)
      altText
    }
    prices {
      price {
        value
        currencyCode
      }
      basePrice {
        value
        currencyCode
      }
      salePrice {
        value
        currencyCode
      }
    }
  }
`);

/**
 * Everything a PDP needs in one request: detail, options, variants and the
 * `turbo_start` metafields. Mapping any of it — money, swatches, option and
 * variant matching — belongs to the sibling modules, not here.
 *
 * ponytail: variants capped at 25 and options at 10, which covers this store
 * (61 variants over 12 products, max 10 on one). A store that crosses three
 * option sets needs a cursor here, and a complexity budget to match.
 */
const ProductDetail = graphql(`
  fragment ProductDetail on Product {
    entityId
    sku
    path
    name
    description
    plainTextDescription(characterLimit: 200)
    type
    condition
    availabilityV2 {
      __typename
      status
      description
    }
    inventory {
      isInStock
      isStockTracked
      hasVariantInventory
      aggregated {
        availableToSell
        warningLevel
      }
    }
    prices {
      price {
        value
        currencyCode
      }
      basePrice {
        value
        currencyCode
      }
      salePrice {
        value
        currencyCode
      }
      retailPrice {
        value
        currencyCode
      }
      saved {
        value
        currencyCode
      }
      priceRange {
        min {
          value
          currencyCode
        }
        max {
          value
          currencyCode
        }
      }
    }
    brand {
      entityId
      name
      path
    }
    categories(first: 10) {
      edges {
        node {
          entityId
          name
          path
        }
      }
    }
    defaultImage {
      url(width: 640)
      urlOriginal
      altText
      isDefault
    }
    images(first: 20) {
      edges {
        node {
          url(width: 640)
          altText
          isDefault
        }
      }
    }
    productOptions(first: 10) {
      edges {
        node {
          __typename
          entityId
          displayName
          isRequired
          isVariantOption
          ... on MultipleChoiceOption {
            displayStyle
            values(first: 25) {
              edges {
                node {
                  __typename
                  entityId
                  label
                  isDefault
                  ... on SwatchOptionValue {
                    hexColors
                  }
                }
              }
            }
          }
        }
      }
    }
    metafields(namespace: "turbo_start", first: 25) {
      edges {
        node {
          entityId
          key
          value
        }
      }
    }
    seo {
      pageTitle
      metaDescription
      metaKeywords
    }
    variants(first: 25) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          entityId
          sku
          isPurchasable
          upc
          mpn
          gtin
          prices {
            price {
              value
              currencyCode
            }
            basePrice {
              value
              currencyCode
            }
            salePrice {
              value
              currencyCode
            }
            retailPrice {
              value
              currencyCode
            }
          }
          inventory {
            isInStock
            aggregated {
              availableToSell
              warningLevel
            }
          }
          options(first: 10) {
            edges {
              node {
                entityId
                displayName
                values(first: 10) {
                  edges {
                    node {
                      entityId
                      label
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);

const CategoryDetail = graphql(
  `
  fragment CategoryDetail on Category {
    entityId
    name
    path
    description
    defaultImage {
      url(width: 640)
      altText
    }
    breadcrumbs(depth: 5) {
      edges {
        node {
          entityId
          name
          path
        }
      }
    }
    seo {
      pageTitle
      metaDescription
      metaKeywords
    }
    products(first: $first, after: $after) {
      collectionInfo {
        totalItems
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          ...ProductCard
        }
      }
    }
  }
`,
  [ProductCard]
);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const ProductByPathQuery = graphql(
  `
  query ProductByPath($path: String!) {
    site {
      route(path: $path, redirectBehavior: FOLLOW) {
        redirect {
          toUrl
        }
        node {
          __typename
          ...ProductDetail
        }
      }
    }
  }
`,
  [ProductDetail]
);

const ProductByIdQuery = graphql(
  `
  query ProductById($entityId: Int!) {
    site {
      product(entityId: $entityId) {
        __typename
        ...ProductDetail
      }
    }
  }
`,
  [ProductDetail]
);

const ProductsByIdsQuery = graphql(
  `
  query ProductsByIds($entityIds: [Int!]!, $first: Int!) {
    site {
      products(entityIds: $entityIds, first: $first) {
        edges {
          node {
            ...ProductCard
          }
        }
      }
    }
  }
`,
  [ProductCard]
);

const CategoryByPathQuery = graphql(
  `
  query CategoryByPath($path: String!, $first: Int!, $after: String) {
    site {
      route(path: $path, redirectBehavior: FOLLOW) {
        redirect {
          toUrl
        }
        node {
          __typename
          ...CategoryDetail
        }
      }
    }
  }
`,
  [CategoryDetail]
);

const CategoryTreeQuery = graphql(`
  query CategoryTree {
    site {
      categoryTree {
        entityId
        name
        path
        description
        productCount
        hasChildren
        image {
          url(width: 320)
          altText
        }
        children {
          entityId
          name
          path
          productCount
          hasChildren
          children {
            entityId
            name
            path
            productCount
            hasChildren
          }
        }
      }
    }
  }
`);

/** Paths only. Cheap enough to page through a whole catalog at build time. */
const ProductPathsQuery = graphql(`
  query ProductPaths($first: Int!, $after: String) {
    site {
      products(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            path
          }
        }
      }
    }
  }
`);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductNode = Extract<
  NonNullable<ResultOf<typeof ProductByPathQuery>["site"]["route"]["node"]>,
  { __typename: "Product" }
>;

type CategoryNode = Extract<
  NonNullable<ResultOf<typeof CategoryByPathQuery>["site"]["route"]["node"]>,
  { __typename: "Category" }
>;

export type CatalogProduct = ProductNode;
export type CatalogCategory = CategoryNode;
export type CatalogProductCard = ResultOf<typeof ProductCard>;
export type CatalogCategoryTreeItem = ResultOf<
  typeof CategoryTreeQuery
>["site"]["categoryTree"][number];

/** The subset of a tree item every level of the query shares. */
export type CategoryTreeNode = {
  entityId: number;
  name: string;
  path: string;
  productCount: number;
  hasChildren: boolean;
  children?: readonly CategoryTreeNode[] | undefined;
};

/**
 * A resolved catalog route.
 *
 * Check the fields in this order, because BigCommerce can populate both at
 * once — a static redirect nulls `node`, a dynamic one (the 301 auto-created
 * on a rename) fills it with the destination entity:
 *
 *   1. `redirectTo` non-null → `redirect()`, so the canonical URL is what the
 *      shopper and the crawler end up on.
 *   2. `node` null → `notFound()`.
 *   3. otherwise render `node`.
 */
export type CatalogRoute<T> = {
  node: T | null;
  redirectTo: string | null;
};

/**
 * Page metadata with BigCommerce's empty-string-for-unset already resolved
 * against a fallback — see `resolveSeo`. `description` can still be empty if
 * the store filled in neither the SEO field nor the entity description, which
 * is the seeded catalog's current state.
 */
export type CatalogSeo = {
  title: string;
  description: string;
  keywords: string[];
};

type Connection<T> = { edges?: readonly ({ node: T } | null)[] | null } | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flattens a Relay connection, dropping null edges. */
export function nodes<T>(connection: Connection<T> | undefined): T[] {
  return connection?.edges?.flatMap((edge) => (edge ? [edge.node] : [])) ?? [];
}

/**
 * Joins catch-all route segments into a BigCommerce storefront path.
 *
 * Categories are multi-segment by default, so this runs for every lookup
 * rather than being reached for when a path looks nested. Leading and trailing
 * slashes are both significant to `site.route`.
 *
 * An empty segment array yields the bare `/{prefix}/` root, which is not a
 * catalog entity — Next's catch-all never produces one, and a caller that
 * hand-builds one gets a null node rather than the whole store.
 */
export function toRoutePath(prefix: string, segments: string[]): string {
  const parts = segments
    .flatMap((segment) => segment.split("/"))
    .map((segment) => segment.trim())
    .filter(Boolean);

  return `/${prefix}/${parts.join("/")}/`.replace(/\/{2,}/g, "/");
}

/** Inverse of `toRoutePath`: a storefront path back to catch-all segments. */
export function toSegments(path: string): string[] {
  return path.split("/").filter(Boolean).slice(1);
}

/**
 * BigCommerce returns `""` for an unset SEO field, not null, so `??` never
 * fires and the page ships an empty `<title>`. Everything here goes through
 * `||` on a trimmed value instead.
 */
export function resolveSeo(
  seo: { pageTitle: string; metaDescription: string; metaKeywords: string },
  fallback: { title: string; description?: string | null }
): CatalogSeo {
  return {
    title: seo.pageTitle.trim() || fallback.title,
    description: seo.metaDescription.trim() || (fallback.description ?? ""),
    keywords: seo.metaKeywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  };
}

/**
 * Depth-first flatten of `categoryTree`, parents before children. Typed
 * structurally because each level of the query selects one field fewer.
 */
export function flattenCategoryTree(
  tree: readonly CategoryTreeNode[]
): CategoryTreeNode[] {
  return tree.flatMap((item) => [
    item,
    ...flattenCategoryTree(item.children ?? []),
  ]);
}

/**
 * `toUrl` is absolute. Comparing pathnames keeps a redirect that points at the
 * path we already asked for from becoming a redirect loop in production.
 */
function redirectTarget(
  toUrl: string | undefined,
  path: string
): string | null {
  if (!toUrl) {
    return null;
  }

  try {
    return new URL(toUrl).pathname === path ? null : toUrl;
  } catch {
    return toUrl === path ? null : toUrl;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** A PDP by its storefront path. Segments are joined before the lookup. */
export async function getProductByPath(
  segments: string[]
): Promise<StorefrontQueryResult<CatalogRoute<CatalogProduct>>> {
  const path = toRoutePath(PRODUCT_PREFIX, segments);
  const result = await storefrontQuery(ProductByPathQuery, {
    variables: { path },
  });

  if (!result.ok) {
    return result;
  }

  const { node, redirect } = result.data.site.route;

  return {
    ok: true,
    data: {
      node: node?.__typename === "Product" ? node : null,
      redirectTo: redirectTarget(redirect?.toUrl, path),
    },
  };
}

/** A single PDP by id. Same selection as `getProductByPath`, no route wrapper. */
export async function getProductById(
  entityId: number
): Promise<StorefrontQueryResult<CatalogProduct | null>> {
  const result = await storefrontQuery(ProductByIdQuery, {
    variables: { entityId },
  });

  return result.ok
    ? { ok: true, data: result.data.site.product ?? null }
    : result;
}

/**
 * Card-shaped products for a list of ids — a Sanity-picked block, a
 * recommendation rail. Results come back in the order the ids were given,
 * because BigCommerce returns them in catalog order and a curated list cares.
 *
 * Ids that no longer resolve are dropped rather than erroring: one archived
 * product should not blank a whole page-builder block.
 */
export async function getProductsByIds(
  entityIds: number[]
): Promise<StorefrontQueryResult<CatalogProductCard[]>> {
  // `entityIds: []` means *no filter* to BigCommerce, which would fetch the
  // whole catalog. An empty request is an empty answer.
  if (entityIds.length === 0) {
    return { ok: true, data: [] };
  }

  const requested = entityIds.slice(0, BATCH_LIMIT);
  const result = await storefrontQuery(ProductsByIdsQuery, {
    variables: { entityIds: requested, first: requested.length },
  });

  if (!result.ok) {
    return result;
  }

  const byId = new Map(
    nodes(result.data.site.products).map((product) => [
      product.entityId,
      product,
    ])
  );

  return {
    ok: true,
    data: requested.flatMap((entityId) => {
      const product = byId.get(entityId);
      return product ? [product] : [];
    }),
  };
}

/**
 * A category by its storefront path, with its first page of products.
 *
 * `["jackets", "leather"]` becomes `/collections/jackets/leather/` — the whole
 * array is joined and looked up once, so a nested category is not a distinct
 * code path from a top-level one.
 */
export async function getCategoryByPath(
  segments: string[],
  options?: { first?: number; after?: string | null }
): Promise<StorefrontQueryResult<CatalogRoute<CatalogCategory>>> {
  const path = toRoutePath(CATEGORY_PREFIX, segments);
  const result = await storefrontQuery(CategoryByPathQuery, {
    variables: {
      path,
      first: options?.first ?? CATEGORY_PAGE_SIZE,
      after: options?.after ?? null,
    },
  });

  if (!result.ok) {
    return result;
  }

  const { node, redirect } = result.data.site.route;

  return {
    ok: true,
    data: {
      node: node?.__typename === "Category" ? node : null,
      redirectTo: redirectTarget(redirect?.toUrl, path),
    },
  };
}

/** The full category tree, three levels deep. One request, no pagination. */
export async function getCategoryTree(): Promise<
  StorefrontQueryResult<CatalogCategoryTreeItem[]>
> {
  const result = await storefrontQuery(CategoryTreeQuery);

  return result.ok ? { ok: true, data: result.data.site.categoryTree } : result;
}

// ---------------------------------------------------------------------------
// Path enumeration for prerendering
// ---------------------------------------------------------------------------

/**
 * How many product pages `generateStaticParams` prerenders. Everything past
 * the cap is left to render on demand — Next's `dynamicParams` defaults to
 * true, so an uncapped path still builds, it just builds on first request.
 * A 30,000-product store would otherwise make `pnpm build` unusable.
 */
export function prerenderLimit(): number {
  return env.BIGCOMMERCE_PRERENDER_LIMIT;
}

/** One page of product paths, plus the cursor for the next one. */
async function fetchProductPathPage(
  first: number,
  after: string | null
): Promise<StorefrontQueryResult<{ paths: string[]; next: string | null }>> {
  const result = await storefrontQuery(ProductPathsQuery, {
    variables: { first, after },
  });

  if (!result.ok) {
    return result;
  }

  const connection = result.data.site.products;

  return {
    ok: true,
    data: {
      paths: nodes(connection).map((product) => product.path),
      next: connection.pageInfo.hasNextPage
        ? (connection.pageInfo.endCursor ?? null)
        : null,
    },
  };
}

/**
 * Product paths for `generateStaticParams`, the sitemap and llms.txt, paged
 * until the cap is reached rather than fetched in one oversized request.
 */
export async function getProductPaths(
  limit = prerenderLimit()
): Promise<StorefrontQueryResult<string[]>> {
  const paths: string[] = [];
  let after: string | null = null;

  while (paths.length < limit) {
    const first = Math.min(PATHS_PAGE_SIZE, limit - paths.length);
    const result = await fetchProductPathPage(first, after);

    if (!result.ok) {
      return result;
    }

    paths.push(...result.data.paths);

    // An empty page that still claims a next cursor would spin the build
    // forever, so no progress ends the walk regardless of what the API says.
    if (!result.data.next || result.data.paths.length === 0) {
      break;
    }

    after = result.data.next;
  }

  // `first` already bounds each request, so this only bites if the API returns
  // more than it was asked for. The cap is the point of the whole function —
  // it holds whatever the other end does.
  return { ok: true, data: paths.slice(0, limit) };
}

/**
 * Category paths. The tree arrives whole in one request, so there is nothing
 * to page and nothing to cap — a catalog with more categories than that has
 * bigger problems than its build time.
 */
export async function getCategoryPaths(): Promise<
  StorefrontQueryResult<string[]>
> {
  const result = await getCategoryTree();

  return result.ok
    ? {
        ok: true,
        data: flattenCategoryTree(result.data).map((item) => item.path),
      }
    : result;
}
