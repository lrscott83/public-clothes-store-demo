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

/**
 * Spanish, UI-facing display labels for each `PaymentChannel` KEY. Keys stay
 * in English (code/DB identifiers); only the human-readable label is
 * Spanish. `Record<PaymentChannel, string>` is deliberate: adding a new
 * channel is a compile error here until its label is added — mirrors the
 * `ROLE_LABELS_ES` convention in `../users/roles.js`.
 */
export const PAYMENT_CHANNEL_LABELS_ES: Record<PaymentChannel, string> = {
  ZELLE: 'Zelle',
  USD_CASH: 'USD en efectivo',
  EUR_CASH: 'EUR en efectivo',
  MN_TRANSFER: 'Transferencia en MN',
  MN_CASH: 'MN en efectivo',
};

/** Spanish display label for a payment channel — UI-facing only, never a stored/matched key. */
export function getPaymentChannelLabel(channel: PaymentChannel): string {
  return PAYMENT_CHANNEL_LABELS_ES[channel];
}
