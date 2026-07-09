/** Sums `priceUSD * quantity` across all cart lines. Empty cart totals 0. */
export function cartTotalUSD(lines: Array<{ priceUSD: number; quantity: number }>): number {
  return lines.reduce((total, line) => total + line.priceUSD * line.quantity, 0);
}
