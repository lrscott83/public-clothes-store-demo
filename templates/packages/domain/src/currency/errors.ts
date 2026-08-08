/**
 * Named domain errors for the Currency module. The rate resolver and money
 * guards throw these explicitly instead of silently returning 0/null — money
 * code must "grita, no adivina" (scream, not guess).
 */

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyError';
  }
}

export class RateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateNotFoundError';
  }
}
