import "server-only";

import { env } from "@workspace/env/server";
import type { ResultOf } from "gql.tada";

import { type StorefrontQueryResult, storefrontQuery } from "./client";
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

/**
 * Grid/PLP shape. Carries options, variants and metafields so every card can
 * render swatches, sizes, badges, hover add-to-cart and the `?Color=`
 * preselect. Measured live at first: 12: complexity 4698 of the 10000
 * per-request budget — small enough to run on every PLP, load-more page and
 * search grid. The review summary costs 3 of that, measured by running the
 * same query with and without it.
 */
export const ProductCard = graphql(`
  fragment ProductCard on Product {
    entityId
    name
    path
    brand {
      entityId
      name
    }
    inventory {
      isInStock
      hasVariantInventory
      # Null on any store that tracks stock per variant, which is most of them
      # — but it is what turns a card's stock badge from "in stock" into "only
      # 3 left", so it stays for the stores that do populate it.
      aggregated {
        availableToSell
      }
    }
    # averageRating is flagged alpha and not for production use, so the average
    # is divided out of these two instead.
    reviewSummary {
      numberOfReviews
      summationOfRatings
    }
    defaultImage {
      url(width: 320)
      altText
    }
    images(first: 6) {
      edges {
        node {
          url(width: 320)
          altText
          isDefault
        }
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
    }
    productOptions(first: 5) {
      edges {
        node {
          __typename
          entityId
          displayName
          ... on MultipleChoiceOption {
            values(first: 25) {
              edges {
                node {
                  __typename
                  entityId
                  label
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
    variants(first: 15) {
      edges {
        node {
          entityId
          isPurchasable
          prices {
            price {
              value
              currencyCode
            }
          }
          inventory {
            isInStock
          }
          defaultImage {
            url(width: 320)
          }
          options(first: 5) {
            edges {
              node {
                displayName
                values(first: 10) {
                  edges {
                    node {
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
    metafields(namespace: "turbo_start", first: 5) {
      edges {
        node {
          key
          value
        }
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
    # No product-level sku: BigCommerce leaves it empty whenever the SKUs live
    # on the variants, which is every product in this catalog. Read the variant
    # sku instead — the JSON-LD and the cart lines already do.
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
    # No aggregated roll-up here either. The PDP reads stock per variant, so it
    # would be a null nothing renders. The card fragment keeps it because its
    # stock badge does read it.
    inventory {
      isInStock
      isStockTracked
      hasVariantInventory
    }
    # averageRating is flagged alpha and not for production use, so the average
    # is divided out of these two instead.
    reviewSummary {
      numberOfReviews
      summationOfRatings
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
    products(first: $first, after: $after) @include(if: $withProducts) {
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
          # Which kind of redirect this is decides whether the shopper may be
          # sent off this storefront — see redirectTarget below.
          to {
            __typename
          }
        }
        node {
          __typename
          # The inline wrap is load-bearing: a bare named-fragment spread on
          # the route's interface field silently drops productOptions and
          # defaultImage — same complexity, HTTP 200, no errors key.
          ... on Product {
            ...ProductDetail
          }
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

/**
 * `$withProducts` exists because BigCommerce charges complexity on what a query
 * *executes*, not on what it declares: this document costs 4724 with the
 * products connection included and 1022 with `@include(if: false)`, measured on
 * the seeded store. The category page and `generateMetadata` want the route
 * resolution and the category's own fields without a page of products attached
 * — the listing comes from `searchCatalog` instead — so they pass false and pay
 * the 1022.
 *
 * There is no sort argument here. `Category.products` sorts with
 * `CategoryProductSort`, but no caller sorts through this document any more:
 * the listings moved to `searchProducts`, and what is left — related products,
 * the Markdown rendering — wants the category's own order. (A `#` comment
 * inside the variable list is what gql.tada's type-level parser chokes on,
 * hence this note out here.)
 */
const CategoryByPathQuery = graphql(
  `
  query CategoryByPath(
    $path: String!
    $first: Int!
    $after: String
    $withProducts: Boolean!
  ) {
    site {
      route(path: $path, redirectBehavior: FOLLOW) {
        redirect {
          toUrl
          # Which kind of redirect this is decides whether the shopper may be
          # sent off this storefront — see redirectTarget below.
          to {
            __typename
          }
        }
        node {
          __typename
          # Same inline wrap as ProductByPath: spread bare, the route field
          # silently drops breadcrumbs.
          ... on Category {
            ...CategoryDetail
          }
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

/**
 * Store capabilities the storefront has to branch on.
 *
 * `productFilteringEnabled` is the one that matters: faceted search is a paid
 * BigCommerce feature, and on a plan without it `searchProducts.filters`
 * returns an empty list with HTTP 200 and no errors — indistinguishable from a
 * catalog that genuinely has nothing to filter on. This flag tells the two
 * apart, so the filter UI can say "your plan does not include this" instead of
 * guessing. Verified on the sandbox: seven facets are configured and enabled in
 * the store's own settings while this reads false.
 */
const StoreSettingsQuery = graphql(`
  query StoreSettings {
    site {
      settings {
        storeName
        search {
          productFilteringEnabled
        }
      }
    }
  }
`);

/**
 * Scalars only. Cheap enough to page through a whole catalog at build time —
 * `entityId` and `name` ride along because they cost nothing next to `path`
 * and save the OG preview a second enumeration.
 */
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
            entityId
            name
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
 * Every category as a `{title, slug}` row, for the index surfaces that render a
 * flat list of links — `/collections.md` today, and anything else that has to
 * name a category by route rather than by document.
 *
 * `slug` carries every segment below `/collections`, because BigCommerce
 * category paths are multi-segment: Henleys under Tops is `tops/henleys`, and
 * `/collections/[...slug]` resolves those segments against the live catalog.
 * The synced Sanity document is not a substitute here — `slugFromPath` in
 * `packages/sanity-sync/src/upsert.ts` joins the same segments with `-`, so
 * `store.slug.current` reads `tops-henleys`, which is an identifier rather than
 * a path and 404s the moment it is used as one.
 */
export function categoryTreeToCollectionList(
  tree: readonly CategoryTreeNode[]
): { title: string; slug: string }[] {
  return flattenCategoryTree(tree).map((item) => ({
    title: item.name,
    slug: toSegments(item.path).join("/"),
  }));
}

/**
 * Where a resolved redirect should actually send the shopper.
 *
 * `toUrl` is absolute and on BigCommerce's own canonical domain, which is not
 * where this storefront lives. Following it verbatim walks a shopper who
 * opened a stale link off the headless storefront and onto the
 * BigCommerce-hosted store — a different site, with different navigation and
 * none of the editorial content. Every redirect kind but one names an entity
 * this app renders itself, so the path is what carries over.
 *
 * `ManualRedirect` is the exception and stays absolute: it is whatever the
 * merchant typed, and it is allowed to point at another domain entirely.
 *
 * Comparing pathnames also keeps a redirect that points at the path we already
 * asked for from becoming a redirect loop in production.
 */
function redirectTarget(
  redirect: { toUrl: string; to: { __typename: string } } | null | undefined,
  path: string
): string | null {
  if (!redirect) {
    return null;
  }

  let pathname: string;
  try {
    pathname = new URL(redirect.toUrl).pathname;
  } catch {
    pathname = redirect.toUrl;
  }

  if (pathname === path) {
    return null;
  }

  return redirect.to.__typename === "ManualRedirect"
    ? redirect.toUrl
    : pathname;
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
      redirectTo: redirectTarget(redirect, path),
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
  options?: {
    first?: number;
    after?: string | null;
    /**
     * Set false to resolve the route and the category's own fields without a
     * page of products — 1022 complexity instead of 4724. `products` is then
     * absent from the node rather than empty, which is why it reads as
     * `undefined` at every call site.
     */
    withProducts?: boolean;
  }
): Promise<StorefrontQueryResult<CatalogRoute<CatalogCategory>>> {
  const path = toRoutePath(CATEGORY_PREFIX, segments);
  const result = await storefrontQuery(CategoryByPathQuery, {
    variables: {
      path,
      first: options?.first ?? CATEGORY_PAGE_SIZE,
      after: options?.after ?? null,
      withProducts: options?.withProducts ?? true,
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
      redirectTo: redirectTarget(redirect, path),
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

/** What this store's plan lets the storefront do. */
export type CatalogStoreSettings = ResultOf<
  typeof StoreSettingsQuery
>["site"]["settings"];

/**
 * Store-level capability flags. Read it where the UI would otherwise have to
 * guess why a feature came back empty.
 */
export async function getStoreSettings(): Promise<
  StorefrontQueryResult<CatalogStoreSettings>
> {
  const result = await storefrontQuery(StoreSettingsQuery);

  return result.ok ? { ok: true, data: result.data.site.settings } : result;
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

/** The scalars `ProductPathsQuery` returns for one product. */
export type CatalogProductSummary = {
  entityId: number;
  name: string;
  path: string;
};

/** One page of product summaries, plus the cursor for the next one. */
async function fetchProductPathPage(
  first: number,
  after: string | null
): Promise<
  StorefrontQueryResult<{
    products: CatalogProductSummary[];
    next: string | null;
  }>
> {
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
      products: nodes(connection),
      next: connection.pageInfo.hasNextPage
        ? (connection.pageInfo.endCursor ?? null)
        : null,
    },
  };
}

/**
 * The same walk as `getProductPaths`, keeping the id and name each page
 * already carried. Its one caller is the Open Graph preview gallery, which
 * needs the id the card is keyed by.
 */
export async function getProductSummaries(
  limit = prerenderLimit()
): Promise<StorefrontQueryResult<CatalogProductSummary[]>> {
  const products: CatalogProductSummary[] = [];
  let after: string | null = null;

  while (products.length < limit) {
    const first = Math.min(PATHS_PAGE_SIZE, limit - products.length);
    const result = await fetchProductPathPage(first, after);

    if (!result.ok) {
      return result;
    }

    products.push(...result.data.products);

    // An empty page that still claims a next cursor would spin the build
    // forever, so no progress ends the walk regardless of what the API says.
    if (!(result.data.next && result.data.products.length > 0)) {
      break;
    }

    after = result.data.next;
  }

  // `first` already bounds each request, so this only bites if the API returns
  // more than it was asked for. The cap is the point of the whole function —
  // it holds whatever the other end does.
  return { ok: true, data: products.slice(0, limit) };
}

/**
 * Product paths for `generateStaticParams`, the sitemap and llms.txt, paged
 * until the cap is reached rather than fetched in one oversized request.
 */
export async function getProductPaths(
  limit = prerenderLimit()
): Promise<StorefrontQueryResult<string[]>> {
  const result = await getProductSummaries(limit);

  return result.ok
    ? { ok: true, data: result.data.map((product) => product.path) }
    : result;
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
