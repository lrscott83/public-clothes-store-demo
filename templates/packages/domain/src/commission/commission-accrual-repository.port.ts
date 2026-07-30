import type { CommissionAccrual } from './commission-accrual.js';

/** Filter for `listAccruals`. Omitted fields do not constrain the result. */
export interface CommissionAccrualFilter {
  /** Scope to one agent — how a `sales_agent` is limited to their OWN accruals. */
  readonly attributedCompanyUserId?: string;
  /** `true` = only accruals with no payment yet; `false` = only settled ones. */
  readonly unsettledOnly?: boolean;
}

/**
 * Port for reading/writing accruals. `create` is create-if-absent keyed on
 * `orderId` (unique index): delivering the same order twice must never produce
 * a second accrual, and re-running must never overwrite a frozen one.
 */
export interface ICommissionAccrualRepository {
  /** Returns the EXISTING accrual untouched when one already exists for `orderId`. */
  create(accrual: CommissionAccrual): Promise<CommissionAccrual>;
  findByOrderId(orderId: string): Promise<CommissionAccrual | null>;
  findById(id: string): Promise<CommissionAccrual | null>;
  list(filter?: CommissionAccrualFilter): Promise<CommissionAccrual[]>;
}

/** DI token for `ICommissionAccrualRepository` — consumers inject by this symbol. */
export const COMMISSION_ACCRUAL_REPOSITORY = Symbol('ICommissionAccrualRepository');
