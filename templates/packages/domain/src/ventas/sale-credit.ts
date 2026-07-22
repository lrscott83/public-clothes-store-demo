import type { Money } from '../currency/money.js';
import type { ExchangeRate } from '../currency/exchange-rate.js';

/**
 * A credit sale (0..1 per `Order`, credit sales only). References `orderId`
 * and `customerId` as foreign keys — NEVER a free-text `client: string`
 * (the pre-hexagonal `models/sale-credit.ts` scaffold had exactly that flaw;
 * this is the corrected shape). `total`/`paid` are Money in `Order.currency`;
 * rates are frozen at the same moment the owning `Order` freezes.
 */
export interface SaleCredit {
  readonly id: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly total: Money;
  readonly paid: Money;
  readonly rateApplied: ExchangeRate;
  readonly rateEffectiveFrom: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Derived, never stored: `true` once `paid >= total`. */
export function isSaleCreditPaid(saleCredit: Pick<SaleCredit, 'total' | 'paid'>): boolean {
  return saleCredit.paid.minorUnits >= saleCredit.total.minorUnits;
}
