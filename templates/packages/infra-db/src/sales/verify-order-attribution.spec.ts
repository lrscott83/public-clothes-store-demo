import { PrismaService } from '../prisma-client.js';
import { verifyOrderAttribution } from './verify-order-attribution.js';
import { wipeCommissionTables } from '../db-cleanup.spec-helper.js';

/**
 * The attribution gate is what stands between "orders carry an agent" and the
 * irreversible commission ledger (migration B). A gate nobody ever saw FAIL is
 * a rubber stamp, so these tests exercise the failing branch first and the
 * passing branch second, against the real database.
 */
describe('verifyOrderAttribution — the migration B gate', () => {
  const prisma = new PrismaService();
  const connectionString = process.env.DATABASE_URL as string;
  const CUTOVER = new Date('2026-01-01T00:00:00.000Z');
  const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // First: commission rows RESTRICT the order delete below.
    await wipeCommissionTables(prisma);
    await prisma.order.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.companyUser.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.company.deleteMany({});
  });

  /** Minimal order fixture: everything the NOT NULL columns need and nothing more. */
  async function seedOrder(attributedCompanyUserId: string | null, createdAt: Date) {
    const company = await prisma.company.create({ data: { name: 'Tienda Prueba', slug: 'default' } });
    const user = await prisma.user.create({
      data: { login: `gate.${createdAt.getTime()}`, passwordHash: VALID_HASH, fullName: 'Gate Fixture' },
    });
    const customer = await prisma.customer.create({ data: { fullName: 'Ana Torres', userId: user.id } });
    const warehouse = await prisma.warehouse.create({ data: { name: 'Pinar del Río' } });

    await prisma.order.create({
      data: {
        customerId: customer.id,
        customerName: customer.fullName,
        warehouseId: warehouse.id,
        deliveryMode: 'pickup',
        currency: 'USD',
        status: 'created',
        subtotal: '100.00',
        discountTotal: '0.00',
        total: '100.00',
        orderDate: createdAt,
        createdAt,
        attributedCompanyUserId,
      },
    });

    return { company, user };
  }

  it('FAILS when an order created after the cutover carries no attribution', async () => {
    await seedOrder(null, new Date('2026-06-01T00:00:00.000Z'));

    const report = await verifyOrderAttribution(connectionString, CUTOVER);

    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatch(/created after the cutover carry no attribution/);
  });

  it('PASSES a pre-cutover null, reporting it as legacy rather than asserting on it', async () => {
    // Backfilling these would fabricate financial evidence, so they are
    // counted and reported — never treated as a failure.
    await seedOrder(null, new Date('2025-06-01T00:00:00.000Z'));

    const report = await verifyOrderAttribution(connectionString, CUTOVER);

    expect(report.failures).toHaveLength(0);
    expect(report.legacyUnattributed).toBe(1);
  });

  /**
   * A gate that reports PASSED without having examined a single row is worse
   * than no gate: it hands over the same green light on evidence it never
   * gathered. The assertion it exists to make — "post-cutover orders carry an
   * attribution" — is vacuously true on an empty table, so the report has to
   * expose HOW MANY rows the assertion actually covered, and the caller has to
   * be able to tell "verified" apart from "nothing to verify".
   */
  describe('vacuity — distinguishing a real pass from an empty one', () => {
    it('reports zero post-cutover orders against an empty table, with no failure raised', async () => {
      const report = await verifyOrderAttribution(connectionString, CUTOVER);

      expect(report.orders).toBe(0);
      expect(report.postCutoverOrders).toBe(0);
      // Not a FAILURE — nothing is broken. It is an absence of evidence, and
      // the CLI is what turns that into a refusal to proceed.
      expect(report.failures).toHaveLength(0);
    });

    it('reports zero post-cutover orders when every order predates the cutover', async () => {
      await seedOrder(null, new Date('2025-06-01T00:00:00.000Z'));

      const report = await verifyOrderAttribution(connectionString, CUTOVER);

      expect(report.orders).toBe(1);
      expect(report.legacyUnattributed).toBe(1);
      expect(report.postCutoverOrders).toBe(0);
      expect(report.failures).toHaveLength(0);
    });
  });

  it('PASSES when every post-cutover order is attributed', async () => {
    const company = await prisma.company.create({ data: { name: 'Tienda Prueba', slug: 'default' } });
    const user = await prisma.user.create({
      data: { login: 'gate.attributed', passwordHash: VALID_HASH, fullName: 'Gestor' },
    });
    const assignment = await prisma.companyUser.create({
      data: { userId: user.id, companyId: company.id, role: 32, status: 'ACTIVE' },
    });
    const customer = await prisma.customer.create({ data: { fullName: 'Ana Torres', userId: user.id } });
    const warehouse = await prisma.warehouse.create({ data: { name: 'Pinar del Río' } });
    await prisma.order.create({
      data: {
        customerId: customer.id,
        customerName: customer.fullName,
        warehouseId: warehouse.id,
        deliveryMode: 'pickup',
        currency: 'USD',
        status: 'created',
        subtotal: '100.00',
        discountTotal: '0.00',
        total: '100.00',
        orderDate: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        attributedCompanyUserId: assignment.id,
      },
    });

    const report = await verifyOrderAttribution(connectionString, CUTOVER);

    expect(report.failures).toHaveLength(0);
    expect(report.legacyUnattributed).toBe(0);
    expect(report.orders).toBe(1);
    // The pass is backed by an actual row — this is what separates it from the
    // vacuous cases above.
    expect(report.postCutoverOrders).toBe(1);
  });
});
