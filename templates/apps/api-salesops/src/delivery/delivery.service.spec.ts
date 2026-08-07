import { Test, TestingModule } from '@nestjs/testing';
import type {
  Carrier as DomainCarrier,
  CarrierWarehouse as DomainCarrierWarehouse,
  DeliveryAssignment as DomainDeliveryAssignment,
  ICarrierRepository,
  ICarrierWarehouseRepository,
  IDeliveryAssignmentRepository,
  IOrderDeliveryGateway,
  Order as DomainOrder,
} from '@store-mgmt/domain';
import {
  CARRIER_REPOSITORY,
  CARRIER_WAREHOUSE_REPOSITORY,
  CarrierNotFoundError,
  DELIVERY_ASSIGNMENT_REPOSITORY,
  InvalidAssignmentStateError,
  ORDER_DELIVERY_GATEWAY,
  OrderAlreadyAssignedError,
} from '@store-mgmt/domain';
import { DeliveryService } from './delivery.service.js';

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
  };
}

function buildAssignmentRepoMock(): jest.Mocked<IDeliveryAssignmentRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByOrderId: jest.fn(),
    list: jest.fn(),
    countOrdersAwaitingCarrier: jest.fn(),
  };
}

function buildOrderDeliveryGatewayMock(): jest.Mocked<IOrderDeliveryGateway> {
  return { markOrderDelivered: jest.fn() };
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

  beforeEach(async () => {
    carrierRepo = buildCarrierRepoMock();
    carrierWarehouseRepo = buildCarrierWarehouseRepoMock();
    assignmentRepo = buildAssignmentRepoMock();
    orderDeliveryGateway = buildOrderDeliveryGatewayMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: CARRIER_REPOSITORY, useValue: carrierRepo },
        { provide: CARRIER_WAREHOUSE_REPOSITORY, useValue: carrierWarehouseRepo },
        { provide: DELIVERY_ASSIGNMENT_REPOSITORY, useValue: assignmentRepo },
        { provide: ORDER_DELIVERY_GATEWAY, useValue: orderDeliveryGateway },
      ],
    }).compile();
    service = module.get(DeliveryService);
  });

  describe('listCarriers', () => {
    it('with a warehouseId returns every active carrier with coversWarehouse, unfiltered (ADR-4)', async () => {
      const covering = carrier({ id: 'carrier-a', name: 'Covering Carrier' });
      const notCovering = carrier({ id: 'carrier-b', name: 'Not Covering Carrier' });
      carrierRepo.list.mockResolvedValue([covering, notCovering]);
      carrierWarehouseRepo.listByCarrier.mockImplementation(async (carrierId: string) =>
        carrierId === 'carrier-a' ? [coverage('carrier-a', 'warehouse-1')] : [],
      );

      const result = await service.listCarriers({ warehouseId: 'warehouse-1' });

      expect(result).toHaveLength(2);
      expect(result.find((c) => c.id === 'carrier-a')!.coversWarehouse).toBe(true);
      expect(result.find((c) => c.id === 'carrier-b')!.coversWarehouse).toBe(false);
    });

    it('a carrier with zero coverage rows reports coversWarehouse:false for every warehouse, but is still listed', async () => {
      const freshCarrier = carrier({ id: 'carrier-fresh', name: 'Fresh Carrier' });
      carrierRepo.list.mockResolvedValue([freshCarrier]);
      carrierWarehouseRepo.listByCarrier.mockResolvedValue([]);

      const result = await service.listCarriers({ warehouseId: 'any-warehouse' });

      expect(result).toHaveLength(1);
      expect(result[0]!.coversWarehouse).toBe(false);
    });

    it('without a warehouseId omits coversWarehouse entirely', async () => {
      carrierRepo.list.mockResolvedValue([carrier()]);

      const result = await service.listCarriers();

      expect(result[0]!.coversWarehouse).toBeUndefined();
      expect(carrierWarehouseRepo.listByCarrier).not.toHaveBeenCalled();
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
            assignment({
              id: 'a2',
              carrierId: 'carrier-busy',
              status: 'delivered',
              deliveredAt: new Date('2026-08-02T00:00:00.000Z'),
            }),
            assignment({
              id: 'a3',
              carrierId: 'carrier-busy',
              status: 'delivered',
              deliveredAt: new Date('2026-08-03T00:00:00.000Z'),
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

    it('applies an optional [from,to] window to throughput only, via the pure fold — repository is always queried unfiltered', async () => {
      const oneCarrier = carrier({ id: 'carrier-1' });
      carrierRepo.list.mockResolvedValue([oneCarrier]);
      assignmentRepo.list.mockImplementation(async (filter?: { status?: string }) => {
        if (filter?.status === 'delivered') {
          return [
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

      const result = await service.getCarrierCapacity({
        from: new Date('2026-08-01T00:00:00.000Z'),
        to: new Date('2026-08-31T00:00:00.000Z'),
      });

      expect(result.carriers[0]!.deliveredCount).toBe(1);
      // Repository call for delivered rows carries NO date filter — the
      // window is applied by the pure fold, not the query (design §4/ADR-3).
      expect(assignmentRepo.list).toHaveBeenCalledWith({ status: 'delivered' });
    });
  });

  describe('listAssignments', () => {
    it('delegates the filter straight to the repository', async () => {
      assignmentRepo.list.mockResolvedValue([assignment()]);

      const result = await service.listAssignments({ carrierId: 'carrier-1', status: 'in_transit' });

      expect(assignmentRepo.list).toHaveBeenCalledWith({ carrierId: 'carrier-1', status: 'in_transit' });
      expect(result).toHaveLength(1);
    });
  });

  describe('findAssignmentByOrderId', () => {
    it('returns null for an order with no assignment — never throws', async () => {
      assignmentRepo.findByOrderId.mockResolvedValue(null);

      await expect(service.findAssignmentByOrderId('order-without-assignment')).resolves.toBeNull();
    });

    it('returns the assignment when one exists', async () => {
      assignmentRepo.findByOrderId.mockResolvedValue(assignment());

      const result = await service.findAssignmentByOrderId('order-1');

      expect(result!.orderId).toBe('order-1');
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
    it('soft-deletes via the repository', async () => {
      await service.deactivateCarrier('carrier-1');

      expect(carrierRepo.softDelete).toHaveBeenCalledWith('carrier-1');
    });
  });

  describe('assign', () => {
    it('creates an in_transit assignment when the carrier is active and the order has none', async () => {
      carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: true }));
      assignmentRepo.findByOrderId.mockResolvedValue(null);
      assignmentRepo.create.mockImplementation(async (a: DomainDeliveryAssignment) => a);

      const result = await service.assign({ orderId: 'order-1', carrierId: 'carrier-1' });

      expect(carrierRepo.findById).toHaveBeenCalledWith('carrier-1');
      expect(assignmentRepo.findByOrderId).toHaveBeenCalledWith('order-1');
      expect(result.status).toBe('in_transit');
      expect(result.orderId).toBe('order-1');
      expect(result.carrierId).toBe('carrier-1');
      expect(assignmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-1', carrierId: 'carrier-1', status: 'in_transit' }),
      );
    });

    it('throws CarrierNotFoundError for an unknown carrier — 404 at the controller', async () => {
      carrierRepo.findById.mockResolvedValue(null);

      await expect(service.assign({ orderId: 'order-1', carrierId: 'unknown' })).rejects.toThrow(
        CarrierNotFoundError,
      );
      expect(assignmentRepo.findByOrderId).not.toHaveBeenCalled();
      expect(assignmentRepo.create).not.toHaveBeenCalled();
    });

    it('throws CarrierNotFoundError for an inactive carrier — same error as unknown (spec: "unknown or inactive")', async () => {
      carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: false }));

      await expect(service.assign({ orderId: 'order-1', carrierId: 'carrier-1' })).rejects.toThrow(
        CarrierNotFoundError,
      );
      expect(assignmentRepo.create).not.toHaveBeenCalled();
    });

    it('throws OrderAlreadyAssignedError when the order already has an assignment — 409 at the controller', async () => {
      carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: true }));
      assignmentRepo.findByOrderId.mockResolvedValue(assignment({ orderId: 'order-1' }));

      await expect(service.assign({ orderId: 'order-1', carrierId: 'carrier-1' })).rejects.toThrow(
        OrderAlreadyAssignedError,
      );
      expect(assignmentRepo.create).not.toHaveBeenCalled();
    });

    describe('coverage is advisory, never enforced (ADR-4 / spec "Coverage Is Advisory")', () => {
      it('succeeds when the carrier has zero coverage rows for any warehouse', async () => {
        carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: true }));
        assignmentRepo.findByOrderId.mockResolvedValue(null);
        carrierWarehouseRepo.listByCarrier.mockResolvedValue([]);
        assignmentRepo.create.mockImplementation(async (a: DomainDeliveryAssignment) => a);

        const result = await service.assign({ orderId: 'order-1', carrierId: 'carrier-1' });

        expect(result.status).toBe('in_transit');
        expect(result).not.toHaveProperty('warning');
        // `assign` never consults coverage at all — it has no `warehouseId`
        // parameter and never calls `listByCarrier` (design: assign's flow
        // is findById -> findByOrderId -> assignCarrier() -> create(), full
        // stop).
        expect(carrierWarehouseRepo.listByCarrier).not.toHaveBeenCalled();
      });

      it('succeeds when the carrier only covers a DIFFERENT warehouse than the order (mismatched coverage)', async () => {
        carrierRepo.findById.mockResolvedValue(carrier({ id: 'carrier-1', active: true }));
        assignmentRepo.findByOrderId.mockResolvedValue(null);
        carrierWarehouseRepo.listByCarrier.mockResolvedValue([coverage('carrier-1', 'warehouse-A')]);
        assignmentRepo.create.mockImplementation(async (a: DomainDeliveryAssignment) => a);

        // The order's own warehouse is never passed to `assign` at all —
        // coverage mismatch has no code path to reject through.
        const result = await service.assign({ orderId: 'order-1', carrierId: 'carrier-1' });

        expect(result.status).toBe('in_transit');
        expect(result).not.toHaveProperty('warning');
        expect(carrierWarehouseRepo.listByCarrier).not.toHaveBeenCalled();
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
      orderDeliveryGateway.markOrderDelivered.mockResolvedValue({} as DomainOrder);

      const result = await service.markDelivered('assignment-1');

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

      const result = await service.markDelivered('unknown-assignment');

      expect(result).toBeNull();
      expect(orderDeliveryGateway.markOrderDelivered).not.toHaveBeenCalled();
    });

    it('throws InvalidAssignmentStateError when the assignment is not in_transit — never calls the gateway', async () => {
      const alreadyDelivered = assignment({ id: 'assignment-1', status: 'delivered' });
      assignmentRepo.findById.mockResolvedValue(alreadyDelivered);

      await expect(service.markDelivered('assignment-1')).rejects.toThrow(InvalidAssignmentStateError);
      expect(orderDeliveryGateway.markOrderDelivered).not.toHaveBeenCalled();
    });
  });
});
