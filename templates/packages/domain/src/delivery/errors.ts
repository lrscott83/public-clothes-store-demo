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

/**
 * Thrown when Delivery asks for an `Order` that does not exist — on `assign`
 * (unknown `orderId` in the body) or through `IOrderDeliveryGateway`.
 *
 * A DOMAIN error, deliberately, not a NestJS `NotFoundException`: the gateway
 * adapter implements a pure domain port, and an HTTP exception thrown from
 * there would leak the delivery mechanism into the domain contract AND, when
 * it surfaces through `POST /delivery/assignments/:id/deliver`, name an
 * *order* for a request that named an *assignment*. The controller maps it.
 */
export class OrderNotFoundForDeliveryError extends Error {
  constructor(public readonly orderId: string) {
    super(`Order "${orderId}" not found`);
    this.name = 'OrderNotFoundForDeliveryError';
  }
}

/**
 * Thrown when a `DeliveryAssignment` is attempted for an order whose status is
 * not `verified`.
 *
 * DECLARED HERE, not imported from Sales. `assertOrderAssignable` used to
 * throw Sales' `InvalidOrderStateError`, which reintroduced a Delivery -> Sales
 * dependency on a Sales ERROR CLASS in the same round that reworked
 * `order-delivery-gateway.port.ts` specifically to stop Delivery depending on
 * Sales' `Order` root. The port carries a structural snapshot precisely so
 * Delivery names the order facts it needs without importing Sales; throwing
 * Sales' error undid that at the one place the rule is easiest to miss.
 *
 * Deliberately the SAME shape and the SAME 409 mapping as
 * `InvalidOrderStateError` — the observable HTTP contract is unchanged. What
 * changed is which module owns the vocabulary of "this order cannot be
 * assigned right now", which is a Delivery rule about a Sales fact, not a
 * Sales rule.
 */
export class OrderNotAssignableStateError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `Order "${orderId}" requires status "${expected}" to receive a DeliveryAssignment, but is "${actual}"`,
    );
    this.name = 'OrderNotAssignableStateError';
  }
}

/**
 * Thrown when a `DeliveryAssignment` is attempted for a `pickup`-mode order.
 * Spec: "Pickup-mode orders MUST NEVER receive a `DeliveryAssignment` row" —
 * the 0 case of the 0..1 cardinality is the MODELLED meaning for pickup, so
 * creating one is a conflict with the order's own fulfillment mode, never a
 * malformed request.
 */
export class PickupOrderCannotBeAssignedError extends Error {
  constructor(public readonly orderId: string) {
    super(`Order "${orderId}" is a pickup order and can never receive a DeliveryAssignment`);
    this.name = 'PickupOrderCannotBeAssignedError';
  }
}

/**
 * Thrown when carrier coverage is declared against a `warehouseId` that does
 * not resolve to a `Warehouse`. The `carrier_warehouse_warehouse_id_fkey`
 * FK is the enforcement; this is that violation stated in the domain's own
 * vocabulary, so the coverage endpoint answers 404 instead of leaking a raw
 * Prisma P2003 as a 500.
 */
export class CoverageWarehouseNotFoundError extends Error {
  constructor(public readonly warehouseId: string) {
    super(`Warehouse "${warehouseId}" not found`);
    this.name = 'CoverageWarehouseNotFoundError';
  }
}

/**
 * Thrown when the same carrier↔warehouse pair is declared twice.
 * `@@unique([carrierId, warehouseId])` is the enforcement (spec: "enforced");
 * this reports it as a 409 the client can act on rather than a raw P2002.
 */
export class CoverageAlreadyDeclaredError extends Error {
  constructor(
    public readonly carrierId: string,
    public readonly warehouseId: string,
  ) {
    super(`Carrier "${carrierId}" already covers warehouse "${warehouseId}"`);
    this.name = 'CoverageAlreadyDeclaredError';
  }
}

/**
 * Thrown when a carrier soft-delete is attempted while it still holds
 * `in_transit` assignments. Deactivating it would hide those in-flight orders
 * from EVERY operational read at once: `getCarrierCapacity` sources carriers
 * with `activeOnly: true`, so the rows vanish from the snapshot, and
 * `countOrdersAwaitingCarrier`'s anti-join excludes them because an
 * assignment row does exist. The orders would be invisible AND unassignable.
 */
export class CarrierHasOpenAssignmentsError extends Error {
  constructor(
    public readonly carrierId: string,
    public readonly openAssignmentCount: number,
  ) {
    super(
      `Carrier "${carrierId}" still has ${openAssignmentCount} in_transit assignment(s) and cannot be deactivated`,
    );
    this.name = 'CarrierHasOpenAssignmentsError';
  }
}
