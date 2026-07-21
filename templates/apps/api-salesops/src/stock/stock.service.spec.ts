import { Test, TestingModule } from '@nestjs/testing';
import type {
  IProductRepository,
  IStockLevelRepository,
  IStockMovementRepository,
  Product as DomainProduct,
  StockLevel as DomainStockLevel,
} from '@store-mgmt/domain';
import {
  InvalidStockMovementError,
  PRODUCT_REPOSITORY,
  STOCK_LEVEL_REPOSITORY,
  STOCK_MOVEMENT_REPOSITORY,
  money,
} from '@store-mgmt/domain';
import { StockService } from './stock.service.js';

function buildProductRepoMock(): jest.Mocked<IProductRepository> {
  return { create: jest.fn(), update: jest.fn(), softDelete: jest.fn(), findById: jest.fn(), list: jest.fn() };
}

function buildStockLevelRepoMock(): jest.Mocked<IStockLevelRepository> {
  return { findById: jest.fn(), findByProductAndWarehouse: jest.fn(), list: jest.fn() };
}

function buildStockMovementRepoMock(): jest.Mocked<IStockMovementRepository> {
  return { record: jest.fn(), list: jest.fn() };
}

const sampleProduct: DomainProduct = {
  id: 'product-uuid-1',
  name: 'Cafetera',
  description: 'desc',
  sku: undefined,
  barcode: undefined,
  price: money(1000n, 'USD'),
  percentDiscountPrice: 0n,
  discountPrice: 0n,
  cost: money(600n, 'USD'),
  categoryId: 'category-uuid-1',
  image: 'x.png',
  isNew: false,
  order: 1,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const sampleLevel: DomainStockLevel = {
  id: 'level-uuid-1',
  productId: 'product-uuid-1',
  warehouseId: 'warehouse-uuid-1',
  onHand: 10,
  reserved: 3,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('StockService', () => {
  let service: StockService;
  let productRepo: jest.Mocked<IProductRepository>;
  let stockLevelRepo: jest.Mocked<IStockLevelRepository>;
  let stockMovementRepo: jest.Mocked<IStockMovementRepository>;

  beforeEach(async () => {
    productRepo = buildProductRepoMock();
    stockLevelRepo = buildStockLevelRepoMock();
    stockMovementRepo = buildStockMovementRepoMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PRODUCT_REPOSITORY, useValue: productRepo },
        { provide: STOCK_LEVEL_REPOSITORY, useValue: stockLevelRepo },
        { provide: STOCK_MOVEMENT_REPOSITORY, useValue: stockMovementRepo },
      ],
    }).compile();
    service = module.get(StockService);
  });

  describe('getLevel', () => {
    it('returns onHand/reserved/derived available as strings', async () => {
      stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(sampleLevel);

      const result = await service.getLevel('product-uuid-1', 'warehouse-uuid-1');

      expect(result).toEqual({
        productId: 'product-uuid-1',
        warehouseId: 'warehouse-uuid-1',
        onHand: '10',
        reserved: '3',
        available: '7',
      });
    });

    it('resolves to all-zero when no StockLevel row exists — never an error', async () => {
      stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(null);

      const result = await service.getLevel('product-uuid-1', 'warehouse-uuid-1');

      expect(result).toEqual({
        productId: 'product-uuid-1',
        warehouseId: 'warehouse-uuid-1',
        onHand: '0',
        reserved: '0',
        available: '0',
      });
    });
  });

  describe('recordMovement', () => {
    it('validates productId exists via IProductRepository BEFORE calling record', async () => {
      productRepo.findById.mockResolvedValue(null);

      await expect(
        service.recordMovement({
          productId: 'unknown-product',
          warehouseId: 'warehouse-uuid-1',
          type: 'purchase_in',
          quantity: '10',
        }),
      ).rejects.toBeInstanceOf(InvalidStockMovementError);
      expect(stockMovementRepo.record).not.toHaveBeenCalled();
    });

    it('rejects a non-positive quantity via the reused domain guard, never calling record', async () => {
      productRepo.findById.mockResolvedValue(sampleProduct);

      await expect(
        service.recordMovement({
          productId: 'product-uuid-1',
          warehouseId: 'warehouse-uuid-1',
          type: 'purchase_in',
          quantity: '0',
        }),
      ).rejects.toBeInstanceOf(InvalidStockMovementError);
      expect(stockMovementRepo.record).not.toHaveBeenCalled();
    });

    it('records a valid movement with createdBy: null (no auth yet) and returns movement + resulting level', async () => {
      productRepo.findById.mockResolvedValue(sampleProduct);
      stockMovementRepo.record.mockResolvedValue({
        movement: {
          id: 'movement-uuid-1',
          productId: 'product-uuid-1',
          warehouseId: 'warehouse-uuid-1',
          type: 'purchase_in',
          reason: null,
          quantity: 10,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          createdBy: null,
        },
        stockLevel: { ...sampleLevel, onHand: 20, reserved: 0 },
      });

      const result = await service.recordMovement({
        productId: 'product-uuid-1',
        warehouseId: 'warehouse-uuid-1',
        type: 'purchase_in',
        quantity: '10',
      });

      expect(stockMovementRepo.record).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'product-uuid-1',
          warehouseId: 'warehouse-uuid-1',
          type: 'purchase_in',
          quantity: 10,
          createdBy: null,
        }),
      );
      expect(result.quantity).toBe('10');
      expect(result.stockLevel.onHand).toBe('20');
      expect(result.stockLevel.available).toBe('20');
    });
  });
});
