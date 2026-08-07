import type { ShopifyProductOption } from "./types";

/** Option names that render as color swatches. */
const COLOR_OPTION_NAMES = new Set(["color", "colour"]);

/** Option names that render as size choices. */
const SIZE_OPTION_NAMES = new Set(["size"]);

export function getOptionType(name: string): "color" | "size" | "default" {
  const lower = name.toLowerCase();
  if (COLOR_OPTION_NAMES.has(lower)) return "color";
  if (SIZE_OPTION_NAMES.has(lower)) return "size";
  return "default";
}

/**
 * Splits product options into color and size value lists for card display.
 * The option names come back too — the PDP keys its search params by the
 * literal Shopify option name, so links need "Colour" when that's what the
 * product uses.
 */
export function getCardOptions(options: ShopifyProductOption[]): {
  colors: string[];
  sizes: string[];
  colorOptionName?: string;
  sizeOptionName?: string;
} {
  let colors: string[] = [];
  let sizes: string[] = [];
  let colorOptionName: string | undefined;
  let sizeOptionName: string | undefined;
  for (const option of options) {
    const type = getOptionType(option.name);
    if (type === "color") {
      colors = option.values;
      colorOptionName = option.name;
    } else if (type === "size") {
      sizes = option.values;
      sizeOptionName = option.name;
    }
  }
  return { colors, sizes, colorOptionName, sizeOptionName };
}
