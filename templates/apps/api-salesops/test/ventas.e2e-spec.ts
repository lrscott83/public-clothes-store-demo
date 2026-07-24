import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/** Bcrypt hash shape accepted by the domain `passwordHash` invariant — never a real credential. */
const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Full HTTP lifecycle against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as the domain/infra-db suites. Covers the
 * spec's stock-bridge (reserve/consume/release), currency-derivation,
 * split-payment, and 4-state-machine scenarios end-to-end (design.md
 * decision #3/#4/#8).
 */
describe('Ventas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let categoryId: string;
  let warehouseId: string;
  let customerId: string;
  /** USD-priced product, $100.00. */
  let usdProductId: string;
  /** MN-priced product, 350.00 MN — chosen so 1 USD = 350 MN converts to an exact $1.00. */
  let mnProductId: string;
  /** EUR-priced product — used ONLY by the missing-rate scenario (no EUR rate is ever seeded). */
  let eurProductId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const category = await request(app.getHttpServer())
      .post('/categories')
      .send({ name: 'Ventas E2E', slug: 'ventas-e2e', order: 1 });
    categoryId = category.body.id;

    const warehouse = await request(app.getHttpServer())
      .post('/warehouses')
      .send({ name: 'Depósito Ventas E2E' });
    warehouseId = warehouse.body.id;

    // Every Customer now requires an existing User (backend-users-roles,
    // Customer.userId 1:1) — mint one for this fixture, unique login per
    // run since `beforeEach` re-creates it every test.
    const user = await prisma.user.create({
      data: { login: `ventas.e2e.${randomUUID()}`, passwordHash: VALID_HASH, fullName: 'Cliente Ventas E2E' },
    });
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .send({ fullName: 'Cliente Ventas E2E', userId: user.id });
    customerId = customer.body.id;

    const usdProduct = await request(app.getHttpServer())
      .post('/products')
      .send({
        name: 'Producto USD',
        description: 'Producto en USD',
        price: { amount: '100.00', currency: 'USD' },
        cost: { amount: '60.00', currency: 'USD' },
        categoryId,
        image: 'https://example.com/usd.png',
        order: 1,
      });
    usdProductId = usdProduct.body.id;

    const mnProduct = await request(app.getHttpServer())
      .post('/products')
      .send({
        name: 'Producto MN',
        description: 'Producto en MN',
        price: { amount: '350.00', currency: 'MN' },
        cost: { amount: '200.00', currency: 'MN' },
        categoryId,
        image: 'https://example.com/mn.png',
        order: 2,
      });
    mnProductId = mnProduct.body.id;

    const eurProduct = await request(app.getHttpServer())
      .post('/products')
      .send({
        name: 'Producto EUR',
        description: 'Producto en EUR',
        price: { amount: '50.00', currency: 'EUR' },
        cost: { amount: '30.00', currency: 'EUR' },
        categoryId,
        image: 'https://example.com/eur.png',
        order: 3,
      });
    eurProductId = eurProduct.body.id;

    // 1 USD = 350 MN — the ONLY rate seeded; EUR never gets a rate on file
    // (needed by the "missing rate" scenario further below).
    await request(app.getHttpServer())
      .post('/currency/rates')
      .send({ channel: 'MN_EFECTIVO', rate: '350.000000', effectiveFrom: '2020-01-01T00:00:00.000Z' });
  });

  afterEach(async () => {
    // `Order` cascades to `OrderLine`/`OrderPayment`/`SaleCredit` on delete
    // (schema.prisma `onDelete: Cascade`) — one deleteMany clears the whole
    // aggregate tree.
    await prisma.order.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.exchangeRate.deleteMany({});
  });

  async function stockIn(productId: string, quantity: string): Promise<void> {
    await request(app.getHttpServer())
      .post('/stock/movements')
      .send({ productId, warehouseId, type: 'purchase_in', quantity })
      .expect(201);
  }

  async function getStockLevel(productId: string): Promise<{ onHand: string; reserved: string; available: string }> {
    const response = await request(app.getHttpServer())
      .get('/stock')
      .query({ productId, warehouseId });
    return response.body;
  }

  it('creates a mixed USD/MN order -> derives USD, converting the MN line', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .send({
        customerId,
        customerName: 'Cliente Ventas E2E',
        warehouseId,
        deliveryMode: 'recogida',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Ventas E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 1 },
          { productId: mnProductId, productName: 'Producto MN', categoryName: 'Ventas E2E', price: { amount: '350.00', currency: 'MN' }, quantity: 1 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '101.00', currency: 'USD' } }],
      });

    expect(response.status).toBe(201);
    expect(response.body.currency).toBe('USD');
    expect(response.body.status).toBe('creado');
    expect(response.body.total).toBe('101.00');
    expect(response.body.lines).toHaveLength(2);
    const mnLine = response.body.lines.find((l: { productId: string }) => l.productId === mnProductId);
    expect(mnLine.lineTotalOrder).toBe('1.00');
  });

  it('creates a split-payment order that sums exactly to total', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .send({
        customerId,
        customerName: 'Cliente Ventas E2E',
        warehouseId,
        deliveryMode: 'recogida',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Ventas E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 2 },
        ],
        payments: [
          { channel: 'ZELLE', amount: { amount: '150.00', currency: 'USD' } },
          { channel: 'USD_EFECTIVO', amount: { amount: '50.00', currency: 'USD' } },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.total).toBe('200.00');
    expect(response.body.payments).toHaveLength(2);
    const paidSum = response.body.payments.reduce(
      (acc: number, p: { amountInOrderCurrency: string }) => acc + Number(p.amountInOrderCurrency),
      0,
    );
    expect(paidSum).toBeCloseTo(200.0, 2);
  });

  it('confirm reserves stock + freezes the rate, WITHOUT touching onHand', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .send({
        customerId,
        customerName: 'Cliente Ventas E2E',
        warehouseId,
        deliveryMode: 'recogida',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Ventas E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });

    const response = await request(app.getHttpServer()).post(`/orders/${created.body.id}/confirm`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('verificado');
    expect(response.body.verifiedAt).not.toBeNull();

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('10');
    expect(level.reserved).toBe('5');
    expect(level.available).toBe('5');
  });

  it('deliver consumes stock (onHand -= qty, reservation released) and stamps deliveredAt', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .send({
        customerId,
        customerName: 'Cliente Ventas E2E',
        warehouseId,
        deliveryMode: 'recogida',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Ventas E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });
    await request(app.getHttpServer()).post(`/orders/${created.body.id}/confirm`).expect(200);

    const response = await request(app.getHttpServer()).post(`/orders/${created.body.id}/deliver`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('entregado');
    expect(response.body.deliveredAt).not.toBeNull();

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('5');
    expect(level.reserved).toBe('0');
    expect(level.available).toBe('5');
  });

  it('cancel from verificado releases the reservation, onHand untouched', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .send({
        customerId,
        customerName: 'Cliente Ventas E2E',
        warehouseId,
        deliveryMode: 'recogida',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Ventas E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });
    await request(app.getHttpServer()).post(`/orders/${created.body.id}/confirm`).expect(200);

    const response = await request(app.getHttpServer()).post(`/orders/${created.body.id}/cancel`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('cancelado');

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('10');
    expect(level.reserved).toBe('0');
  });

  it('cancel from creado has NO stock effect (nothing was ever reserved)', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .send({
        customerId,
        customerName: 'Cliente Ventas E2E',
        warehouseId,
        deliveryMode: 'recogida',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Ventas E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });
    expect(created.body.status).toBe('creado');

    const response = await request(app.getHttpServer()).post(`/orders/${created.body.id}/cancel`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('cancelado');

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('10');
    expect(level.reserved).toBe('0');
  });

  it('confirm with insufficient stock -> 409, order stays creado, no partial reservation', async () => {
    await stockIn(usdProductId, '2');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .send({
        customerId,
        customerName: 'Cliente Ventas E2E',
        warehouseId,
        deliveryMode: 'recogida',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Ventas E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });

    const response = await request(app.getHttpServer()).post(`/orders/${created.body.id}/confirm`);

    expect(response.status).toBe(409);

    const found = await request(app.getHttpServer()).get(`/orders/${created.body.id}`);
    expect(found.body.status).toBe('creado');

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('2');
    expect(level.reserved).toBe('0');
  });

  it('cross-currency line/payment with no resolvable rate -> 409 RateNotFoundError, no partial commit', async () => {
    const beforeCount = await prisma.order.count();

    const response = await request(app.getHttpServer())
      .post('/orders')
      .send({
        customerId,
        customerName: 'Cliente Ventas E2E',
        warehouseId,
        deliveryMode: 'recogida',
        lines: [
          { productId: eurProductId, productName: 'Producto EUR', categoryName: 'Ventas E2E', price: { amount: '50.00', currency: 'EUR' }, quantity: 1 },
        ],
        payments: [{ channel: 'EUR_EFECTIVO', amount: { amount: '50.00', currency: 'EUR' } }],
      });

    expect(response.status).toBe(409);

    const afterCount = await prisma.order.count();
    expect(afterCount).toBe(beforeCount);
  });

  it('confirm/deliver/cancel on an entregado order all -> 409 InvalidOrderStateError, entregado terminal', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .send({
        customerId,
        customerName: 'Cliente Ventas E2E',
        warehouseId,
        deliveryMode: 'recogida',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Ventas E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });
    await request(app.getHttpServer()).post(`/orders/${created.body.id}/confirm`).expect(200);
    await request(app.getHttpServer()).post(`/orders/${created.body.id}/deliver`).expect(200);

    const confirmResponse = await request(app.getHttpServer()).post(`/orders/${created.body.id}/confirm`);
    const deliverResponse = await request(app.getHttpServer()).post(`/orders/${created.body.id}/deliver`);
    const cancelResponse = await request(app.getHttpServer()).post(`/orders/${created.body.id}/cancel`);

    expect(confirmResponse.status).toBe(409);
    expect(deliverResponse.status).toBe(409);
    expect(cancelResponse.status).toBe(409);
  });

  it('returns 404 for confirm/deliver/cancel on an unknown order id', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000000';

    const confirmResponse = await request(app.getHttpServer()).post(`/orders/${unknownId}/confirm`);
    const deliverResponse = await request(app.getHttpServer()).post(`/orders/${unknownId}/deliver`);
    const cancelResponse = await request(app.getHttpServer()).post(`/orders/${unknownId}/cancel`);

    expect(confirmResponse.status).toBe(404);
    expect(deliverResponse.status).toBe(404);
    expect(cancelResponse.status).toBe(404);
  });
});
