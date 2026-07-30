/**
 * Named domain errors for the Commission module. Guards throw these explicitly
 * instead of silently defaulting or guessing — "grita, no adivina" (scream,
 * not guess), matching the Users/Customer/Sales/Companies modules.
 *
 * Every one of these guards money that will be paid to a person, so the
 * failure mode has to be a refusal, never a plausible-looking number.
 */

/** Thrown when accrual is attempted for an order that has not reached `delivered`. Commission is earned by delivery, not by booking. */
export class OrderNotDeliveredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderNotDeliveredError';
  }
}

/** Thrown when a second payment is recorded against an accrual that is already settled — an accrual is paid once, or not at all. */
export class CommissionAlreadySettledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommissionAlreadySettledError';
  }
}

/**
 * Thrown when accrual is attempted for an order carrying no attributed agent.
 * Orders predating the attribution cutover legitimately have none; crediting
 * one to a guessed agent would fabricate a financial record, so the recorder
 * declines and logs instead.
 */
export class UnattributedOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnattributedOrderError';
  }
}
