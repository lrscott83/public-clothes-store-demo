import { Test, TestingModule } from '@nestjs/testing';
import type { SanitizedUser } from '@store-mgmt/api-common';
import type {
  Carrier as DomainCarrier,
  CarrierWarehouse as DomainCarrierWarehouse,
  DeliveryAssignment as DomainDeliveryAssignment,
  ICarrierRepository,
  ICarrierWarehouseRepository,
  IDeliveryAssignmentRepository,
  IOrderDeliveryGateway,
  IWarehouseOperatorRepository,
  OrderDeliverySnapshot,
} from '@store-mgmt/domain';
import {
  CARRIER_REPOSITORY,
  CARRIER_WAREHOUSE_REPOSITORY,
  CarrierHasOpenAssignmentsError,
  CarrierNotFoundError,
  DELIVERY_ASSIGNMENT_REPOSITORY,
  InvalidAssignmentStateError,
  OrderNotAssignableStateError,
  ORDER_DELIVERY_GATEWAY,
  OrderAlreadyAssignedError,
  OrderNotFoundForDeliveryError,
  PickupOrderCannotBeAssignedError,
  USER_ROLES,
  WAREHOUSE_OPERATOR_REPOSITORY,
  WarehouseScopeViolationError,
} from '@store-mgmt/domain';
import { NO_WAREHOUSE } from '../auth/role-scope.js';
import {
  DEFAULT_ASSIGNMENT_PAGE_SIZE,
  DEFAULT_ASSIGNMENT_WINDOW_DAYS,
  DEFAULT_THROUGHPUT_WINDOW_DAYS,
  DeliveryService,
} from './delivery.service.js';

function buildCarrierRepoMock(): jest.Mocked<ICarrierRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
  };
}

function buildCarrierWarehouseRepoMock(): jest.Mocked<ICarrierWarehouseRepository> {
  return {
    add: jest.fn(),
    remove: jest.fn(),
    listByCarrier: jest.fn(),
    listByWarehouse: jest.fn(),
  };
}

function buildWarehouseOperatorRepoMock(): jest.Mocked<IWarehouseOperatorRepository> {
  return {
    create: jest.fn(),
    findByUserId: jest.fn(),
    findByWarehouseId: jest.fn(),
  };
}

/** An `owner` — never warehouse-scoped, so scope assertions pass through. */
function ownerActor(): SanitizedUser {
  return {
    id: 'user-owner',
    companyUserId: 'company-user-owner',
    roles: [USER_ROLES.owner],
  } as unknown as SanitizedUser;
}

/** A caller whose access comes SOLELY from `warehouse_operator` — the scoped case. */
function warehouseOperatorActor(): SanitizedUser {
  return {
    id: 'user-operator',
    companyUserId: 'company-user-operator',
    roles: [USER_ROLES.warehouse_operator],
  } as unknown as SanitizedUser;
}

function orderSnapshot(overrides: Partial<OrderDeliverySnapshot> = {}): OrderDeliverySnapshot {
  return {
    orderId: 'order-1',
    warehouseId: 'warehouse-1',
    deliveryMode: 'delivery',
    status: 'verified',
    ...overrides,
  };
}

function buildAssignmentRepoMock(): jest.Mocked<IDeliveryAssignmentRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByOrderId: jest.fn(),
    list: jest.fn(),
    listPage: jest.fn(),
    countOrdersAwaitingCarrier: jest.fn(),
  };
}

function buildOrderDeliveryGatewayMock(): jest.Mocked<IOrderDeliveryGateway> {
  return { markOrderDelivered: jest.fn(), findOrderSnapshot: jest.fn() };
}

function carrier(overrides: Partial<DomainCarrier> = {}): DomainCarrier {
  return {
    id: 'carrier-1',
    name: 'Envíos Rápidos',
    phone: null,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function coverage(carrierId: string, warehouseId: string): DomainCarrierWarehouse {
  return { id: `cw-${carrierId}-${warehouseId}`, carrierId, warehouseId, createdAt: new Date() };
}

function assignment(overrides: Partial<DomainDeliveryAssignment> = {}): DomainDeliveryAssignment {
  return {
    id: 'assignment-1',
    orderId: 'order-1',
    carrierId: 'carrier-1',
    status: 'in_transit',
    assignedAt: new Date('2026-08-01T10:00:00.000Z'),
    deliveredAt: null,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('DeliveryService', () => {
  let service: DeliveryService;
  let carrierRepo: jest.Mocked<ICarrierRepository>;
  let carrierWarehouseRepo: jest.Mocked<ICarrierWarehouseRepository>;
  let assignmentRepo: jest.Mocked<IDeliveryAssignmentRepository>;
  let orderDeliveryGateway: jest.Mocked<IOrderDeliveryGateway>;
  let warehouseOperatorRepo: jest.Mocked<IWarehouseOperatorRepository>;

  beforeEach(async () => {
    carrierRepo = buildCarrierRepoMock();
    carrierWarehouseRepo = buildCarrierWarehouseRepoMock();
    assignmentRepo = buildAssignmentRepoMock();
    orderDeliveryGateway = buildOrderDeliveryGatewayMock();
    warehouseOperatorRepo = buildWarehouseOperatorRepoMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: CARRIER_REPOSITORY, useValue: carrierRepo },
        { provide: CARRIER_WAREHOUSE_REPOSITORY, useValue: carrierWarehouseRepo },
        { provide: DELIVERY_ASSIGNMENT_REPOSITORY, useValue: assignmentRepo },
        { provide: ORDER_DELIVERY_GATEWAY, useValue: orderDeliveryGateway },
        { provide: WAREHOUSE_OPERATOR_REPOSITORY, useValue: warehouseOperatorRepo },
      ],
    }).compile();
    service = module.get(DeliveryService);
  });

  describe('listCarriers', () => {
    it('with a warehouseId returns every active carrier with coversWarehouse, unfiltered (ADR-4)', async () => {
      const covering = carrier({ id: 'carrier-a', name: 'Covering Carrier' });
      const notCovering = carrier({ id: 'carrier-b', name: 'Not Covering Carrier' });
      carrierRepo.list.mockResolvedValue([covering, notCovering]);
      carrierWarehouseRepo.listByWarehouse.mockResolvedValue([coverage('carrier-a', 'warehouse-1')]);

      const result = await service.listCarriers({ warehouseId: 'warehouse-1' });

      expect(result).toHaveLength(2);
      expect(result.find((c) => c.id === 'carrier-a')!.coversWarehouse).toBe(true);
      expect(result.find((c) => c.id === 'carrier-b')!.coversWarehouse).toBe(false);
    });

    it('resolves coverage with ONE query regardless of how many carriers there are — no N+1', async () => {
      carrierRepo.list.mockResolvedValue([
        carrier({ id: 'carrier-a' }),
        carrier({ id: 'carrier-b' }),
        carrier({ id: 'carrier-c' }),
      ]);
      carrierWarehouseRepo.listByWarehouse.mockResolvedValue([coverage('carrier-b', 'warehouse-1')]);

      await service.listCarriers({ warehouseId: 'warehouse-1' });

      expect(carrierWarehouseRepo.listByWarehouse).toHaveBeenCalledTimes(1);
      expect(carrierWarehouseRepo.listByWarehouse).toHaveBeenCalledWith('warehouse-1');
      // The old shape issued one `listByCarrier` PER carrier to answer a
      // single boolean, discarding everything else it loaded.
      expect(carrierWarehouseRepo.listByCarrier).not.toHaveBeenCalled();
    });

    it('a carrier with zero coverage rows reports coversWarehouse:false for every warehouse, but is still listed', async () => {
      const freshCarrier = carrier({ id: 'carrier-fresh', name: 'Fresh Carrier' });
      carrierRepo.list.mockResolvedValue([freshCarrier]);
      carrierWarehouseRepo.listByWarehouse.mockResolvedValue([]);

      const result = await service.listCarriers({ warehouseId: 'any-warehouse' });

      expect(result).toHaveLength(1);
      expect(result[0]!.coversWarehouse).toBe(false);
    });

    it('without a warehouseId omits coversWarehouse entirely', async () => {
      carrierRepo.list.mockResolvedValue([carrier()]);

      const result = await service.listCarriers();

      expect(result[0]!.coversWarehouse).toBeUndefined();
      expect(carrierWarehouseRepo.listByWarehouse).not.toHaveBeenCalled();
    });
  });

  describe('coverage writes (the surface that makes coversWarehouse ever true)', () => {
    it('addCarrierCoverage writes through the repository port', async () => {
      carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1' }));
      carrierWarehouseRepo.add.mockResolvedValue(coverage('carrier-1', 'warehouse-1'));

      const result = await service.addCarrierCoverage('carrier-1', 'warehouse-1');

      expect(carrierWarehouseRepo.add).toHaveBeenCalledWith({
        carrierId: 'carrier-1',
        warehouseId: 'warehouse-1',
      });
      expect(result.carrierId).toBe('carrier-1');
      expect(result.warehouseId).toBe('warehouse-1');
    });

    it('addCarrierCoverage rejects an unknown carrier with CarrierNotFoundError', async () => {
      carrierRepo.findById.mockResolvedValue(null);

      await expect(service.addCarrierCoverage('unknown', 'warehouse-1')).rejects.toThrow(
        CarrierNotFoundError,
      );
      expect(carrierWarehouseRepo.add).not.toHaveBeenCalled();
    });

    it('removeCarrierCoverage deletes through the repository port and is a no-op when absent', async () => {
      await service.removeCarrierCoverage('carrier-1', 'warehouse-1');

      expect(carrierWarehouseRepo.remove).toHaveBeenCalledWith('carrier-1', 'warehouse-1');
    });
  });

  describe('getCarrierCapacity', () => {
    it('reports busy/free from in_transit assignments, throughput from delivered ones, and orders awaiting a carrier', async () => {
      const busyCarrier = carrier({ id: 'carrier-busy', name: 'Busy Carrier' });
      const freeCarrier = carrier({ id: 'carrier-free', name: 'Free Carrier' });
      carrierRepo.list.mockResolvedValue([busyCarrier, freeCarrier]);
      assignmentRepo.list.mockImplementation(async (filter?: { status?: string }) => {
        if (filter?.status === 'in_transit') {
          return [assignment({ id: 'a1', carrierId: 'carrier-busy', status: 'in_transit' })];
        }
        if (filter?.status === 'delivered') {
          return [
            // Relative dates, NOT fixed calendar days: the throughput window
            // counts back from TODAY, so hardcoded August dates silently
            // fall out of the window as the calendar moves and the test
            // rots (it did exactly that on 2026-09-01). One and two days
            // back stay inside any sane window forever.
            assignment({
              id: 'a2',
              carrierId: 'carrier-busy',
              status: 'delivered',
              deliveredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
            }),
            assignment({
              id: 'a3',
              carrierId: 'carrier-busy',
              status: 'delivered',
              deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            }),
          ];
        }
        return [];
      });
      assignmentRepo.countOrdersAwaitingCarrier.mockResolvedValue(3);

      const result = await service.getCarrierCapacity();

      expect(result.busyCount).toBe(1);
      expect(result.freeCount).toBe(1);
      expect(result.ordersAwaitingCarrier).toBe(3);
      const busyRow = result.carriers.find((c) => c.carrierId === 'carrier-busy')!;
      expect(busyRow.busy).toBe(true);
      expect(busyRow.inTransitCount).toBe(1);
      expect(busyRow.deliveredCount).toBe(2);
      const freeRow = result.carriers.find((c) => c.carrierId === 'carrier-free')!;
      expect(freeRow.busy).toBe(false);
      expect(freeRow.deliveredCount).toBe(0);
    });

    it('pushes the [from,to] window into the repository filter AND still folds it purely', async () => {
      const oneCarrier = carrier({ id: 'carrier-1' });
      carrierRepo.list.mockResolvedValue([oneCarrier]);
      assignmentRepo.list.mockImplementation(async (filter?: { status?: string }) => {
        if (filter?.status === 'delivered') {
          return [
            // A repository that (correctly) honours the filter would not
            // return this row at all; it is here to prove the pure fold is
            // STILL the interpreter of the bounds, not just the query.
            assignment({
              id: 'early',
              carrierId: 'carrier-1',
              status: 'delivered',
              deliveredAt: new Date('2026-07-01T00:00:00.000Z'),
            }),
            assignment({
              id: 'inWindow',
              carrierId: 'carrier-1',
              status: 'delivered',
              deliveredAt: new Date('2026-08-05T00:00:00.000Z'),
            }),
          ];
        }
        return [];
      });
      assignmentRepo.countOrdersAwaitingCarrier.mockResolvedValue(0);

      const from = new Date('2026-08-01T00:00:00.000Z');
      const to = new Date('2026-08-31T00:00:00.000Z');
      const result = await service.getCarrierCapacity({ from, to });

      expect(result.carriers[0]!.deliveredCount).toBe(1);
      // The window now bounds the QUERY too. `GET /delivery/capacity` is a
      // dashboard read; loading every delivered assignment in the tenant's
      // entire history, unpaginated, on every call is not a shape that
      // survives contact with a real tenant.
      expect(assignmentRepo.list).toHaveBeenCalledWith({
        status: 'delivered',
        deliveredFrom: from,
        deliveredTo: to,
      });
    });

    /**
     * CLASS G2 — with no query params this used to issue an UNBOUNDED
     * `list({status:'delivered'})`: every delivered assignment in the
     * tenant's entire history, unpaginated, on every dashboard poll.
     */
    function deliveredFilter(): { deliveredFrom?: Date; deliveredTo?: Date } | undefined {
      return assignmentRepo.list.mock.calls
        .map((call) => call[0] as { status?: string; deliveredFrom?: Date; deliveredTo?: Date })
        .find((filter) => filter?.status === 'delivered');
    }

    it('applies a DEFAULT lower bound when the caller names neither bound — never an unbounded read', async () => {
      carrierRepo.list.mockResolvedValue([carrier({ id: 'carrier-1' })]);
      assignmentRepo.list.mockResolvedValue([]);
      assignmentRepo.countOrdersAwaitingCarrier.mockResolvedValue(0);
      const before = Date.now();

      await service.getCarrierCapacity();

      const from = deliveredFilter()?.deliveredFrom;
      expect(from).toBeInstanceOf(Date);
      const ageDays = (before - from!.getTime()) / (24 * 60 * 60 * 1000);
      expect(ageDays).toBeCloseTo(DEFAULT_THROUGHPUT_WINDOW_DAYS, 3);
    });

    /**
     * The upper bound is left OPEN by default, and that is the point, not an
     * omission. A default `to = new Date()` reads the APP's clock while
     * `deliveredAt` is stamped by the DATABASE's (`closeAssignmentOnDeliveryTx`
     * writes `now()`), so any skew where the database runs ahead silently
     * drops the newest deliveries from every poll.
     */
    it('leaves the upper bound OPEN by default — no app/DB clock agreement required', async () => {
      carrierRepo.list.mockResolvedValue([carrier({ id: 'carrier-1' })]);
      assignmentRepo.list.mockResolvedValue([]);
      assignmentRepo.countOrdersAwaitingCarrier.mockResolvedValue(0);

      await service.getCarrierCapacity();

      expect(deliveredFilter()).not.toHaveProperty('deliveredTo');
    });

    /**
     * THE regression this round exists for. `resolveThroughputWindow` used to
     * return the caller's window untouched the moment EITHER bound was named,
     * so `?to=...` with no `from` produced exactly the unbounded full-history
     * scan the default was added to remove — while the code doc claimed the
     * read was "ALWAYS BOUNDED". The previous spec locked that behavior in as
     * if it were intended.
     */
    it('fills the MISSING lower bound when only ?to is named — a named upper bound is not a window', async () => {
      carrierRepo.list.mockResolvedValue([carrier({ id: 'carrier-1' })]);
      assignmentRepo.list.mockResolvedValue([]);
      assignmentRepo.countOrdersAwaitingCarrier.mockResolvedValue(0);
      const to = new Date('2026-08-01T00:00:00.000Z');

      await service.getCarrierCapacity({ to });

      const filter = deliveredFilter();
      expect(filter?.deliveredTo).toEqual(to);
      expect(filter?.deliveredFrom).toBeInstanceOf(Date);
      // Measured back from `to`, not from now: the caller asked about a
      // period, so the default window is relative to the period they named.
      const spanDays = (to.getTime() - filter!.deliveredFrom!.getTime()) / (24 * 60 * 60 * 1000);
      expect(spanDays).toBeCloseTo(DEFAULT_THROUGHPUT_WINDOW_DAYS, 3);
    });

    /** The window that was actually used is reported, so a bounded number is never presented as all-time. */
    it('reports the window it used back on the response, with a null upper bound when open', async () => {
      carrierRepo.list.mockResolvedValue([carrier({ id: 'carrier-1' })]);
      assignmentRepo.list.mockResolvedValue([]);
      assignmentRepo.countOrdersAwaitingCarrier.mockResolvedValue(0);

      const result = await service.getCarrierCapacity();

      expect(result.throughputWindow.from).toEqual(expect.any(String));
      expect(result.throughputWindow.to).toBeNull();
    });

    it('leaves an explicitly named lower bound alone — naming it IS the choice about the range', async () => {
      carrierRepo.list.mockResolvedValue([carrier({ id: 'carrier-1' })]);
      assignmentRepo.list.mockResolvedValue([]);
      assignmentRepo.countOrdersAwaitingCarrier.mockResolvedValue(0);
      const from = new Date('2020-01-01T00:00:00.000Z');

      await service.getCarrierCapacity({ from });

      expect(assignmentRepo.list).toHaveBeenCalledWith({ status: 'delivered', deliveredFrom: from });
    });

    /**
     * The `in_transit` read stays unbounded ON PURPOSE: it is the open
     * working set, not history, and truncating it would under-report exactly
     * the number operators act on.
     */
    it('does NOT window the in_transit read', async () => {
      carrierRepo.list.mockResolvedValue([carrier({ id: 'carrier-1' })]);
      assignmentRepo.list.mockResolvedValue([]);
      assignmentRepo.countOrdersAwaitingCarrier.mockResolvedValue(0);

      await service.getCarrierCapacity();

      expect(assignmentRepo.list).toHaveBeenCalledWith({ status: 'in_transit' });
    });
  });

  describe('listAssignments', () => {
    it('delegates the filter to the BOUNDED page read, never the complete one', async () => {
      assignmentRepo.listPage.mockResolvedValue([assignment()]);

      const result = await service.listAssignments(
        { carrierId: 'carrier-1', status: 'in_transit' },
        ownerActor(),
      );

      expect(assignmentRepo.list).not.toHaveBeenCalled();
      expect(assignmentRepo.listPage).toHaveBeenCalledWith(
        expect.objectContaining({ carrierId: 'carrier-1', status: 'in_transit' }),
      );
      expect(result).toHaveLength(1);
    });

    /**
     * This endpoint returned EVERY assignment row in the tenant's history —
     * no window, no limit, no pagination — while the SAME round gave
     * `getCarrierCapacity` a default window precisely because an unbounded
     * `list({status:'delivered'})` was unacceptable. The endpoint returning
     * FULL ROWS was left unbounded while the one returning a COUNT was fixed.
     */
    it('bounds a bare request BOTH ways — a default window and a default page size', async () => {
      assignmentRepo.listPage.mockResolvedValue([]);
      const before = Date.now();

      await service.listAssignments({}, ownerActor());

      const filter = assignmentRepo.listPage.mock.calls[0]![0];
      expect(filter.take).toBe(DEFAULT_ASSIGNMENT_PAGE_SIZE);
      const expectedFrom = before - DEFAULT_ASSIGNMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      expect(filter.assignedFrom!.getTime()).toBeGreaterThanOrEqual(expectedFrom - 5_000);
      expect(filter.assignedFrom!.getTime()).toBeLessThanOrEqual(expectedFrom + 5_000);
      // The UPPER bound stays OPEN unless named — a default `to` from the
      // app's clock would silently drop the newest rows under clock skew.
      expect(filter.assignedTo).toBeUndefined();
    });

    it('honours an explicit window, page size and cursor', async () => {
      assignmentRepo.listPage.mockResolvedValue([]);
      const from = new Date('2026-01-01T00:00:00.000Z');
      const to = new Date('2026-02-01T00:00:00.000Z');

      await service.listAssignments(
        { from, to, take: 25, cursorId: 'cursor-row-id' },
        ownerActor(),
      );

      expect(assignmentRepo.listPage).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedFrom: from,
          assignedTo: to,
          take: 25,
          cursorId: 'cursor-row-id',
        }),
      );
    });

    /**
     * CLASS D3 — these rows name an `orderId` for every delivery order in the
     * tenant. Sales filters `GET /orders` to the operator's own warehouse, so
     * an unscoped Delivery list is a second door onto identifiers the first
     * one withholds.
     */
    it('pushes the operator’s own warehouse into the QUERY, never filters after the fact', async () => {
      warehouseOperatorRepo.findByUserId.mockResolvedValue({
        id: 'op-1',
        userId: 'user-operator',
        warehouseId: 'warehouse-A',
      } as never);
      assignmentRepo.listPage.mockResolvedValue([]);

      await service.listAssignments({ status: 'in_transit' }, warehouseOperatorActor());

      expect(assignmentRepo.listPage).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_transit', orderWarehouseId: 'warehouse-A' }),
      );
    });

    /**
     * Asserted against the EXPORTED sentinel, not `expect.any(String)`. The
     * loose matcher passed for any string the implementation happened to
     * produce — `''` and `'*'` included, and `''` reaches Postgres as invalid
     * uuid syntax (P2007), i.e. a 500 rather than the empty list this test
     * claims to prove. A fail-closed test that cannot distinguish failing
     * closed from crashing is not evidence of failing closed.
     */
    it('returns nothing for a warehouse_operator with no WarehouseOperator row — fails closed', async () => {
      warehouseOperatorRepo.findByUserId.mockResolvedValue(null);
      assignmentRepo.listPage.mockResolvedValue([]);

      const result = await service.listAssignments({}, warehouseOperatorActor());

      expect(assignmentRepo.listPage).toHaveBeenCalledWith(
        expect.objectContaining({ orderWarehouseId: NO_WAREHOUSE }),
      );
      expect(result).toEqual([]);
    });
  });

  describe('findAssignmentByOrderId', () => {
    it('returns null for an order with no assignment — never throws', async () => {
      assignmentRepo.findByOrderId.mockResolvedValue(null);

      await expect(
        service.findAssignmentByOrderId('order-without-assignment', ownerActor()),
      ).resolves.toBeNull();
    });

    it('returns the assignment when one exists', async () => {
      assignmentRepo.findByOrderId.mockResolvedValue(assignment());

      const result = await service.findAssignmentByOrderId('order-1', ownerActor());

      expect(result!.orderId).toBe('order-1');
    });

    it('issues NO order read for an unscoped caller — the resolver is lazy', async () => {
      assignmentRepo.findByOrderId.mockResolvedValue(assignment());

      await service.findAssignmentByOrderId('order-1', ownerActor());

      expect(orderDeliveryGateway.findOrderSnapshot).not.toHaveBeenCalled();
    });

    it('403s a scoped operator asking about ANOTHER warehouse’s order', async () => {
      orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(
        orderSnapshot({ warehouseId: 'warehouse-A' }),
      );
      warehouseOperatorRepo.findByUserId.mockResolvedValue({
        id: 'op-1',
        userId: 'user-operator',
        warehouseId: 'warehouse-B',
      } as never);

      await expect(
        service.findAssignmentByOrderId('order-1', warehouseOperatorActor()),
      ).rejects.toThrow(WarehouseScopeViolationError);
      expect(assignmentRepo.findByOrderId).not.toHaveBeenCalled();
    });

    it('allows a scoped operator asking about their OWN warehouse’s order', async () => {
      orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(
        orderSnapshot({ warehouseId: 'warehouse-A' }),
      );
      warehouseOperatorRepo.findByUserId.mockResolvedValue({
        id: 'op-1',
        userId: 'user-operator',
        warehouseId: 'warehouse-A',
      } as never);
      assignmentRepo.findByOrderId.mockResolvedValue(assignment());

      await expect(
        service.findAssignmentByOrderId('order-1', warehouseOperatorActor()),
      ).resolves.not.toBeNull();
    });

    /**
     * The endpoint's observable contract MUST NOT depend on the caller's
     * role. For an unknown `orderId` an unscoped caller gets `null`/200 —
     * the controller's own documented behavior ("MUST tolerate a missing
     * assignment ... never a 404"). A scoped operator used to get 404,
     * because the lazy resolver threw `OrderNotFoundForDeliveryError`.
     *
     * That made this endpoint an order-EXISTENCE oracle for exactly the role
     * the scope restricts: 403 meant "exists, another warehouse", 404 meant
     * "no such order". A missing order is now simply out of scope.
     */
    describe('an unknown order answers the same shape regardless of role', () => {
      it('is null/200 for an unscoped caller', async () => {
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(null);
        assignmentRepo.findByOrderId.mockResolvedValue(null);

        await expect(service.findAssignmentByOrderId('nope', ownerActor())).resolves.toBeNull();
      });

      it('is 403 — never 404 — for a scoped warehouse_operator', async () => {
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(null);
        warehouseOperatorRepo.findByUserId.mockResolvedValue({
          id: 'op-1',
          userId: 'user-operator',
          warehouseId: 'warehouse-A',
        } as never);

        const attempt = service.findAssignmentByOrderId('nope', warehouseOperatorActor());

        await expect(attempt).rejects.toThrow(WarehouseScopeViolationError);
        await expect(attempt).rejects.not.toThrow(OrderNotFoundForDeliveryError);
        expect(assignmentRepo.findByOrderId).not.toHaveBeenCalled();
      });

      /**
       * And it is INDISTINGUISHABLE from a real cross-warehouse order — which
       * is the whole point: both answer 403, so the response carries no
       * information about whether the order exists.
       */
      it('is indistinguishable from a real order in another warehouse', async () => {
        warehouseOperatorRepo.findByUserId.mockResolvedValue({
          id: 'op-1',
          userId: 'user-operator',
          warehouseId: 'warehouse-A',
        } as never);

        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(null);
        const missing = await service
          .findAssignmentByOrderId('nope', warehouseOperatorActor())
          .catch((err: Error) => err.constructor.name);

        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(
          orderSnapshot({ warehouseId: 'warehouse-B' }),
        );
        const foreign = await service
          .findAssignmentByOrderId('order-1', warehouseOperatorActor())
          .catch((err: Error) => err.constructor.name);

        expect(missing).toBe(foreign);
      });
    });
  });

  describe('createCarrier', () => {
    it('creates a carrier via the repository', async () => {
      carrierRepo.create.mockResolvedValue(carrier({ id: 'new-carrier', name: 'New Carrier' }));

      const result = await service.createCarrier({ name: 'New Carrier' });

      expect(carrierRepo.create).toHaveBeenCalledWith({ name: 'New Carrier' });
      expect(result.id).toBe('new-carrier');
      expect(result.name).toBe('New Carrier');
    });
  });

  describe('updateCarrier', () => {
    it('updates a carrier via the repository', async () => {
      carrierRepo.update.mockResolvedValue(carrier({ id: 'carrier-1', name: 'Renamed' }));

      const result = await service.updateCarrier('carrier-1', { name: 'Renamed' });

      expect(carrierRepo.update).toHaveBeenCalledWith('carrier-1', { name: 'Renamed' });
      expect(result.name).toBe('Renamed');
    });
  });

  describe('deactivateCarrier', () => {
    it('soft-deletes via the repository, which owns the open-assignment guard', async () => {
      await service.deactivateCarrier('carrier-1');

      expect(carrierRepo.softDelete).toHaveBeenCalledWith('carrier-1');
      // Deliberately NOT a `list()` pre-check any more: it read in one
      // statement and wrote in another, so a concurrent `assign` landing in
      // between recreated exactly the stranded state it existed to prevent.
      // The guard now runs inside the write's own transaction and row lock
      // (`PrismaCarrierRepository.deactivateGuarded`).
      expect(assignmentRepo.list).not.toHaveBeenCalled();
    });

    it('propagates the repository’s CarrierHasOpenAssignmentsError', async () => {
      carrierRepo.softDelete.mockRejectedValue(new CarrierHasOpenAssignmentsError('carrier-1', 1));

      await expect(service.deactivateCarrier('carrier-1')).rejects.toThrow(
        CarrierHasOpenAssignmentsError,
      );
    });
  });

  describe('updateCarrier — the SECOND writer of `active` (CLASS C)', () => {
    it('routes a deactivating patch through the repository unchanged — one guard, not a second copy', async () => {
      carrierRepo.update.mockResolvedValue(carrier({ id: 'carrier-1', active: false }));

      await service.updateCarrier('carrier-1', { active: false });

      expect(carrierRepo.update).toHaveBeenCalledWith('carrier-1', { active: false });
    });

    it('propagates CarrierHasOpenAssignmentsError for PATCH {"active": false} — no longer a one-line bypass', async () => {
      carrierRepo.update.mockRejectedValue(new CarrierHasOpenAssignmentsError('carrier-1', 2));

      await expect(service.updateCarrier('carrier-1', { active: false })).rejects.toThrow(
        CarrierHasOpenAssignmentsError,
      );
    });
  });

  describe('assign', () => {
    it('creates an in_transit assignment when the order is verified+delivery, the carrier is active, and the order has none', async () => {
      orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(orderSnapshot());
      carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: true }));
      assignmentRepo.findByOrderId.mockResolvedValue(null);
      assignmentRepo.create.mockImplementation(async (a: DomainDeliveryAssignment) => a);

      const result = await service.assign({ orderId: 'order-1', carrierId: 'carrier-1' }, ownerActor());

      expect(orderDeliveryGateway.findOrderSnapshot).toHaveBeenCalledWith('order-1');
      expect(carrierRepo.findById).toHaveBeenCalledWith('carrier-1');
      expect(assignmentRepo.findByOrderId).toHaveBeenCalledWith('order-1');
      expect(result.status).toBe('in_transit');
      expect(result.orderId).toBe('order-1');
      expect(result.carrierId).toBe('carrier-1');
      expect(assignmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-1', carrierId: 'carrier-1', status: 'in_transit' }),
      );
    });

    describe('validates the ORDER before creating anything (it used to validate nothing)', () => {
      it('throws OrderNotFoundForDeliveryError for an unknown orderId — 404, never a raw Prisma P2003 as 500', async () => {
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(null);

        await expect(
          service.assign({ orderId: 'ghost-order', carrierId: 'carrier-1' }, ownerActor()),
        ).rejects.toThrow(OrderNotFoundForDeliveryError);
        expect(assignmentRepo.create).not.toHaveBeenCalled();
      });

      it('throws PickupOrderCannotBeAssignedError for a pickup order — spec: pickup MUST NEVER receive an assignment', async () => {
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(
          orderSnapshot({ deliveryMode: 'pickup' }),
        );

        await expect(
          service.assign({ orderId: 'order-1', carrierId: 'carrier-1' }, ownerActor()),
        ).rejects.toThrow(PickupOrderCannotBeAssignedError);
        expect(assignmentRepo.create).not.toHaveBeenCalled();
      });

      it.each(['created', 'delivered', 'cancelled'] as const)(
        'throws OrderNotAssignableStateError for a %s order — an assignment on one poisons capacity permanently',
        async (status) => {
          orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(orderSnapshot({ status }));

          await expect(
            service.assign({ orderId: 'order-1', carrierId: 'carrier-1' }, ownerActor()),
          ).rejects.toThrow(OrderNotAssignableStateError);
          expect(assignmentRepo.create).not.toHaveBeenCalled();
        },
      );
    });

    describe('warehouse scope (the same rule POST /orders/:id/deliver applies)', () => {
      it('rejects a warehouse_operator scoped to a DIFFERENT warehouse', async () => {
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(
          orderSnapshot({ warehouseId: 'warehouse-A' }),
        );
        warehouseOperatorRepo.findByUserId.mockResolvedValue({
          id: 'op-1',
          userId: 'user-operator',
          warehouseId: 'warehouse-B',
        } as never);

        await expect(
          service.assign({ orderId: 'order-1', carrierId: 'carrier-1' }, warehouseOperatorActor()),
        ).rejects.toThrow(WarehouseScopeViolationError);
        expect(assignmentRepo.create).not.toHaveBeenCalled();
      });

      it('allows a warehouse_operator scoped to the order’s OWN warehouse', async () => {
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(
          orderSnapshot({ warehouseId: 'warehouse-A' }),
        );
        warehouseOperatorRepo.findByUserId.mockResolvedValue({
          id: 'op-1',
          userId: 'user-operator',
          warehouseId: 'warehouse-A',
        } as never);
        carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: true }));
        assignmentRepo.findByOrderId.mockResolvedValue(null);
        assignmentRepo.create.mockImplementation(async (a: DomainDeliveryAssignment) => a);

        const result = await service.assign(
          { orderId: 'order-1', carrierId: 'carrier-1' },
          warehouseOperatorActor(),
        );

        expect(result.status).toBe('in_transit');
      });

      /**
       * The `!order` 404 used to run BEFORE this scope assertion, so a scoped
       * operator got 404 for an id that does not exist and 403 for one that
       * belongs to another warehouse: an order-EXISTENCE oracle for exactly
       * the role the scope exists to restrict. `findAssignmentByOrderId` — in
       * the same file — closed this and names the problem verbatim; `assign`
       * did not get the same treatment and nothing covered it.
       */
      it('answers an UNKNOWN order with 403, not 404, for a scoped operator — no existence oracle', async () => {
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(null);
        warehouseOperatorRepo.findByUserId.mockResolvedValue({
          id: 'op-1',
          userId: 'user-operator',
          warehouseId: 'warehouse-A',
        } as never);

        const attempt = service.assign(
          { orderId: 'no-such-order', carrierId: 'carrier-1' },
          warehouseOperatorActor(),
        );

        // The SAME error another warehouse's order produces, so the two are
        // indistinguishable from outside.
        await expect(attempt).rejects.toThrow(WarehouseScopeViolationError);
        await expect(attempt).rejects.not.toThrow(OrderNotFoundForDeliveryError);
        expect(assignmentRepo.create).not.toHaveBeenCalled();
      });

      it('still answers an UNKNOWN order with 404 for an UNSCOPED caller', async () => {
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(null);

        await expect(
          service.assign({ orderId: 'no-such-order', carrierId: 'carrier-1' }, ownerActor()),
        ).rejects.toThrow(OrderNotFoundForDeliveryError);
        expect(warehouseOperatorRepo.findByUserId).not.toHaveBeenCalled();
      });

      it('issues no operator lookup at all for an owner — unscoped callers pay nothing', async () => {
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(orderSnapshot());
        carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: true }));
        assignmentRepo.findByOrderId.mockResolvedValue(null);
        assignmentRepo.create.mockImplementation(async (a: DomainDeliveryAssignment) => a);

        await service.assign({ orderId: 'order-1', carrierId: 'carrier-1' }, ownerActor());

        expect(warehouseOperatorRepo.findByUserId).not.toHaveBeenCalled();
      });
    });

    it('throws CarrierNotFoundError for an unknown carrier — 404 at the controller', async () => {
      orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(orderSnapshot());
      carrierRepo.findById.mockResolvedValue(null);

      await expect(
        service.assign({ orderId: 'order-1', carrierId: 'unknown' }, ownerActor()),
      ).rejects.toThrow(CarrierNotFoundError);
      expect(assignmentRepo.findByOrderId).not.toHaveBeenCalled();
      expect(assignmentRepo.create).not.toHaveBeenCalled();
    });

    it('throws CarrierNotFoundError for an inactive carrier — same error as unknown (spec: "unknown or inactive")', async () => {
      orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(orderSnapshot());
      carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: false }));

      await expect(
        service.assign({ orderId: 'order-1', carrierId: 'carrier-1' }, ownerActor()),
      ).rejects.toThrow(CarrierNotFoundError);
      expect(assignmentRepo.create).not.toHaveBeenCalled();
    });

    it('throws OrderAlreadyAssignedError when the order already has an assignment — 409 at the controller', async () => {
      orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(orderSnapshot());
      carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: true }));
      assignmentRepo.findByOrderId.mockResolvedValue(assignment({ orderId: 'order-1' }));

      await expect(
        service.assign({ orderId: 'order-1', carrierId: 'carrier-1' }, ownerActor()),
      ).rejects.toThrow(OrderAlreadyAssignedError);
      expect(assignmentRepo.create).not.toHaveBeenCalled();
    });

    describe('coverage is advisory, never enforced (ADR-4 / spec "Coverage Is Advisory")', () => {
      it('succeeds when the carrier has zero coverage rows for any warehouse', async () => {
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(orderSnapshot());
        carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: true }));
        assignmentRepo.findByOrderId.mockResolvedValue(null);
        carrierWarehouseRepo.listByCarrier.mockResolvedValue([]);
        assignmentRepo.create.mockImplementation(async (a: DomainDeliveryAssignment) => a);

        const result = await service.assign(
          { orderId: 'order-1', carrierId: 'carrier-1' },
          ownerActor(),
        );

        expect(result.status).toBe('in_transit');
        expect(result).not.toHaveProperty('warning');
        // `assign` never consults coverage at all. It now knows the order's
        // warehouse (it must, to scope the caller) — and STILL does not
        // check whether the carrier covers it. That is ADR-4, not an
        // oversight: coverage is advisory, surfaced on reads only.
        expect(carrierWarehouseRepo.listByCarrier).not.toHaveBeenCalled();
        expect(carrierWarehouseRepo.listByWarehouse).not.toHaveBeenCalled();
      });

      it('succeeds when the carrier only covers a DIFFERENT warehouse than the order (mismatched coverage)', async () => {
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(
          orderSnapshot({ warehouseId: 'warehouse-B' }),
        );
        carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: true }));
        assignmentRepo.findByOrderId.mockResolvedValue(null);
        carrierWarehouseRepo.listByCarrier.mockResolvedValue([coverage('carrier-1', 'warehouse-A')]);
        assignmentRepo.create.mockImplementation(async (a: DomainDeliveryAssignment) => a);

        const result = await service.assign(
          { orderId: 'order-1', carrierId: 'carrier-1' },
          ownerActor(),
        );

        expect(result.status).toBe('in_transit');
        expect(result).not.toHaveProperty('warning');
        expect(carrierWarehouseRepo.listByCarrier).not.toHaveBeenCalled();
        expect(carrierWarehouseRepo.listByWarehouse).not.toHaveBeenCalled();
      });
    });
  });

  describe('markDelivered', () => {
    it('guards in_transit, calls the gateway with orderId, and re-reads the assignment — writes NOTHING to the assignment itself', async () => {
      const inTransit = assignment({ id: 'assignment-1', orderId: 'order-1', status: 'in_transit' });
      const delivered = assignment({
        id: 'assignment-1',
        orderId: 'order-1',
        status: 'delivered',
        deliveredAt: new Date('2026-08-06T12:00:00.000Z'),
      });
      assignmentRepo.findById.mockResolvedValueOnce(inTransit).mockResolvedValueOnce(delivered);
      orderDeliveryGateway.markOrderDelivered.mockResolvedValue(undefined);

      const result = await service.markDelivered('assignment-1', ownerActor());

      expect(assignmentRepo.findById).toHaveBeenNthCalledWith(1, 'assignment-1');
      expect(orderDeliveryGateway.markOrderDelivered).toHaveBeenCalledWith('order-1');
      expect(assignmentRepo.findById).toHaveBeenNthCalledWith(2, 'assignment-1');
      expect(assignmentRepo.findById).toHaveBeenCalledTimes(2);
      expect(result!.status).toBe('delivered');
      // `IDeliveryAssignmentRepository` has no write method for this transition
      // (design §8) — `create` is the only write on this mock and it must
      // never be touched by `markDelivered`.
      expect(assignmentRepo.create).not.toHaveBeenCalled();
    });

    it('returns null for an unknown assignment id — controller maps 404, never calls the gateway', async () => {
      assignmentRepo.findById.mockResolvedValue(null);

      const result = await service.markDelivered('unknown-assignment', ownerActor());

      expect(result).toBeNull();
      expect(orderDeliveryGateway.markOrderDelivered).not.toHaveBeenCalled();
    });

    it('throws InvalidAssignmentStateError when the assignment is not in_transit — never calls the gateway', async () => {
      const alreadyDelivered = assignment({ id: 'assignment-1', status: 'delivered' });
      assignmentRepo.findById.mockResolvedValue(alreadyDelivered);

      await expect(service.markDelivered('assignment-1', ownerActor())).rejects.toThrow(
        InvalidAssignmentStateError,
      );
      expect(orderDeliveryGateway.markOrderDelivered).not.toHaveBeenCalled();
    });

    it('throws InvalidAssignmentStateError for a cancelled assignment — cancelled is terminal too', async () => {
      assignmentRepo.findById.mockResolvedValue(assignment({ id: 'assignment-1', status: 'cancelled' }));

      await expect(service.markDelivered('assignment-1', ownerActor())).rejects.toThrow(
        InvalidAssignmentStateError,
      );
      expect(orderDeliveryGateway.markOrderDelivered).not.toHaveBeenCalled();
    });

    describe('warehouse scope — the Delivery door must not bypass what the Sales door enforces', () => {
      it('rejects a warehouse_operator scoped to a DIFFERENT warehouse than the assignment’s order', async () => {
        assignmentRepo.findById.mockResolvedValue(
          assignment({ id: 'assignment-1', orderId: 'order-1', status: 'in_transit' }),
        );
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(
          orderSnapshot({ warehouseId: 'warehouse-A' }),
        );
        warehouseOperatorRepo.findByUserId.mockResolvedValue({
          id: 'op-1',
          userId: 'user-operator',
          warehouseId: 'warehouse-B',
        } as never);

        // Without this, an operator scoped to B could deliver an A order
        // through the Delivery door — consuming A's stock and firing A's
        // commission accrual — while `POST /orders/:id/deliver` rejected the
        // exact same act with 403.
        await expect(
          service.markDelivered('assignment-1', warehouseOperatorActor()),
        ).rejects.toThrow(WarehouseScopeViolationError);
        expect(orderDeliveryGateway.markOrderDelivered).not.toHaveBeenCalled();
      });

      it('allows a warehouse_operator scoped to the order’s OWN warehouse', async () => {
        assignmentRepo.findById
          .mockResolvedValueOnce(
            assignment({ id: 'assignment-1', orderId: 'order-1', status: 'in_transit' }),
          )
          .mockResolvedValueOnce(
            assignment({
              id: 'assignment-1',
              orderId: 'order-1',
              status: 'delivered',
              deliveredAt: new Date('2026-08-06T12:00:00.000Z'),
            }),
          );
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(
          orderSnapshot({ warehouseId: 'warehouse-A' }),
        );
        warehouseOperatorRepo.findByUserId.mockResolvedValue({
          id: 'op-1',
          userId: 'user-operator',
          warehouseId: 'warehouse-A',
        } as never);
        orderDeliveryGateway.markOrderDelivered.mockResolvedValue(undefined);

        const result = await service.markDelivered('assignment-1', warehouseOperatorActor());

        expect(result!.status).toBe('delivered');
      });

      /**
       * `assign`'s leak, one identifier over. The `!found -> null` return
       * (mapped to 404 by the controller) used to run BEFORE this scope
       * assertion, so a scoped operator could tell an assignment id that
       * exists from one that does not by reading 403 vs 404.
       */
      it('answers an UNKNOWN assignment with 403, not 404, for a scoped operator', async () => {
        assignmentRepo.findById.mockResolvedValue(null);
        warehouseOperatorRepo.findByUserId.mockResolvedValue({
          id: 'op-1',
          userId: 'user-operator',
          warehouseId: 'warehouse-A',
        } as never);

        await expect(
          service.markDelivered('no-such-assignment', warehouseOperatorActor()),
        ).rejects.toThrow(WarehouseScopeViolationError);
        expect(orderDeliveryGateway.markOrderDelivered).not.toHaveBeenCalled();
      });

      it('still answers an UNKNOWN assignment with null (404) for an UNSCOPED caller', async () => {
        assignmentRepo.findById.mockResolvedValue(null);

        await expect(service.markDelivered('no-such-assignment', ownerActor())).resolves.toBeNull();
        expect(warehouseOperatorRepo.findByUserId).not.toHaveBeenCalled();
      });

      it('resolves no order snapshot at all for an owner — unscoped callers pay for no extra read', async () => {
        assignmentRepo.findById
          .mockResolvedValueOnce(
            assignment({ id: 'assignment-1', orderId: 'order-1', status: 'in_transit' }),
          )
          .mockResolvedValueOnce(
            assignment({ id: 'assignment-1', orderId: 'order-1', status: 'delivered' }),
          );
        orderDeliveryGateway.markOrderDelivered.mockResolvedValue(undefined);

        await service.markDelivered('assignment-1', ownerActor());

        expect(orderDeliveryGateway.findOrderSnapshot).not.toHaveBeenCalled();
      });

      it('throws OrderNotFoundForDeliveryError when a scoped operator’s assignment points at a missing order', async () => {
        assignmentRepo.findById.mockResolvedValue(
          assignment({ id: 'assignment-1', orderId: 'ghost-order', status: 'in_transit' }),
        );
        orderDeliveryGateway.findOrderSnapshot.mockResolvedValue(null);

        await expect(
          service.markDelivered('assignment-1', warehouseOperatorActor()),
        ).rejects.toThrow(OrderNotFoundForDeliveryError);
        expect(orderDeliveryGateway.markOrderDelivered).not.toHaveBeenCalled();
      });
    });
  });
});
