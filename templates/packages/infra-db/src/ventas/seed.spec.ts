import { PrismaService } from '../prisma-client.js';
import { seedOrders } from './seed.js';

/**
 * Integration test against the real `store_mgmt` Postgres database. Covers
 * the spec's demo-seed idempotency requirement: re-running never duplicates
 * the 4 demo orders (single-currency, mixed USD/MN, split-payment, credit
 * sale), and the set spans `creado`/`verificado`/`entregado` across itself.
 */
describe('seedOrders', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterEach(async () => {
    // Targeted cleanup — only rows `seedOrders` itself creates, so sibling
    // spec files' own customer/warehouse fixtures (managed by their own
    // idempotent seeds) are left untouched.
    await prisma.orderPayment.deleteMany({});
    await prisma.saleCredit.deleteMany({});
    await prisma.orderLine.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.exchangeRate.deleteMany({ where: { channel: 'MN_TRANSFERENCIA' } });
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.product.deleteMany({ where: { name: { startsWith: 'Producto Demo' } } });
    await prisma.category.deleteMany({ where: { slug: 'ventas-seed-demo' } });
    await prisma.customer.deleteMany({});
    await prisma.warehouse.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates the 4 demo orders spanning creado/verificado/entregado', async () => {
    const result = await seedOrders(prisma);

    expect(result.ordersUpserted).toBe(4);

    const orders = await prisma.order.findMany({ where: { customerName: { not: '' } } });
    const statuses = new Set(orders.map((o) => o.status));
    expect(statuses.has('creado')).toBe(true);
    expect(statuses.has('verificado')).toBe(true);
    expect(statuses.has('entregado')).toBe(true);
  });

  it('is idempotent: running twice never duplicates the demo orders', async () => {
    const first = await seedOrders(prisma);
    const ordersAfterFirst = await prisma.order.count();

    const second = await seedOrders(prisma);
    const ordersAfterSecond = await prisma.order.count();

    expect(second.ordersUpserted).toBe(0);
    expect(ordersAfterSecond).toBe(ordersAfterFirst);
    expect(first.ordersUpserted).toBe(4);
  });

  it('the credit-sale demo order carries an attached SaleCredit', async () => {
    await seedOrders(prisma);

    const saleCredit = await prisma.saleCredit.findFirst();
    expect(saleCredit).not.toBeNull();
    expect(Number(saleCredit?.paid.toString())).toBe(0);
  });
});
