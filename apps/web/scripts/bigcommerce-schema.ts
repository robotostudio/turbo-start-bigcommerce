/**
 * Refreshes the committed BigCommerce Storefront API schema from your own
 * store, by introspecting it through the same client the app uses.
 *
 *   pnpm bigcommerce:schema
 *
 * The schema is committed on purpose, so a fresh clone typechecks with no
 * store and no credentials. This script is opt-in and is deliberately not a
 * prerequisite of `dev` or `build`.
 */

import { writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildClientSchema,
  getIntrospectionQuery,
  type IntrospectionQuery,
  printSchema,
} from "graphql";

const REQUIRED = [
  "BIGCOMMERCE_STORE_HASH",
  "BIGCOMMERCE_STOREFRONT_TOKEN",
] as const;

const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(
    [
      `Cannot refresh the schema: ${missing.join(" and ")} not set.`,
      "",
      "This is the only command in the repo that needs a real BigCommerce",
      "store. Copy apps/web/.env.example to apps/web/.env.local, fill in your",
      "own store hash and a private storefront token, then run it again.",
      "",
      "Nothing else needs them. check-types, build and test all run on the",
      "committed schema in src/lib/bigcommerce/schema.graphql.",
    ].join("\n")
  );
  process.exit(1);
}

// Imported late: this module validates the whole server environment when it
// loads, and the check above gives a better message than it would.
const { storefrontQuery, storefrontUrl } = await import(
  "../src/lib/bigcommerce/client"
);

const result = await storefrontQuery<IntrospectionQuery, never>(
  getIntrospectionQuery()
);

if (!result.ok) {
  console.error(
    `Introspection of ${storefrontUrl} failed (${result.kind}): ${result.error}`
  );
  process.exit(1);
}

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/bigcommerce/schema.graphql"
);

writeFileSync(outPath, `${printSchema(buildClientSchema(result.data))}\n`);

console.log(
  `Wrote ${relative(process.cwd(), outPath)} from ${storefrontUrl}`
);
