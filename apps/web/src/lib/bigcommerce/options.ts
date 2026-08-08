import type { CardColor } from "@/components/product/product-card";
import { swatchHex } from "./color";

/** Option names that render as colour swatches. */
const COLOR_OPTION_NAMES = new Set(["color", "colour"]);

/** Option names that render as size choices. */
const SIZE_OPTION_NAMES = new Set(["size"]);

/**
 * Classifies an option by name. Deliberately not by BigCommerce's
 * `displayStyle: "Swatch"`, which only product options carry — a variant's own
 * options report a name and nothing else, and both sides have to agree or a
 * colour selection stops resolving to a variant.
 */
export function getOptionType(name: string): "color" | "size" | "default" {
  const lower = name.toLowerCase();
  if (COLOR_OPTION_NAMES.has(lower)) return "color";
  if (SIZE_OPTION_NAMES.has(lower)) return "size";
  return "default";
}

/**
 * A `MultipleChoiceOption` as the card queries it. `edges` is nullable
 * because gql.tada types every connection off the real schema as
 * `edges: T[] | null`, so the generated payload types fit directly.
 */
export type BigCommerceProductOption = {
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
 * Splits product options into the card's colour swatches and size list.
 *
 * BigCommerce hangs the swatch hex off the option value, so the colours come
 * out of the product fetch already fully formed — no second lookup, and no
 * name-to-hex table to drift.
 *
 * The option names come back too: the PDP keys its search params by the
 * literal option name, so links need "Colour" when that is what the product
 * uses.
 */
export function getCardOptions(options: readonly BigCommerceProductOption[]): {
  colors: CardColor[];
  sizes: string[];
  colorOptionName?: string;
  sizeOptionName?: string;
} {
  let colors: CardColor[] = [];
  let sizes: string[] = [];
  let colorOptionName: string | undefined;
  let sizeOptionName: string | undefined;

  for (const option of options) {
    const values = (option.values?.edges ?? []).map((edge) => edge.node);
    const type = getOptionType(option.displayName);
    if (type === "color") {
      colors = values.map((value) => ({
        name: value.label,
        hex: swatchHex(value.hexColors),
      }));
      colorOptionName = option.displayName;
    } else if (type === "size") {
      sizes = values.map((value) => value.label);
      sizeOptionName = option.displayName;
    }
  }

  return { colors, sizes, colorOptionName, sizeOptionName };
}
