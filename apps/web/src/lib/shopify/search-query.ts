/**
 * Turns a raw user query into a Shopify Storefront search string.
 *
 * Shopify's `search` / `predictiveSearch` treat space-separated words as a
 * strict AND, so a query like "white shirt" returns nothing when no single
 * product has both words in an indexed field (e.g. "white" is only a variant
 * color, not part of the title). We instead prefix-wildcard each word and join
 * them with `OR`, so partial and multi-word queries surface the most relevant
 * matches first (Shopify ranks products matching more terms higher) while still
 * matching as the user types.
 *
 * Examples: "white shirt" -> "white* OR shirt*", "whi" -> "whi*".
 */

// Characters that are operators in Shopify's search syntax — stripped so raw
// user input can't produce a malformed query.
const RESERVED_CHARS = /["()*:~\\]/g;

export function toStorefrontSearchQuery(raw: string): string {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(RESERVED_CHARS, "").replace(/^-+/, ""))
    .filter(Boolean);

  if (tokens.length === 0) {
    return "";
  }

  return tokens.map((token) => `${token}*`).join(" OR ");
}
