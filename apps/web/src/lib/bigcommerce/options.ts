import type { CardColor } from "@/components/product/product-card";
import type { ProductOption } from "./product-model";

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
export function getCardOptions(options: readonly ProductOption[]): {
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
    const type = getOptionType(option.name);
    if (type === "color") {
      colors = option.values.map(({ value, hex }) => ({ name: value, hex }));
      colorOptionName = option.name;
    } else if (type === "size") {
      sizes = option.values.map(({ value }) => value);
      sizeOptionName = option.name;
    }
  }

  return { colors, sizes, colorOptionName, sizeOptionName };
}
