import { NegativeStockError, type StockMovementType } from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';
import { PrismaWarehouseRepository } from './prisma-warehouse.repository.js';
import { PrismaStockLevelRepository } from './prisma-stock-level.repository.js';
import { PrismaStockMovementRepository } from './prisma-stock-movement.repository.js';
import { PrismaCategoryRepository } from '../product/prisma-category.repository.js';
import { PrismaProductRepository } from '../product/prisma-product.repository.js';

describe('PrismaStockMovementRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaStockMovementRepository;
  let stockLevelRepository: PrismaStockLevelRepository;
  let warehouseRepository: PrismaWarehouseRepository;
  let categoryRepository: PrismaCategoryRepository;
  let productRepository: PrismaProductRepository;

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new PrismaStockMovementRepository(prisma);
    stockLevelRepository = new PrismaStockLevelRepository(prisma);
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

  it('lazily creates a StockLevel on the first movement and adjusts onHand', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();

    const result = await repository.record({
      productId: product.id,
      warehouseId: warehouse.id,
      type: 'purchase_in',
      quantity: 10,
    });

    expect(result.stockLevel.onHand).toBe(10);
    expect(result.movement.quantity).toBe(10);
    expect(result.movement.type).toBe('purchase_in');

    const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
    expect(level?.onHand).toBe(10);
  });

  it('appends a StockMovement row for every record() call', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();

    await repository.record({ productId: product.id, warehouseId: warehouse.id, type: 'purchase_in', quantity: 10 });
    await repository.record({ productId: product.id, warehouseId: warehouse.id, type: 'sale_out', quantity: 4 });

    const movements = await repository.list({ productId: product.id, warehouseId: warehouse.id });
    expect(movements).toHaveLength(2);

    const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
    expect(level?.onHand).toBe(6);
  });

  it('a sale_out exceeding onHand throws NegativeStockError and persists NEITHER the level change NOR the movement', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    await repository.record({ productId: product.id, warehouseId: warehouse.id, type: 'purchase_in', quantity: 5 });

    await expect(
      repository.record({ productId: product.id, warehouseId: warehouse.id, type: 'sale_out', quantity: 10 }),
    ).rejects.toThrow(NegativeStockError);

    const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
    expect(level?.onHand).toBe(5); // unchanged

    const movements = await repository.list({ productId: product.id, warehouseId: warehouse.id });
    expect(movements).toHaveLength(1); // only the initial purchase_in
  });

  it('concurrency: two racing sale_out movements that would jointly overdraw onHand — exactly ONE succeeds', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    await repository.record({ productId: product.id, warehouseId: warehouse.id, type: 'purchase_in', quantity: 10 });

    const results = await Promise.allSettled([
      repository.record({ productId: product.id, warehouseId: warehouse.id, type: 'sale_out', quantity: 7 }),
      repository.record({ productId: product.id, warehouseId: warehouse.id, type: 'sale_out', quantity: 7 }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(NegativeStockError);

    const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
    expect(level?.onHand).toBe(3); // 10 - 7, never negative
    expect(level!.onHand).toBeGreaterThanOrEqual(0);
  });

  it('every StockMovementType TS union value has an identical-string Prisma enum counterpart', async () => {
    const unionValues: StockMovementType[] = [
      'purchase_in',
      'sale_out',
      'transfer_in',
      'transfer_out',
      'adjustment_in',
      'adjustment_out',
    ];
    const { product, warehouse } = await seedProductAndWarehouse();

    for (const type of unionValues) {
      await expect(
        repository.record({ productId: product.id, warehouseId: warehouse.id, type, quantity: 1 }),
      ).resolves.toBeDefined();
    }
  });
});
