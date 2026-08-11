/**
 * `percentDiscountPrice` (design.md §3, e.g. `"20.00"`) rendered as a compact
 * badge label — `"-20%"`, not `"-20.00%"`. Trims a trailing `.00` but keeps a
 * genuinely fractional percent (`"12.50"` -> `"-12.5%"`).
 */
export function formatPercentBadge(percent: string): string {
  const value = Number(percent);
  const trimmed = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  return `-${trimmed}%`;
}
