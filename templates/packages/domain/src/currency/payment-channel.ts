import type { Currency } from './money.js';

/**
 * The five confirmed payment channels (engram decision/currency-financial-params).
 * No other channel must be accepted — this is a closed union, not an open string.
 */
export type PaymentChannel =
  | 'ZELLE'
  | 'USD_EFECTIVO'
  | 'EUR_EFECTIVO'
  | 'MN_TRANSFERENCIA'
  | 'MN_EFECTIVO';

/** Each channel has a single, fixed settlement currency. */
export const CHANNEL_CURRENCY: Record<PaymentChannel, Currency> = {
  ZELLE: 'USD',
  USD_EFECTIVO: 'USD',
  EUR_EFECTIVO: 'EUR',
  MN_TRANSFERENCIA: 'MN',
  MN_EFECTIVO: 'MN',
};
