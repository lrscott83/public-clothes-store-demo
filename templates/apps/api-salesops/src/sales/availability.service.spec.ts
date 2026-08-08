import { Test } from '@nestjs/testing';
import { STOCK_LEVEL_REPOSITORY, WAREHOUSE_REPOSITORY, type StockLevel, type Warehouse } from '@store-mgmt/domain';
import { AvailabilityService } from './availability.service.js';

function level(warehouseId: string, productId: string, onHand: number, reserved = 0): StockLevel {
  return {
    id: `sl-${warehouseId}-${productId}`,
    productId,
    warehouseId,
    onHand,
    reserved,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function warehouse(id: string, name: string): Warehouse {
  return {
    id,
    name,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as Warehouse;
}

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let stockList: jest.Mock;
  let warehouseList: jest.Mock;

  beforeEach(async () => {
    stockList = jest.fn();
    warehouseList = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: STOCK_LEVEL_REPOSITORY, useValue: { list: stockList } },
        { provide: WAREHOUSE_REPOSITORY, useValue: { list: warehouseList } },
      ],
    }).compile();

    service = moduleRef.get(AvailabilityService);
  });

  it('returns only the warehouses that cover the whole basket', async () => {
    warehouseList.mockResolvedValue([warehouse('w-1', 'Central'), warehouse('w-2', 'Norte')]);
    stockList.mockImplementation(async ({ productId }: { productId: string }) =>
      productId === 'p-1'
        ? [level('w-1', 'p-1', 5), level('w-2', 'p-1', 5)]
        : [level('w-1', 'p-2', 3)], // w-2 has no row for p-2
    );

    const result = await service.eligibleWarehousesFor([
      { productId: 'p-1', quantity: 2 },
      { productId: 'p-2', quantity: 1 },
    ]);

    expect(result.map((w) => w.id)).toEqual(['w-1']);
  });

  it('fans out ONE stock query per distinct product, not per basket line', async () => {
    warehouseList.mockResolvedValue([warehouse('w-1', 'Central')]);
    stockList.mockResolvedValue([level('w-1', 'p-1', 99)]);

    await service.eligibleWarehousesFor([
      { productId: 'p-1', quantity: 1 },
      { productId: 'p-1', quantity: 1 },
    ]);

    expect(stockList).toHaveBeenCalledTimes(1);
    expect(stockList).toHaveBeenCalledWith({ productId: 'p-1' });
  });

  it('returns an empty list when no warehouse qualifies — never throws', async () => {
    warehouseList.mockResolvedValue([warehouse('w-1', 'Central')]);
    stockList.mockResolvedValue([level('w-1', 'p-1', 0)]);

    await expect(service.eligibleWarehousesFor([{ productId: 'p-1', quantity: 1 }])).resolves.toEqual(
      [],
    );
  });

  it('considers every active warehouse — never narrows by caller scope', async () => {
    // The sales agent is bound to NO warehouse (D2).
    warehouseList.mockResolvedValue([warehouse('w-7', 'Lejano')]);
    stockList.mockResolvedValue([level('w-7', 'p-1', 5)]);

    const result = await service.eligibleWarehousesFor([{ productId: 'p-1', quantity: 1 }]);

    expect(result.map((w) => w.id)).toEqual(['w-7']);
    expect(warehouseList).toHaveBeenCalledWith();
  });
});
