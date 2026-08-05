import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { USER_ROLES } from '@store-mgmt/domain';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  authHeader,
  companyIdHeader,
  createAuthedUser,
  createLinkedCompanyMember,
  dropTenantSchemas,
  getTenantServices,
  tenantClientFor,
  type AuthedUser,
  type TenantPrismaClient,
  type TenantServices,
} from './support/auth-e2e-helper.js';

/**
 * Full HTTP lifecycle against a real, provisioned tenant schema (no mocks,
 * no `overrideGuard` — the REAL `TenantContextGuard` resolves every caller
 * from the `X-Company-Id` header, spec: salesops-tenancy "The test
 * exercises the real guard, not a stub"). Every agent/owner minted below
 * shares the SAME company (`companyId`, provisioned once in `beforeAll`) —
 * required for "shows an owner the whole company" below to mean anything.
 *
 * The claim these cases exist to defend is INDEPENDENCE: paying an agent must
 * leave the customer's order untouched. That cannot be shown with mocks — the
 * whole risk is that some write path couples the two, and only the real stack
 * can prove it does not.
 */
describe('Commission (e2e)', () => {
  let app: INestApplication;
  let services: TenantServices;
  let tenant: TenantPrismaClient;
  let companyId: string;
  let categoryId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    services = getTenantServices(moduleFixture);

    const seed = await createAuthedUser(services, USER_ROLES.owner);
    companyId = seed.companyId;
    tenant = tenantClientFor(services, companyId);

    const category = await tenant.category.create({
      data: { name: 'Commission E2E', slug: 'commission-e2e', order: 905, active: true },
    });
    categoryId = category.id;
  });

  afterEach(async () => {
    await tenant.commissionPayment.deleteMany({});
    await tenant.commissionAccrual.deleteMany({});
    await tenant.productCommissionReference.deleteMany({});
    await tenant.orderLine.deleteMany({});
    await tenant.order.deleteMany({});
    await tenant.product.deleteMany({ where: { categoryId } });
    await tenant.warehouse.deleteMany({
      where: { stockLevels: { none: {} }, movements: { none: {} }, orders: { none: {} } },
    });
    await tenant.customer.deleteMany({});
    await tenant.companyUser.deleteMany({ where: { createdByCompanyUserId: { not: null } } });
    // Wipes EVERY CompanyUser in the tenant, including `beforeAll`'s throwaway
    // seed owner — safe, because `companyId`/`tenant` (the schema itself) are
    // independent of any specific CompanyUser row surviving, and every caller
    // used inside an `it()` is minted fresh via `createAuthedUser(..., companyId)`.
    await tenant.companyUser.deleteMany({});
    await services.masterPrisma.user.deleteMany({});
  });

  afterAll(async () => {
    await tenant.category.deleteMany({ where: { id: categoryId } });
    await dropTenantSchemas(services, [companyId]);
    await app.close();
  });

  /** A delivered, attributed order with a commission reference — i.e. an accrual waiting to happen. */
  async function seedAccruedSale(): Promise<{ agent: AuthedUser; order: { id: string }; accrual: { id: string } }> {
    const agent = await createAuthedUser(services, USER_ROLES.sales_agent, companyId);
    const customerUserId = await createLinkedCompanyMember(services, companyId, 'Cliente E2E');
    const customer = await tenant.customer.create({
      data: { fullName: 'Cliente E2E', companyUserId: customerUserId },
    });
    const warehouse = await tenant.warehouse.create({ data: { name: `Almacén ${randomUUID()}` } });
    const product = await tenant.product.create({
      data: {
        name: `Producto ${randomUUID()}`,
        description: 'commission e2e fixture',
        price: '1000.00',
        priceCurrency: 'MN',
        cost: '500.00',
        costCurrency: 'MN',
        categoryId,
        image: 'commission-e2e.png',
        order: 1,
      },
    });
    await tenant.productCommissionReference.create({
      data: { productId: product.id, amountMn: '300.00' },
    });

    const order = await tenant.order.create({
      data: {
        customerId: customer.id,
        customerName: customer.fullName,
        warehouseId: warehouse.id,
        deliveryMode: 'pickup',
        currency: 'MN',
        status: 'delivered',
        subtotal: '1000.00',
        discountTotal: '0.00',
        total: '1000.00',
        orderDate: new Date(),
        attributedCompanyUserId: agent.companyUserId,
        lines: {
          create: [
            {
              productId: product.id,
              productName: product.name,
              categoryName: 'Commission E2E',
              price: '1000.00',
              priceCurrency: 'MN',
              quantity: 2,
              unitFinalPrice: '1000.00',
              lineTotalNative: '2000.00',
              rateApplied: '1.000000',
              rateChannel: 'MN_CASH',
              rateEffectiveFrom: new Date(),
              lineTotalOrder: '2000.00',
            },
          ],
        },
      },
      include: { lines: true },
    });

    const accrual = await tenant.commissionAccrual.create({
      data: {
        orderId: order.id,
        attributedCompanyUserId: agent.companyUserId,
        total: '600.00',
        accruedAt: new Date(),
        lines: {
          create: [
            {
              orderLineId: order.lines[0]!.id,
              productId: product.id,
              quantity: 2,
              unitCommission: '300.00',
              lineCommission: '600.00',
            },
          ],
        },
      },
    });

    return { agent, order, accrual };
  }

  // R14 — the half that only end-to-end can show.
  it('recording a payment leaves the order byte-for-byte unchanged', async () => {
    const { order, accrual } = await seedAccruedSale();
    const { token } = await createAuthedUser(services, USER_ROLES.owner, companyId);
    const before = await tenant.order.findUniqueOrThrow({ where: { id: order.id } });

    const response = await request(app.getHttpServer())
      .post('/commissions/payments')
      .set(...authHeader(token))
      .set(...companyIdHeader(companyId))
      .send({ accrualId: accrual.id, note: 'Pago quincenal' });

    expect(response.status).toBe(201);
    expect(response.body.amount).toEqual({ amount: '600.00', currency: 'MN' });

    const after = await tenant.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toEqual(before);
    expect(after.status).toBe('delivered');
  });

  it('pays the accrual total, ignoring any amount the caller sends', async () => {
    const { accrual } = await seedAccruedSale();
    const { token } = await createAuthedUser(services, USER_ROLES.owner, companyId);

    const response = await request(app.getHttpServer())
      .post('/commissions/payments')
      .set(...authHeader(token))
      .set(...companyIdHeader(companyId))
      .send({ accrualId: accrual.id, amount: '999999.00' });

    expect(response.status).toBe(201);
    const stored = await tenant.commissionPayment.findUniqueOrThrow({
      where: { accrualId: accrual.id },
    });
    expect(stored.amount.toString()).toBe('600');
  });

  it('rejects a second payment on the same accrual -> 409, with only one payment stored', async () => {
    const { accrual } = await seedAccruedSale();
    const { token } = await createAuthedUser(services, USER_ROLES.owner, companyId);
    await request(app.getHttpServer())
      .post('/commissions/payments')
      .set(...authHeader(token))
      .set(...companyIdHeader(companyId))
      .send({ accrualId: accrual.id })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/commissions/payments')
      .set(...authHeader(token))
      .set(...companyIdHeader(companyId))
      .send({ accrualId: accrual.id });

    expect(second.status).toBe(409);
    expect(await tenant.commissionPayment.count({ where: { accrualId: accrual.id } })).toBe(1);
  });

  it('scopes an agent to their own accruals, never a colleague\'s', async () => {
    const mine = await seedAccruedSale();
    await seedAccruedSale();

    const response = await request(app.getHttpServer())
      .get('/commissions/accruals')
      .set(...authHeader(mine.agent.token))
      .set(...companyIdHeader(companyId));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].orderId).toBe(mine.order.id);
  });

  it('shows an owner the whole company', async () => {
    await seedAccruedSale();
    await seedAccruedSale();
    const { token } = await createAuthedUser(services, USER_ROLES.owner, companyId);

    const response = await request(app.getHttpServer())
      .get('/commissions/accruals')
      .set(...authHeader(token))
      .set(...companyIdHeader(companyId));

    expect(response.body).toHaveLength(2);
  });

  it('reports accrued, paid and outstanding per agent', async () => {
    const { agent, accrual } = await seedAccruedSale();
    const { token } = await createAuthedUser(services, USER_ROLES.owner, companyId);
    await request(app.getHttpServer())
      .post('/commissions/payments')
      .set(...authHeader(token))
      .set(...companyIdHeader(companyId))
      .send({ accrualId: accrual.id })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/commissions/report')
      .set(...authHeader(token))
      .set(...companyIdHeader(companyId));

    const row = response.body.find(
      (r: { companyUserId: string }) => r.companyUserId === agent.companyUserId,
    );
    expect(row.totalAccrued.amount).toBe('600.00');
    expect(row.totalPaid.amount).toBe('600.00');
    expect(row.totalOutstanding.amount).toBe('0.00');
  });

  it('denies a sales_agent the settlement route -> 403', async () => {
    const { accrual, agent } = await seedAccruedSale();

    const response = await request(app.getHttpServer())
      .post('/commissions/payments')
      .set(...authHeader(agent.token))
      .set(...companyIdHeader(companyId))
      .send({ accrualId: accrual.id });

    expect(response.status).toBe(403);
    expect(await tenant.commissionPayment.count()).toBe(0);
  });
});
