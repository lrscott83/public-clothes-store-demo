import type { Currency } from './money.js';

/**
 * The five confirmed payment channels (engram decision/currency-financial-params).
 * No other channel must be accepted — this is a closed union, not an open string.
 */
export type PaymentChannel =
  | 'ZELLE'
  | 'USD_CASH'
  | 'EUR_CASH'
  | 'MN_TRANSFER'
  | 'MN_CASH';

/** Each channel has a single, fixed settlement currency. */
export const CHANNEL_CURRENCY: Record<PaymentChannel, Currency> = {
  ZELLE: 'USD',
  USD_CASH: 'USD',
  EUR_CASH: 'EUR',
  MN_TRANSFER: 'MN',
  MN_CASH: 'MN',
};
