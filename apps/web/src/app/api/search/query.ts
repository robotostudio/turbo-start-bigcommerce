import "server-only";

import type { ResultOf, VariablesOf } from "gql.tada";

import type {
  Facet,
  SearchFiltersPayload,
} from "@/components/collection/filter-utils";
import {
  type StorefrontQueryResult,
  storefrontQuery,
} from "@/lib/bigcommerce/client";
import {
  FACET_LIST_PAGE_SIZE,
  SearchFacetFields,
  toFacets,
} from "@/lib/bigcommerce/facets";
import { graphql } from "@/lib/bigcommerce/graphql";

/**
 * The one catalog search read, shared by the predictive (`/api/search`) and
 * full (`/api/search/full`) routes — and, through them, by the Studio's
 * product search input, which cannot hold a token of its own.
 *
 * Facets come back on the same request rather than a second one, because
 * `searchProducts` returns them beside the products it filtered and asking
 * twice would pay the query cost twice for one answer. `productFilteringEnabled`
 * rides along for the same reason: it is what tells an empty facet list apart
 * from a plan that has no facets to give.
 *
 * `categoryEntityId` is on `SearchProductsFiltersInput`, so this same read can
 * serve a category listing later without changing the transformer or the codec.
 * The PLP deliberately still uses `Category.products`: moving it here costs
 * about 1000 more complexity per request and gives up the
 * `CategoryProductSort.DEFAULT` member the sort menu depends on, and on a plan
 * without filtering it would buy nothing a shopper could see.
 */

/** Card shape for search grids. Same weight class as the PLP card. */
const SearchCardFields = graphql(`
  fragment SearchCardFields on Product {
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

export type SearchCardProduct = ResultOf<typeof SearchCardFields>;

const SearchProductsQuery = graphql(
  `
  query SearchProducts(
    $filters: SearchProductsFiltersInput!
    $first: Int!
    $facetsFirst: Int!
  ) {
    site {
      settings {
        search {
          productFilteringEnabled
        }
      }
      search {
        searchProducts(filters: $filters) {
          products(first: $first) {
            collectionInfo {
              totalItems
            }
            edges {
              node {
                ...SearchCardFields
              }
            }
          }
          filters(first: $facetsFirst) {
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
  [SearchCardFields, SearchFacetFields]
);

/**
 * The codec's payload has to satisfy the input type gql.tada generated from the
 * introspected schema. Asserting it here is the only place the two meet: the
 * codec is client-side and cannot import a `server-only` module, so this
 * assignment is what fails `check-types` if a field name drifts out of the
 * schema.
 */
type SearchProductsFilters = VariablesOf<typeof SearchProductsQuery>["filters"];

export type CatalogSearch = {
  products: SearchCardProduct[];
  totalCount: number;
  /** BigCommerce's own autocomplete/spelling suggestions, flattened. */
  suggestions: string[];
  /** Facets for this result set. Empty on a plan without Product Filtering. */
  facets: Facet[];
  /** Whether the store's plan includes faceted search at all. */
  filteringEnabled: boolean;
};

/** Full-text product search. BigCommerce takes the term verbatim — no operator syntax to escape. */
export async function searchCatalog(
  searchTerm: string,
  first: number,
  selection?: SearchFiltersPayload
): Promise<StorefrontQueryResult<CatalogSearch>> {
  const filters: SearchProductsFilters = { ...selection, searchTerm };

  const result = await storefrontQuery(SearchProductsQuery, {
    variables: { filters, first, facetsFirst: FACET_LIST_PAGE_SIZE },
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
      facets: toFacets(facetConnection.edges, filteringEnabled),
      filteringEnabled,
      suggestions: suggestions.flatMap((suggestion) =>
        suggestion.results.map((suggestionResult) => suggestionResult.text)
      ),
    },
  };
}

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
