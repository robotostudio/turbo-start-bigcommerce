/**
 * Smoke test: prints the connected BigCommerce store's name.
 *
 *   pnpm bigcommerce:smoke
 *
 * Exercises the real client — endpoint from env, private storefront token,
 * complexity header, result contract — against a live store.
 */

import { storefrontQuery } from "../src/lib/bigcommerce/client";
import { graphql } from "../src/lib/bigcommerce/graphql";

const StoreNameQuery = graphql(`
  query StoreName {
    site {
      settings {
        storeName
        status
      }
    }
  }
`);

const result = await storefrontQuery(StoreNameQuery);

if (!result.ok) {
  console.error(`Smoke test failed (${result.kind}): ${result.error}`);
  process.exit(1);
}

const settings = result.data.site.settings;

console.log(`Store name: ${settings?.storeName ?? "(none)"}`);
console.log(`Status:     ${settings?.status ?? "(none)"}`);
