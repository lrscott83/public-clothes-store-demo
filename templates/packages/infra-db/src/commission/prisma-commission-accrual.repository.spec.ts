import { computeAccrual, money, moneyToDecimalString } from '@store-mgmt/domain';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema, assertAbsentFromPublicSchema } from '../tenant-schema.spec-helper.js';
import { PrismaCommissionAccrualRepository } from './prisma-commission-accrual.repository.js';
import { seedCommissionFixture, wipeCommissionFixture } from './commission-fixtures.spec-helper.js';

/**
 * Integration tests against a REAL, per-suite provisioned tenant Postgres
 * schema (design.md §4, P12 Option C) — same discipline as
 * `prisma-currency.repository.spec.ts`.
 *
 * The property under test is that an accrual, once written, is IMMUTABLE
 * through this adapter. Commission is money owed to a person: a second write
 * must return what is already there rather than restate it against whatever
 * the reference table happens to say today.
 */
describe('PrismaCommissionAccrualRepository', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let repository: PrismaCommissionAccrualRepository;
  let categoryId: string;

  beforeAll(async () => {
    tenantContext = fakeTenantContext(getTenantSchema);
    repository = new PrismaCommissionAccrualRepository(tenantContext);
    const category = await tenantContext.getClient().category.upsert({
      where: { slug: 'commission-accrual-spec' },
      update: {},
      create: { name: 'Commission Accrual Spec', slug: 'commission-accrual-spec', order: 901, active: true },
    });
    categoryId = category.id;
  });

  afterEach(async () => {
    await wipeCommissionFixture(tenantContext.getClient(), categoryId);
  });

  it('persists the accrual with its frozen lines and round-trips every amount, scoped to the tenant schema alone', async () => {
    const fixture = await seedCommissionFixture(tenantContext.getClient(), categoryId);

    const created = await repository.create(accrualFor(fixture, 30000n));

    expect(moneyToDecimalString(created.total)).toBe('600.00');
    expect(created.lines).toHaveLength(1);
    expect(moneyToDecimalString(created.lines[0]!.unitCommission)).toBe('300.00');
    expect(moneyToDecimalString(created.lines[0]!.lineCommission)).toBe('600.00');
    expect(created.accruedAt).toEqual(new Date('2026-07-30T10:00:00.000Z'));

    const reread = await repository.findByOrderId(fixture.orderId);
    expect(moneyToDecimalString(reread!.total)).toBe('600.00');
    expect(reread!.lines[0]!.quantity).toBe(2);
    // The trap this batch's instructions call out by name: a spec that never
    // provisions a tenant schema, or that reaches a master/default client,
    // can still pass for the wrong reason. `public` still holds a same-named
    // legacy `commission_accrual` table until task 14.2's reset.
    await assertAbsentFromPublicSchema('commission_accrual', 'id', created.id);
  });

  function accrualFor(
    fixture: { companyUserId: string; orderId: string; orderLineId: string; productId: string },
    unitMinorUnits: bigint,
    quantity = 2,
  ) {
    return computeAccrual(
      {
        orderId: fixture.orderId,
        attributedCompanyUserId: fixture.companyUserId,
        lines: [{ orderLineId: fixture.orderLineId, productId: fixture.productId, quantity }],
      },
      new Map([[fixture.productId, money(unitMinorUnits, 'MN')]]),
      new Date('2026-07-30T10:00:00.000Z'),
    );
  }

  it('is create-if-absent: a second create returns the ORIGINAL, never restating it', async () => {
    const fixture = await seedCommissionFixture(tenantContext.getClient(), categoryId);
    const first = await repository.create(accrualFor(fixture, 30000n));

    // Same order, but the commission table has since been "edited" upward.
    const second = await repository.create(accrualFor(fixture, 99900n));

    expect(second.id).toBe(first.id);
    expect(moneyToDecimalString(second.total)).toBe('600.00');
    expect(
      await tenantContext.getClient().commissionAccrual.count({ where: { orderId: fixture.orderId } }),
    ).toBe(1);
  });

  it('records unresolved lines separately, and they never reach the total', async () => {
    const fixture = await seedCommissionFixture(tenantContext.getClient(), categoryId);
    const accrual = computeAccrual(
      {
        orderId: fixture.orderId,
        attributedCompanyUserId: fixture.companyUserId,
        lines: [{ orderLineId: fixture.orderLineId, productId: fixture.productId, quantity: 4 }],
      },
      new Map(), // nothing configured
      new Date('2026-07-30T10:00:00.000Z'),
    );

    const created = await repository.create(accrual);

    expect(moneyToDecimalString(created.total)).toBe('0.00');
    expect(created.lines).toHaveLength(0);
    expect(created.unresolved).toEqual([
      { orderLineId: fixture.orderLineId, productId: fixture.productId, quantity: 4 },
    ]);
    // The distinction survives in the DB, not just in memory: a zero-amount
    // resolved line would be indistinguishable from this on any later report.
    expect(await tenantContext.getClient().commissionAccrualLine.count()).toBe(0);
    expect(await tenantContext.getClient().commissionAccrualUnresolved.count()).toBe(1);
  });

  it('finds by id and returns null for an unknown one', async () => {
    const fixture = await seedCommissionFixture(tenantContext.getClient(), categoryId);
    const created = await repository.create(accrualFor(fixture, 30000n));

    expect((await repository.findById(created.id))!.orderId).toBe(fixture.orderId);
    expect(await repository.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await repository.findByOrderId('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  describe('list', () => {
    it('scopes to one agent — the shape a sales_agent reading their own accruals needs', async () => {
      const mine = await seedCommissionFixture(tenantContext.getClient(), categoryId);
      const theirs = await seedCommissionFixture(tenantContext.getClient(), categoryId);
      await repository.create(accrualFor(mine, 30000n));
      await repository.create(accrualFor(theirs, 30000n));

      const scoped = await repository.list({ attributedCompanyUserId: mine.companyUserId });

      expect(scoped).toHaveLength(1);
      expect(scoped[0]!.orderId).toBe(mine.orderId);
    });

    it('filters settled from unsettled', async () => {
      const settled = await seedCommissionFixture(tenantContext.getClient(), categoryId);
      const unsettled = await seedCommissionFixture(tenantContext.getClient(), categoryId);
      const settledAccrual = await repository.create(accrualFor(settled, 30000n));
      await repository.create(accrualFor(unsettled, 30000n));
      await tenantContext.getClient().commissionPayment.create({
        data: {
          accrualId: settledAccrual.id,
          amount: '600.00',
          paidAt: new Date(),
          recordedByCompanyUserId: settled.companyUserId,
        },
      });

      const open = await repository.list({ unsettledOnly: true });
      const closed = await repository.list({ unsettledOnly: false });

      expect(open.map((a) => a.orderId)).toEqual([unsettled.orderId]);
      expect(closed.map((a) => a.orderId)).toEqual([settled.orderId]);
    });

    it('returns everything when no filter is given', async () => {
      const a = await seedCommissionFixture(tenantContext.getClient(), categoryId);
      const b = await seedCommissionFixture(tenantContext.getClient(), categoryId);
      await repository.create(accrualFor(a, 30000n));
      await repository.create(accrualFor(b, 30000n));

      expect(await repository.list()).toHaveLength(2);
    });
  });
});
