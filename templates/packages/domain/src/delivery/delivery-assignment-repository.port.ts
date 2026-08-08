import type { DeliveryAssignment, DeliveryAssignmentStatus } from './delivery-assignment.js';

/** The filter fields that constrain rows without depending on `deliveredAt`. */
interface DeliveryAssignmentFilterBase {
  readonly carrierId?: string;
  /**
   * Restricts to assignments whose ORDER belongs to this warehouse — the
   * warehouse scope `OrderController` applies to its own list, pushed into
   * the query rather than applied in memory. Resolved through the
   * `delivery_assignment -> sales_order` relation; there is no `warehouse_id`
   * column on the assignment itself and deliberately so (it would be a
   * denormalized copy of a fact Sales owns).
   */
  readonly orderWarehouseId?: string;
}

/**
 * Filter for `list`. Omitted fields do not constrain the result.
 *
 * `deliveredFrom`/`deliveredTo` bound the `deliveredAt` COLUMN, which is NULL
 * for every `in_transit` and every `cancelled` row — so a range on it
 * silently excludes them. That is right for throughput and wrong for anything
 * else, so the type only ADMITS the bounds together with
 * `status: 'delivered'`: the exclusion stops being a trap the caller has to
 * already know about and becomes something the compiler states.
 */
export type DeliveryAssignmentFilter =
  | (DeliveryAssignmentFilterBase & {
      readonly status?: DeliveryAssignmentStatus;
      readonly deliveredFrom?: undefined;
      readonly deliveredTo?: undefined;
    })
  | (DeliveryAssignmentFilterBase & {
      readonly status: 'delivered';
      readonly deliveredFrom?: Date;
      readonly deliveredTo?: Date;
    });

/**
 * Filter for `listPage` — the ROW-RETURNING read.
 *
 * `take` is REQUIRED, and that is the point of this type existing separately.
 * `GET /delivery/assignments` returned every assignment row in the tenant's
 * history — no window, no limit, no pagination — while the SAME remediation
 * round added a default window to `getCarrierCapacity` precisely because an
 * unbounded `list({status:'delivered'})` was unacceptable. The endpoint
 * returning FULL ROWS was left unbounded while the one returning a COUNT was
 * fixed.
 *
 * A default inside the adapter would have fixed that one endpoint and left
 * the class alive: the next row-returning caller would forget again, and
 * nothing would say so. Making `take` a required field means a caller cannot
 * ask for rows without stating how many — the compiler asks the question.
 *
 * It is NOT simply added to `DeliveryAssignmentFilter` because the other two
 * callers (`getCarrierCapacity`'s in-flight and throughput reads) must read a
 * COMPLETE set — they fold their rows into counts, and a row limit there would
 * make the dashboard quietly under-report, which is the same class of lie as
 * an inverted range. Those reads are bounded by a WINDOW instead; see `list`.
 */
export interface DeliveryAssignmentPageFilter extends DeliveryAssignmentFilterBase {
  readonly status?: DeliveryAssignmentStatus;
  /** Lower bound on `assignedAt` — a NOT NULL column, so it constrains every status equally. */
  readonly assignedFrom?: Date;
  /** Upper bound on `assignedAt`. */
  readonly assignedTo?: Date;
  /** REQUIRED. Maximum rows in this page; the adapter also clamps it to its own hard cap. */
  readonly take: number;
  /**
   * Keyset cursor: the `id` of the last row of the previous page. The next
   * page starts at the row AFTER it, in the `assignedAt desc, id desc` order
   * `listPage` always sorts by.
   *
   * `id` and not `assignedAt`: two assignments created in one transaction
   * share a timestamp, and a cursor on a non-unique key either skips rows or
   * repeats them.
   */
  readonly cursorId?: string;
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
  /**
   * Fails on a duplicate `orderId` — the UNIQUE index IS the guarantee (D1).
   *
   * Also RE-VALIDATES the order inside the same transaction as the insert,
   * holding a row lock on it: an order that stopped being an assignable
   * `verified` delivery order between the service's pre-check and this write
   * gets `OrderNotAssignableStateError`/`PickupOrderCannotBeAssignedError`/
   * `OrderNotFoundForDeliveryError` instead of a row that lands `in_transit`
   * on a `cancelled` order and can never be closed by any API path. The
   * service-layer checks stay as the fast path with the better message; THIS
   * is the guard a concurrent `POST /orders/:id/cancel` cannot step around.
   */
  create(assignment: DeliveryAssignment): Promise<DeliveryAssignment>;
  findById(id: string): Promise<DeliveryAssignment | null>;
  /** `null` = pickup order, or delivered before this module existed. Not an error. */
  findByOrderId(orderId: string): Promise<DeliveryAssignment | null>;
  /**
   * The COMPLETE set matching `filter` — no row limit, deliberately.
   *
   * Reserved for the AGGREGATE readers (`computeCarrierCapacity`,
   * `computeCarrierThroughput`), which fold every row into a count: truncating
   * them would under-report exactly the numbers operators act on. What bounds
   * these reads is a WINDOW, not a limit — `getCarrierCapacity` always passes
   * `deliveredFrom` for the throughput read, and the `in_transit` read is
   * bounded by how much work is in flight, which is the open working set
   * rather than history.
   *
   * DO NOT use this to serve rows to a client. `listPage` exists for that and
   * makes the bound a compile-time requirement.
   */
  list(filter?: DeliveryAssignmentFilter): Promise<DeliveryAssignment[]>;
  /**
   * One BOUNDED page, newest first (`assignedAt desc, id desc`), for the reads
   * that hand rows back to a caller. `take` is required and additionally
   * clamped by the adapter; `cursorId` walks the keyset.
   */
  listPage(filter: DeliveryAssignmentPageFilter): Promise<DeliveryAssignment[]>;
  /** Anti-join: `verified` + `deliveryMode='delivery'` + no assignment row (design §4). */
  countOrdersAwaitingCarrier(): Promise<number>;
}

/** DI token for `IDeliveryAssignmentRepository` — consumers inject by this symbol. */
export const DELIVERY_ASSIGNMENT_REPOSITORY = Symbol('IDeliveryAssignmentRepository');
