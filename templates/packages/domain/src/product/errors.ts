/**
 * Named domain errors for the Products & Categories module. Guards throw
 * these explicitly instead of silently clamping/defaulting invalid input —
 * money and master-data invariants must "grita, no adivina" (scream, not
 * guess), matching the Currency module's error discipline.
 */

export class InvalidProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProductError';
  }
}

export class InvalidCategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCategoryError';
  }
}
