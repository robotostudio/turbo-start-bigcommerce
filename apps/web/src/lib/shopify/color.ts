/** Maps common color names to hex values for swatch display. */
const COLOR_MAP: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  purple: "#a855f7",
  pink: "#ec4899",
  brown: "#92400e",
  gray: "#6b7280",
  grey: "#6b7280",
  navy: "#1e3a5f",
  beige: "#f5f5dc",
  cream: "#fffdd0",
  tan: "#d2b48c",
  olive: "#808000",
  teal: "#14b8a6",
  coral: "#ff7f50",
  gold: "#fbbf24",
  silver: "#c0c0c0",
  charcoal: "#36454f",
  ivory: "#fffff0",
  burgundy: "#800020",
  lavender: "#e9d5ff",
  maroon: "#800000",
  mint: "#98f5e1",
  peach: "#ffcba4",
  rust: "#b7410e",
  sage: "#bcb88a",
  sand: "#c2b280",
  slate: "#708090",
  wine: "#722f37",
  natural: "#f5f0e1",
  // Hand-off catalog colours (exact hex from the product source).
  "chalk white": "#f2f0ea",
  ecru: "#e2d8c3",
  "ecru multi": "#d9c7a8",
  "faded rose": "#c89aa0",
  indigo: "#37496b",
  "indigo rinse": "#2c3e5d",
  "oat melange": "#d8c9b4",
  "olive drab": "#6b6b47",
  "undyed ecru": "#ede6d6",
  "warm stone": "#8ca6c4",
  "washed black": "#3a3a3c",
};

/**
 * Resolves a color name to a hex value. Exact match first, then substring
 * (so "Warm Olive" → olive). Returns null when nothing matches.
 *
 * Shared by the PDP color swatch and product cards. A Sanity-authored color
 * library will later be merged over this map as the source of truth.
 */
export function getColorHex(colorName: string): string | null {
  const lower = colorName.toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];

  for (const [key, hex] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return hex;
  }
  return null;
}
