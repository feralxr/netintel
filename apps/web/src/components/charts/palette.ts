// A small, consistent categorical palette used across every chart so the
// same category/dimension always gets the same color everywhere in the app.
// Anchored on the accent orange, extended with complementary hues that stay
// readable on the near-black background.

export const CHART_PALETTE = [
  "#e8622c", // accent orange
  "#4f9dde", // blue
  "#7dd3a0", // green
  "#e0b84c", // amber
  "#b58af5", // purple
  "#ec7fb5", // pink
  "#5fc9c9", // teal
  "#e58a6b", // terracotta
  "#8b9ce8", // periwinkle
  "#c4d95a", // lime
];

const colorCache = new Map<string, string>();
let nextIndex = 0;

/** Deterministic color assignment: the same key always gets the same color for the lifetime of the page. */
export function colorFor(key: string): string {
  if (colorCache.has(key)) return colorCache.get(key)!;
  const color = CHART_PALETTE[nextIndex % CHART_PALETTE.length];
  nextIndex += 1;
  colorCache.set(key, color);
  return color;
}

export const CHART_GRID_COLOR = "#242428";
export const CHART_AXIS_COLOR = "#5a5a60";
export const CHART_TOOLTIP_BG = "#191a1d";
export const CHART_TOOLTIP_BORDER = "#242428";
