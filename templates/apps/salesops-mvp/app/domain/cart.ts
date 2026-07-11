import type { ExchangeRates } from './types';
import { formatMoney } from '@store-mgmt/storefront/config';

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/** Sums `priceUSD * quantity` across all cart lines. Empty cart totals 0. */
export function cartTotalUSD(lines: Array<{ priceUSD: number; quantity: number }>): number {
  return lines.reduce((total, line) => total + line.priceUSD * line.quantity, 0);
}

/**
 * Converts a USD total to the given currency using the provided exchange rates.
 * Identity for USD. Falls back to USD for unknown currencies.
 */
export function convertTotal(
  totalUSD: number,
  currency: string,
  rates: ExchangeRates,
): number {
  switch (currency) {
    case 'USD':
      return totalUSD;
    case 'MN':
      return totalUSD * rates.usdToMn;
    case 'ZELLE':
      return totalUSD * rates.zelle;
    case 'EUR':
      return totalUSD * rates.eur;
    default:
      return totalUSD;
  }
}

/**
 * Formats a numeric amount as a display string for the given currency.
 * - USD, ZELLE, EUR → via formatMoney (Intl)
 * - MN → es-VE decimal format + ' Mn' suffix
 * - Unknown → USD format (fallback)
 */
export function formatConvertedTotal(amount: number, currency: string): string {
  switch (currency) {
    case 'USD':
      return formatMoney(amount, MONEY);
    case 'MN':
      return `${Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} MN`;
    case 'ZELLE':
      return `${formatMoney(amount, MONEY)} (Zelle)`;
    case 'EUR':
      return formatMoney(amount, { locale: 'en-US', currency: 'EUR' });
    default:
      return formatMoney(amount, MONEY);
  }
}
