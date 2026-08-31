export interface FormatMoneyOptions {
  readonly locale: string;
  readonly currency: string;
}

/**
 * Format a decimal string amount as `<number> <CODE>` with:
 * - Regular space (U+0020) as thousands separator: "10 234 015.50"
 * - Period (dot) as decimal separator: "1 234.50"
 * - Currency code as suffix with a space: "1 234.50 USD"
 *
 * `Intl.NumberFormat` cannot be used here because it emits typographic
 * spaces (U+202F narrow no-break or U+00A0 no-break) instead of a
 * regular ASCII space, and MN is not ISO 4217.
 *
 * `amount` is a decimal STRING matching the wire shape (`PublicMoneyDto`,
 * design.md §3) — never a JSON number.
 */
export function formatMoney(amount: string, options: FormatMoneyOptions): string {
  const value = Number(amount);
  const negative = value < 0;
  const abs = Math.abs(value);

  const [intPart, decPart] = abs.toFixed(2).split('.');
  // Insert space every 3 digits from the right
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const formatted = `${negative ? '-' : ''}${grouped}.${decPart}`;

  return `${formatted} ${options.currency}`;
}
