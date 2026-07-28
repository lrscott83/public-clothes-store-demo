import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { USER_ROLES } from '@store-mgmt/domain';
import { PrismaService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { authHeader, createAuthedUser, createAuthedWarehouseOperator } from './support/auth-e2e-helper.js';

/** Bcrypt hash shape accepted by the domain `passwordHash` invariant -- never a real credential. */
const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Full HTTP lifecycle against the real `store_mgmt` Postgres database (no
 * mocks) -- same discipline as the domain/infra-db suites. Covers the
 * spec's stock-bridge (reserve/consume/release), currency-derivation,
 * split-payment, and 4-state-machine scenarios end-to-end (design.md
 * decision #3/#4/#8). All requests authenticate as `admin` (super-root --
 * bypasses both the role matrix and the warehouse-operator scope) so the
 * business-logic assertions stay focused; the dedicated `RolesGuard
 * enforcement` block at the bottom exercises the role matrix + scope itself.
 */
describe('Sales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

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
    adminToken = (await createAuthedUser(prisma, USER_ROLES.admin)).token;

    const category = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(adminToken))
      .send({ name: 'Sales E2E', slug: 'sales-e2e', order: 1 });
    categoryId = category.body.id;

    const warehouse = await request(app.getHttpServer())
      .post('/warehouses')
      .set(...authHeader(adminToken))
      .send({ name: 'Depósito Sales E2E' });
    warehouseId = warehouse.body.id;

    // Every Customer now requires an existing User (backend-users-roles,
    // Customer.userId 1:1) — mint one for this fixture, unique login per
    // run since `beforeEach` re-creates it every test.
    const user = await prisma.user.create({
      data: { login: `sales.e2e.${randomUUID()}`, passwordHash: VALID_HASH, fullName: 'Cliente Sales E2E' },
    });
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(adminToken))
      .send({ fullName: 'Cliente Sales E2E', userId: user.id });
    customerId = customer.body.id;

    const usdProduct = await request(app.getHttpServer())
      .post('/products')
      .set(...authHeader(adminToken))
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
      .set(...authHeader(adminToken))
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
      .set(...authHeader(adminToken))
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
      .set(...authHeader(adminToken))
      .send({ channel: 'MN_CASH', rate: '350.000000', effectiveFrom: '2020-01-01T00:00:00.000Z' });
  });

  afterEach(async () => {
    // `Order` cascades to `OrderLine`/`OrderPayment`/`SaleCredit` on delete
    // (schema.prisma `onDelete: Cascade`) — one deleteMany clears the whole
    // aggregate tree. `User` cascades to `WarehouseOperator` the same way.
    await prisma.order.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    // `WarehouseOperator.warehouseId` has no `onDelete: Cascade` (only the
    // `userId` side does) — must clear it BEFORE `warehouse.deleteMany`.
    await prisma.warehouseOperator.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.customer.deleteMany({});
    // `company_user` has NO FK to `app_user` (soft FK by design), so deleting
    // users without this leaves orphan assignments accumulating across runs.
    await prisma.companyUser.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.exchangeRate.deleteMany({});
  });

  /**
   * Seeds stock so an order can be CREATED at all: since the availability
   * invariant, `POST /orders` rejects a warehouse that cannot cover the whole
   * basket. Defaults to the suite's main warehouse; pass `intoWarehouseId`
   * for the multi-warehouse cases.
   */
  async function stockIn(
    productId: string,
    quantity: string,
    intoWarehouseId: string = warehouseId,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post('/stock/movements')
      .set(...authHeader(adminToken))
      .send({ productId, warehouseId: intoWarehouseId, type: 'purchase_in', quantity })
      .expect(201);
  }

  async function getStockLevel(productId: string): Promise<{ onHand: string; reserved: string; available: string }> {
    const response = await request(app.getHttpServer())
      .get('/stock')
      .set(...authHeader(adminToken))
      .query({ productId, warehouseId });
    return response.body;
  }

  it('creates a mixed USD/MN order -> derives USD, converting the MN line', async () => {
    await stockIn(usdProductId, '10');
    await stockIn(mnProductId, '10');

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(adminToken))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId,
        deliveryMode: 'pickup',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 1 },
          { productId: mnProductId, productName: 'Producto MN', categoryName: 'Sales E2E', price: { amount: '350.00', currency: 'MN' }, quantity: 1 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '101.00', currency: 'USD' } }],
      });

    expect(response.status).toBe(201);
    expect(response.body.currency).toBe('USD');
    expect(response.body.status).toBe('created');
    expect(response.body.total).toBe('101.00');
    expect(response.body.lines).toHaveLength(2);
    const mnLine = response.body.lines.find((l: { productId: string }) => l.productId === mnProductId);
    expect(mnLine.lineTotalOrder).toBe('1.00');
  });

  it('creates a split-payment order that sums exactly to total', async () => {
    await stockIn(usdProductId, '10');

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(adminToken))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId,
        deliveryMode: 'pickup',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 2 },
        ],
        payments: [
          { channel: 'ZELLE', amount: { amount: '150.00', currency: 'USD' } },
          { channel: 'USD_CASH', amount: { amount: '50.00', currency: 'USD' } },
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
      .set(...authHeader(adminToken))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId,
        deliveryMode: 'pickup',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/confirm`)
      .set(...authHeader(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('verified');
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
      .set(...authHeader(adminToken))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId,
        deliveryMode: 'pickup',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });
    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/confirm`)
      .set(...authHeader(adminToken))
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/deliver`)
      .set(...authHeader(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('delivered');
    expect(response.body.deliveredAt).not.toBeNull();

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('5');
    expect(level.reserved).toBe('0');
    expect(level.available).toBe('5');
  });

  it('cancel from verified releases the reservation, onHand untouched', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(adminToken))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId,
        deliveryMode: 'pickup',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });
    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/confirm`)
      .set(...authHeader(adminToken))
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/cancel`)
      .set(...authHeader(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('cancelled');

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('10');
    expect(level.reserved).toBe('0');
  });

  it('cancel from created has NO stock effect (nothing was ever reserved)', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(adminToken))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId,
        deliveryMode: 'pickup',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });
    expect(created.body.status).toBe('created');

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/cancel`)
      .set(...authHeader(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('cancelled');

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('10');
    expect(level.reserved).toBe('0');
  });

  it('creation against a warehouse that cannot cover the basket -> 409, no order written', async () => {
    await stockIn(usdProductId, '2');
    const beforeCount = await prisma.order.count();

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(adminToken))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId,
        deliveryMode: 'pickup',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });

    expect(response.status).toBe(409);
    expect(await prisma.order.count()).toBe(beforeCount);

    // Nothing was held while checking.
    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('2');
    expect(level.reserved).toBe('0');
  });

  it('creation checks availability but RESERVES nothing — two orders may be created against the same stock, and confirm is the real gate', async () => {
    // Pins the accepted race deliberately. The creation-time check is a
    // fast-fail so an order is never written against a warehouse that plainly
    // cannot fill it — it is NOT a hold. Both orders below are created
    // legitimately; whoever confirms first gets the stock, and the loser gets
    // a 409 at confirm with its order untouched. If someone later "fixes"
    // this into a reservation at creation, this test is what should stop them.
    await stockIn(usdProductId, '5');

    const body = {
      customerId,
      customerName: 'Cliente Sales E2E',
      warehouseId,
      deliveryMode: 'pickup',
      lines: [
        { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
      ],
      payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
    };

    const first = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(adminToken))
      .send(body);
    const second = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(adminToken))
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((await getStockLevel(usdProductId)).reserved).toBe('0');

    // The winner reserves for real.
    await request(app.getHttpServer())
      .post(`/orders/${first.body.id}/confirm`)
      .set(...authHeader(adminToken))
      .expect(200);
    expect((await getStockLevel(usdProductId)).reserved).toBe('5');

    // The loser is rejected at confirm, stays `created`, and reserves nothing.
    const loser = await request(app.getHttpServer())
      .post(`/orders/${second.body.id}/confirm`)
      .set(...authHeader(adminToken));
    expect(loser.status).toBe(409);

    const found = await request(app.getHttpServer())
      .get(`/orders/${second.body.id}`)
      .set(...authHeader(adminToken));
    expect(found.body.status).toBe('created');

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('5');
    expect(level.reserved).toBe('5');
  });

  it('cross-currency line/payment with no resolvable rate -> 409 RateNotFoundError, no partial commit', async () => {
    const beforeCount = await prisma.order.count();

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(adminToken))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId,
        deliveryMode: 'pickup',
        lines: [
          { productId: eurProductId, productName: 'Producto EUR', categoryName: 'Sales E2E', price: { amount: '50.00', currency: 'EUR' }, quantity: 1 },
        ],
        payments: [{ channel: 'EUR_CASH', amount: { amount: '50.00', currency: 'EUR' } }],
      });

    expect(response.status).toBe(409);

    const afterCount = await prisma.order.count();
    expect(afterCount).toBe(beforeCount);
  });

  it('confirm/deliver/cancel on an delivered order all -> 409 InvalidOrderStateError, delivered terminal', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(adminToken))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId,
        deliveryMode: 'pickup',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 5 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '500.00', currency: 'USD' } }],
      });
    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/confirm`)
      .set(...authHeader(adminToken))
      .expect(200);
    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/deliver`)
      .set(...authHeader(adminToken))
      .expect(200);

    const confirmResponse = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/confirm`)
      .set(...authHeader(adminToken));
    const deliverResponse = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/deliver`)
      .set(...authHeader(adminToken));
    const cancelResponse = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/cancel`)
      .set(...authHeader(adminToken));

    expect(confirmResponse.status).toBe(409);
    expect(deliverResponse.status).toBe(409);
    expect(cancelResponse.status).toBe(409);
  });

  it('returns 404 for confirm/deliver/cancel on an unknown order id', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000000';

    const confirmResponse = await request(app.getHttpServer())
      .post(`/orders/${unknownId}/confirm`)
      .set(...authHeader(adminToken));
    const deliverResponse = await request(app.getHttpServer())
      .post(`/orders/${unknownId}/deliver`)
      .set(...authHeader(adminToken));
    const cancelResponse = await request(app.getHttpServer())
      .post(`/orders/${unknownId}/cancel`)
      .set(...authHeader(adminToken));

    expect(confirmResponse.status).toBe(404);
    expect(deliverResponse.status).toBe(404);
    expect(cancelResponse.status).toBe(404);
  });

  describe('RolesGuard enforcement + warehouse_operator scope', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const response = await request(app.getHttpServer()).get('/orders');
      expect(response.status).toBe(401);
    });

    it('rejects a plain "user" caller with 403', async () => {
      const { token } = await createAuthedUser(prisma, USER_ROLES.user);

      const response = await request(app.getHttpServer()).get('/orders').set(...authHeader(token));
      expect(response.status).toBe(403);
    });

    it('a "sales_operator" caller creates an order -> 201, but cannot deliver it (403 — warehouse-floor action)', async () => {
      await stockIn(usdProductId, '10');
      const { token: salesToken } = await createAuthedUser(prisma, USER_ROLES.sales_operator);

      const created = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(salesToken))
        .send({
          customerId,
          customerName: 'Cliente Sales E2E',
          warehouseId,
          deliveryMode: 'pickup',
          lines: [
            { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 1 },
          ],
          payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
        });
      expect(created.status).toBe(201);

      const deliverResponse = await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/deliver`)
        .set(...authHeader(salesToken));
      expect(deliverResponse.status).toBe(403);
    });

    it('a "warehouse_operator" scoped to the order\'s OWN warehouse can deliver it -> 200', async () => {
      await stockIn(usdProductId, '10');
      const { token: operatorToken } = await createAuthedWarehouseOperator(prisma, warehouseId);

      const created = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(adminToken))
        .send({
          customerId,
          customerName: 'Cliente Sales E2E',
          warehouseId,
          deliveryMode: 'pickup',
          lines: [
            { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 1 },
          ],
          payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
        });
      await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/confirm`)
        .set(...authHeader(adminToken))
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/deliver`)
        .set(...authHeader(operatorToken));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('delivered');
    });

    it('a "warehouse_operator" scoped to a DIFFERENT warehouse cannot deliver -> 403', async () => {
      await stockIn(usdProductId, '10');
      const otherWarehouse = await request(app.getHttpServer())
        .post('/warehouses')
        .set(...authHeader(adminToken))
        .send({ name: 'Otro Depósito E2E' });
      const { token: operatorToken } = await createAuthedWarehouseOperator(prisma, otherWarehouse.body.id);

      const created = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(adminToken))
        .send({
          customerId,
          customerName: 'Cliente Sales E2E',
          warehouseId,
          deliveryMode: 'pickup',
          lines: [
            { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 1 },
          ],
          payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
        });
      await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/confirm`)
        .set(...authHeader(adminToken))
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/deliver`)
        .set(...authHeader(operatorToken));

      expect(response.status).toBe(403);
    });

    it('GET /orders filters to the warehouse_operator\'s own warehouse', async () => {
      const otherWarehouse = await request(app.getHttpServer())
        .post('/warehouses')
        .set(...authHeader(adminToken))
        .send({ name: 'Otro Depósito Lista E2E' });

      await stockIn(usdProductId, '10');
      await stockIn(usdProductId, '10', otherWarehouse.body.id);

      const ownOrder = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(adminToken))
        .send({
          customerId,
          customerName: 'Cliente Sales E2E',
          warehouseId,
          deliveryMode: 'pickup',
          lines: [
            { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 1 },
          ],
          payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
        });
      const otherOrder = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(adminToken))
        .send({
          customerId,
          customerName: 'Cliente Sales E2E',
          warehouseId: otherWarehouse.body.id,
          deliveryMode: 'pickup',
          lines: [
            { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 1 },
          ],
          payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
        });

      const { token: operatorToken } = await createAuthedWarehouseOperator(prisma, warehouseId);

      const response = await request(app.getHttpServer()).get('/orders').set(...authHeader(operatorToken));

      expect(response.status).toBe(200);
      const ids = response.body.map((o: { id: string }) => o.id);
      expect(ids).toContain(ownOrder.body.id);
      expect(ids).not.toContain(otherOrder.body.id);
    });
  });
});
