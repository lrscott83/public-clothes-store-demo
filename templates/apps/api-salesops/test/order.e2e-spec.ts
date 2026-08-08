import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { USER_ROLES } from '@store-mgmt/domain';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  authHeader,
  companyIdHeader,
  createAuthedUser,
  createAuthedWarehouseOperator,
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
 * no `overrideGuard` — the REAL `TenantContextGuard` resolves `admin` from
 * the `X-Company-Id` header, spec: salesops-tenancy "The test exercises the
 * real guard, not a stub") -- same discipline as the domain/infra-db
 * suites. Covers the spec's stock-bridge (reserve/consume/release),
 * currency-derivation, split-payment, and 4-state-machine scenarios
 * end-to-end (design.md decision #3/#4/#8). All requests authenticate as
 * `admin` (super-root -- bypasses both the role matrix and the
 * warehouse-operator scope) so the business-logic assertions stay focused;
 * the dedicated `RolesGuard enforcement` block at the bottom exercises the
 * role matrix + scope itself.
 */
describe('Sales (e2e)', () => {
  let app: INestApplication;
  let services: TenantServices;
  let tenant: TenantPrismaClient;
  let companyId: string;
  let admin: AuthedUser;

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

    services = getTenantServices(moduleFixture);
    // One tenant provisioned once for the whole suite — every fixture below
    // (categories, warehouses, customers, products, admin/agent/operator
    // callers) lives in this SAME schema, re-seeded every test.
    const seed = await createAuthedUser(services, USER_ROLES.admin);
    companyId = seed.companyId;
    tenant = tenantClientFor(services, companyId);
  });

  afterAll(async () => {
    await dropTenantSchemas(services, [companyId]);
    await app.close();
  });

  beforeEach(async () => {
    admin = await createAuthedUser(services, USER_ROLES.admin, companyId);

    const category = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({ name: 'Sales E2E', slug: 'sales-e2e', order: 1 });
    categoryId = category.body.id;

    const warehouse = await request(app.getHttpServer())
      .post('/warehouses')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({ name: 'Depósito Sales E2E' });
    warehouseId = warehouse.body.id;

    // Every Customer now requires an existing tenant CompanyUser
    // (backend-users-roles, D1's `companyUserId` 1:1) — mint one for this
    // fixture, unique login per run since `beforeEach` re-creates it every
    // test.
    const linkedUserId = await createLinkedCompanyMember(services, companyId, 'Cliente Sales E2E');
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'Cliente Sales E2E', userId: linkedUserId });
    customerId = customer.body.id;

    const usdProduct = await request(app.getHttpServer())
      .post('/products')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({ channel: 'MN_CASH', rate: '350.000000', effectiveFrom: '2020-01-01T00:00:00.000Z' });
  });

  afterEach(async () => {
    // Commission first. Delivering an order now records an accrual, and
    // `commission_accrual.order_id` is `ON DELETE RESTRICT` — deliberately, so
    // nobody can erase evidence of what an agent earned by tidying up orders.
    // The consequence lands here: the accrual (and any payment settling it)
    // must go before the order it belongs to.
    await tenant.commissionPayment.deleteMany({});
    await tenant.commissionAccrual.deleteMany({});
    await tenant.productCommissionReference.deleteMany({});
    // `delivery_assignment.order_id` is ON DELETE RESTRICT too (Phase 5) —
    // must clear it (and its carrier, same FK style) BEFORE the order.
    await tenant.deliveryAssignment.deleteMany({});
    await tenant.carrier.deleteMany({});
    // `Order` cascades to `OrderLine`/`OrderPayment`/`SaleCredit` on delete
    // (schema.prisma `onDelete: Cascade`) — one deleteMany clears the whole
    // aggregate tree. `CompanyUser` cascades to `WarehouseOperator` the same way.
    await tenant.order.deleteMany({});
    await tenant.stockMovement.deleteMany({});
    await tenant.stockLevel.deleteMany({});
    await tenant.product.deleteMany({});
    await tenant.category.deleteMany({});
    // `WarehouseOperator.warehouseId` has no `onDelete: Cascade` (only the
    // `companyUserId` side does) — must clear it BEFORE `warehouse.deleteMany`.
    await tenant.warehouseOperator.deleteMany({});
    await tenant.warehouse.deleteMany({});
    await tenant.customer.deleteMany({});
    // `company_user` has NO FK to `app_user` (soft FK by design), so deleting
    // users without this leaves orphan assignments accumulating across runs.
    await tenant.companyUser.deleteMany({});
    await services.masterPrisma.user.deleteMany({});
    await tenant.exchangeRate.deleteMany({});
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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({ productId, warehouseId: intoWarehouseId, type: 'purchase_in', quantity })
      .expect(201);
  }

  async function getStockLevel(productId: string): Promise<{ onHand: string; reserved: string; available: string }> {
    const response = await request(app.getHttpServer())
      .get('/stock')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .query({ productId, warehouseId });
    return response.body;
  }

  it('creates a mixed USD/MN order -> derives USD, converting the MN line', async () => {
    await stockIn(usdProductId, '10');
    await stockIn(mnProductId, '10');

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));

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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/deliver`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('delivered');
    expect(response.body.deliveredAt).not.toBeNull();

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('5');
    expect(level.reserved).toBe('0');
    expect(level.available).toBe('5');
  });

  it('the D5 door: POST /orders/:id/deliver on a delivery-mode order with an in_transit assignment closes it too (Phase 5, design §2B)', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId,
        deliveryMode: 'delivery',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 2 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '200.00', currency: 'USD' } }],
      });
    expect(created.body.deliveryMode).toBe('delivery');

    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/confirm`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .expect(200);

    // Phase 6 shipped, so `POST /delivery/carriers` and
    // `POST /delivery/assignments` both exist now — `test/delivery.e2e-spec.ts`
    // drives them. This test is about the SALES door (`POST /orders/:id/deliver`
    // closing an assignment it did not create), so the fixture is still seeded
    // directly against the tenant client: routing it through Delivery's own
    // endpoints would couple a Sales assertion to Delivery's authorization
    // rules and make a Delivery regression fail here instead of there.
    const carrier = await tenant.carrier.create({ data: { name: 'Transportes D5 E2E' } });
    const assignment = await tenant.deliveryAssignment.create({
      data: { orderId: created.body.id, carrierId: carrier.id, status: 'in_transit', assignedAt: new Date() },
    });

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/deliver`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('delivered');

    const reloadedAssignment = await tenant.deliveryAssignment.findUnique({ where: { id: assignment.id } });
    expect(reloadedAssignment?.status).toBe('delivered');
    expect(reloadedAssignment?.deliveredAt).not.toBeNull();
  });

  it('direct deliver still works unchanged for a delivery-mode order with NO assignment (0 rows is not an error)', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId,
        deliveryMode: 'delivery',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 2 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '200.00', currency: 'USD' } }],
      });

    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/confirm`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/deliver`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('delivered');
  });

  it('cancel from verified releases the reservation, onHand untouched', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/cancel`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));

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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('cancelled');

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('10');
    expect(level.reserved).toBe('0');
  });

  it('PATCH cannot rename the buyer — customerName is not patchable', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({
        customerId,
        warehouseId,
        deliveryMode: 'pickup',
        lines: [{ productId: usdProductId, quantity: 1 }],
        payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
      });
    expect(created.status).toBe(201);
    const originalName = created.body.customerName;

    const patched = await request(app.getHttpServer())
      .patch(`/orders/${created.body.id}`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({ customerName: 'Nombre Falsificado' });

    expect(patched.status).toBe(200);
    expect(patched.body.customerName).toBe(originalName);
  });

  it('PATCH rejects an invalid deliveryMode instead of persisting it verbatim', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({
        customerId,
        warehouseId,
        deliveryMode: 'pickup',
        lines: [{ productId: usdProductId, quantity: 1 }],
        payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
      });

    const patched = await request(app.getHttpServer())
      .patch(`/orders/${created.body.id}`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({ deliveryMode: 'banana' });

    expect(patched.status).toBe(400);

    const found = await request(app.getHttpServer())
      .get(`/orders/${created.body.id}`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));
    expect(found.body.deliveryMode).toBe('pickup');
  });

  it('prices the line from the CATALOG and ignores a price smuggled into the request', async () => {
    // The whole point: a caller could otherwise name its own price for a real
    // product, and that number flows into the line total, the order total, the
    // payment sum and the credit balance.
    await stockIn(usdProductId, '10');

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({
        customerId,
        customerName: 'Nombre Falsificado',
        warehouseId,
        deliveryMode: 'pickup',
        lines: [
          {
            productId: usdProductId,
            quantity: 1,
            price: { amount: '0.01', currency: 'USD' },
            productName: 'Producto Falsificado',
            categoryName: 'Categoría Falsificada',
          },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
      });

    expect(response.status).toBe(201);
    // Catalog price is 100.00 USD — not the 0.01 that was sent.
    expect(response.body.total).toBe('100.00');
    expect(response.body.lines[0].price).toEqual({ amount: '100.00', currency: 'USD' });
    expect(response.body.lines[0].productName).toBe('Producto USD');
    expect(response.body.customerName).not.toBe('Nombre Falsificado');
  });

  it('creation referencing an unknown product -> 400, no order written', async () => {
    const beforeCount = await tenant.order.count();

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({
        customerId,
        warehouseId,
        deliveryMode: 'pickup',
        lines: [{ productId: '22222222-2222-4222-8222-222222222222', quantity: 1 }],
        payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/product .* not found/i);
    expect(await tenant.order.count()).toBe(beforeCount);
  });

  it('creation for an unknown customer -> 400, no order written', async () => {
    await stockIn(usdProductId, '10');
    const beforeCount = await tenant.order.count();

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({
        customerId: '33333333-3333-4333-8333-333333333333',
        warehouseId,
        deliveryMode: 'pickup',
        lines: [{ productId: usdProductId, quantity: 1 }],
        payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/customer .* not found/i);
    expect(await tenant.order.count()).toBe(beforeCount);
  });

  it('creation against a soft-deleted warehouse -> 400, even though it still holds stock', async () => {
    // The eligibility query lists ACTIVE warehouses only. If creation accepted
    // an inactive one, the write would take exactly what the read says does
    // not qualify — and the stock still sitting there would make it look fine.
    const retired = await request(app.getHttpServer())
      .post('/warehouses')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({ name: 'Depósito Retirado E2E' });
    await stockIn(usdProductId, '10', retired.body.id);
    await request(app.getHttpServer())
      .delete(`/warehouses/${retired.body.id}`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .expect(200);

    const beforeCount = await tenant.order.count();
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId: retired.body.id,
        deliveryMode: 'pickup',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 1 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/inactive/i);
    expect(await tenant.order.count()).toBe(beforeCount);
  });

  it('creation against an unknown warehouse -> 400 naming the warehouse, never a stock shortage', async () => {
    const beforeCount = await tenant.order.count();

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send({
        customerId,
        customerName: 'Cliente Sales E2E',
        warehouseId: '11111111-1111-4111-8111-111111111111',
        deliveryMode: 'pickup',
        lines: [
          { productId: usdProductId, productName: 'Producto USD', categoryName: 'Sales E2E', price: { amount: '100.00', currency: 'USD' }, quantity: 1 },
        ],
        payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/not found/i);
    expect(await tenant.order.count()).toBe(beforeCount);
  });

  it('creation against a warehouse that cannot cover the basket -> 409, no order written', async () => {
    await stockIn(usdProductId, '2');
    const beforeCount = await tenant.order.count();

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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
    expect(await tenant.order.count()).toBe(beforeCount);

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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send(body);
    const second = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((await getStockLevel(usdProductId)).reserved).toBe('0');

    // The winner reserves for real.
    await request(app.getHttpServer())
      .post(`/orders/${first.body.id}/confirm`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .expect(200);
    expect((await getStockLevel(usdProductId)).reserved).toBe('5');

    // The loser is rejected at confirm, stays `created`, and reserves nothing.
    const loser = await request(app.getHttpServer())
      .post(`/orders/${second.body.id}/confirm`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));
    expect(loser.status).toBe(409);

    const found = await request(app.getHttpServer())
      .get(`/orders/${second.body.id}`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));
    expect(found.body.status).toBe('created');

    const level = await getStockLevel(usdProductId);
    expect(level.onHand).toBe('5');
    expect(level.reserved).toBe('5');
  });

  it('cross-currency line/payment with no resolvable rate -> 409 RateNotFoundError, no partial commit', async () => {
    const beforeCount = await tenant.order.count();

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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

    const afterCount = await tenant.order.count();
    expect(afterCount).toBe(beforeCount);
  });

  it('confirm/deliver/cancel on an delivered order all -> 409 InvalidOrderStateError, delivered terminal', async () => {
    await stockIn(usdProductId, '10');

    const created = await request(app.getHttpServer())
      .post('/orders')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
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
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .expect(200);
    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/deliver`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId))
      .expect(200);

    const confirmResponse = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/confirm`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));
    const deliverResponse = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/deliver`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));
    const cancelResponse = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/cancel`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));

    expect(confirmResponse.status).toBe(409);
    expect(deliverResponse.status).toBe(409);
    expect(cancelResponse.status).toBe(409);
  });

  it('returns 404 for confirm/deliver/cancel on an unknown order id', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000000';

    const confirmResponse = await request(app.getHttpServer())
      .post(`/orders/${unknownId}/confirm`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));
    const deliverResponse = await request(app.getHttpServer())
      .post(`/orders/${unknownId}/deliver`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));
    const cancelResponse = await request(app.getHttpServer())
      .post(`/orders/${unknownId}/cancel`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));

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
      const { token } = await createAuthedUser(services, USER_ROLES.user, companyId);

      const response = await request(app.getHttpServer())
        .get('/orders')
        .set(...authHeader(token))
        .set(...companyIdHeader(companyId));
      expect(response.status).toBe(403);
    });

    it('stamps the REAL authenticated agent as the attribution, ignoring the payload', async () => {
      await stockIn(usdProductId, '10');
      const agent = await createAuthedUser(services, USER_ROLES.sales_agent, companyId);
      const impostor = await createAuthedUser(services, USER_ROLES.sales_agent, companyId);

      const created = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(agent.token))
        .set(...companyIdHeader(companyId))
        .send({
          customerId,
          warehouseId,
          deliveryMode: 'pickup',
          // A real, well-formed CompanyUser id belonging to someone else — the
          // most convincing form the attack takes. It must still be ignored.
          attributedCompanyUserId: impostor.companyUserId,
          lines: [{ productId: usdProductId, quantity: 1 }],
          payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
        });

      expect(created.status).toBe(201);
      expect(created.body.attributedCompanyUserId).toBe(agent.companyUserId);

      // Persisted, not just echoed back.
      const row = await tenant.order.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.attributedCompanyUserId).toBe(agent.companyUserId);
    });

    it('a sales_agent sees only their OWN orders on GET /orders, and 403s on another agent\'s', async () => {
      await stockIn(usdProductId, '10');
      const mine = await createAuthedUser(services, USER_ROLES.sales_agent, companyId);
      const theirs = await createAuthedUser(services, USER_ROLES.sales_agent, companyId);

      const orderBody = {
        customerId,
        warehouseId,
        deliveryMode: 'pickup',
        lines: [{ productId: usdProductId, quantity: 1 }],
        payments: [{ channel: 'ZELLE', amount: { amount: '100.00', currency: 'USD' } }],
      };
      const myOrder = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(mine.token))
        .set(...companyIdHeader(companyId))
        .send(orderBody)
        .expect(201);
      const theirOrder = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(theirs.token))
        .set(...companyIdHeader(companyId))
        .send(orderBody)
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/orders')
        .set(...authHeader(mine.token))
        .set(...companyIdHeader(companyId));
      expect(list.status).toBe(200);
      const ids = (list.body as { id: string }[]).map((o) => o.id);
      expect(ids).toContain(myOrder.body.id);
      expect(ids).not.toContain(theirOrder.body.id);

      const forbidden = await request(app.getHttpServer())
        .get(`/orders/${theirOrder.body.id}`)
        .set(...authHeader(mine.token))
        .set(...companyIdHeader(companyId));
      expect(forbidden.status).toBe(403);

      // The write path is scoped with the read path, and nothing is written.
      const forbiddenPatch = await request(app.getHttpServer())
        .patch(`/orders/${theirOrder.body.id}`)
        .set(...authHeader(mine.token))
        .set(...companyIdHeader(companyId))
        .send({ deliveryMode: 'delivery' });
      expect(forbiddenPatch.status).toBe(403);

      const untouched = await tenant.order.findUniqueOrThrow({
        where: { id: theirOrder.body.id },
      });
      expect(untouched.deliveryMode).toBe('pickup');
    });

    it('a "sales_operator" caller creates an order -> 201, but cannot deliver it (403 — warehouse-floor action)', async () => {
      await stockIn(usdProductId, '10');
      const { token: salesToken } = await createAuthedUser(services, USER_ROLES.sales_operator, companyId);

      const created = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(salesToken))
        .set(...companyIdHeader(companyId))
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
        .set(...authHeader(salesToken))
        .set(...companyIdHeader(companyId));
      expect(deliverResponse.status).toBe(403);
    });

    it('a "warehouse_operator" scoped to the order\'s OWN warehouse can deliver it -> 200', async () => {
      await stockIn(usdProductId, '10');
      const { token: operatorToken } = await createAuthedWarehouseOperator(services, companyId, warehouseId);

      const created = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(admin.token))
        .set(...companyIdHeader(companyId))
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
        .set(...authHeader(admin.token))
        .set(...companyIdHeader(companyId))
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/deliver`)
        .set(...authHeader(operatorToken))
        .set(...companyIdHeader(companyId));

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('delivered');
    });

    it('a "warehouse_operator" scoped to a DIFFERENT warehouse cannot deliver -> 403', async () => {
      await stockIn(usdProductId, '10');
      const otherWarehouse = await request(app.getHttpServer())
        .post('/warehouses')
        .set(...authHeader(admin.token))
        .set(...companyIdHeader(companyId))
        .send({ name: 'Otro Depósito E2E' });
      const { token: operatorToken } = await createAuthedWarehouseOperator(services, companyId, otherWarehouse.body.id);

      const created = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(admin.token))
        .set(...companyIdHeader(companyId))
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
        .set(...authHeader(admin.token))
        .set(...companyIdHeader(companyId))
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`/orders/${created.body.id}/deliver`)
        .set(...authHeader(operatorToken))
        .set(...companyIdHeader(companyId));

      expect(response.status).toBe(403);
    });

    it('GET /orders filters to the warehouse_operator\'s own warehouse', async () => {
      const otherWarehouse = await request(app.getHttpServer())
        .post('/warehouses')
        .set(...authHeader(admin.token))
        .set(...companyIdHeader(companyId))
        .send({ name: 'Otro Depósito Lista E2E' });

      await stockIn(usdProductId, '10');
      await stockIn(usdProductId, '10', otherWarehouse.body.id);

      const ownOrder = await request(app.getHttpServer())
        .post('/orders')
        .set(...authHeader(admin.token))
        .set(...companyIdHeader(companyId))
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
        .set(...authHeader(admin.token))
        .set(...companyIdHeader(companyId))
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

      const { token: operatorToken } = await createAuthedWarehouseOperator(services, companyId, warehouseId);

      const response = await request(app.getHttpServer())
        .get('/orders')
        .set(...authHeader(operatorToken))
        .set(...companyIdHeader(companyId));

      expect(response.status).toBe(200);
      const ids = response.body.map((o: { id: string }) => o.id);
      expect(ids).toContain(ownOrder.body.id);
      expect(ids).not.toContain(otherOrder.body.id);
    });
  });
});
