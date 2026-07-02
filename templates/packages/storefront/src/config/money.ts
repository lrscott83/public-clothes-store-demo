export interface FormatMoneyOptions {
  locale: string;
  currency: string;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

/**
 * Formats a numeric amount as currency via `Intl.NumberFormat`, memoizing
 * one formatter instance per `locale|currency` pair.
 */
export function formatMoney(amount: number, options: FormatMoneyOptions): string {
  const cacheKey = `${options.locale}|${options.currency}`;
  let formatter = formatterCache.get(cacheKey);

  if (!formatter) {
    formatter = new Intl.NumberFormat(options.locale, {
      style: 'currency',
      currency: options.currency,
    });
    formatterCache.set(cacheKey, formatter);
  }

  return formatter.format(amount);
}
