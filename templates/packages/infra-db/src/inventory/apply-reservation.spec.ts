import { InsufficientStockError, InvalidStockLevelError } from '@store-mgmt/domain';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema } from '../tenant-schema.spec-helper.js';
import { applyReservationTx } from './apply-reservation.js';
import { PrismaWarehouseRepository } from './prisma-warehouse.repository.js';
import { PrismaCategoryRepository } from '../product/prisma-category.repository.js';
import { PrismaProductRepository } from '../product/prisma-product.repository.js';

/**
 * Integration tests against a REAL, per-suite provisioned tenant Postgres
 * schema (design.md §4, P12 Option C) — same discipline as
 * `prisma-currency.repository.spec.ts`. `applyReservationTx`'s `tx` param is
 * typed against `generated/tenant`'s `Prisma.TransactionClient` (task 6.2),
 * so this spec must drive it through a real tenant client, not the master
 * `PrismaService` it used before.
 */
describe('applyReservationTx', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let warehouseRepository: PrismaWarehouseRepository;
  let categoryRepository: PrismaCategoryRepository;
  let productRepository: PrismaProductRepository;

  beforeAll(() => {
    tenantContext = fakeTenantContext(getTenantSchema);
    warehouseRepository = new PrismaWarehouseRepository(tenantContext);
    categoryRepository = new PrismaCategoryRepository(tenantContext);
    productRepository = new PrismaProductRepository(tenantContext);
  });

  afterEach(async () => {
    const prisma = tenantContext.getClient();
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.warehouse.deleteMany({});
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

  it('reserve raises reserved by quantity when available >= quantity', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    const prisma = tenantContext.getClient();
    await prisma.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, onHand: 10, reserved: 0 },
    });

    const result = await prisma.$transaction((tx) =>
      applyReservationTx(
        tx,
        { productId: product.id, warehouseId: warehouse.id, quantity: 4 },
        'reserve',
      ),
    );

    expect(result.reserved).toBe(4);
    expect(result.onHand).toBe(10);

    const level = await prisma.stockLevel.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });
    expect(level?.reserved).toBe(4);
  });

  it('reserve beyond available (onHand - (reserved+qty) < 0) throws InsufficientStockError and mutates zero rows', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    const prisma = tenantContext.getClient();
    await prisma.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, onHand: 5, reserved: 2 },
    });

    await expect(
      prisma.$transaction((tx) =>
        applyReservationTx(
          tx,
          { productId: product.id, warehouseId: warehouse.id, quantity: 4 },
          'reserve',
        ),
      ),
    ).rejects.toThrow(InsufficientStockError);

    const level = await prisma.stockLevel.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });
    expect(level?.reserved).toBe(2); // unchanged
    expect(level?.onHand).toBe(5); // unchanged
  });

  it('release lowers reserved by quantity', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    const prisma = tenantContext.getClient();
    await prisma.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, onHand: 10, reserved: 6 },
    });

    const result = await prisma.$transaction((tx) =>
      applyReservationTx(
        tx,
        { productId: product.id, warehouseId: warehouse.id, quantity: 6 },
        'release',
      ),
    );

    expect(result.reserved).toBe(0);
    expect(result.onHand).toBe(10);
  });

  it('release beyond reserved (reserved-qty < 0) throws InvalidStockLevelError and mutates zero rows', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    const prisma = tenantContext.getClient();
    await prisma.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, onHand: 10, reserved: 2 },
    });

    await expect(
      prisma.$transaction((tx) =>
        applyReservationTx(
          tx,
          { productId: product.id, warehouseId: warehouse.id, quantity: 5 },
          'release',
        ),
      ),
    ).rejects.toThrow(InvalidStockLevelError);

    const level = await prisma.stockLevel.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });
    expect(level?.reserved).toBe(2); // unchanged
  });

  it('reserving against a not-yet-existing StockLevel (lazily upserted at onHand=0) fails and rolls back the lazy-create too', async () => {
    const { product, warehouse } = await seedProductAndWarehouse();
    const prisma = tenantContext.getClient();

    await expect(
      prisma.$transaction((tx) =>
        applyReservationTx(
          tx,
          { productId: product.id, warehouseId: warehouse.id, quantity: 1 },
          'reserve',
        ),
      ),
    ).rejects.toThrow(InsufficientStockError);

    // Whole transaction rolled back, including the lazy upsert — no row persists.
    const level = await prisma.stockLevel.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });
    expect(level).toBeNull();
  });
});
