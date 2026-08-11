export interface FormatMoneyOptions {
  readonly locale: string;
  readonly currency: string;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getCachedFormatter(cacheKey: string, build: () => Intl.NumberFormat): Intl.NumberFormat {
  let formatter = formatterCache.get(cacheKey);
  if (!formatter) {
    formatter = build();
    formatterCache.set(cacheKey, formatter);
  }
  return formatter;
}

/**
 * `web-catalog` owns this formatter (design.md D9 references, spec:
 * "Money Formatting Supports Non-ISO Currencies") because `MN` is not ISO
 * 4217 — `new Intl.NumberFormat({ currency: 'MN' })` throws `RangeError`
 * (spike 0.4, `money.test.ts`'s first assertion proves it). `amount` is a
 * decimal STRING, matching the wire shape (`PublicMoneyDto`, design.md §3)
 * — never a JSON number — and is parsed here only for display, never for
 * further arithmetic.
 *
 * `USD`/`EUR` (and any other real ISO 4217 code) fall through to standard
 * `Intl.NumberFormat` currency output, one memoized formatter instance per
 * `locale|currency` pair — same pattern as the frozen
 * `packages/storefront/src/config/money.ts` this app must never import
 * (D9), rewritten here because that package is off-limits.
 */
export function formatMoney(amount: string, options: FormatMoneyOptions): string {
  const value = Number(amount);

  if (options.currency === 'MN') {
    const formatter = getCachedFormatter(
      `plain|${options.locale}`,
      () => new Intl.NumberFormat(options.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
    return `${formatter.format(value)} MN`;
  }

  const formatter = getCachedFormatter(
    `${options.locale}|${options.currency}`,
    () => new Intl.NumberFormat(options.locale, { style: 'currency', currency: options.currency }),
  );
  return formatter.format(value);
}
