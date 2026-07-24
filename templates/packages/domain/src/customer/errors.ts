/**
 * Named domain errors for the Clientes module. Guards throw these explicitly
 * instead of silently clamping/defaulting invalid input — "grita, no
 * adivina" (scream, not guess), matching the Warehouse/Products/Currency
 * modules' error discipline.
 */

export class InvalidCustomerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCustomerError';
  }
}

/** Thrown when a `documentId` would collide with an existing customer's. */
export class DuplicateCustomerDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateCustomerDocumentError';
  }
}

/** Thrown when `Customer.userId` does not reference an existing `User` (FK violation). */
export class CustomerUserNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerUserNotFoundError';
  }
}

/** Thrown when `Customer.userId` would collide with an existing customer's — the 1:1 link is unique. */
export class DuplicateCustomerUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateCustomerUserError';
  }
}
