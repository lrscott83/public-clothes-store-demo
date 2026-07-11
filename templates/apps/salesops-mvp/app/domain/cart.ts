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
 * USD→currency multiplier (the "tasa de cambio"): 1 for USD, the matching rate
 * otherwise. Unknown currencies fall back to 1.
 */
export function rateFor(currency: string, rates: ExchangeRates): number {
  switch (currency) {
    case 'USD':
      return 1;
    case 'MN':
      return rates.usdToMn;
    case 'ZELLE':
      return rates.zelle;
    case 'EUR':
      return rates.eur;
    default:
      return 1;
  }
}

/**
 * Label for a currency `<option>`: the code plus its exchange rate in
 * parentheses, e.g. `"MN (680)"`.
 */
export function currencyOptionLabel(currency: string, rates: ExchangeRates): string {
  return `${currency} (${rateFor(currency, rates)})`;
}

/**
 * Dual price display: the amount in the selected currency with the USD price in
 * parentheses, e.g. `"10,200.00 MN ($15.00)"`. USD returns just the plain USD
 * string (no redundant parentheses). Non-USD currencies render uniformly as
 * `"<amount> <CODE> ($<usd>)"`.
 */
export function formatPriceWithUSD(usdAmount: number, currency: string, rates: ExchangeRates): string {
  const usd = formatMoney(usdAmount, MONEY);
  if (currency === 'USD') return usd;
  const converted = convertTotal(usdAmount, currency, rates);
  const amount = Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(converted);
  return `${amount} ${currency} (${usd})`;
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
