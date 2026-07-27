/**
 * Named domain errors for the Warehouses & Inventory module. Guards throw
 * these explicitly instead of silently clamping/defaulting invalid input —
 * "grita, no adivina" (scream, not guess), matching the Products/Currency
 * modules' error discipline.
 */

export class InvalidWarehouseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWarehouseError';
  }
}

export class InvalidStockLevelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStockLevelError';
  }
}

export class InvalidStockMovementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStockMovementError';
  }
}

/** Thrown when a movement/adjustment would drive `onHand` (or `reserved`) below 0. */
export class NegativeStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NegativeStockError';
  }
}

/** Thrown when a `reserve()` would push `available` (`onHand - reserved`) below 0. */
export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientStockError';
  }
}
