/**
 * Named domain errors for the Customers module. Guards throw these explicitly
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

/**
 * Thrown when `Customer.companyUserId` does not reference an existing tenant
 * `CompanyUser` (FK violation). Named `...UserNotFoundError` from before the
 * multi-tenant-by-schema reshape (design.md D1) moved the link from master
 * `User` to tenant `CompanyUser` — kept as-is to avoid a wider rename of
 * consumers outside this batch's scope.
 */
export class CustomerUserNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerUserNotFoundError';
  }
}

/** Thrown when `Customer.companyUserId` would collide with an existing customer's — the 1:1 link is unique. */
export class DuplicateCustomerUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateCustomerUserError';
  }
}
