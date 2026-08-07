import { randomUUID } from 'node:crypto';
import { InvalidAssignmentStateError } from './errors.js';

/**
 * `in_transit` and `delivered` are the two states of the HAPPY path — there
 * is still no third "assigned but not yet picked up" state (D1, spec: "Only
 * two assignment states exist"; that requirement is about the pickup/transit
 * split, and it still holds).
 *
 * `cancelled` is not a third happy-path state: it is the TERMINAL state of an
 * assignment whose order was cancelled out from under it. Without it, such a
 * row stays `in_transit` forever — the carrier reads BUSY in
 * `computeCarrierCapacity` with no API path able to close it, because
 * `markDelivered` on a cancelled order throws `InvalidOrderStateError`.
 * Recovery then needs manual SQL. Closing those rows as `delivered` was
 * explicitly rejected: it would inflate `computeCarrierThroughput`, i.e.
 * corrupt throughput reporting with deliveries that never happened.
 *
 * Only `in_transit` counts as busy; only `delivered` counts as throughput.
 * `cancelled` is neither.
 */
export type DeliveryAssignmentStatus = 'in_transit' | 'delivered' | 'cancelled';

/**
 * Bridges an `Order` to a `Carrier`, 0..1 per order (`orderId` UNIQUE,
 * mirroring `CommissionAccrual.orderId`'s idempotency guarantee). The
 * delivered edge has exactly ONE writer — `closeAssignmentOnDeliveryTx`
 * (Phase 5, design §2B/§8) — never `markDelivered` on the repository port.
 */
export interface DeliveryAssignment {
  readonly id: string;
  readonly orderId: string;
  readonly carrierId: string;
  readonly status: DeliveryAssignmentStatus;
  readonly assignedAt: Date;
  readonly deliveredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Input to `assignCarrier`. `id` is optional so the factory can mint a fresh assignment. */
export interface AssignCarrierInput {
  readonly id?: string;
  readonly orderId: string;
  readonly carrierId: string;
}

/**
 * Atomically creates a `DeliveryAssignment` in `in_transit` — carrier and
 * initial state are set together in the SAME factory call, never in two
 * separate writes (spec: "Assigning a carrier creates an in_transit
 * assignment atomically").
 */
export function assignCarrier(input: AssignCarrierInput, at: Date): DeliveryAssignment {
  return {
    id: input.id ?? randomUUID(),
    orderId: input.orderId,
    carrierId: input.carrierId,
    status: 'in_transit',
    assignedAt: at,
    deliveredAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * The `in_transit -> delivered` PRECONDITION, on its own, returning nothing.
 *
 * Extracted so callers that need only the GUARD can say so by name.
 * `DeliveryService.markDelivered` does not write the delivered edge itself
 * (that is `closeAssignmentOnDeliveryTx`, inside Sales' transaction, design
 * §8) — it needs the rule checked and nothing else. Calling
 * `markAssignmentDelivered` there and discarding the return read like a
 * leftover: nothing signalled the statement was load-bearing, and a cleanup
 * pass deleting it would have silently removed the only guard on the
 * transition. This name cannot be deleted by accident.
 *
 * Rejects any source status other than `in_transit` — including an
 * already-`delivered` and a `cancelled` assignment (both terminal) — with
 * `InvalidAssignmentStateError`.
 */
export function assertAssignmentDeliverable(assignment: DeliveryAssignment): void {
  if (assignment.status !== 'in_transit') {
    throw new InvalidAssignmentStateError(assignment.id, 'in_transit', assignment.status);
  }
}

/**
 * Pure transition: `in_transit -> delivered`, stamping `deliveredAt`. Mirrors
 * `deliverOrder`'s shape exactly. The precondition is
 * `assertAssignmentDeliverable` — one rule, one home, so the guard and the
 * transition can never disagree about what "deliverable" means.
 */
export function markAssignmentDelivered(
  assignment: DeliveryAssignment,
  at: Date,
): DeliveryAssignment {
  assertAssignmentDeliverable(assignment);
  return { ...assignment, status: 'delivered', deliveredAt: at, updatedAt: at };
}
