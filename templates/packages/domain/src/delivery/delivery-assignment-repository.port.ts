import type { DeliveryAssignment, DeliveryAssignmentStatus } from './delivery-assignment.js';

/** Filter for `list`. Omitted fields do not constrain the result. */
export interface DeliveryAssignmentFilter {
  readonly carrierId?: string;
  readonly status?: DeliveryAssignmentStatus;
  readonly deliveredFrom?: Date;
  readonly deliveredTo?: Date;
}

/**
 * Port for reading/writing `DeliveryAssignment`. Zero dependency on any
 * persistence technology.
 *
 * There is deliberately NO `markDelivered` method here — the delivered edge
 * has exactly one writer, `closeAssignmentOnDeliveryTx` (Phase 5, design
 * §2B/§8), invoked inside Sales' own transaction. Do not add one back for
 * convenience; that absence is the design.
 */
export interface IDeliveryAssignmentRepository {
  /** Fails on a duplicate `orderId` — the UNIQUE index IS the guarantee (D1). */
  create(assignment: DeliveryAssignment): Promise<DeliveryAssignment>;
  findById(id: string): Promise<DeliveryAssignment | null>;
  /** `null` = pickup order, or delivered before this module existed. Not an error. */
  findByOrderId(orderId: string): Promise<DeliveryAssignment | null>;
  list(filter?: DeliveryAssignmentFilter): Promise<DeliveryAssignment[]>;
  /** Anti-join: `verified` + `deliveryMode='delivery'` + no assignment row (design §4). */
  countOrdersAwaitingCarrier(): Promise<number>;
}

/** DI token for `IDeliveryAssignmentRepository` — consumers inject by this symbol. */
export const DELIVERY_ASSIGNMENT_REPOSITORY = Symbol('IDeliveryAssignmentRepository');
