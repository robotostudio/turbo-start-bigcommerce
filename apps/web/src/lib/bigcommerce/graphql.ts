import { initGraphQLTada } from "gql.tada";

import type { introspection } from "./graphql-env";

/**
 * Typed document builder for the BigCommerce Storefront API.
 *
 * The types come from `./graphql-env.d.ts`, which is generated from
 * `./schema.graphql` and committed — so this typechecks on a fresh clone with
 * no store and no credentials. Refresh both with `pnpm bigcommerce:schema`.
 *
 * `disableMasking` keeps fragment fields readable on the parent result, which
 * is how the rest of this codebase already reads query results.
 */
export const graphql = initGraphQLTada<{
  introspection: introspection;
  scalars: {
    BigDecimal: number;
    DateTime: string;
    Long: number;
    UUID: string;
  };
  disableMasking: true;
}>();
