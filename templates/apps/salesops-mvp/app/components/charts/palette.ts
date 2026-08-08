/**
 * Shared categorical palette for every chart primitive in this directory.
 * Plain Tailwind utility class pairs (fill + stroke), no raw hex values, so
 * the whole dashboard's charts stay visually consistent and themeable via
 * the app's existing semantic color tokens (`primary`, `accent`, `success`,
 * etc. — see `templates/packages/web-common/styles.css`).
 *
 * Chart primitives pick a color by index (`palette[i % palette.length]`) or
 * by an explicit `colorKey` name passed through `bars`/`slices` props — this
 * module knows nothing about pedidos, margen, or any other domain concept.
 */
export interface PaletteColor {
  key: string;
  fill: string;
  stroke: string;
}

export const CHART_PALETTE: PaletteColor[] = [
  { key: 'primary', fill: 'fill-primary', stroke: 'stroke-primary' },
  { key: 'secondary', fill: 'fill-secondary', stroke: 'stroke-secondary' },
  { key: 'accent', fill: 'fill-accent', stroke: 'stroke-accent' },
  { key: 'success', fill: 'fill-success', stroke: 'stroke-success' },
  { key: 'warning', fill: 'fill-warning', stroke: 'stroke-warning' },
  { key: 'info', fill: 'fill-info', stroke: 'stroke-info' },
];

/** Resolves a palette color by explicit `colorKey`, falling back to a stable index-based pick. */
export function resolveChartColor(index: number, colorKey?: string): PaletteColor {
  if (colorKey) {
    const match = CHART_PALETTE.find((color) => color.key === colorKey);
    if (match) return match;
  }
  return CHART_PALETTE[index % CHART_PALETTE.length];
}
