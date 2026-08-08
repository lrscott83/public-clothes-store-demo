import type { Money } from '../currency/money.js';

/**
 * Reads the commission a product earns. Pure id lookup — all name matching
 * already happened at seed time.
 */
export interface ICommissionReferenceProvider {
  /**
   * `undefined` means "no reference configured" and MUST NOT be coerced to
   * zero anywhere downstream. An unconfigured product is an unknown, and the
   * accrual carries it as unresolved so it can be fixed; a zero would look
   * like a settled fact and quietly under-pay someone.
   */
  commissionFor(productId: string): Promise<Money | undefined>;
  /** Batch form for accrual, which needs every line's reference at once — avoids N+1 per order line. */
  commissionsFor(productIds: readonly string[]): Promise<ReadonlyMap<string, Money>>;
}

/** DI token for `ICommissionReferenceProvider` — consumers inject by this symbol. */
export const COMMISSION_REFERENCE_PROVIDER = Symbol('ICommissionReferenceProvider');
