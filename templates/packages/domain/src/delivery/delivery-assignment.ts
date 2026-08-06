import { randomUUID } from 'node:crypto';
import { InvalidAssignmentStateError } from './errors.js';

/**
 * Exactly two states — no third "assigned but not yet picked up" state
 * exists (D1, spec: "Only two assignment states exist").
 */
export type DeliveryAssignmentStatus = 'in_transit' | 'delivered';

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
 * Pure guard: `in_transit -> delivered`, stamping `deliveredAt`. Mirrors
 * `deliverOrder`'s shape exactly. Rejects any other source status —
 * including an already-`delivered` assignment — with
 * `InvalidAssignmentStateError`.
 */
export function markAssignmentDelivered(
  assignment: DeliveryAssignment,
  at: Date,
): DeliveryAssignment {
  if (assignment.status !== 'in_transit') {
    throw new InvalidAssignmentStateError(assignment.id, 'in_transit', assignment.status);
  }
  return { ...assignment, status: 'delivered', deliveredAt: at, updatedAt: at };
}
