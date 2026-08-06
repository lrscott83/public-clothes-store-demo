import { Test, TestingModule } from '@nestjs/testing';
import type {
  Carrier as DomainCarrier,
  CarrierWarehouse as DomainCarrierWarehouse,
  DeliveryAssignment as DomainDeliveryAssignment,
  ICarrierRepository,
  ICarrierWarehouseRepository,
  IDeliveryAssignmentRepository,
} from '@store-mgmt/domain';
import {
  CARRIER_REPOSITORY,
  CARRIER_WAREHOUSE_REPOSITORY,
  DELIVERY_ASSIGNMENT_REPOSITORY,
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

  beforeEach(async () => {
    carrierRepo = buildCarrierRepoMock();
    carrierWarehouseRepo = buildCarrierWarehouseRepoMock();
    assignmentRepo = buildAssignmentRepoMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: CARRIER_REPOSITORY, useValue: carrierRepo },
        { provide: CARRIER_WAREHOUSE_REPOSITORY, useValue: carrierWarehouseRepo },
        { provide: DELIVERY_ASSIGNMENT_REPOSITORY, useValue: assignmentRepo },
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
});
