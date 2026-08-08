import "server-only";

import type { ResultOf, VariablesOf } from "gql.tada";

import type {
  Facet,
  SearchFiltersPayload,
} from "@/components/collection/filter-utils";
import type { ListingSort } from "@/components/collection/sort-utils";
import { type CatalogProductCard, ProductCard } from "./catalog";
import { type StorefrontQueryResult, storefrontQuery } from "./client";
import { FACET_LIST_PAGE_SIZE, SearchFacetFields, toFacets } from "./facets";
import { graphql } from "./graphql";

/**
 * The one product-listing read.
 *
 * Every surface that shows a grid of products goes through here: the search
 * page, the search drawer's typeahead, and the category pages. BigCommerce
 * uses one field for all of them — `site.search.searchProducts` — and varies
 * only the filter payload, so a keyword search is `{ searchTerm }`, a category
 * listing is `{ categoryEntityId }`, and a filtered search is both plus
 * whatever the URL codec produced.
 *
 * There is no predictive-search endpoint to be missing: BigCommerce publishes
 * none, and typeahead here is this same query with `first: 10` and the results
 * grouped client-side.
 *
 * The category pages used to read `Category.products` instead. Two things
 * changed that. `Category.products` takes no filter argument, so a category
 * page on a plan *with* Product Filtering could only ever render an empty
 * sidebar; and the reason recorded for keeping it — roughly a thousand extra
 * complexity per request — turned out to be the wrong number. Measured on the
 * seeded store, the category page's total goes 5728 → 7693 (+34%), and the
 * cost that matters is a different one: `searchProducts` filters by
 * `categoryEntityId`, and a path has to be resolved to an id first, so the
 * page render pays one extra serialised round trip. It pays it at build and
 * revalidation time only — the page is statically generated with
 * `revalidate = 300`, and load-more forwards the id it already has.
 */

/**
 * `$withFacets` is the same lever `$withProducts` is in `catalog.ts`, for the
 * same reason: BigCommerce charges complexity on what a query *executes*, not
 * on what it declares. Typeahead runs per keystroke and renders products and
 * suggestions only, so it pays for neither the facet list nor the plan flag
 * that exists to describe it: 6686 with them and 4664 without, measured on the
 * seeded store at `first: 10`.
 */
const SearchProductsQuery = graphql(
  `
  query SearchProducts(
    $filters: SearchProductsFiltersInput!
    $sort: SearchProductsSortInput
    $first: Int!
    $after: String
    $facetsFirst: Int!
    $withFacets: Boolean!
  ) {
    site {
      settings @include(if: $withFacets) {
        search {
          productFilteringEnabled
        }
      }
      search {
        searchProducts(filters: $filters, sort: $sort) {
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
          filters(first: $facetsFirst) @include(if: $withFacets) {
            pageInfo {
              hasNextPage
            }
            edges {
              node {
                ...SearchFacetFields
              }
            }
          }
          suggestions {
            results {
              text
            }
          }
        }
      }
    }
  }
`,
  [ProductCard, SearchFacetFields]
);

/**
 * The codec's payload has to satisfy the input type gql.tada generated from the
 * introspected schema. Asserting it here is the only place the two meet: the
 * codec is client-side and cannot import a `server-only` module, so this
 * assignment is what fails `check-types` if a field name drifts out of the
 * schema. The sort menu is checked the same way, by the `sort` variable below —
 * a menu member that is not a `SearchProductsSortInput` member fails there.
 */
type SearchProductsFilters = VariablesOf<typeof SearchProductsQuery>["filters"];

/** `searchProducts.products(first:)` refuses anything larger. */
export const SEARCH_PAGE_LIMIT = 50;

export type CatalogSearch = {
  products: CatalogProductCard[];
  totalCount: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  /** BigCommerce's own autocomplete/spelling suggestions, flattened. */
  suggestions: string[];
  /** Facets for this result set. Empty on a plan without Product Filtering. */
  facets: Facet[];
  /** Whether the store's plan includes faceted search at all. */
  filteringEnabled: boolean;
};

export type CatalogSearchOptions = {
  /** Full-text term. BigCommerce takes it verbatim — no operator syntax to escape. */
  searchTerm?: string;
  /**
   * Scopes the read to one category. BigCommerce documents this argument as the
   * one that makes a category's own product order and its category-specific
   * filtering settings apply, so a category listing must use it rather than
   * `categoryEntityIds`.
   */
  categoryEntityId?: number;
  first: number;
  after?: string | null;
  /**
   * A `SearchProductsSortInput` member. Leave unset for the store's default,
   * which is relevance for a keyword search and the category's own order
   * otherwise.
   */
  sort?: ListingSort;
  /** Facet selection from the URL codec. */
  filters?: SearchFiltersPayload;
  /**
   * Set false to leave the facet list and the plan flag out of the request.
   * `facets` then reads empty and `filteringEnabled` false, which is what a
   * caller that renders neither wants anyway.
   */
  facets?: boolean;
};

/**
 * Call with a `searchTerm`, a `categoryEntityId`, or both. A payload carrying
 * neither is rejected — "At least one filter must be provided.", HTTP 200 with
 * an `errors` array — so the callers that can have an empty query short-circuit
 * before they get here rather than asking and handling the failure.
 *
 * The codec writes the category *facet* to `categoryEntityIds` (plural), which
 * is a different argument from the `categoryEntityId` a category page scopes
 * itself with, and BigCommerce documents them for different jobs. Both can
 * therefore be present at once on a filtered category page without either
 * overwriting the other.
 */
export async function searchCatalog({
  searchTerm,
  categoryEntityId,
  first,
  after,
  sort,
  filters: selection,
  facets = true,
}: CatalogSearchOptions): Promise<StorefrontQueryResult<CatalogSearch>> {
  const filters: SearchProductsFilters = { ...selection };
  if (searchTerm) filters.searchTerm = searchTerm;
  if (categoryEntityId !== undefined) {
    filters.categoryEntityId = categoryEntityId;
  }

  const result = await storefrontQuery(SearchProductsQuery, {
    variables: {
      filters,
      // Null rather than absent: BigCommerce treats the two the same here, and
      // gql.tada requires every declared variable to be supplied.
      sort: sort ?? null,
      first: Math.min(first, SEARCH_PAGE_LIMIT),
      after: after ?? null,
      facetsFirst: FACET_LIST_PAGE_SIZE,
      withFacets: facets,
    },
  });

  if (!result.ok) {
    return result;
  }

  const {
    products,
    filters: facetConnection,
    suggestions,
  } = result.data.site.search.searchProducts;
  const filteringEnabled =
    result.data.site.settings?.search?.productFilteringEnabled ?? false;

  return {
    ok: true,
    data: {
      products: (products.edges ?? []).map((edge) => edge.node),
      totalCount: Number(products.collectionInfo?.totalItems ?? 0),
      pageInfo: {
        hasNextPage: products.pageInfo.hasNextPage,
        endCursor: products.pageInfo.endCursor ?? null,
      },
      // Absent, not empty, when the gate is off — and toFacets reads an empty
      // list on a false flag as "this store's plan has no filtering" and warns.
      facets: facetConnection
        ? toFacets(facetConnection.edges, filteringEnabled)
        : [],
      filteringEnabled,
      suggestions: suggestions.flatMap((suggestion) =>
        suggestion.results.map((suggestionResult) => suggestionResult.text)
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Category helpers for the search surfaces
// ---------------------------------------------------------------------------

/** A category as the search surfaces serve it to the client. */
export type SearchCategory = {
  entityId: number;
  name: string;
  path: string;
  image: { url: string; altText: string } | null;
};

type TreeNode = {
  entityId: number;
  name: string;
  path: string;
  image?: { url: string; altText: string } | null;
  children?: readonly TreeNode[];
};

/** Depth-first flatten that, unlike the catalog helper, keeps `image` in the type. */
export function flattenCategories(nodes: readonly TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenCategories(node.children ?? []),
  ]);
}

export function toSearchCategory(node: TreeNode): SearchCategory {
  return {
    entityId: node.entityId,
    name: node.name,
    path: node.path,
    image: node.image ?? null,
  };
}

export type SearchCardProduct = ResultOf<typeof ProductCard>;
