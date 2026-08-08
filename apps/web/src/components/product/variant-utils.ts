import type { CardVariant } from "./product-card";

/**
 * Variant helpers the PDP and the product card share.
 *
 * These are pure and API-agnostic — they read `selectedOptions` and
 * `availableForSale` off the canonical `CardVariant`, nothing else. Their real
 * home is `lib/bigcommerce/variant-utils.ts` next to `toCardVariant`; they live
 * here because that module was off-limits while this landed. Move them at the
 * squash and this file disappears.
 */

/** Finds the variant matching a `{ optionName: value }` selection. */
export function findVariantByOptions(
  variants: CardVariant[],
  selectedOptions: Record<string, string>
): CardVariant | null {
  const entries = Object.entries(selectedOptions).filter(
    ([, value]) => value !== ""
  );
  if (entries.length === 0) return null;

  return (
    variants.find((variant) =>
      entries.every(([name, value]) =>
        variant.selectedOptions.some(
          (option) => option.name === name && option.value === value
        )
      )
    ) ?? null
  );
}

/**
 * `option value -> buyable`, given what is selected on the *other* options —
 * so picking a colour greys out the sizes that colourway doesn't come in.
 */
export function getOptionAvailability(
  variants: CardVariant[],
  optionName: string,
  currentSelections: Record<string, string>
): Record<string, boolean> {
  const availability: Record<string, boolean> = {};

  const otherSelections = Object.entries(currentSelections).filter(
    ([name, value]) => name !== optionName && value !== ""
  );

  for (const variant of variants) {
    const optionValue = variant.selectedOptions.find(
      (option) => option.name === optionName
    )?.value;
    if (!optionValue) continue;

    const matchesOthers = otherSelections.every(([name, value]) =>
      variant.selectedOptions.some(
        (option) => option.name === name && option.value === value
      )
    );

    if (matchesOthers && variant.availableForSale) {
      availability[optionValue] = true;
    } else if (!(optionValue in availability)) {
      availability[optionValue] = false;
    }
  }

  return availability;
}

/** PDP link carrying an option selection in the query string. */
export function buildVariantUrl(
  handle: string,
  selectedOptions: Record<string, string>
): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(selectedOptions)) {
    if (value) {
      params.set(name, value);
    }
  }
  const qs = params.toString();
  return `/products/${handle}${qs ? `?${qs}` : ""}`;
}

/**
 * The cart's merchandise id.
 *
 * BigCommerce's line-item mutations take `productEntityId` *and*
 * `variantEntityId`, and the two id spaces overlap — so neither half
 * identifies a purchasable on its own. `toMerchandiseId` in
 * `lib/bigcommerce/cart.ts` parses this same shape back out of a cart payload.
 * A missing product id degrades to the bare variant id rather than fabricating
 * one; the cart then reports the line as unresolvable instead of adding the
 * wrong thing.
 */
export function merchandiseId(
  productId: string | number | undefined,
  variantId: string
): string {
  return productId === undefined ? variantId : `${productId}:${variantId}`;
}
