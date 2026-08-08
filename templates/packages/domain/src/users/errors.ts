/**
 * Named domain errors for the Users/Identity module. Guards throw these
 * explicitly instead of silently clamping/defaulting invalid input — "grita,
 * no adivina" (scream, not guess), matching the Customer/Sales modules'
 * error discipline.
 */

export class InvalidUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUserError';
  }
}

/** Thrown when a `login` would collide with an existing user's. */
export class DuplicateLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateLoginError';
  }
}

/**
 * Thrown when a warehouse-scoped caller acts on (or reads) something that
 * belongs to a warehouse other than their own — the `assertWarehouseScope`
 * rule, stated in the domain's own vocabulary.
 *
 * A DOMAIN error, deliberately, not a NestJS `ForbiddenException`: the
 * assertion is shared by `OrderController`, `CarrierController` and
 * `DeliveryAssignmentController`, and every OTHER failure those controllers
 * surface is a domain error they map themselves. One layer throwing HTTP
 * exceptions and every other throwing domain errors is the kind of split that
 * makes a future non-HTTP caller (a job, a CLI) inherit `@nestjs/common`.
 * Each controller maps this to 403.
 */
export class WarehouseScopeViolationError extends Error {
  constructor(public readonly warehouseId: string) {
    super('Not scoped to this warehouse');
    this.name = 'WarehouseScopeViolationError';
  }
}
