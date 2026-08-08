/**
 * Named domain errors for the Sales module. Guards throw these explicitly
 * instead of silently clamping/defaulting invalid input — "grita, no
 * adivina" (scream, not guess), matching every other module's error
 * discipline (Currency/Products/Warehouses/Customers).
 */

export class InvalidOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderError';
  }
}

/**
 * Thrown when a status-transition guard (`confirmOrder`/`deliverOrder`/
 * `cancelOrder`) is invoked from a source status that does not allow it.
 * `expected` documents the only source status(es) the transition accepts
 * (e.g. `'created'` or `'created|verified'`); `actual` is the order's real
 * status at the time of the attempt.
 */
export class InvalidOrderStateError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `Order "${orderId}" requires status "${expected}" for this transition, but is "${actual}"`,
    );
    this.name = 'InvalidOrderStateError';
  }
}

/** What an order points at and must be able to resolve before it can exist. */
export type OrderReferenceKind = 'warehouse' | 'product' | 'category' | 'customer';

/**
 * Thrown when something an order REFERENCES is not usable: it does not exist,
 * or it has been soft-deleted (`active=false`).
 *
 * Deliberately NOT the same error as `WarehouseCannotFulfillOrderError`.
 * A shortage means the world cannot satisfy the request right now; an
 * unresolvable reference means the request itself is wrong and no change in
 * stock would ever make it succeed. Reporting a shortage for a warehouse that
 * does not exist would blame the stock for a typo.
 *
 * `inactive` matters as much as `not found`: soft-deleted rows are still
 * readable, and every listing endpoint hides them by default. Accepting one
 * here would let a write take exactly what the corresponding read says does
 * not qualify.
 */
export class UnsellableOrderReferenceError extends Error {
  constructor(
    public readonly kind: OrderReferenceKind,
    public readonly referenceId: string,
    public readonly reason: 'not found' | 'inactive',
  ) {
    super(`${kind} "${referenceId}" cannot be used on an order — ${reason}`);
    this.name = 'UnsellableOrderReferenceError';
  }
}

/**
 * Thrown when the warehouse an order names cannot cover the whole basket from
 * its own available stock (`onHand - reserved`) at creation time, or when a
 * warehouse change would move an order to one that cannot.
 *
 * Distinct from `InsufficientStockError`, which fires later at `confirmOrder`
 * when stock is actually RESERVED. This one is a fast-fail on a read snapshot
 * and holds nothing — both can legitimately fire for the same order if stock
 * is taken in between.
 */
export class WarehouseCannotFulfillOrderError extends Error {
  constructor(public readonly warehouseId: string) {
    super(`Warehouse "${warehouseId}" cannot fulfill every line of this order from available stock`);
    this.name = 'WarehouseCannotFulfillOrderError';
  }
}

/**
 * Re-exported, NOT redefined — cross-currency conversion failures during
 * order-line/order-payment building surface the SAME `RateNotFoundError`
 * the Currency module already throws (`currency/errors.ts`). No duplicate
 * class. Re-exporting the identical binding through both `currency/index.js`
 * and `sales/index.js` is safe: ES module `export *` ambiguity only fires
 * when two DIFFERENT bindings share a name, not when both paths resolve to
 * the same original declaration.
 */
export { RateNotFoundError } from '../currency/errors.js';
