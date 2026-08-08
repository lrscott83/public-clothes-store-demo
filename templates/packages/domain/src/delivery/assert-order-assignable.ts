import type { DeliveryMode, OrderStatus } from '../sales/order.js';
import {
  CarrierNotFoundError,
  OrderNotAssignableStateError,
  OrderNotFoundForDeliveryError,
  PickupOrderCannotBeAssignedError,
} from './errors.js';

/**
 * The only order facts the assignability rules read. Structurally satisfied
 * by `OrderDeliverySnapshot` (which also carries `warehouseId`, needed for
 * scoping and irrelevant here) and by the two columns
 * `PrismaDeliveryAssignmentRepository.create` reads back under its row lock.
 */
export interface AssignableOrder {
  readonly deliveryMode: DeliveryMode;
  readonly status: OrderStatus;
}

/** The only carrier fact the rules read. Satisfied by the `Carrier` entity and by the locked re-read. */
export interface AssignableCarrier {
  readonly active: boolean;
}

/**
 * Both sides of the decision, each nullable because "does not exist" IS one
 * of the answers the rules have to give.
 */
export interface AssignmentCandidate {
  readonly orderId: string;
  readonly carrierId: string;
  readonly order: AssignableOrder | null;
  readonly carrier: AssignableCarrier | null;
}

/**
 * THE four rules that decide whether a `DeliveryAssignment` may be created —
 * in ONE place, for the two callers that must agree about them.
 *
 * They used to be stated twice: in `DeliveryService.assign` (the fast path,
 * unlocked) and again inside `PrismaDeliveryAssignmentRepository.create`'s
 * locked re-read (the one a concurrent writer cannot step around). Both
 * checks are genuinely needed — the service's gives the clearer, cheaper
 * answer, the adapter's is the one that actually holds under concurrency —
 * but there is no reason for the RULES to live in both. A change to any of
 * them had to be made in two unrelated files in two different layers, and
 * nothing failed if only one was updated.
 *
 * It also put fulfilment POLICY in an infrastructure adapter, which
 * `architecture.md` places squarely in the domain ("pure business logic in
 * packages; delivery and wiring in apps; infrastructure enters through
 * ports"). The same round did exactly the right thing by extracting
 * `assertAssignmentDeliverable`, then did the opposite here.
 *
 * Pure, total, and returns nothing: the rules either hold or one of them
 * throws its own named error. The lock, the locked re-read, and the ordering
 * of the reads all stay with their callers — only the decision moved.
 *
 * CHECK ORDER IS PART OF THE CONTRACT. "The order exists" is answered FIRST
 * because `DeliveryService.assign` asserts the caller's warehouse scope
 * immediately after it: any rule evaluated earlier would answer an
 * out-of-scope operator with a fact about an order they are not allowed to
 * see. The carrier is answered LAST for the same reason — it is the one fact
 * here that is not about the order at all.
 *
 * `CarrierNotFoundError` deliberately covers BOTH an unknown carrier and an
 * inactive one, matching the error's own message ("not found or inactive")
 * and giving a soft-deleted carrier no distinguishable response.
 *
 * EVERY error it throws is a DELIVERY error. The status rule used to throw
 * Sales' `InvalidOrderStateError`, which put a Sales error class on Delivery's
 * import list in the same round that reshaped `order-delivery-gateway.port.ts`
 * to stop Delivery depending on Sales' `Order` root — see
 * `OrderNotAssignableStateError`. The HTTP answer (409) is identical.
 */
export function assertOrderAssignable(candidate: AssignmentCandidate): void {
  if (candidate.order === null) {
    throw new OrderNotFoundForDeliveryError(candidate.orderId);
  }
  if (candidate.order.deliveryMode === 'pickup') {
    throw new PickupOrderCannotBeAssignedError(candidate.orderId);
  }
  if (candidate.order.status !== 'verified') {
    throw new OrderNotAssignableStateError(candidate.orderId, 'verified', candidate.order.status);
  }
  if (candidate.carrier === null || !candidate.carrier.active) {
    throw new CarrierNotFoundError(candidate.carrierId);
  }
}
