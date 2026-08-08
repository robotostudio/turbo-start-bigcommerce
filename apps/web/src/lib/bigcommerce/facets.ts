import "server-only";

import type { ResultOf } from "gql.tada";
import { Logger } from "@workspace/logger";

import type { Facet, FacetOption } from "@/components/collection/filter-utils";
import { FILTER_PARAMS } from "@/components/collection/filter-utils";
import { graphql } from "@/lib/bigcommerce/graphql";

/**
 * The facet half of `searchProducts`, and the transformer that flattens
 * BigCommerce's typed filter union into something a panel can render.
 *
 * This is the part of the port that could not be adapted. The platform this
 * starter came off hands the client an opaque JSON blob to echo back, so one
 * generic component there covers any filter the API grows. BigCommerce returns a
 * union the client has to branch on:
 *
 *   BrandSearchFilter | CategorySearchFilter | ProductAttributeSearchFilter
 *   | RatingSearchFilter | PriceSearchFilter | OtherSearchFilter
 *
 * The branching happens once, here, and the panel sees only the two shapes in
 * `Facet` — a list of values or a price range.
 */

const logger = new Logger("facets");

/**
 * Every facet value list is itself a paginated connection, and every one of
 * them gets an explicit page size.
 *
 * This is the argument Catalyst omits. Leave it off and BigCommerce applies its
 * own default rather than erroring, so a brand list with more entries than that
 * default comes back truncated partway through with HTTP 200 and no hint that
 * anything is missing — the failure looks like a merchant who only has nine
 * brands. `hasNextPage` is selected alongside so a truncation past even these
 * sizes is detectable rather than silent.
 *
 * The sizes are 50 per value list and 10 for ratings, matching the query
 * captured in `__fixtures__/search-filters-unavailable.json`, which the live API
 * accepted at HTTP 200. They are literals because GraphQL takes a literal or a
 * variable and threading four variables through for four constants is worse to
 * read than the numbers are.
 *
 * One addition over the captured query: `OtherSearchFilter`. That member carries
 * the in stock, free shipping and featured toggles, and the capture had no
 * fragment for it, so those three facets would have arrived as a `__typename`
 * with nothing selectable in it.
 */
const FACET_PAGE_SIZE = 25;

export const SearchFacetFields = graphql(`
  fragment SearchFacetFields on SearchProductFilter {
    __typename
    displayName
    isCollapsedByDefault
    ... on BrandSearchFilter {
      displayProductCount
      brands(first: 50) {
        pageInfo {
          hasNextPage
        }
        edges {
          node {
            entityId
            name
            isSelected
            productCount
          }
        }
      }
    }
    ... on CategorySearchFilter {
      displayProductCount
      categories(first: 50) {
        pageInfo {
          hasNextPage
        }
        edges {
          node {
            entityId
            name
            isSelected
            productCount
          }
        }
      }
    }
    ... on ProductAttributeSearchFilter {
      filterKey
      displayProductCount
      attributes(first: 50) {
        pageInfo {
          hasNextPage
        }
        edges {
          node {
            value
            isSelected
            productCount
          }
        }
      }
    }
    ... on RatingSearchFilter {
      ratings(first: 10) {
        pageInfo {
          hasNextPage
        }
        edges {
          node {
            value
            isSelected
            productCount
          }
        }
      }
    }
    ... on PriceSearchFilter {
      selected {
        minPrice
        maxPrice
      }
    }
    ... on OtherSearchFilter {
      displayProductCount
      isInStock {
        displayName
        isSelected
        productCount
      }
      freeShipping {
        displayName
        isSelected
        productCount
      }
      isFeatured {
        displayName
        isSelected
        productCount
      }
    }
  }
`);

/** Page size for the facet list itself, applied by the query that composes this. */
export const FACET_LIST_PAGE_SIZE = FACET_PAGE_SIZE;

export type SearchFacet = ResultOf<typeof SearchFacetFields>;

/**
 * Guards against the page sizes above being outgrown quietly.
 *
 * The whole point of an explicit page size is that truncation stops being
 * invisible, which only holds if somebody is told. One line per over-long list,
 * naming the facet, because "brands" and "colour" truncating are different
 * problems with different fixes.
 */
function warnIfTruncated(name: string, hasNextPage: boolean | undefined) {
  if (hasNextPage) {
    logger.warn(
      `Facet "${name}" has more values than the page size requested, so the panel is showing a partial list. Raise the page size in lib/bigcommerce/facets.ts.`
    );
  }
}

function countOrNull(display: boolean, count: number): number | null {
  return display ? count : null;
}

type OtherFacet = Extract<SearchFacet, { __typename: "OtherSearchFilter" }>;

/**
 * `OtherSearchFilter`'s three toggles, each a one-option list.
 *
 * All three are nullable on the schema — a store can enable any subset — so a
 * missing one is dropped rather than rendered as a toggle that filters nothing.
 */
function otherOptions(facet: OtherFacet): FacetOption[] {
  const toggles = [
    { item: facet.isInStock, paramKey: FILTER_PARAMS.stock, value: "in" },
    {
      item: facet.freeShipping,
      paramKey: FILTER_PARAMS.shipping,
      value: "free",
    },
    { item: facet.isFeatured, paramKey: FILTER_PARAMS.featured, value: "1" },
  ];

  return toggles.flatMap(({ item, paramKey, value }) =>
    item
      ? [
          {
            paramKey,
            paramValue: value,
            label: item.displayName,
            productCount: countOrNull(
              facet.displayProductCount,
              item.productCount
            ),
            isSelected: item.isSelected,
          },
        ]
      : []
  );
}

type Member<T extends SearchFacet["__typename"]> = Extract<
  SearchFacet,
  { __typename: T }
>;

/**
 * The value lists, one small builder each.
 *
 * Split out of the switch rather than inlined into it because six inline `.map`
 * calls in one function is what tripped `noExcessiveCognitiveComplexity`, and
 * the rule was right — the interesting part of each member is two lines, and
 * they were buried in dispatch.
 */
function brandOptions(facet: Member<"BrandSearchFilter">): FacetOption[] {
  warnIfTruncated(facet.displayName, facet.brands.pageInfo.hasNextPage);
  return (facet.brands.edges ?? []).map(({ node }) => ({
    paramKey: FILTER_PARAMS.brand,
    paramValue: String(node.entityId),
    label: node.name,
    productCount: countOrNull(facet.displayProductCount, node.productCount),
    isSelected: node.isSelected,
  }));
}

function categoryOptions(facet: Member<"CategorySearchFilter">): FacetOption[] {
  warnIfTruncated(facet.displayName, facet.categories.pageInfo.hasNextPage);
  return (facet.categories.edges ?? []).map(({ node }) => ({
    paramKey: FILTER_PARAMS.category,
    paramValue: String(node.entityId),
    label: node.name,
    productCount: countOrNull(facet.displayProductCount, node.productCount),
    isSelected: node.isSelected,
  }));
}

/**
 * The store's own `filterKey` goes into the param name, so a merchant adding a
 * facet needs no code change here to make it filterable.
 */
function attributeOptions(
  facet: Member<"ProductAttributeSearchFilter">
): FacetOption[] {
  warnIfTruncated(facet.displayName, facet.attributes.pageInfo.hasNextPage);
  return (facet.attributes.edges ?? []).map(({ node }) => ({
    paramKey: `${FILTER_PARAMS.attributePrefix}${facet.filterKey}`,
    paramValue: node.value,
    label: node.value,
    productCount: countOrNull(facet.displayProductCount, node.productCount),
    isSelected: node.isSelected,
  }));
}

/**
 * `rating` on the input is a range, and the storefront offers the conventional
 * "n stars and up", so the value becomes `minRating` — and `single`, because
 * picking 3 after 4 has to mean 3 rather than appending a second param.
 */
function ratingOptions(facet: Member<"RatingSearchFilter">): FacetOption[] {
  warnIfTruncated(facet.displayName, facet.ratings.pageInfo.hasNextPage);
  return (facet.ratings.edges ?? []).map(({ node }) => ({
    paramKey: FILTER_PARAMS.minRating,
    paramValue: String(node.value),
    label: `${node.value} stars & up`,
    productCount: node.productCount,
    isSelected: node.isSelected,
    single: true as const,
  }));
}

/**
 * One union member to one `Facet`, or `null` for a member that arrived with
 * nothing selectable in it.
 *
 * An empty option list is dropped rather than rendered: a facet heading with no
 * values under it reads as a UI bug, and it is not the same signal as the whole
 * filter list being empty, which is what `filterPanelState` handles.
 */
function toFacet(facet: SearchFacet): Facet | null {
  // Keyed on `__typename`, not the interface's `name`, which the schema marks
  // deprecated in favour of `displayName`. Product attributes are the only
  // member that can appear more than once, so only they carry more than the type
  // name — a store with a Colour and a Size facet sends two of them, and keying
  // both on the type name collides in React and in the collapse state.
  const shared = {
    id:
      facet.__typename === "ProductAttributeSearchFilter"
        ? `${facet.__typename}:${facet.filterKey}`
        : facet.__typename,
    name: facet.displayName,
    collapsedByDefault: facet.isCollapsedByDefault,
  };

  if (facet.__typename === "PriceSearchFilter") {
    // No options: BigCommerce's price facet is a range the shopper types into,
    // not buckets somebody picked. `selected` is what it echoes back.
    return {
      kind: "price",
      ...shared,
      selected: {
        min: facet.selected?.minPrice ?? null,
        max: facet.selected?.maxPrice ?? null,
      },
    };
  }

  const options = optionsFor(facet);
  if (options === null) return null;
  const offerable = options.filter(isOfferable);
  return offerable.length
    ? { kind: "options", ...shared, options: offerable }
    : null;
}

/**
 * Whether an option is worth offering, which is a rule about this panel rather
 * than a claim about what BigCommerce counts.
 *
 * A value that matches nothing in the current result set is a control that
 * cannot change the grid, so it is dropped — and a facet left with none of them
 * drops with it, by the same rule that drops an empty one above.
 *
 * Two values are not zero and must survive. `null` is a facet that asked for its
 * counts to be hidden, which says nothing about how many products are behind
 * each value. And a *selected* value at zero is a combination the shopper
 * narrowed to nothing: removing it from the panel would take away the control
 * that undoes it, and the label its chip reads from.
 */
function isOfferable(option: FacetOption): boolean {
  return option.productCount !== 0 || option.isSelected;
}

/** `null` for a union member added after this was written. */
function optionsFor(
  facet: Exclude<SearchFacet, Member<"PriceSearchFilter">>
): FacetOption[] | null {
  switch (facet.__typename) {
    case "BrandSearchFilter":
      return brandOptions(facet);
    case "CategorySearchFilter":
      return categoryOptions(facet);
    case "ProductAttributeSearchFilter":
      return attributeOptions(facet);
    case "RatingSearchFilter":
      return ratingOptions(facet);
    case "OtherSearchFilter":
      return otherOptions(facet);
    default:
      // Dropping it keeps the rest of the panel working; rendering an unknown
      // shape would not.
      return null;
  }
}

/** Whether the empty-filter-list warning has already been emitted. */
let warnedUnavailable = false;

/**
 * Flatten the facet connection, and say something when it is empty.
 *
 * An empty list is the plan gate, not an absence of matches. BigCommerce
 * answers HTTP 200 with `filters.edges: []` and no `errors` key on a plan
 * without Product Filtering — byte-identical to a query that matched no facets,
 * captured in `__fixtures__/search-filters-unavailable.json`. Only
 * `productFilteringEnabled` separates the two, which is why it is threaded in
 * here rather than inferred.
 *
 * The warning fires once per process, not once per request. The cause is a
 * store-level plan setting that cannot change between two requests, so a line
 * per category view would be noise that trains people to filter the logs.
 */
export function toFacets(
  edges: readonly { node: SearchFacet }[] | null | undefined,
  filteringEnabled: boolean
): Facet[] {
  const facets = (edges ?? [])
    .map(({ node }) => toFacet(node))
    .filter((facet): facet is Facet => facet !== null);

  if (facets.length === 0 && !filteringEnabled && !warnedUnavailable) {
    warnedUnavailable = true;
    logger.warn(
      "BigCommerce returned no product filters and site.settings.search.productFilteringEnabled is false, so faceted search is not on this store's plan. The storefront is rendering its 'filters unavailable' state. This message appears once per server process."
    );
  }

  return facets;
}

/** Test seam: the once-per-process latch would otherwise leak between cases. */
export function resetFacetWarningForTests() {
  warnedUnavailable = false;
}
