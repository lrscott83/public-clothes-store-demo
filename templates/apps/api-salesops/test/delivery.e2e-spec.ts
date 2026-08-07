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
 * Full HTTP lifecycle for `/delivery/*` against a real, provisioned tenant
 * schema — the REAL guard chain, the REAL `DeliveryModule` wiring, the REAL
 * `DeliveryService`, the REAL Prisma adapters, no `useValue` anywhere.
 *
 * WHY THIS FILE EXISTS: the module had ZERO e2e coverage. Its controller
 * specs do use supertest and the real guards, but they inject
 * `{ provide: DeliveryService, useValue: mock }` — so nothing exercised
 * whether `DeliveryModule` can resolve its own providers at all, and nothing
 * exercised the service's scope logic through the stack. That is precisely
 * why a round-1 authorization bypass sat inside a green suite. Every sibling
 * module (`order`, `warehouse`, `product`, `commission`, …) ships one of
 * these; Delivery did not.
 *
 * Most requests authenticate as `admin` (bypasses the role matrix and the
 * warehouse scope) so the business assertions stay focused; the dedicated
 * `warehouse_operator scope` block at the bottom exercises the scope itself,
 * end to end, across two warehouses.
 */
describe('Delivery (e2e)', () => {
  let app: INestApplication;
  let services: TenantServices;
  let tenant: TenantPrismaClient;
  let companyId: string;
  let admin: AuthedUser;

  let categoryId: string;
  let warehouseAId: string;
  let warehouseBId: string;
  let customerId: string;
  let productId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    services = getTenantServices(moduleFixture);
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

    const category = await asAdmin('post', '/categories').send({
      name: 'Delivery E2E',
      slug: 'delivery-e2e',
      order: 1,
    });
    categoryId = category.body.id;

    const warehouseA = await asAdmin('post', '/warehouses').send({ name: 'Depósito A' });
    warehouseAId = warehouseA.body.id;
    const warehouseB = await asAdmin('post', '/warehouses').send({ name: 'Depósito B' });
    warehouseBId = warehouseB.body.id;

    const linkedUserId = await createLinkedCompanyMember(services, companyId, 'Cliente Delivery E2E');
    const customer = await asAdmin('post', '/customers').send({
      fullName: 'Cliente Delivery E2E',
      userId: linkedUserId,
    });
    customerId = customer.body.id;

    const product = await asAdmin('post', '/products').send({
      name: 'Producto Delivery',
      description: 'Producto de prueba',
      price: { amount: '100.00', currency: 'USD' },
      cost: { amount: '60.00', currency: 'USD' },
      categoryId,
      image: 'https://example.com/p.png',
      order: 1,
    });
    productId = product.body.id;

    await asAdmin('post', '/currency/rates').send({
      channel: 'MN_CASH',
      rate: '350.000000',
      effectiveFrom: '2020-01-01T00:00:00.000Z',
    });
  });

  afterEach(async () => {
    await tenant.commissionPayment.deleteMany({});
    await tenant.commissionAccrual.deleteMany({});
    await tenant.productCommissionReference.deleteMany({});
    await tenant.deliveryAssignment.deleteMany({});
    await tenant.carrierWarehouse.deleteMany({});
    await tenant.carrier.deleteMany({});
    await tenant.order.deleteMany({});
    await tenant.stockMovement.deleteMany({});
    await tenant.stockLevel.deleteMany({});
    await tenant.product.deleteMany({});
    await tenant.category.deleteMany({});
    await tenant.warehouseOperator.deleteMany({});
    await tenant.warehouse.deleteMany({});
    await tenant.customer.deleteMany({});
    await tenant.companyUser.deleteMany({});
    await services.masterPrisma.user.deleteMany({});
    await tenant.exchangeRate.deleteMany({});
  });

  function asAdmin(method: 'get' | 'post' | 'patch' | 'delete', url: string) {
    return request(app.getHttpServer())
      [method](url)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(companyId));
  }

  function asUser(
    user: AuthedUser,
    method: 'get' | 'post' | 'patch' | 'delete',
    url: string,
  ) {
    return request(app.getHttpServer())
      [method](url)
      .set(...authHeader(user.token))
      .set(...companyIdHeader(companyId));
  }

  async function stockIn(intoWarehouseId: string, quantity = '20'): Promise<void> {
    await asAdmin('post', '/stock/movements')
      .send({ productId, warehouseId: intoWarehouseId, type: 'purchase_in', quantity })
      .expect(201);
  }

  async function createCarrier(name = 'Transportes E2E'): Promise<string> {
    const response = await asAdmin('post', '/delivery/carriers').send({ name });
    expect(response.status).toBe(201);
    return response.body.id;
  }

  /** Creates an order and, unless `confirm: false`, walks it to `verified` through the REAL Sales endpoints. */
  async function createOrder(
    options: { warehouseId?: string; deliveryMode?: 'delivery' | 'pickup'; confirm?: boolean } = {},
  ): Promise<string> {
    const targetWarehouse = options.warehouseId ?? warehouseAId;
    await stockIn(targetWarehouse);
    const created = await asAdmin('post', '/orders').send({
      customerId,
      customerName: 'Cliente Delivery E2E',
      warehouseId: targetWarehouse,
      deliveryMode: options.deliveryMode ?? 'delivery',
      lines: [
        {
          productId,
          productName: 'Producto Delivery',
          categoryName: 'Delivery E2E',
          price: { amount: '100.00', currency: 'USD' },
          quantity: 2,
        },
      ],
      payments: [{ channel: 'ZELLE', amount: { amount: '200.00', currency: 'USD' } }],
    });
    expect(created.status).toBe(201);
    if (options.confirm !== false) {
      await asAdmin('post', `/orders/${created.body.id}/confirm`).expect(200);
    }
    return created.body.id;
  }

  /**
   * The DI check the controller specs structurally cannot make: they replace
   * `DeliveryService` with a mock, so a `DeliveryModule` that cannot resolve
   * its own providers would still give them a green suite.
   */
  it('resolves the whole DeliveryModule through real DI — every endpoint answers', async () => {
    const carriers = await asAdmin('get', '/delivery/carriers');
    const assignments = await asAdmin('get', '/delivery/assignments');
    const capacity = await asAdmin('get', '/delivery/capacity');

    expect(carriers.status).toBe(200);
    expect(assignments.status).toBe(200);
    expect(capacity.status).toBe(200);
    expect(capacity.body).toHaveProperty('ordersAwaitingCarrier');
    // CLASS G2: the window that actually bounded the throughput read is
    // reported, so a bounded number is never presented as all-time.
    expect(capacity.body.throughputWindow.from).toEqual(expect.any(String));
  });

  describe('POST /delivery/assignments', () => {
    it('assigns a carrier to a verified delivery order — 201, in_transit', async () => {
      const carrierId = await createCarrier();
      const orderId = await createOrder();

      const response = await asAdmin('post', '/delivery/assignments').send({ orderId, carrierId });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('in_transit');
      expect(response.body.deliveredAt).toBeNull();
      const persisted = await tenant.deliveryAssignment.findUnique({ where: { orderId } });
      expect(persisted?.carrierId).toBe(carrierId);
    });

    it('rejects a PICKUP order with 409 — pickup MUST NEVER receive an assignment', async () => {
      const carrierId = await createCarrier();
      const orderId = await createOrder({ deliveryMode: 'pickup' });

      const response = await asAdmin('post', '/delivery/assignments').send({ orderId, carrierId });

      expect(response.status).toBe(409);
      expect(await tenant.deliveryAssignment.findUnique({ where: { orderId } })).toBeNull();
    });

    it('rejects a NON-VERIFIED order with 409 — an assignment on one poisons capacity permanently', async () => {
      const carrierId = await createCarrier();
      const orderId = await createOrder({ confirm: false });

      const response = await asAdmin('post', '/delivery/assignments').send({ orderId, carrierId });

      expect(response.status).toBe(409);
      expect(await tenant.deliveryAssignment.findUnique({ where: { orderId } })).toBeNull();
    });

    it('rejects an UNKNOWN order with 404, never a raw 500', async () => {
      const carrierId = await createCarrier();

      const response = await asAdmin('post', '/delivery/assignments').send({
        orderId: '00000000-0000-4000-8000-0000000000aa',
        carrierId,
      });

      expect(response.status).toBe(404);
    });

    it('rejects a DUPLICATE assignment with 409 — the UNIQUE index is the guarantee', async () => {
      const carrierId = await createCarrier();
      const otherCarrierId = await createCarrier('Transportes E2E 2');
      const orderId = await createOrder();
      await asAdmin('post', '/delivery/assignments').send({ orderId, carrierId }).expect(201);

      const response = await asAdmin('post', '/delivery/assignments').send({
        orderId,
        carrierId: otherCarrierId,
      });

      expect(response.status).toBe(409);
    });

    /** CLASS A, through the whole stack — not the boundary helper in isolation. */
    it('rejects a malformed uuid with 400, never letting it reach Postgres as a P2007 500', async () => {
      const carrierId = await createCarrier();

      const response = await asAdmin('post', '/delivery/assignments').send({
        orderId: 'not-a-uuid',
        carrierId,
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /delivery/assignments/:id/deliver', () => {
    it('marks the assignment delivered AND drives the order to delivered — one transition, one path', async () => {
      const carrierId = await createCarrier();
      const orderId = await createOrder();
      const assignment = await asAdmin('post', '/delivery/assignments').send({ orderId, carrierId });

      const response = await asAdmin('post', `/delivery/assignments/${assignment.body.id}/deliver`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('delivered');
      expect(response.body.deliveredAt).not.toBeNull();
      const order = await asAdmin('get', `/orders/${orderId}`);
      expect(order.body.status).toBe('delivered');
    });

    it('409s a second deliver — delivered is terminal', async () => {
      const carrierId = await createCarrier();
      const orderId = await createOrder();
      const assignment = await asAdmin('post', '/delivery/assignments').send({ orderId, carrierId });
      await asAdmin('post', `/delivery/assignments/${assignment.body.id}/deliver`).expect(200);

      const response = await asAdmin('post', `/delivery/assignments/${assignment.body.id}/deliver`);

      expect(response.status).toBe(409);
    });

    it('404s an unknown assignment id', async () => {
      const response = await asAdmin(
        'post',
        '/delivery/assignments/00000000-0000-4000-8000-0000000000cc/deliver',
      );

      expect(response.status).toBe(404);
    });
  });

  describe('carrier coverage', () => {
    it('adds coverage, surfaces it on the carrier read, then removes it', async () => {
      const carrierId = await createCarrier();

      const added = await asAdmin('post', `/delivery/carriers/${carrierId}/warehouses`).send({
        warehouseId: warehouseAId,
      });
      expect(added.status).toBe(201);

      const covering = await asAdmin('get', `/delivery/carriers?warehouseId=${warehouseAId}`);
      expect(covering.body.find((c: { id: string }) => c.id === carrierId).coversWarehouse).toBe(true);

      const notCovering = await asAdmin('get', `/delivery/carriers?warehouseId=${warehouseBId}`);
      expect(notCovering.body.find((c: { id: string }) => c.id === carrierId).coversWarehouse).toBe(
        false,
      );

      const removed = await asAdmin(
        'delete',
        `/delivery/carriers/${carrierId}/warehouses/${warehouseAId}`,
      );
      expect(removed.status).toBe(200);
      expect(await tenant.carrierWarehouse.count({ where: { carrierId } })).toBe(0);
    });

    it('409s a duplicate coverage pair and 404s an unknown warehouse', async () => {
      const carrierId = await createCarrier();
      await asAdmin('post', `/delivery/carriers/${carrierId}/warehouses`)
        .send({ warehouseId: warehouseAId })
        .expect(201);

      const duplicate = await asAdmin('post', `/delivery/carriers/${carrierId}/warehouses`).send({
        warehouseId: warehouseAId,
      });
      const unknownWarehouse = await asAdmin('post', `/delivery/carriers/${carrierId}/warehouses`).send({
        warehouseId: '00000000-0000-4000-8000-0000000000ee',
      });

      expect(duplicate.status).toBe(409);
      expect(unknownWarehouse.status).toBe(404);
    });

    /** CLASS C — unknown and INACTIVE must mean the same thing, as `CarrierNotFoundError`'s message says. */
    it('404s coverage for a SOFT-DELETED carrier, exactly as for an unknown one', async () => {
      const carrierId = await createCarrier();
      await asAdmin('delete', `/delivery/carriers/${carrierId}`).expect(200);

      const response = await asAdmin('post', `/delivery/carriers/${carrierId}/warehouses`).send({
        warehouseId: warehouseAId,
      });

      expect(response.status).toBe(404);
    });
  });

  /**
   * CLASS C — `active` has two writers and one invariant. `PATCH
   * {"active": false}` was a one-line bypass of the guard `DELETE` enforced.
   */
  describe('the open-assignment invariant guards BOTH writers of `active`', () => {
    async function carrierWithOpenAssignment(): Promise<string> {
      const carrierId = await createCarrier();
      const orderId = await createOrder();
      await asAdmin('post', '/delivery/assignments').send({ orderId, carrierId }).expect(201);
      return carrierId;
    }

    it('DELETE /delivery/carriers/:id -> 409 while in_transit assignments remain', async () => {
      const carrierId = await carrierWithOpenAssignment();

      const response = await asAdmin('delete', `/delivery/carriers/${carrierId}`);

      expect(response.status).toBe(409);
      expect((await tenant.carrier.findUnique({ where: { id: carrierId } }))?.active).toBe(true);
    });

    it('PATCH /delivery/carriers/:id {"active": false} -> 409 too, not a bypass', async () => {
      const carrierId = await carrierWithOpenAssignment();

      const response = await asAdmin('patch', `/delivery/carriers/${carrierId}`).send({
        active: false,
      });

      expect(response.status).toBe(409);
      expect((await tenant.carrier.findUnique({ where: { id: carrierId } }))?.active).toBe(true);
    });

    it('PATCH of any OTHER field still works on the same carrier', async () => {
      const carrierId = await carrierWithOpenAssignment();

      const response = await asAdmin('patch', `/delivery/carriers/${carrierId}`).send({
        name: 'Renombrado',
      });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Renombrado');
    });

    it('404s PATCH/DELETE on a well-formed but UNKNOWN uuid, never a 500', async () => {
      const unknown = '00000000-0000-4000-8000-0000000000ff';

      const patched = await asAdmin('patch', `/delivery/carriers/${unknown}`).send({ name: 'x' });
      const deleted = await asAdmin('delete', `/delivery/carriers/${unknown}`);

      expect(patched.status).toBe(404);
      expect(deleted.status).toBe(404);
    });
  });

  /**
   * CLASS E/F — cancelling an ASSIGNED order must close its assignment as
   * `cancelled` in the same transaction. Without it the row stayed
   * `in_transit` forever: the carrier read BUSY in every capacity snapshot,
   * no API path could close it, and (since the deactivation guard became
   * real) it would block that carrier's deactivation permanently.
   */
  describe('POST /orders/:id/cancel closes an open assignment', () => {
    it('closes it as cancelled — never delivered, deliveredAt stays null', async () => {
      const carrierId = await createCarrier();
      const orderId = await createOrder();
      const assignment = await asAdmin('post', '/delivery/assignments').send({ orderId, carrierId });

      const cancelled = await asAdmin('post', `/orders/${orderId}/cancel`);

      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe('cancelled');
      const reloaded = await tenant.deliveryAssignment.findUnique({
        where: { id: assignment.body.id },
      });
      expect(reloaded?.status).toBe('cancelled');
      // Closing it as `delivered` would make `computeCarrierThroughput` count
      // a delivery that never happened — explicitly rejected.
      expect(reloaded?.deliveredAt).toBeNull();
    });

    it('frees the carrier for deactivation again', async () => {
      const carrierId = await createCarrier();
      const orderId = await createOrder();
      await asAdmin('post', '/delivery/assignments').send({ orderId, carrierId }).expect(201);
      await asAdmin('post', `/orders/${orderId}/cancel`).expect(200);

      const response = await asAdmin('delete', `/delivery/carriers/${carrierId}`);

      expect(response.status).toBe(200);
    });

    it('is a no-op — never a 500 — for a pickup order with no assignment at all', async () => {
      const orderId = await createOrder({ deliveryMode: 'pickup' });

      const response = await asAdmin('post', `/orders/${orderId}/cancel`);

      expect(response.status).toBe(200);
    });
  });

  /**
   * CLASS D — the scope, through the full stack. This is what the mocked
   * controller specs structurally could not exercise: they replace the very
   * service the scope lives in.
   */
  describe('warehouse_operator scope', () => {
    let operatorA: AuthedUser;
    let orderInA: string;
    let orderInB: string;
    let carrierId: string;

    beforeEach(async () => {
      operatorA = await createAuthedWarehouseOperator(services, companyId, warehouseAId);
      carrierId = await createCarrier();
      orderInA = await createOrder({ warehouseId: warehouseAId });
      orderInB = await createOrder({ warehouseId: warehouseBId });
    });

    it('403s assigning a carrier to ANOTHER warehouse’s order', async () => {
      const response = await asUser(operatorA, 'post', '/delivery/assignments').send({
        orderId: orderInB,
        carrierId,
      });

      expect(response.status).toBe(403);
      expect(await tenant.deliveryAssignment.findUnique({ where: { orderId: orderInB } })).toBeNull();
    });

    it('allows assigning to their OWN warehouse’s order', async () => {
      const response = await asUser(operatorA, 'post', '/delivery/assignments').send({
        orderId: orderInA,
        carrierId,
      });

      expect(response.status).toBe(201);
    });

    it('403s marking ANOTHER warehouse’s assignment delivered — the same rule POST /orders/:id/deliver applies', async () => {
      const assignment = await asAdmin('post', '/delivery/assignments').send({
        orderId: orderInB,
        carrierId,
      });

      const response = await asUser(
        operatorA,
        'post',
        `/delivery/assignments/${assignment.body.id}/deliver`,
      );

      expect(response.status).toBe(403);
      const reloaded = await tenant.deliveryAssignment.findUnique({
        where: { id: assignment.body.id },
      });
      expect(reloaded?.status).toBe('in_transit');
    });

    it('allows marking their OWN warehouse’s assignment delivered', async () => {
      const assignment = await asAdmin('post', '/delivery/assignments').send({
        orderId: orderInA,
        carrierId,
      });

      const response = await asUser(
        operatorA,
        'post',
        `/delivery/assignments/${assignment.body.id}/deliver`,
      );

      expect(response.status).toBe(200);
    });

    /**
     * CLASS D3 — the list names an `orderId` for every delivery order in the
     * tenant. Sales filters `GET /orders` to the operator's own warehouse; an
     * unscoped Delivery list was a second door onto the same identifiers.
     */
    it('GET /delivery/assignments returns ONLY their own warehouse’s rows', async () => {
      const mine = await asAdmin('post', '/delivery/assignments').send({
        orderId: orderInA,
        carrierId,
      });
      const theirs = await asAdmin('post', '/delivery/assignments').send({
        orderId: orderInB,
        carrierId,
      });

      const response = await asUser(operatorA, 'get', '/delivery/assignments');

      expect(response.status).toBe(200);
      expect(response.body.map((a: { id: string }) => a.id)).toEqual([mine.body.id]);
      expect(response.body.map((a: { id: string }) => a.id)).not.toContain(theirs.body.id);
    });

    it('GET /delivery/assignments/by-order/:orderId 403s across warehouses and answers for their own', async () => {
      await asAdmin('post', '/delivery/assignments').send({ orderId: orderInA, carrierId }).expect(201);

      const foreign = await asUser(operatorA, 'get', `/delivery/assignments/by-order/${orderInB}`);
      const own = await asUser(operatorA, 'get', `/delivery/assignments/by-order/${orderInA}`);

      expect(foreign.status).toBe(403);
      expect(own.status).toBe(200);
      expect(own.body.orderId).toBe(orderInA);
    });

    /**
     * THE EXISTENCE ORACLE, closed at the HTTP boundary.
     *
     * `assign` answered 404 for an `orderId` that does not exist and 403 for
     * one that belongs to another warehouse, so a scoped operator could POST
     * any uuid and read the status code to learn whether that order is in the
     * tenant — for exactly the role the scope exists to restrict. Both answers
     * must now be the SAME, and the one that leaks nothing is 403.
     */
    it('POST /delivery/assignments answers an UNKNOWN order the same way as a FOREIGN one — 403, no existence oracle', async () => {
      const unknownOrderId = randomUUID();

      const foreign = await asUser(operatorA, 'post', '/delivery/assignments').send({
        orderId: orderInB,
        carrierId,
      });
      const unknown = await asUser(operatorA, 'post', '/delivery/assignments').send({
        orderId: unknownOrderId,
        carrierId,
      });

      expect(foreign.status).toBe(403);
      expect(unknown.status).toBe(403);
      // An UNSCOPED caller still gets the informative 404 — the contract only
      // changed for the callers the scope applies to.
      const asAdminUnknown = await asAdmin('post', '/delivery/assignments').send({
        orderId: unknownOrderId,
        carrierId,
      });
      expect(asAdminUnknown.status).toBe(404);
    });

    /** The same leak, one identifier over: assignment ids instead of order ids. */
    it('POST /delivery/assignments/:id/deliver answers an UNKNOWN assignment the same way as a FOREIGN one — 403', async () => {
      const theirs = await asAdmin('post', '/delivery/assignments').send({
        orderId: orderInB,
        carrierId,
      });
      const unknownAssignmentId = randomUUID();

      const foreign = await asUser(
        operatorA,
        'post',
        `/delivery/assignments/${theirs.body.id}/deliver`,
      );
      const unknown = await asUser(
        operatorA,
        'post',
        `/delivery/assignments/${unknownAssignmentId}/deliver`,
      );

      expect(foreign.status).toBe(403);
      expect(unknown.status).toBe(403);
      expect(
        (await asAdmin('post', `/delivery/assignments/${unknownAssignmentId}/deliver`)).status,
      ).toBe(404);
    });

    it('403s a sales_agent on every Delivery read — Delivery is not a second door onto every order id', async () => {
      const agent = await createAuthedUser(services, USER_ROLES.sales_agent, companyId);

      const list = await asUser(agent, 'get', '/delivery/assignments');
      const byOrder = await asUser(agent, 'get', `/delivery/assignments/by-order/${orderInA}`);
      const capacity = await asUser(agent, 'get', '/delivery/capacity');

      expect(list.status).toBe(403);
      expect(byOrder.status).toBe(403);
      expect(capacity.status).toBe(403);
    });
  });

  /**
   * `GET /delivery/assignments` returned EVERY assignment row in the tenant's
   * history — no window, no limit, no pagination — while the same round gave
   * `GET /delivery/capacity` a default window because an unbounded delivered
   * read was unacceptable. The endpoint returning FULL ROWS was left unbounded
   * while the one returning a COUNT was fixed.
   */
  describe('GET /delivery/assignments is bounded', () => {
    it('honours ?limit and pages with ?cursor, without repeating a row', async () => {
      const carrierId = await createCarrier();
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const orderId = await createOrder({ warehouseId: warehouseAId });
        const created = await asAdmin('post', '/delivery/assignments').send({ orderId, carrierId });
        ids.push(created.body.id);
      }

      const first = await asAdmin('get', '/delivery/assignments?limit=2');
      expect(first.status).toBe(200);
      expect(first.body).toHaveLength(2);

      const cursor = first.body[1].id;
      const second = await asAdmin('get', `/delivery/assignments?limit=2&cursor=${cursor}`);
      expect(second.status).toBe(200);

      const walked = [...first.body, ...second.body].map((a: { id: string }) => a.id);
      expect(new Set(walked).size).toBe(walked.length);
      expect(new Set(walked)).toEqual(new Set(ids));
    });

    it('excludes rows outside the ?from window', async () => {
      const carrierId = await createCarrier();
      const orderId = await createOrder({ warehouseId: warehouseAId });
      await asAdmin('post', '/delivery/assignments').send({ orderId, carrierId }).expect(201);

      const future = await asAdmin('get', '/delivery/assignments?from=2099-01-01T00:00:00.000Z');

      expect(future.status).toBe(200);
      expect(future.body).toEqual([]);
    });

    it('400s a bad limit or cursor rather than silently ignoring it', async () => {
      expect((await asAdmin('get', '/delivery/assignments?limit=0')).status).toBe(400);
      expect((await asAdmin('get', '/delivery/assignments?limit=abc')).status).toBe(400);
      expect((await asAdmin('get', '/delivery/assignments?cursor=not-a-uuid')).status).toBe(400);
    });
  });

  /** CLASS G3 — an inverted range returns zero rows, so the dashboard reports zero deliveries while looking healthy. */
  describe('GET /delivery/capacity window validation', () => {
    it('400s an inverted from/to range instead of reporting zero deliveries', async () => {
      const response = await asAdmin(
        'get',
        '/delivery/capacity?from=2026-08-31T00:00:00.000Z&to=2026-08-01T00:00:00.000Z',
      );

      expect(response.status).toBe(400);
    });

    it('400s an unparseable date', async () => {
      const response = await asAdmin('get', '/delivery/capacity?from=garbage');

      expect(response.status).toBe(400);
    });

    /**
     * The 400 message promises ISO-8601 and the check was a bare
     * `Number.isNaN(new Date(value).getTime())`, which accepts a great deal
     * that is not ISO-8601: `2026` (becomes Jan 1st), `Aug 1 2026`, `2026-8-1`
     * (parsed in LOCAL time, not UTC). Each silently produces a DIFFERENT
     * window from the one typed, and combined with the default window a
     * mistyped bound still returns a plausible-looking answer.
     */
    it.each(['2026', 'Aug 1 2026', '08/01/2026'])(
      '400s "%s" — the message promises ISO-8601, so the check must enforce it',
      async (value) => {
        const response = await asAdmin(
          'get',
          `/delivery/capacity?from=${encodeURIComponent(value)}`,
        );

        expect(response.status).toBe(400);
      },
    );

    it('still accepts real ISO-8601, date-only and date-time alike', async () => {
      expect((await asAdmin('get', '/delivery/capacity?from=2026-01-01')).status).toBe(200);
      expect(
        (await asAdmin('get', '/delivery/capacity?from=2026-01-01T00:00:00.000Z')).status,
      ).toBe(200);
    });
  });
});
