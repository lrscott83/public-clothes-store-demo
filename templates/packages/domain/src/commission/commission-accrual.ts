import type { Money } from '../currency/money.js';

/**
 * One resolved line of an accrual. `unitCommission` is a FROZEN snapshot of
 * the reference at accrual time, not a live lookup — the same discipline
 * `OrderLine` already applies to price and exchange rate. Editing the
 * commission table must never silently restate what an agent already earned.
 */
export interface CommissionAccrualLine {
  readonly id: string;
  readonly orderLineId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitCommission: Money;
  /** `unitCommission x quantity`, frozen alongside it. */
  readonly lineCommission: Money;
}

/**
 * A line whose product had NO commission reference configured.
 *
 * It is deliberately not a line with a zero amount. "Unconfigured" and "worth
 * nothing" are different facts, and collapsing them would silently under-pay
 * an agent while leaving an accrual that looks complete. Excluded from
 * `total`, carried here so a report can show it as missing configuration.
 */
export interface UnresolvedCommissionLine {
  readonly orderLineId: string;
  readonly productId: string;
  readonly quantity: number;
}

/**
 * What one delivered order earned one agent. Created once, at delivery, and
 * never recomputed — see `computeAccrual`.
 */
export interface CommissionAccrual {
  readonly id: string;
  readonly orderId: string;
  readonly attributedCompanyUserId: string;
  /** Sum of `lineCommission` across RESOLVED lines only. Always MN. */
  readonly total: Money;
  readonly lines: readonly CommissionAccrualLine[];
  readonly unresolved: readonly UnresolvedCommissionLine[];
  readonly accruedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
