import type { Order } from '../sales/order.js';
import type { CommissionAccrual } from './commission-accrual.js';

/**
 * The seam `OrderService.deliver` depends on. Sales depends on a port that the
 * COMMISSION concept declares — dependency inversion, so the sales module
 * never imports a commission implementation and the two can be reasoned about
 * separately.
 *
 * Declared here rather than driven by an event bus: at this scale a bus is
 * ceremony, and keeping the call inside the one method that owns the
 * `delivered` transition makes the trigger visible where it happens.
 */
export interface ICommissionAccrualRecorder {
  /**
   * Idempotent create-if-absent for a DELIVERED order. Returns the EXISTING
   * accrual untouched if one is already recorded — delivering twice, or a
   * retry after a partial failure, must never produce a second one.
   *
   * Returns `null` when the order carries no attributed agent (a row predating
   * the attribution cutover). That is logged, never accrued: crediting a
   * guessed agent would fabricate a financial record.
   */
  recordForDeliveredOrder(order: Order): Promise<CommissionAccrual | null>;
}

/** DI token for `ICommissionAccrualRecorder` — consumers inject by this symbol. */
export const COMMISSION_ACCRUAL_RECORDER = Symbol('ICommissionAccrualRecorder');
