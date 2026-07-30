import type { Money } from '../currency/money.js';

/**
 * Settlement of one accrual. 1:1 with it, enforced by a unique index — an
 * accrual is either paid or it is not. Partial payments and payout batches are
 * deliberately absent: no requirement asks for them, and a payment schedule
 * would be the kind of structure that is easy to add later and impossible to
 * simplify once anything has settled against it.
 *
 * Recording one does NOT touch `Order.status`. Whether the customer's order is
 * delivered and whether the agent has been paid are independent facts, and
 * coupling them would make paying an agent look like a change to the sale.
 */
export interface CommissionPayment {
  readonly id: string;
  readonly accrualId: string;
  /** Always MN — the currency the accrual was computed in. */
  readonly amount: Money;
  readonly paidAt: Date;
  /** The `CompanyUser` who recorded the settlement, never the one being paid. */
  readonly recordedByCompanyUserId: string;
  readonly note: string | null;
  readonly createdAt: Date;
}
