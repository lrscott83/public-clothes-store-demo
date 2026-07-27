/**
 * Named domain errors for the Sales module. Guards throw these explicitly
 * instead of silently clamping/defaulting invalid input — "grita, no
 * adivina" (scream, not guess), matching every other module's error
 * discipline (Currency/Products/Almacenes/Clientes).
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
