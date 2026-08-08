import "server-only";

import type { ResultOf } from "gql.tada";

import {
  type StorefrontQueryResult,
  storefrontQuery,
} from "@/lib/bigcommerce/client";
import { graphql } from "@/lib/bigcommerce/graphql";

/**
 * The one catalog search read, shared by the predictive (`/api/search`) and
 * full (`/api/search/full`) routes — and, through them, by the Studio's
 * product search input, which cannot hold a token of its own.
 *
 * Facets are deliberately not selected: product filtering is plan-gated on
 * this store and comes back as an empty connection with no error — see
 * `lib/bigcommerce/__fixtures__/search-filters-unavailable.json`. ROB-2546
 * owns the facet rewrite.
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
  query SearchProducts($filters: SearchProductsFiltersInput!, $first: Int!) {
    site {
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
  [SearchCardFields]
);

export type CatalogSearch = {
  products: SearchCardProduct[];
  totalCount: number;
  /** BigCommerce's own autocomplete/spelling suggestions, flattened. */
  suggestions: string[];
};

/** Full-text product search. BigCommerce takes the term verbatim — no operator syntax to escape. */
export async function searchCatalog(
  searchTerm: string,
  first: number
): Promise<StorefrontQueryResult<CatalogSearch>> {
  const result = await storefrontQuery(SearchProductsQuery, {
    variables: { filters: { searchTerm }, first },
  });

  if (!result.ok) {
    return result;
  }

  const { products, suggestions } = result.data.site.search.searchProducts;

  return {
    ok: true,
    data: {
      products: (products.edges ?? []).map((edge) => edge.node),
      totalCount: Number(products.collectionInfo?.totalItems ?? 0),
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
