import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { USER_ROLES } from '@store-mgmt/domain';
import { PrismaService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { authHeader, createAuthedUser } from './support/auth-e2e-helper.js';

/**
 * Full HTTP lifecycle against the real database.
 *
 * The claim these cases exist to defend is INDEPENDENCE: paying an agent must
 * leave the customer's order untouched. That cannot be shown with mocks — the
 * whole risk is that some write path couples the two, and only the real stack
 * can prove it does not.
 */
describe('Commission (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    const category = await prisma.category.upsert({
      where: { slug: 'commission-e2e' },
      update: {},
      create: { name: 'Commission E2E', slug: 'commission-e2e', order: 905, active: true },
    });
    categoryId = category.id;
  });

  afterEach(async () => {
    await prisma.commissionPayment.deleteMany({});
    await prisma.commissionAccrual.deleteMany({});
    await prisma.productCommissionReference.deleteMany({});
    await prisma.orderLine.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.warehouse.deleteMany({
      where: { stockLevels: { none: {} }, movements: { none: {} }, orders: { none: {} } },
    });
    await prisma.customer.deleteMany({});
    await prisma.companyUser.deleteMany({ where: { createdByCompanyUserId: { not: null } } });
    await prisma.companyUser.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await app.close();
  });

  /** A delivered, attributed order with a commission reference — i.e. an accrual waiting to happen. */
  async function seedAccruedSale() {
    const agent = await createAuthedUser(prisma, USER_ROLES.sales_agent);
    const customerUser = await prisma.user.create({
      data: {
        login: `e2e.${randomUUID()}`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV',
        fullName: 'Cliente E2E',
      },
    });
    const customer = await prisma.customer.create({
      data: { fullName: 'Cliente E2E', userId: customerUser.id },
    });
    const warehouse = await prisma.warehouse.create({ data: { name: `Almacén ${randomUUID()}` } });
    const product = await prisma.product.create({
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
    await prisma.productCommissionReference.create({
      data: { productId: product.id, amountMn: '300.00' },
    });

    const order = await prisma.order.create({
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

    const accrual = await prisma.commissionAccrual.create({
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
    const { token } = await createAuthedUser(prisma, USER_ROLES.owner);
    const before = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    const response = await request(app.getHttpServer())
      .post('/commissions/payments')
      .set(...authHeader(token))
      .send({ accrualId: accrual.id, note: 'Pago quincenal' });

    expect(response.status).toBe(201);
    expect(response.body.amount).toEqual({ amount: '600.00', currency: 'MN' });

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toEqual(before);
    expect(after.status).toBe('delivered');
  });

  it('pays the accrual total, ignoring any amount the caller sends', async () => {
    const { accrual } = await seedAccruedSale();
    const { token } = await createAuthedUser(prisma, USER_ROLES.owner);

    const response = await request(app.getHttpServer())
      .post('/commissions/payments')
      .set(...authHeader(token))
      .send({ accrualId: accrual.id, amount: '999999.00' });

    expect(response.status).toBe(201);
    const stored = await prisma.commissionPayment.findUniqueOrThrow({
      where: { accrualId: accrual.id },
    });
    expect(stored.amount.toString()).toBe('600');
  });

  it('rejects a second payment on the same accrual -> 409, with only one payment stored', async () => {
    const { accrual } = await seedAccruedSale();
    const { token } = await createAuthedUser(prisma, USER_ROLES.owner);
    await request(app.getHttpServer())
      .post('/commissions/payments')
      .set(...authHeader(token))
      .send({ accrualId: accrual.id })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/commissions/payments')
      .set(...authHeader(token))
      .send({ accrualId: accrual.id });

    expect(second.status).toBe(409);
    expect(await prisma.commissionPayment.count({ where: { accrualId: accrual.id } })).toBe(1);
  });

  it('scopes an agent to their own accruals, never a colleague\'s', async () => {
    const mine = await seedAccruedSale();
    await seedAccruedSale();

    const response = await request(app.getHttpServer())
      .get('/commissions/accruals')
      .set(...authHeader(mine.agent.token));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].orderId).toBe(mine.order.id);
  });

  it('shows an owner the whole company', async () => {
    await seedAccruedSale();
    await seedAccruedSale();
    const { token } = await createAuthedUser(prisma, USER_ROLES.owner);

    const response = await request(app.getHttpServer())
      .get('/commissions/accruals')
      .set(...authHeader(token));

    expect(response.body).toHaveLength(2);
  });

  it('reports accrued, paid and outstanding per agent', async () => {
    const { agent, accrual } = await seedAccruedSale();
    const { token } = await createAuthedUser(prisma, USER_ROLES.owner);
    await request(app.getHttpServer())
      .post('/commissions/payments')
      .set(...authHeader(token))
      .send({ accrualId: accrual.id })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/commissions/report')
      .set(...authHeader(token));

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
      .send({ accrualId: accrual.id });

    expect(response.status).toBe(403);
    expect(await prisma.commissionPayment.count()).toBe(0);
  });
});
