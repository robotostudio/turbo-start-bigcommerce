/**
 * The hex a colour swatch renders.
 *
 * BigCommerce carries it on the option value itself — a `SwatchOptionValue`
 * reports `hexColors` — so there is no name-to-hex table to author and keep
 * in sync with the catalog. A two-tone swatch reports several
 * hexes; the card draws one dot, so the first is the swatch.
 *
 * Returns null for a colour option the merchant did not style as a swatch,
 * which the card already renders as an unfilled chip.
 */
export function swatchHex(
  hexColors: readonly string[] | null | undefined
): string | null {
  return hexColors?.[0] ?? null;
}
