import { PrismaService } from '../prisma-client.js';
import { seedOrders } from './seed.js';
import { wipeCommissionTables } from '../db-cleanup.spec-helper.js';

/**
 * Integration test against the real `store_mgmt` Postgres database. Covers
 * the spec's demo-seed idempotency requirement: re-running never duplicates
 * the 4 demo orders (single-currency, mixed USD/MN, split-payment, credit
 * sale), and the set spans `created`/`verified`/`delivered` across itself.
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
    // First: commission rows RESTRICT the order delete below.
    await wipeCommissionTables(prisma);
    await prisma.orderPayment.deleteMany({});
    await prisma.saleCredit.deleteMany({});
    await prisma.orderLine.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.exchangeRate.deleteMany({ where: { channel: 'MN_TRANSFER' } });
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.product.deleteMany({ where: { name: { startsWith: 'Producto Demo' } } });
    await prisma.category.deleteMany({ where: { slug: 'sales-seed-demo' } });
    await prisma.customer.deleteMany({});
    // `seedOrders` -> `seedCustomers` mints/links an `app_user` per demo
    // customer (backend-users-roles, Customer.userId 1:1) — clean those up
    // too, same "only rows this seed itself creates" discipline as above.
    // `company_user` has NO FK to `app_user` (soft FK by design) — deleting
    // users alone would leave orphan assignments behind and trip the §7
    // backfill gate.
    await prisma.companyUser.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.warehouse.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates the 4 demo orders spanning created/verified/delivered', async () => {
    const result = await seedOrders(prisma);

    expect(result.ordersUpserted).toBe(4);

    const orders = await prisma.order.findMany({ where: { customerName: { not: '' } } });
    const statuses = new Set(orders.map((o) => o.status));
    expect(statuses.has('created')).toBe(true);
    expect(statuses.has('verified')).toBe(true);
    expect(statuses.has('delivered')).toBe(true);
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

  it('attributes EVERY demo order to the cockpit sales agent — none left unattributed', async () => {
    await seedOrders(prisma);

    const orders = await prisma.order.findMany();
    const agentUser = await prisma.user.findUniqueOrThrow({ where: { login: 'sales.agent' } });
    const assignment = await prisma.companyUser.findFirstOrThrow({
      where: { userId: agentUser.id, status: 'ACTIVE' },
    });

    // "Every", not "at least one": a seed that leaves some orders null would
    // still look healthy here while failing Phase 5's accrual gate later.
    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders) {
      expect(order.attributedCompanyUserId).toBe(assignment.id);
    }
  });

  it('the credit-sale demo order carries an attached SaleCredit', async () => {
    await seedOrders(prisma);

    const saleCredit = await prisma.saleCredit.findFirst();
    expect(saleCredit).not.toBeNull();
    expect(Number(saleCredit?.paid.toString())).toBe(0);
  });
});
