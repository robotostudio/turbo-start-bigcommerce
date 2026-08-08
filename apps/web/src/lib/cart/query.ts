import "server-only";

import type { TadaDocumentNode } from "gql.tada";

import {
  type StorefrontQueryResult,
  storefrontQuery,
} from "@/lib/bigcommerce/client";
import { getCustomerToken } from "@/lib/customer/server";

/**
 * A cart request, with the signed-in customer attached when there is one.
 *
 * This exists because forgetting the token is silent and looks like an empty
 * basket. Once `login` assigns a cart to a customer, an anonymous read of it
 * returns null — measured against the live store: `site.cart` on an assigned
 * cart answers `null` without `X-Bc-Customer-Access-Token` and answers
 * normally with it. No error, no warning, just a cart that is not there.
 *
 * So every cart call goes through here rather than calling `storefrontQuery`
 * directly, and a new cart operation gets the token by construction instead of
 * by remembering.
 */
export async function cartQuery<TResult, TVariables>(
  document: TadaDocumentNode<TResult, TVariables>,
  variables: TVariables
): Promise<StorefrontQueryResult<TResult>> {
  return storefrontQuery(document, {
    variables,
    customerToken: await getCustomerToken(),
  });
}
