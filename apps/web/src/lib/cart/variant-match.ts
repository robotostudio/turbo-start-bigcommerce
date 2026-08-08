import type { ProductVariant } from "@/lib/cart/types";

/** Finds the variant matching a selected-options map. */
export function findVariantByOptions(
  variants: ProductVariant[],
  selectedOptions: Record<string, string>
): ProductVariant | null {
  const entries = Object.entries(selectedOptions).filter(
    ([, value]) => value !== ""
  );
  if (entries.length === 0) return null;

  return (
    variants.find((variant) =>
      entries.every(([name, value]) =>
        variant.selectedOptions.some(
          (opt) => opt.name === name && opt.value === value
        )
      )
    ) ?? null
  );
}

/** Availability map: option value -> boolean, given the other selections. */
export function getOptionAvailability(
  variants: ProductVariant[],
  optionName: string,
  currentSelections: Record<string, string>
): Record<string, boolean> {
  const availability: Record<string, boolean> = {};

  const otherSelections = Object.entries(currentSelections).filter(
    ([name, value]) => name !== optionName && value !== ""
  );

  for (const variant of variants) {
    const optionValue = variant.selectedOptions.find(
      (opt) => opt.name === optionName
    )?.value;
    if (!optionValue) continue;

    const matchesOthers = otherSelections.every(([name, value]) =>
      variant.selectedOptions.some(
        (opt) => opt.name === name && opt.value === value
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
