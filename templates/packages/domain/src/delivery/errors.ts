/**
 * Named domain errors for the Delivery module. Guards throw these explicitly
 * instead of silently defaulting or guessing — "grita, no adivina" (scream,
 * not guess), matching every other module's error discipline.
 */

/**
 * Thrown when `markAssignmentDelivered` (or the service-layer transition it
 * backs) is invoked on a `DeliveryAssignment` that is not `in_transit`.
 * Mirrors `InvalidOrderStateError`'s shape exactly.
 */
export class InvalidAssignmentStateError extends Error {
  constructor(
    public readonly assignmentId: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `DeliveryAssignment "${assignmentId}" requires status "${expected}" for this transition, but is "${actual}"`,
    );
    this.name = 'InvalidAssignmentStateError';
  }
}

/** Thrown when `DeliveryService.assign` is given a `carrierId` that does not resolve to an active `Carrier`. */
export class CarrierNotFoundError extends Error {
  constructor(public readonly carrierId: string) {
    super(`Carrier "${carrierId}" not found or inactive`);
    this.name = 'CarrierNotFoundError';
  }
}

/**
 * Thrown when a second `DeliveryAssignment` is attempted for an `orderId`
 * that already has one — the `orderId` UNIQUE index is the guarantee this
 * error surfaces at the service layer (design §4/§8).
 */
export class OrderAlreadyAssignedError extends Error {
  constructor(public readonly orderId: string) {
    super(`Order "${orderId}" already has a DeliveryAssignment`);
    this.name = 'OrderAlreadyAssignedError';
  }
}
