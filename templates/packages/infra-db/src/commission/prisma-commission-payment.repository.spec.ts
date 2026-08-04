import { computeAccrual, money, moneyToDecimalString } from '@store-mgmt/domain';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema, assertAbsentFromPublicSchema } from '../tenant-schema.spec-helper.js';
import { PrismaCommissionAccrualRepository } from './prisma-commission-accrual.repository.js';
import { PrismaCommissionPaymentRepository } from './prisma-commission-payment.repository.js';
import { seedCommissionFixture, wipeCommissionFixture } from './commission-fixtures.spec-helper.js';

/**
 * Integration tests against a REAL, per-suite provisioned tenant Postgres
 * schema (design.md §4, P12 Option C) — same discipline as
 * `prisma-currency.repository.spec.ts`.
 *
 * The one guarantee that matters here is 1:1 — an accrual is settled once or
 * not at all. It is enforced by a unique index rather than by a check in the
 * service, because a service check loses to two concurrent requests and this
 * is the table where losing means paying somebody twice.
 */
describe('PrismaCommissionPaymentRepository', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let accruals: PrismaCommissionAccrualRepository;
  let payments: PrismaCommissionPaymentRepository;
  let categoryId: string;

  beforeAll(async () => {
    tenantContext = fakeTenantContext(getTenantSchema);
    accruals = new PrismaCommissionAccrualRepository(tenantContext);
    payments = new PrismaCommissionPaymentRepository(tenantContext);
    const category = await tenantContext.getClient().category.upsert({
      where: { slug: 'commission-payment-spec' },
      update: {},
      create: { name: 'Commission Payment Spec', slug: 'commission-payment-spec', order: 902, active: true },
    });
    categoryId = category.id;
  });

  afterEach(async () => {
    await wipeCommissionFixture(tenantContext.getClient(), categoryId);
  });

  async function anAccrual() {
    const fixture = await seedCommissionFixture(tenantContext.getClient(), categoryId);
    const accrual = await accruals.create(
      computeAccrual(
        {
          orderId: fixture.orderId,
          attributedCompanyUserId: fixture.companyUserId,
          lines: [{ orderLineId: fixture.orderLineId, productId: fixture.productId, quantity: 2 }],
        },
        new Map([[fixture.productId, money(30000n, 'MN')]]),
        new Date('2026-07-30T10:00:00.000Z'),
      ),
    );
    return { accrual, fixture };
  }

  it('records a settlement and round-trips it as MN Money, scoped to the tenant schema alone', async () => {
    const { accrual, fixture } = await anAccrual();

    const payment = await payments.create({
      accrualId: accrual.id,
      amountMinorUnits: accrual.total.minorUnits,
      paidAt: new Date('2026-07-31T09:00:00.000Z'),
      recordedByCompanyUserId: fixture.companyUserId,
      note: 'Pago quincenal',
    });

    expect(moneyToDecimalString(payment.amount)).toBe('600.00');
    expect(payment.amount.currency).toBe('MN');
    expect(payment.paidAt).toEqual(new Date('2026-07-31T09:00:00.000Z'));
    expect(payment.note).toBe('Pago quincenal');
    expect(payment.recordedByCompanyUserId).toBe(fixture.companyUserId);
    // The trap this batch's instructions call out by name: a spec that never
    // provisions a tenant schema, or that reaches a master/default client,
    // can still pass for the wrong reason. `public` still holds a same-named
    // legacy `commission_payment` table until task 14.2's reset.
    await assertAbsentFromPublicSchema('commission_payment', 'id', payment.id);
  });

  it('REJECTS a settlement recorded by a company user that does not exist', async () => {
    // Who authorised a payment is part of the financial record. Without a
    // foreign key the column is a free-text UUID: it can name a company user
    // that was deleted, or one that never existed, and the day someone asks
    // who approved this the answer is an id nobody can resolve.
    const { accrual } = await anAccrual();

    await expect(
      payments.create({
        accrualId: accrual.id,
        amountMinorUnits: accrual.total.minorUnits,
        paidAt: new Date('2026-07-31T09:00:00.000Z'),
        recordedByCompanyUserId: '00000000-0000-0000-0000-000000000000',
        note: null,
      }),
    ).rejects.toThrow();
  });

  it('REJECTS a second payment against the same accrual — paid once, or not at all', async () => {
    const { accrual, fixture } = await anAccrual();
    const input = {
      accrualId: accrual.id,
      amountMinorUnits: accrual.total.minorUnits,
      paidAt: new Date(),
      recordedByCompanyUserId: fixture.companyUserId,
    };
    await payments.create(input);

    await expect(payments.create(input)).rejects.toThrow();
    expect(
      await tenantContext.getClient().commissionPayment.count({ where: { accrualId: accrual.id } }),
    ).toBe(1);
  });

  it('defaults an omitted note to null rather than an empty string', async () => {
    const { accrual, fixture } = await anAccrual();

    const payment = await payments.create({
      accrualId: accrual.id,
      amountMinorUnits: 0n,
      paidAt: new Date(),
      recordedByCompanyUserId: fixture.companyUserId,
    });

    expect(payment.note).toBeNull();
  });

  it('finds by accrual id, and returns null for an unsettled one', async () => {
    const { accrual, fixture } = await anAccrual();
    expect(await payments.findByAccrualId(accrual.id)).toBeNull();

    await payments.create({
      accrualId: accrual.id,
      amountMinorUnits: accrual.total.minorUnits,
      paidAt: new Date(),
      recordedByCompanyUserId: fixture.companyUserId,
    });

    expect((await payments.findByAccrualId(accrual.id))!.accrualId).toBe(accrual.id);
  });

  describe('listByAccrualIds — the batch a report uses to mark accruals settled', () => {
    it('returns only the settled ones, and an empty array for no ids', async () => {
      const settled = await anAccrual();
      const unsettled = await anAccrual();
      await payments.create({
        accrualId: settled.accrual.id,
        amountMinorUnits: settled.accrual.total.minorUnits,
        paidAt: new Date(),
        recordedByCompanyUserId: settled.fixture.companyUserId,
      });

      const found = await payments.listByAccrualIds([settled.accrual.id, unsettled.accrual.id]);

      expect(found).toHaveLength(1);
      expect(found[0]!.accrualId).toBe(settled.accrual.id);
      expect(await payments.listByAccrualIds([])).toEqual([]);
    });
  });

  it('cannot be erased as a side effect of deleting its accrual — it is a financial record', async () => {
    const { accrual, fixture } = await anAccrual();
    await payments.create({
      accrualId: accrual.id,
      amountMinorUnits: accrual.total.minorUnits,
      paidAt: new Date(),
      recordedByCompanyUserId: fixture.companyUserId,
    });

    // RESTRICT, not CASCADE: proof that a person was paid must not vanish
    // because somebody tidied up the accrual it settles.
    await expect(
      tenantContext.getClient().commissionAccrual.delete({ where: { id: accrual.id } }),
    ).rejects.toThrow();
  });
});
