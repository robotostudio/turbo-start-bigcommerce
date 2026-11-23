import type { MoneyV2, SelectedOption } from "@/lib/cart/types";
import { toMerchandiseId } from "./cart";
import { swatchHex } from "./color";
import { type BigCommerceMoney, toMoney } from "./money";
import { getOptionType } from "./options";

/** One option value with its swatch hex, when the merchant styled one. */
export type ProductOptionValue = {
  value: string;
  hex: string | null;
};

export type ProductOption = {
  id: string;
  name: string;
  values: ProductOptionValue[];
};

export type ProductVariant = {
  /** The variant entity id. Keys the PDP's compare-at map; never sent to the cart. */
  id: string;
  /**
   * `product:variant`: the line-item mutations need both ids and the id spaces
   * overlap, so neither alone identifies a purchasable. See `fromMerchandiseId`.
   */
  merchandiseId: string;
  title: string;
  availableForSale: boolean;
  price: MoneyV2;
  /** Per-variant photo, under `attribute_rule_images/`: never in the gallery. */
  image: { url: string } | null;
  selectedOptions: SelectedOption[];
};

/**
 * A `Variant` as the queries fetch it. Connections type `edges` as nullable so
 * the gql.tada-generated payload types (`edges: T[] | null`) fit directly.
 */
export type BigCommerceVariant = {
  entityId: number;
  isPurchasable?: boolean;
  prices?: { price: BigCommerceMoney } | null;
  /**
   * `aggregated` reads null on stores that hide stock levels, so `isInStock`
   * is the authoritative field here — a null aggregate is unknown stock, never
   * zero stock.
   */
  inventory?: { isInStock?: boolean } | null;
  defaultImage?: { url: string } | null;
  options?: {
    edges?:
      | readonly {
          node: {
            displayName: string;
            values?: {
              edges?: readonly { node: { label: string } }[] | null;
            } | null;
          };
        }[]
      | null;
  } | null;
};

/** Only a multiple-choice option has `values`. */
export type BigCommerceProductOption = {
  entityId: number;
  displayName: string;
  values?: {
    edges?:
      | readonly {
          node: { label: string; hexColors?: readonly string[] | null };
        }[]
      | null;
  } | null;
};

/**
 * Flattens a BigCommerce variant. BigCommerce nests a variant's chosen value
 * one connection deeper than a flat list; a variant holds exactly one value
 * per option — that is what makes it a variant — so the first is the choice.
 */
export function toProductVariant(
  productEntityId: number,
  variant: BigCommerceVariant
): ProductVariant {
  const selectedOptions = (variant.options?.edges ?? []).map(({ node }) => ({
    name: node.displayName,
    value: node.values?.edges?.[0]?.node.label ?? "",
  }));
  return {
    id: String(variant.entityId),
    merchandiseId: toMerchandiseId({
      productEntityId,
      variantEntityId: variant.entityId,
    }),
    title: selectedOptions.map((option) => option.value).join(" / "),
    availableForSale:
      variant.isPurchasable !== false && variant.inventory?.isInStock !== false,
    price: variant.prices
      ? toMoney(variant.prices.price)
      : { amount: "0.00", currencyCode: "" },
    image: variant.defaultImage ? { url: variant.defaultImage.url } : null,
    selectedOptions,
  };
}

export function productVariants(product: {
  entityId: number;
  variants?: { edges?: readonly { node: BigCommerceVariant }[] | null } | null;
}): ProductVariant[] {
  return (product.variants?.edges ?? []).map((edge) =>
    toProductVariant(product.entityId, edge.node)
  );
}

/**
 * An option with nothing to choose from (a text field, a date) is dropped: no
 * selector can render it and no variant is keyed on it.
 */
export function toProductOptions(
  options: readonly BigCommerceProductOption[]
): ProductOption[] {
  return options.flatMap((option) => {
    const values = (option.values?.edges ?? []).map(({ node }) => ({
      value: node.label,
      hex: swatchHex(node.hexColors),
    }));
    return values.length > 0
      ? [{ id: String(option.entityId), name: option.displayName, values }]
      : [];
  });
}

/** Finds the variant matching a `{ optionName: value }` selection. */
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
          (option) => option.name === name && option.value === value
        )
      )
    ) ?? null
  );
}

/**
 * The variant to render: whatever the URL asks for, falling back per option
 * to the first variant's own value so a bare PDP URL still lands on
 * something buyable.
 *
 * `complete` is what gates the CTA — an option the shopper hasn't chosen yet
 * must read "Select Options", not silently add the default.
 */
export function resolveSelection(
  options: ProductOption[],
  variants: ProductVariant[],
  searchParams: { get(name: string): string | null }
) {
  const [defaultVariant] = variants;
  const selections: Record<string, string> = {};

  for (const option of options) {
    selections[option.name] =
      searchParams.get(option.name) ??
      defaultVariant?.selectedOptions.find((s) => s.name === option.name)
        ?.value ??
      "";
  }

  return {
    complete: options
      .filter((option) => option.values.length > 1)
      .every((option) =>
        option.values.some((v) => v.value === selections[option.name])
      ),
    variant: findVariantByOptions(variants, selections) ?? defaultVariant,
  };
}

/**
 * `option value -> buyable`, given what is selected on the *other* options —
 * so picking a colour greys out the sizes that colourway doesn't come in.
 */
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

type GalleryImage = { url: string; altText?: string | null };

/**
 * The product photos belonging to one colourway. BigCommerce names the colour
 * in each photo's alt text; that is the only in-band link from a photo to a
 * swatch. The longest matching label wins, so a product carrying both
 * "Indigo" and "Indigo Rinse" does not hand "Indigo Rinse" photos to the
 * "Indigo" swatch.
 */
export function colorGallery<T extends GalleryImage>(
  gallery: readonly T[],
  color: string,
  colors: readonly string[]
): T[] {
  // Whole words only: "Red" must not match inside "Tailored", nor "Tan"
  // inside "Standard".
  const ranked = [...colors]
    .sort((a, b) => b.length - a.length)
    .map((label) => ({
      label,
      pattern: new RegExp(
        `(?<![\\p{L}\\p{N}])${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
        "iu"
      ),
    }));
  return gallery.filter((image) => {
    const alt = image.altText ?? "";
    return ranked.find(({ pattern }) => pattern.test(alt))?.label === color;
  });
}

/**
 * The gallery photo to bring forward for a variant: its colour's first photo.
 * The variant's own `image` cannot be used for this — it lives under
 * `attribute_rule_images/` and never appears in the gallery.
 */
export function variantGalleryImage(
  variant: ProductVariant,
  options: readonly ProductOption[],
  gallery: readonly GalleryImage[]
): string | undefined {
  const colorOption = options.find(
    (option) => getOptionType(option.name) === "color"
  );
  const color = variant.selectedOptions.find(
    (option) => option.name === colorOption?.name
  )?.value;
  if (!(colorOption && color)) return undefined;

  return colorGallery(
    gallery,
    color,
    colorOption.values.map((value) => value.value)
  )[0]?.url;
}
