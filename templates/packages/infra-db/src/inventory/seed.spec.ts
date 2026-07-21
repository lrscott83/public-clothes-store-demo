import { PrismaService } from '../prisma-client.js';
import { seedWarehouses, WAREHOUSE_NAMES } from './seed.js';

/**
 * Integration test against the real `store_mgmt` Postgres database. Covers
 * the spec's "Seed produces 3 active warehouses" and "No StockLevel rows
 * are seeded" scenarios, plus idempotency (re-running never duplicates).
 */
describe('seedWarehouses', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterEach(async () => {
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.warehouse.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces exactly 3 active Warehouse rows with the MVP names', async () => {
    await seedWarehouses(prisma);

    const warehouses = await prisma.warehouse.findMany();
    expect(warehouses).toHaveLength(3);
    expect(warehouses.every((w) => w.active)).toBe(true);
    expect(warehouses.map((w) => w.name).sort()).toEqual([...WAREHOUSE_NAMES].sort());
  });

  it('seeds ZERO StockLevel rows', async () => {
    await seedWarehouses(prisma);

    const levels = await prisma.stockLevel.findMany();
    expect(levels).toHaveLength(0);
  });

  it('is idempotent: running the seed twice yields exactly 3 rows, never duplicates', async () => {
    await seedWarehouses(prisma);
    await seedWarehouses(prisma);

    const warehouses = await prisma.warehouse.findMany();
    expect(warehouses).toHaveLength(3);
  });
});
