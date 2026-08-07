import { Inject, Injectable } from '@nestjs/common';
import type { SanitizedUser } from '@store-mgmt/api-common';
import type {
  Carrier as DomainCarrier,
  CarrierUpdateInput,
  CarrierWarehouse as DomainCarrierWarehouse,
  DeliveryAssignment as DomainDeliveryAssignment,
  DeliveryAssignmentStatus,
  ICarrierRepository,
  ICarrierWarehouseRepository,
  IDeliveryAssignmentRepository,
  IOrderDeliveryGateway,
  IWarehouseOperatorRepository,
} from '@store-mgmt/domain';
import {
  CARRIER_REPOSITORY,
  CARRIER_WAREHOUSE_REPOSITORY,
  CarrierNotFoundError,
  DELIVERY_ASSIGNMENT_REPOSITORY,
  ORDER_DELIVERY_GATEWAY,
  OrderAlreadyAssignedError,
  OrderNotFoundForDeliveryError,
  WAREHOUSE_OPERATOR_REPOSITORY,
  assertAssignmentDeliverable,
  assertOrderAssignable,
  assignCarrier,
  computeCarrierCapacity,
  computeCarrierThroughput,
} from '@store-mgmt/domain';
import { NO_WAREHOUSE, assertWarehouseScope, resolveWarehouseScopeFilter } from '../auth/role-scope.js';
import type {
  AssignCarrierDto,
  CarrierCapacityResponseDto,
  CarrierCoverageResponseDto,
  CarrierResponseDto,
  CreateCarrierDto,
  DeliveryAssignmentResponseDto,
} from './dto/index.js';

export interface ListCarriersFilter {
  readonly warehouseId?: string;
}

export interface CapacityWindow {
  readonly from?: Date;
  readonly to?: Date;
}

/**
 * How far back `GET /delivery/capacity` looks when the caller does not name a
 * LOWER bound. Long enough to be a useful default for an operations
 * dashboard, short enough that the query stays bounded as the tenant's
 * history grows — which an unbounded `list({status:'delivered'})` was not.
 */
export const DEFAULT_THROUGHPUT_WINDOW_DAYS = 30;

/**
 * How far back `GET /delivery/assignments` looks when the caller names no
 * LOWER bound. Same number and same reasoning as the throughput window: this
 * endpoint had NO bound of any kind, so it returned every assignment row in
 * the tenant's history on every call.
 */
export const DEFAULT_ASSIGNMENT_WINDOW_DAYS = 30;

/** Rows per page when the caller names no `limit`. The adapter clamps the ceiling. */
export const DEFAULT_ASSIGNMENT_PAGE_SIZE = 100;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** What `GET /delivery/assignments` accepts, before the warehouse scope is applied. */
export interface ListAssignmentsFilter {
  readonly status?: DeliveryAssignmentStatus;
  readonly carrierId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly take?: number;
  readonly cursorId?: string;
}

/**
 * Fills in the MISSING lower bound on `assignedAt`, never the whole window —
 * the same shape (and the same reasons) as `resolveThroughputWindow`.
 *
 * `from` is what gets defaulted because `from` is what bounds the scan. The
 * upper bound is left OPEN when unnamed: a default `to = new Date()` would
 * come from the APP's clock while `assigned_at` is written by whatever clock
 * minted the entity, so any skew silently drops the newest assignments from
 * every poll.
 */
function resolveAssignmentWindow(
  filter: ListAssignmentsFilter,
  now: Date = new Date(),
): { readonly from: Date; readonly to?: Date } {
  const to = filter.to;
  const from =
    filter.from ?? new Date((to ?? now).getTime() - DEFAULT_ASSIGNMENT_WINDOW_DAYS * MS_PER_DAY);
  return { from, ...(to !== undefined ? { to } : {}) };
}

/**
 * Fills in the MISSING bound, never the whole window.
 *
 * The previous version bailed out entirely the moment EITHER bound was named
 * — so `?to=2026-08-01`, with no `from`, produced exactly the unbounded
 * full-history scan the default was introduced to remove, while the doc
 * comment above `getCarrierCapacity` claimed the read was "ALWAYS BOUNDED".
 * A default that only applies when nothing at all is named is not a floor.
 *
 * `from` is what gets defaulted, because `from` is what bounds the scan:
 * `deliveredAt >= from` is the predicate the index can serve, and the number
 * of rows is driven by how far BACK the read reaches, not how recent it
 * stops.
 *
 * THE UPPER BOUND IS LEFT OPEN when the caller does not name one, and that is
 * deliberate rather than lazy. A default `to = new Date()` would come from
 * the APP's clock while `deliveredAt` is written by the DATABASE's
 * (`closeAssignmentOnDeliveryTx` stamps it with `now()`), so any skew where
 * the database runs ahead silently drops the newest deliveries from every
 * poll — a dashboard quietly under-reporting today's work, which is the
 * hardest kind of wrong to notice. An open upper bound needs no clock
 * agreement at all.
 */
function resolveThroughputWindow(window: CapacityWindow | undefined, now: Date = new Date()): CapacityWindow {
  const to = window?.to;
  const from =
    window?.from ??
    new Date((to ?? now).getTime() - DEFAULT_THROUGHPUT_WINDOW_DAYS * MS_PER_DAY);
  return { from, ...(to !== undefined ? { to } : {}) };
}

/**
 * Orchestration layer for the Delivery module (design §6). Phase 4 shipped
 * the read surface, Phase 6a added Carrier CRUD writes and `assign`, Phase 6b
 * added `markDelivered` — the method that reaches across the module boundary,
 * via `IOrderDeliveryGateway` (`SalesModule`, design §2A).
 * Mirrors `WarehouseService`'s shape: the only place with I/O, maps domain
 * entities to response DTOs (dates -> ISO strings).
 *
 * `assign` and `markDelivered` take the authenticated ACTOR, because both are
 * warehouse-floor operations on somebody's order and both must apply the same
 * warehouse scope `POST /orders/:id/deliver` applies. The check lives HERE,
 * not in the controller, so any future Delivery door inherits it instead of
 * having to remember to re-copy it — the rule itself lives in exactly one
 * place, `../auth/role-scope.ts`, shared with `OrderController`.
 */
@Injectable()
export class DeliveryService {
  constructor(
    @Inject(CARRIER_REPOSITORY) private readonly carrierRepository: ICarrierRepository,
    @Inject(CARRIER_WAREHOUSE_REPOSITORY)
    private readonly carrierWarehouseRepository: ICarrierWarehouseRepository,
    @Inject(DELIVERY_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepository: IDeliveryAssignmentRepository,
    @Inject(ORDER_DELIVERY_GATEWAY)
    private readonly orderDeliveryGateway: IOrderDeliveryGateway,
    @Inject(WAREHOUSE_OPERATOR_REPOSITORY)
    private readonly warehouseOperatorRepository: IWarehouseOperatorRepository,
  ) {}

  /**
   * `coversWarehouse` is added ONLY when `filter.warehouseId` is given —
   * ADR-4: coverage is advisory, exposed on reads, and the list itself is
   * NEVER filtered by it (every active carrier is always returned).
   *
   * Coverage is resolved with ONE `listByWarehouse` query plus a `Set`, not
   * one `listByCarrier` per carrier: the answer is a single boolean per row,
   * and the schema already carries `carrier_warehouse_warehouse_id_idx` for
   * exactly this direction.
   */
  async listCarriers(filter?: ListCarriersFilter): Promise<CarrierResponseDto[]> {
    const carriers = await this.carrierRepository.list({ activeOnly: true });
    if (filter?.warehouseId === undefined) {
      return carriers.map((carrier) => this.toCarrierResponse(carrier));
    }

    const coverage = await this.carrierWarehouseRepository.listByWarehouse(filter.warehouseId);
    const covering = new Set(coverage.map((row) => row.carrierId));
    return carriers.map((carrier) => this.toCarrierResponse(carrier, covering.has(carrier.id)));
  }

  async findCarrierById(id: string): Promise<CarrierResponseDto | null> {
    const found = await this.carrierRepository.findById(id);
    return found ? this.toCarrierResponse(found) : null;
  }

  /**
   * Defaults (`phone ?? null`, `active ?? true`) are applied by the domain
   * factory `createCarrier` inside the repository adapter, so they have one
   * authoritative home rather than being re-stated at every layer.
   */
  async createCarrier(input: CreateCarrierDto): Promise<CarrierResponseDto> {
    const created = await this.carrierRepository.create(input);
    return this.toCarrierResponse(created);
  }

  /**
   * `active` is the SAME column `deactivateCarrier` writes, and it is held to
   * the SAME invariant: `PATCH {"active": false}` on a carrier with open
   * `in_transit` assignments is refused with `CarrierHasOpenAssignmentsError`,
   * exactly like `DELETE`. It used to be a one-line bypass of the guard.
   *
   * Neither method re-implements the check here. It lives in ONE place,
   * `PrismaCarrierRepository.deactivateGuarded`, where it runs inside the same
   * transaction and the same row lock as the write — a service-level
   * read-then-write across two statements is not a guard at all, since a
   * concurrent `POST /delivery/assignments` landing in between recreates the
   * stranded state (`PrismaDeliveryAssignmentRepository.create` takes the same
   * lock, which is what makes them serialize).
   */
  async updateCarrier(id: string, patch: CarrierUpdateInput): Promise<CarrierResponseDto> {
    const updated = await this.carrierRepository.update(id, patch);
    return this.toCarrierResponse(updated);
  }

  /**
   * Soft-delete only — flips `active`, never a hard `DELETE` (spec: "Deleting
   * a carrier soft-deletes it").
   *
   * REFUSED while the carrier still holds `in_transit` assignments.
   * Deactivating it would hide those in-flight orders from every operational
   * read at once: `getCarrierCapacity` sources carriers with
   * `activeOnly: true`, so the rows drop out of the snapshot, and
   * `countOrdersAwaitingCarrier`'s anti-join excludes them too because an
   * assignment row does exist. The orders end up invisible AND unassignable.
   *
   * The refusal is the adapter's, not this method's — see `updateCarrier`.
   */
  async deactivateCarrier(id: string): Promise<void> {
    await this.carrierRepository.softDelete(id);
  }

  /**
   * Declares that `carrierId` serves `warehouseId`. ADVISORY only — never
   * consulted by `assign`.
   *
   * Unknown and INACTIVE carriers are treated identically, which is what
   * `CarrierNotFoundError`'s own message ("not found or inactive") has always
   * claimed and what `assign` has always done. This method used to check only
   * `!carrier`, so coverage could be declared for a soft-deleted carrier —
   * one error meaning two different things depending on which method threw it.
   */
  async addCarrierCoverage(carrierId: string, warehouseId: string): Promise<CarrierCoverageResponseDto> {
    const carrier = await this.carrierRepository.findById(carrierId);
    if (!carrier || !carrier.active) {
      throw new CarrierNotFoundError(carrierId);
    }
    const created = await this.carrierWarehouseRepository.add({ carrierId, warehouseId });
    return this.toCoverageResponse(created);
  }

  /** Withdraws a coverage declaration. A no-op when the pair was never declared — not an error. */
  async removeCarrierCoverage(carrierId: string, warehouseId: string): Promise<void> {
    await this.carrierWarehouseRepository.remove(carrierId, warehouseId);
  }

  /**
   * SCOPED to the actor's warehouse, exactly as `GET /orders` is.
   *
   * These rows name an `orderId` for every delivery order in the tenant. A
   * `warehouse_operator` who may not read those orders through
   * `GET /orders` — Sales filters that list to their own warehouse and 403s a
   * cross-warehouse `GET /orders/:id` — could enumerate every one of them
   * through this door instead. A scope applied on one door and not the other
   * is not a narrower grant, it is a bypass; the same sentence the module
   * already used about `assign`/`markDelivered`.
   *
   * The scope is pushed into the QUERY (`orderWarehouseId`), not applied to
   * the result: the other warehouses' rows must never leave the database.
   *
   * ALWAYS BOUNDED, TWO WAYS. This returned EVERY assignment row in the
   * tenant's history — no window, no limit, no pagination — while the same
   * remediation round gave `getCarrierCapacity` a default window precisely
   * because an unbounded `list({status:'delivered'})` was unacceptable. The
   * endpoint returning FULL ROWS was left unbounded while the one returning a
   * COUNT was fixed.
   *
   *   - A default WINDOW on `assignedAt` (`DEFAULT_ASSIGNMENT_WINDOW_DAYS`)
   *     whenever the caller names no lower bound. `assignedAt` is NOT NULL, so
   *     unlike the `deliveredAt` window this excludes nothing by status.
   *   - A `take` on top of it, defaulted here and hard-clamped in the adapter,
   *     with `cursorId` to walk the rest.
   *
   * Both are needed and neither replaces the other: a window alone still
   * returns everything inside it (a busy tenant's month is not a page), and a
   * `take` alone still makes the database sort the whole history to find the
   * newest rows. What is GUARANTEED is that no request produces an unbounded
   * read by accident; a caller who names `from` explicitly and pages through
   * chooses their own range, which is a choice, not a defaulting bug.
   */
  async listAssignments(
    filter: ListAssignmentsFilter,
    actor: SanitizedUser,
  ): Promise<DeliveryAssignmentResponseDto[]> {
    const scope = await resolveWarehouseScopeFilter(actor, this.warehouseOperatorRepository);
    const window = resolveAssignmentWindow(filter);
    const rows = await this.assignmentRepository.listPage({
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.carrierId !== undefined ? { carrierId: filter.carrierId } : {}),
      ...(filter.cursorId !== undefined ? { cursorId: filter.cursorId } : {}),
      ...(window.to !== undefined ? { assignedTo: window.to } : {}),
      assignedFrom: window.from,
      take: filter.take ?? DEFAULT_ASSIGNMENT_PAGE_SIZE,
      ...(scope === null ? {} : { orderWarehouseId: scope }),
    });
    return rows.map((row) => this.toAssignmentResponse(row));
  }

  /**
   * `null` = pickup order, or delivered before this module existed — never a
   * 404 (design §6).
   *
   * The `findById` counterpart of `listAssignments`' scoping: a scoped
   * operator asking about another warehouse's order gets 403, mirroring
   * `GET /orders/:id`, rather than a `null` that would leak "no assignment
   * exists" for an order they may not see at all. The order is resolved
   * LAZILY — only a scoped caller pays for that read.
   *
   * AN UNKNOWN ORDER IS OUT OF SCOPE, NOT A 404. The lazy resolver used to
   * throw `OrderNotFoundForDeliveryError` for a missing order, which the
   * controller maps to 404 — so the same request answered `null`/200 for an
   * unscoped caller and 404 for a `warehouse_operator`. That contradicts the
   * controller's own documented contract ("MUST tolerate a missing
   * assignment — `null` ... never a 404") and, worse, turned this endpoint
   * into an order-EXISTENCE oracle for precisely the role the scope exists to
   * restrict: 403 meant "that order exists in another warehouse", 404 meant
   * "no such order". Resolving to `NO_WAREHOUSE` — an id no `warehouse` row
   * can hold — makes a scoped operator's answer 403 either way, so the
   * observable contract no longer depends on who is asking.
   */
  async findAssignmentByOrderId(
    orderId: string,
    actor: SanitizedUser,
  ): Promise<DeliveryAssignmentResponseDto | null> {
    await assertWarehouseScope(
      actor,
      async () => {
        const order = await this.orderDeliveryGateway.findOrderSnapshot(orderId);
        return order?.warehouseId ?? NO_WAREHOUSE;
      },
      this.warehouseOperatorRepository,
    );
    const found = await this.assignmentRepository.findByOrderId(orderId);
    return found ? this.toAssignmentResponse(found) : null;
  }

  /**
   * Validates the ORDER first, then the caller's scope, then the carrier,
   * then the no-duplicate rule, and only then creates (task 6.3/6.4).
   *
   * The order checks are not optional politeness: without them an unknown
   * `orderId` surfaced a raw Prisma P2003 as a 500, a `pickup` order could be
   * given an assignment the spec says must NEVER exist, and an assignment on
   * a `created`/`cancelled`/`delivered` order poisoned capacity permanently —
   * `markDelivered` on it throws, so nothing could ever close it.
   *
   * Deliberately does NOT consult `carrierWarehouseRepository`. It now knows
   * the order's warehouse (it must, to scope the caller) and still does not
   * check coverage against it — coverage is advisory, surfaced on reads only
   * (`listCarriers`), and MUST NOT block or warn on assignment (spec:
   * "Coverage Is Advisory, Not an Enforced Assignment Block"; ADR-4).
   *
   * `CarrierNotFoundError` covers BOTH an unknown id and an inactive
   * carrier — same 404 either way, mirroring the error's own message.
   *
   * AN UNKNOWN ORDER IS OUT OF SCOPE, NOT A 404 — for a scoped caller. The
   * `!order` check used to run BEFORE `assertWarehouseScope`, so a scoped
   * `warehouse_operator` got 404 for an id that does not exist and 403 for one
   * that belongs to another warehouse. That difference is an order-EXISTENCE
   * oracle for exactly the role the scope exists to restrict: post any uuid,
   * read the status code, learn whether that order is in the tenant.
   * `findAssignmentByOrderId` — in this same file — closed precisely this and
   * says so verbatim in its own doc comment; `assign` did not get the same
   * treatment, and no spec covered unknown-order + scoped-operator.
   */
  async assign(input: AssignCarrierDto, actor: SanitizedUser): Promise<DeliveryAssignmentResponseDto> {
    const order = await this.orderDeliveryGateway.findOrderSnapshot(input.orderId);
    // The scope assertion comes FIRST, and a missing order resolves to
    // `NO_WAREHOUSE` — an id no `warehouse` row can hold — so a scoped
    // operator's answer is 403 either way and the observable contract no
    // longer depends on who is asking. An UNSCOPED caller reaches the 404
    // below unchanged: `assertWarehouseScope` returns immediately for them and
    // never looks at the resolved id.
    await assertWarehouseScope(
      actor,
      order?.warehouseId ?? NO_WAREHOUSE,
      this.warehouseOperatorRepository,
    );
    // Rule 1, answered here rather than left to `assertOrderAssignable`, and
    // it is the same `OrderNotFoundForDeliveryError` that would throw: it has
    // to be answered before every OTHER rule, or an out-of-scope operator
    // learns facts about an order they may not see.
    if (!order) {
      throw new OrderNotFoundForDeliveryError(input.orderId);
    }

    const carrier = await this.carrierRepository.findById(input.carrierId);
    // THE decision, in the domain, shared verbatim with
    // `PrismaDeliveryAssignmentRepository.create`'s locked re-read. Both
    // checks are needed — this one is the fast path with the cheaper answer,
    // the adapter's is the one a concurrent writer cannot step around — but
    // the RULES have exactly one home.
    assertOrderAssignable({
      orderId: input.orderId,
      carrierId: input.carrierId,
      order,
      carrier,
    });

    const existing = await this.assignmentRepository.findByOrderId(input.orderId);
    if (existing) {
      throw new OrderAlreadyAssignedError(input.orderId);
    }

    // The pre-check above and this `create` are not one transaction and take
    // no lock, so concurrent assigns still race. The adapter translates the
    // `order_id` UNIQUE violation into `OrderAlreadyAssignedError`, so the
    // loser of that race gets the same 409 as the sequential case.
    const created = await this.assignmentRepository.create(
      assignCarrier({ orderId: input.orderId, carrierId: input.carrierId }, new Date()),
    );
    return this.toAssignmentResponse(created);
  }

  /**
   * Guards `in_transit` through the DOMAIN factory `markAssignmentDelivered`
   * (its thrown `InvalidAssignmentStateError` IS the guard — the transition
   * rule has one home, and this method no longer hand-copies it), delegates
   * the actual transition to `IOrderDeliveryGateway.markOrderDelivered`
   * (design §2A), then re-reads. The factory's RETURN value is deliberately
   * discarded: `closeAssignmentOnDeliveryTx` (Phase 5) is the one writer of
   * the delivered edge, inside Sales' own transaction.
   * `IDeliveryAssignmentRepository` gains no `markDelivered` method for this;
   * that absence is the design (design §8), not an oversight. `null` on an
   * unknown id lets the controller map a clean 404, mirroring
   * `OrderService.confirm/deliver/cancel`'s own null-on-missing shape.
   *
   * The warehouse scope is asserted BEFORE the transition, against the
   * assignment's own order, through the SAME single call shape `assign` uses.
   * The order snapshot is still fetched only when the caller is actually
   * warehouse-scoped — but by handing `assertWarehouseScope` a LAZY resolver
   * rather than by re-asking `isScopedWarehouseOperator` here first. That
   * duplicate predicate put the rule in one place and the decision to apply
   * it in two, so widening the rule later would silently not have taken
   * effect on this method.
   *
   * AN UNKNOWN ASSIGNMENT IS OUT OF SCOPE, NOT A 404 — for a scoped caller.
   * Same leak as `assign`'s, one identifier over: the `!found` return used to
   * run BEFORE the scope assertion, so a scoped `warehouse_operator` got 404
   * for an assignment id that does not exist and 403 for one belonging to
   * another warehouse — an assignment-existence oracle. Resolving a missing
   * assignment to `NO_WAREHOUSE` makes both answers 403 for them, and leaves
   * an unscoped caller's clean 404 exactly as it was.
   *
   * The order lookup keeps its own `OrderNotFoundForDeliveryError` for the
   * case where the assignment EXISTS and its order does not — an FK-impossible
   * state (`onDelete: Restrict` on `delivery_assignment.order_id`), which is
   * why it is reported as a fault rather than folded into the scope answer.
   */
  async markDelivered(
    assignmentId: string,
    actor: SanitizedUser,
  ): Promise<DeliveryAssignmentResponseDto | null> {
    const found = await this.assignmentRepository.findById(assignmentId);

    await assertWarehouseScope(
      actor,
      async () => {
        if (!found) {
          return NO_WAREHOUSE;
        }
        const order = await this.orderDeliveryGateway.findOrderSnapshot(found.orderId);
        if (!order) {
          throw new OrderNotFoundForDeliveryError(found.orderId);
        }
        return order.warehouseId;
      },
      this.warehouseOperatorRepository,
    );

    if (!found) {
      return null;
    }

    // The GUARD, called by its name. `markAssignmentDelivered` was called
    // here for its throw and its return value discarded, which read like a
    // leftover — nothing signalled the statement was load-bearing, and a
    // cleanup pass deleting it would have removed the only check on the
    // transition without failing a single test loudly.
    assertAssignmentDeliverable(found);

    await this.orderDeliveryGateway.markOrderDelivered(found.orderId);

    const updated = await this.assignmentRepository.findById(assignmentId);
    return updated ? this.toAssignmentResponse(updated) : null;
  }

  /**
   * Loads the snapshot (all active carriers + all `in_transit` assignments)
   * and hands it to the PURE `computeCarrierCapacity` (ADR-3) — no capacity
   * query logic lives here.
   *
   * THE THROUGHPUT READ ALWAYS CARRIES A LOWER BOUND. This endpoint used to
   * issue `list({status:'delivered'})` with no bound whatsoever — every
   * delivered assignment in the tenant's entire history, unpaginated, on
   * every dashboard poll. `resolveThroughputWindow` now supplies
   * `DEFAULT_THROUGHPUT_WINDOW_DAYS` as `from` whenever the caller does not
   * name one, and the window that was actually used is reported back on the
   * response so the numbers are never silently narrower than the caller
   * assumed.
   *
   * Note what is and is not claimed. A caller who names `from` explicitly
   * decides their own range, and `?from=2020-01-01` really will read
   * everything since 2020 — that is their choice, not a defaulting bug. The
   * guarantee is that NO request produces an unbounded read by ACCIDENT. The
   * upper bound is left open unless named; see `resolveThroughputWindow` for
   * why defaulting it to the app clock would be worse than leaving it off.
   *
   * BREAKING, on purpose: `deliveredCount` used to mean "delivered ever" for
   * a caller passing no query params, and now means "delivered in the last
   * `DEFAULT_THROUGHPUT_WINDOW_DAYS` days". Every existing caller sees the
   * number change without changing its request. `throughputWindow` on the
   * response is what makes the new meaning readable, but the change itself is
   * silent at the call site and belongs in the changelog.
   *
   * The bound is a WINDOW and not a `take`, deliberately: a row limit would
   * make `deliveredCount` quietly under-report, which is the same class of
   * lie as an inverted range (see `assertOrderedWindow`) — a dashboard that
   * looks operational and is wrong.
   *
   * NOT warehouse-scoped, unlike `listAssignments`/`findAssignmentByOrderId`,
   * and deliberately so: every field here is an AGGREGATE over carriers
   * (busy/free counts, per-carrier throughput, a count of orders awaiting a
   * carrier). No order identifier leaves this endpoint, so there is nothing
   * for a cross-warehouse read to enumerate — which is the whole reason the
   * other two are scoped. The role gate (`DELIVERY_READ_ROLES`) still
   * applies. If a future field ever names an ORDER, this needs the scope too.
   *
   * The `in_transit` read is deliberately NOT windowed. It is the open
   * working set, not history: it is bounded by how much work is in flight,
   * every row of it is needed for `busy`/`inTransitCount` to be correct, and
   * truncating it would under-report exactly the number operators act on.
   *
   * The window is pushed into the REPOSITORY filter as well as being applied
   * by the pure fold `computeCarrierThroughput`; the pure fold remains the
   * INTERPRETER of the bounds, so the meaning of "delivered in range" is
   * decided in one tested place and the two readings cannot diverge.
   */
  async getCarrierCapacity(window?: CapacityWindow): Promise<CarrierCapacityResponseDto> {
    const effectiveWindow = resolveThroughputWindow(window);
    const [carriers, openAssignments, deliveredAssignments, ordersAwaitingCarrier] = await Promise.all([
      this.carrierRepository.list({ activeOnly: true }),
      this.assignmentRepository.list({ status: 'in_transit' }),
      this.assignmentRepository.list({
        status: 'delivered',
        ...(effectiveWindow.from !== undefined ? { deliveredFrom: effectiveWindow.from } : {}),
        ...(effectiveWindow.to !== undefined ? { deliveredTo: effectiveWindow.to } : {}),
      }),
      this.assignmentRepository.countOrdersAwaitingCarrier(),
    ]);

    const capacity = computeCarrierCapacity(carriers, openAssignments);
    const throughput = computeCarrierThroughput(deliveredAssignments, effectiveWindow);

    return {
      throughputWindow: {
        from: effectiveWindow.from ? effectiveWindow.from.toISOString() : null,
        to: effectiveWindow.to ? effectiveWindow.to.toISOString() : null,
      },
      carriers: capacity.carriers.map((row) => ({
        carrierId: row.carrierId,
        carrierName: row.carrierName,
        busy: row.busy,
        inTransitCount: row.inTransitCount,
        deliveredCount: throughput.get(row.carrierId) ?? 0,
      })),
      busyCount: capacity.busyCount,
      freeCount: capacity.freeCount,
      ordersAwaitingCarrier,
    };
  }

  private toCarrierResponse(carrier: DomainCarrier, coversWarehouse?: boolean): CarrierResponseDto {
    return {
      id: carrier.id,
      name: carrier.name,
      phone: carrier.phone,
      active: carrier.active,
      ...(coversWarehouse !== undefined ? { coversWarehouse } : {}),
      createdAt: carrier.createdAt.toISOString(),
      updatedAt: carrier.updatedAt.toISOString(),
    };
  }

  private toCoverageResponse(coverage: DomainCarrierWarehouse): CarrierCoverageResponseDto {
    return {
      id: coverage.id,
      carrierId: coverage.carrierId,
      warehouseId: coverage.warehouseId,
      createdAt: coverage.createdAt.toISOString(),
    };
  }

  private toAssignmentResponse(assignment: DomainDeliveryAssignment): DeliveryAssignmentResponseDto {
    return {
      id: assignment.id,
      orderId: assignment.orderId,
      carrierId: assignment.carrierId,
      status: assignment.status,
      assignedAt: assignment.assignedAt.toISOString(),
      deliveredAt: assignment.deliveredAt ? assignment.deliveredAt.toISOString() : null,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }
}
