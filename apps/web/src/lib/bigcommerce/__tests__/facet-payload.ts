import type { SearchFacet } from "@/lib/bigcommerce/facets";

/**
 * A facet-bearing `searchProducts.filters` payload.
 *
 * **Schema-derived, not captured.** Every other fixture in this package is a
 * verbatim response from the live store. This one cannot be: faceted search is
 * plan-gated, and on this Partner Sandbox `filters.edges` is `[]` on every
 * request — see `__fixtures__/search-filters-unavailable.json`, which is the
 * real capture of exactly that. There is no way to make this store emit a facet,
 * so there is nothing to capture.
 *
 * What that costs, stated rather than papered over. The field names, types and
 * nullability here are authoritative: they come from `graphql-env.d.ts`, which
 * is introspected from the store's own schema, and this file is typed as
 * `SearchFacet[]`, so a schema change breaks it at `check-types` rather than
 * silently. The *values* are invented. Nothing that reads this may assert what
 * BigCommerce actually puts in `filterKey`, or whether `productCount` counts
 * products before or after the current filters are applied — the schema cannot
 * say, and guessing is how a mapper ends up passing against its author's
 * assumptions instead of the API.
 *
 * So: assert shape and branching. Leave value semantics to a store that can
 * serve them.
 */
export const FACET_PAYLOAD: SearchFacet[] = [
  {
    __typename: "BrandSearchFilter",
    displayName: "Brand",
    isCollapsedByDefault: false,
    displayProductCount: true,
    brands: {
      pageInfo: { hasNextPage: false },
      edges: [
        {
          node: {
            entityId: 12,
            name: "Aster",
            isSelected: true,
            productCount: 3,
          },
        },
        {
          node: {
            entityId: 34,
            name: "Bramley",
            isSelected: false,
            productCount: 5,
          },
        },
      ],
    },
  },
  {
    __typename: "CategorySearchFilter",
    displayName: "Category",
    isCollapsedByDefault: false,
    // Counts switched off, so the panel must show none rather than zero.
    displayProductCount: false,
    categories: {
      pageInfo: { hasNextPage: false },
      edges: [
        {
          node: {
            entityId: 23,
            name: "Jackets",
            isSelected: false,
            productCount: 7,
          },
        },
      ],
    },
  },
  {
    __typename: "ProductAttributeSearchFilter",
    displayName: "Colour",
    isCollapsedByDefault: false,
    filterKey: "colour",
    displayProductCount: true,
    attributes: {
      // Deliberately truncated, to exercise the warning.
      pageInfo: { hasNextPage: true },
      edges: [
        { node: { value: "Black", isSelected: false, productCount: 4 } },
        { node: { value: "Ecru", isSelected: true, productCount: 2 } },
      ],
    },
  },
  {
    // A second attribute facet. Both would collide on `__typename` alone.
    __typename: "ProductAttributeSearchFilter",
    displayName: "Size",
    isCollapsedByDefault: true,
    filterKey: "size",
    displayProductCount: true,
    attributes: {
      pageInfo: { hasNextPage: false },
      edges: [{ node: { value: "M", isSelected: false, productCount: 6 } }],
    },
  },
  {
    __typename: "RatingSearchFilter",
    displayName: "Rating",
    isCollapsedByDefault: true,
    ratings: {
      pageInfo: { hasNextPage: false },
      edges: [
        // `value` is a String on the schema, not a Float.
        { node: { value: "4", isSelected: false, productCount: 8 } },
        { node: { value: "3", isSelected: false, productCount: 11 } },
      ],
    },
  },
  {
    __typename: "PriceSearchFilter",
    displayName: "Price",
    isCollapsedByDefault: false,
    selected: { minPrice: 50, maxPrice: 200 },
  },
  {
    __typename: "OtherSearchFilter",
    displayName: "Other",
    isCollapsedByDefault: false,
    displayProductCount: true,
    isInStock: { displayName: "In stock", isSelected: true, productCount: 9 },
    // Nullable on the schema — a store can enable any subset of the three.
    freeShipping: null,
    isFeatured: { displayName: "Featured", isSelected: false, productCount: 2 },
  },
  {
    // A facet that arrived with nothing selectable in it.
    __typename: "BrandSearchFilter",
    displayName: "Empty brand facet",
    isCollapsedByDefault: false,
    displayProductCount: true,
    brands: { pageInfo: { hasNextPage: false }, edges: [] },
  },
];
