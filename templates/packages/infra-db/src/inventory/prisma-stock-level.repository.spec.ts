import { InsufficientStockError, InvalidStockLevelError } from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';
import { PrismaWarehouseRepository } from './prisma-warehouse.repository.js';
import { PrismaStockLevelRepository } from './prisma-stock-level.repository.js';
import { PrismaCategoryRepository } from '../product/prisma-category.repository.js';
import { PrismaProductRepository } from '../product/prisma-product.repository.js';

describe('PrismaStockLevelRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaStockLevelRepository;
  let warehouseRepository: PrismaWarehouseRepository;
  let categoryRepository: PrismaCategoryRepository;
  let productRepository: PrismaProductRepository;

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new PrismaStockLevelRepository(prisma);
    warehouseRepository = new PrismaWarehouseRepository(prisma);
    categoryRepository = new PrismaCategoryRepository(prisma);
    productRepository = new PrismaProductRepository(prisma);
  });

  afterEach(async () => {
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.warehouse.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedProductAndWarehouse() {
    const category = await categoryRepository.create({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });
    const product = await productRepository.create({
      name: 'Cafetera',
      description: 'desc',
      price: { minorUnits: 1000n, currency: 'USD' },
      cost: { minorUnits: 600n, currency: 'USD' },
      categoryId: category.id,
      image: 'x.png',
      order: 1,
    });
    const warehouse = await warehouseRepository.create({ name: 'Pinar del Río' });
    return { product, warehouse };
  }

  it('findByProductAndWarehouse resolves null when no row exists — missing means zero stock', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();

    const found = await repository.findByProductAndWarehouse(product.id, warehouse.id);

    expect(found).toBeNull();
  });

  it('findByProductAndWarehouse returns the persisted row when one exists', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    await prisma.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, onHand: 5, reserved: 1 },
    });

    const found = await repository.findByProductAndWarehouse(product.id, warehouse.id);

    expect(found).not.toBeNull();
    expect(found?.onHand).toBe(5);
    expect(found?.reserved).toBe(1);
  });

  it('enforces UNIQUE(productId, warehouseId) — duplicate insert is rejected', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    await prisma.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, onHand: 0, reserved: 0 },
    });

    await expect(
      prisma.stockLevel.create({
        data: { productId: product.id, warehouseId: warehouse.id, onHand: 0, reserved: 0 },
      }),
    ).rejects.toThrow();
  });

  it('list() maps every row to the domain StockLevel shape', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    await prisma.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, onHand: 3, reserved: 0 },
    });

    const rows = await repository.list({ productId: product.id });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.warehouseId).toBe(warehouse.id);
  });

  it('reserve() wraps applyReservationTx in its own $transaction and returns the mapped StockLevel', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    await prisma.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, onHand: 10, reserved: 0 },
    });

    const result = await repository.reserve({
      productId: product.id,
      warehouseId: warehouse.id,
      quantity: 3,
    });

    expect(result.reserved).toBe(3);
    expect(result.onHand).toBe(10);

    const level = await repository.findByProductAndWarehouse(product.id, warehouse.id);
    expect(level?.reserved).toBe(3);
  });

  it('reserve() beyond available throws InsufficientStockError and mutates zero rows', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    await prisma.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, onHand: 2, reserved: 0 },
    });

    await expect(
      repository.reserve({ productId: product.id, warehouseId: warehouse.id, quantity: 5 }),
    ).rejects.toThrow(InsufficientStockError);

    const level = await repository.findByProductAndWarehouse(product.id, warehouse.id);
    expect(level?.reserved).toBe(0); // unchanged
  });

  it('release() wraps applyReservationTx in its own $transaction and returns the mapped StockLevel', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    await prisma.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, onHand: 10, reserved: 5 },
    });

    const result = await repository.release({
      productId: product.id,
      warehouseId: warehouse.id,
      quantity: 5,
    });

    expect(result.reserved).toBe(0);
    expect(result.onHand).toBe(10);
  });

  it('release() beyond reserved throws InvalidStockLevelError and mutates zero rows', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    await prisma.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, onHand: 10, reserved: 1 },
    });

    await expect(
      repository.release({ productId: product.id, warehouseId: warehouse.id, quantity: 3 }),
    ).rejects.toThrow(InvalidStockLevelError);

    const level = await repository.findByProductAndWarehouse(product.id, warehouse.id);
    expect(level?.reserved).toBe(1); // unchanged
  });
});
