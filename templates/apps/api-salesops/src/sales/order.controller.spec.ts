import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import {
  InsufficientStockError,
  InvalidOrderError,
  InvalidOrderStateError,
  NegativeStockError,
  RateNotFoundError,
  USER_ROLES,
  WAREHOUSE_OPERATOR_REPOSITORY,
  WarehouseCannotFulfillOrderError,
  type IWarehouseOperatorRepository,
} from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import {
  mockTenantContextService,
  overrideJwtAuth,
  overrideTenantContext,
  SAMPLE_AUTH_USER,
} from '../test-support/auth-test-helpers.js';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';

type OrderServiceMock = {
  create: jest.Mock;
  update: jest.Mock;
  findById: jest.Mock;
  list: jest.Mock;
  confirm: jest.Mock;
  deliver: jest.Mock;
  cancel: jest.Mock;
};

const OWN_WAREHOUSE_ID = 'warehouse-uuid-1';
const OTHER_WAREHOUSE_ID = 'warehouse-uuid-2';

const sampleResponse = {
  id: 'order-uuid-1',
  customerId: 'customer-uuid-1',
  customerName: 'Ana Torres',
  warehouseId: 'warehouse-uuid-1',
  deliveryMode: 'pickup',
  currency: 'USD',
  status: 'created',
  subtotal: '100.00',
  discountTotal: '0.00',
  total: '100.00',
  lines: [],
  payments: [],
  saleCredit: null,
  attributedCompanyUserId: 'test-company-user-1',
  orderDate: '2026-01-01T00:00:00.000Z',
  verifiedAt: null,
  deliveredAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// WHAT to sell and HOW MANY. Name, category, price and discounts are resolved
// from the catalog by the service; `customerName` from the customer record.
const validCreateBody = {
  customerId: 'customer-uuid-1',
  warehouseId: 'warehouse-uuid-1',
  deliveryMode: 'pickup',
  lines: [{ productId: 'product-uuid-1', quantity: 1 }],
  payments: [{ channel: 'USD_CASH', amount: { amount: '100.00', currency: 'USD' } }],
};

/** Builds a test app with `JwtAuthGuard`/`TenantContextGuard` overridden to inject `req.user`/`req.tenant` (`roles: null` -> 401), keeping the REAL `RolesGuard`. `warehouseOperatorRepository.findByUserId` defaults to a row scoped to `OWN_WAREHOUSE_ID`. */
async function buildApp(
  service: OrderServiceMock,
  roles: number | null,
  warehouseOperatorRepository: jest.Mocked<IWarehouseOperatorRepository> = buildOperatorRepoMock(),
): Promise<INestApplication> {
  const builder = overrideTenantContext(
    overrideJwtAuth(
      Test.createTestingModule({
        controllers: [OrderController],
        providers: [
          { provide: OrderService, useValue: service },
          { provide: WAREHOUSE_OPERATOR_REPOSITORY, useValue: warehouseOperatorRepository },
          { provide: TenantContextService, useValue: mockTenantContextService() },
          RolesGuard,
        ],
      }),
      roles,
    ),
  );
  const module: TestingModule = await builder.compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

function buildOperatorRepoMock(): jest.Mocked<IWarehouseOperatorRepository> {
  return {
    create: jest.fn(),
    findByUserId: jest.fn().mockResolvedValue({
      companyUserId: 'test-user-1',
      warehouseId: OWN_WAREHOUSE_ID,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
    findByWarehouseId: jest.fn(),
  };
}

describe('OrderController', () => {
  let app: INestApplication;
  let service: OrderServiceMock;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      confirm: jest.fn(),
      deliver: jest.fn(),
      cancel: jest.fn(),
    };

    // `admin` passes every role gate AND bypasses warehouse scoping — keeps
    // pre-existing tests focused on behavior, not on the role/scope matrix
    // (that's covered below). `deliver` now pre-checks existence via
    // `findById` (for the warehouse-scope check) BEFORE calling `deliver` —
    // every pre-existing `deliver` test must mock `findById` too.
    service.findById.mockResolvedValue(sampleResponse);
    app = await buildApp(service, USER_ROLES.admin);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /orders', () => {
    it('returns 201 with the created order', async () => {
      service.create.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer()).post('/orders').send(validCreateBody);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleResponse);
    });

    it('attributes the sale to the authenticated actor, sourced from req.user.companyUserId', async () => {
      service.create.mockResolvedValue(sampleResponse);

      await request(app.getHttpServer()).post('/orders').send(validCreateBody);

      // The assignment id, passed OUT OF BAND of the DTO — the second argument
      // exists precisely so the request body has no channel to reach it.
      expect(service.create).toHaveBeenCalledWith(expect.anything(), SAMPLE_AUTH_USER.companyUserId);
    });

    it('IGNORES any client-supplied attribution in the payload', async () => {
      service.create.mockResolvedValue(sampleResponse);

      await request(app.getHttpServer())
        .post('/orders')
        .send({
          ...validCreateBody,
          attributedCompanyUserId: 'cu-someone-else',
          companyUserId: 'cu-someone-else',
        });

      // Commission is money. A caller who could name the beneficiary could
      // credit another agent's sale to themselves, so the payload must never
      // be a source — not even when the field happens to be well-formed.
      //
      // The stray keys DO ride along inside the body object (this app installs
      // no ValidationPipe, so nothing strips them), which is exactly why the
      // attribution travels as a separate argument: `OrderService.create`
      // reads the argument and never the body. That the body copy is inert is
      // proven against the real implementation in `order.service.spec.ts`.
      expect(service.create).toHaveBeenCalledWith(expect.anything(), SAMPLE_AUTH_USER.companyUserId);
    });

    it('maps InvalidOrderError to 400', async () => {
      service.create.mockRejectedValue(new InvalidOrderError('Order requires at least one OrderLine'));

      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validCreateBody, lines: [] });

      expect(response.status).toBe(400);
    });

    it('maps RateNotFoundError to 409', async () => {
      service.create.mockRejectedValue(new RateNotFoundError('no rate for EUR_CASH'));

      const response = await request(app.getHttpServer()).post('/orders').send(validCreateBody);

      expect(response.status).toBe(409);
    });

    it('maps WarehouseCannotFulfillOrderError to 409, naming the warehouse', async () => {
      // 409, not 400: the request is well-formed, the world cannot satisfy it.
      service.create.mockRejectedValue(new WarehouseCannotFulfillOrderError('warehouse-uuid-1'));

      const response = await request(app.getHttpServer()).post('/orders').send(validCreateBody);

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('warehouse-uuid-1');
    });

    it('rejects an empty or missing lines array with 400 before reaching the service', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validCreateBody, lines: [] })
        .expect(400);
      await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validCreateBody, lines: undefined })
        .expect(400);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('rejects a line without a productId, or with a non-positive/non-integer quantity, with 400', async () => {
      // No global ValidationPipe here and the DTOs are erased at runtime, so
      // the controller is the only thing standing between a malformed body and
      // the domain.
      for (const bad of [
        { quantity: 1 },
        { productId: '   ', quantity: 1 },
        { productId: 'product-uuid-1', quantity: 0 },
        { productId: 'product-uuid-1', quantity: -1 },
        { productId: 'product-uuid-1', quantity: 1.5 },
        { productId: 'product-uuid-1', quantity: '2' },
      ]) {
        await request(app.getHttpServer())
          .post('/orders')
          .send({ ...validCreateBody, lines: [bad] })
          .expect(400);
      }
      expect(service.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown payment channel with 400 before reaching the service', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validCreateBody, payments: [{ channel: 'BOGUS', amount: { amount: '100.00', currency: 'USD' } }] });

      expect(response.status).toBe(400);
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /orders', () => {
    it('returns the full list', async () => {
      service.list.mockResolvedValue([sampleResponse]);

      const response = await request(app.getHttpServer()).get('/orders');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleResponse]);
      expect(service.list).toHaveBeenCalledWith();
    });
  });

  describe('GET /orders/:id', () => {
    it('returns 200 for a found order', async () => {
      service.findById.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer()).get('/orders/order-uuid-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleResponse);
    });

    it('returns 404 for an unknown id', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/orders/unknown-id');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /orders/:id', () => {
    it('returns 200 with the updated order (created only)', async () => {
      service.update.mockResolvedValue({ ...sampleResponse, deliveryMode: 'delivery' });

      const response = await request(app.getHttpServer())
        .patch('/orders/order-uuid-1')
        .send({ deliveryMode: 'delivery' });

      expect(response.status).toBe(200);
      expect(response.body.deliveryMode).toBe('delivery');
    });

    it('maps WarehouseCannotFulfillOrderError to 409 on a warehouse change', async () => {
      service.update.mockRejectedValue(new WarehouseCannotFulfillOrderError('warehouse-uuid-2'));

      const response = await request(app.getHttpServer())
        .patch('/orders/order-uuid-1')
        .send({ warehouseId: 'warehouse-uuid-2' });

      expect(response.status).toBe(409);
    });

    it('maps InvalidOrderStateError (not created) to 409', async () => {
      service.update.mockRejectedValue(new InvalidOrderStateError('order-uuid-1', 'created', 'verified'));

      const response = await request(app.getHttpServer())
        .patch('/orders/order-uuid-1')
        .send({ deliveryMode: 'delivery' });

      expect(response.status).toBe(409);
    });

    it('returns 404 for an unknown id', async () => {
      service.update.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .patch('/orders/unknown-id')
        .send({ deliveryMode: 'pickup' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /orders/:id', () => {
    it('does not exist — an Order is an immutable event and is never deleted', async () => {
      const response = await request(app.getHttpServer()).delete('/orders/order-uuid-1');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /orders/:id/confirm', () => {
    it('returns 200 with the frozen snapshot + reserved stock', async () => {
      service.confirm.mockResolvedValue({ ...sampleResponse, status: 'verified', verifiedAt: '2026-01-02T00:00:00.000Z' });

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/confirm');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('verified');
    });

    it('maps InsufficientStockError to 409', async () => {
      service.confirm.mockRejectedValue(new InsufficientStockError('not enough available stock'));

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/confirm');

      expect(response.status).toBe(409);
    });

    it('maps InvalidOrderStateError to 409', async () => {
      service.confirm.mockRejectedValue(new InvalidOrderStateError('order-uuid-1', 'created', 'delivered'));

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/confirm');

      expect(response.status).toBe(409);
    });

    it('returns 404 for an unknown id', async () => {
      service.confirm.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).post('/orders/unknown-id/confirm');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /orders/:id/deliver', () => {
    it('returns 200 with consumed stock + deliveredAt', async () => {
      service.deliver.mockResolvedValue({ ...sampleResponse, status: 'delivered', deliveredAt: '2026-01-03T00:00:00.000Z' });

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/deliver');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('delivered');
    });

    it('maps NegativeStockError to 409', async () => {
      service.deliver.mockRejectedValue(new NegativeStockError('onHand would go negative'));

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/deliver');

      expect(response.status).toBe(409);
    });
  });

  describe('POST /orders/:id/cancel', () => {
    it('returns 200', async () => {
      service.cancel.mockResolvedValue({ ...sampleResponse, status: 'cancelled' });

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/cancel');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('cancelled');
    });

    it('maps InvalidOrderStateError (delivered terminal) to 409', async () => {
      service.cancel.mockRejectedValue(new InvalidOrderStateError('order-uuid-1', 'created|verified', 'delivered'));

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/cancel');

      expect(response.status).toBe(409);
    });
  });

  describe('RolesGuard enforcement', () => {
    it('rejects an unauthenticated request with 401', async () => {
      await app.close();
      app = await buildApp(service, null);

      const response = await request(app.getHttpServer()).get('/orders');
      expect(response.status).toBe(401);
    });

    it('rejects a plain "user" caller with 403', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.user);

      const response = await request(app.getHttpServer()).get('/orders');
      expect(response.status).toBe(403);
    });

    it('admits a "sales_operator" caller creating an order -> 201', async () => {
      await app.close();
      service.create.mockResolvedValue(sampleResponse);
      app = await buildApp(service, USER_ROLES.sales_operator);

      const response = await request(app.getHttpServer()).post('/orders').send(validCreateBody);
      expect(response.status).toBe(201);
    });

    it('admits a "sales_agent" caller creating an order -> 201', async () => {
      // The agent is the reason attribution exists. If this route were closed
      // to them, no order could ever be attributed to an agent at all.
      await app.close();
      service.create.mockResolvedValue(sampleResponse);
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer()).post('/orders').send(validCreateBody);
      expect(response.status).toBe(201);
    });

    it.each([
      ['confirm', '/orders/order-uuid-1/confirm'],
      ['cancel', '/orders/order-uuid-1/cancel'],
      ['deliver', '/orders/order-uuid-1/deliver'],
    ])('rejects a "sales_agent" caller on %s with 403 — booking a sale is not moving stock', async (_name, route) => {
      // The grants above are method-level precisely so these three do NOT
      // widen along with them.
      await app.close();
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer()).post(route);
      expect(response.status).toBe(403);
    });

    it('rejects a "warehouse_operator" caller creating an order with 403 — not a sales role', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer()).post('/orders').send(validCreateBody);
      expect(response.status).toBe(403);
    });
  });

  describe('warehouse_operator scope on GET /orders (list)', () => {
    it('filters the list to the operator\'s own warehouse', async () => {
      await app.close();
      const otherWarehouseOrder = { ...sampleResponse, id: 'order-uuid-2', warehouseId: OTHER_WAREHOUSE_ID };
      service.list.mockResolvedValue([sampleResponse, otherWarehouseOrder]);
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer()).get('/orders');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleResponse]);
    });

    it('does NOT filter for an "owner"/"admin"/"sales_operator" caller', async () => {
      await app.close();
      const otherWarehouseOrder = { ...sampleResponse, id: 'order-uuid-2', warehouseId: OTHER_WAREHOUSE_ID };
      service.list.mockResolvedValue([sampleResponse, otherWarehouseOrder]);
      app = await buildApp(service, USER_ROLES.sales_operator);

      const response = await request(app.getHttpServer()).get('/orders');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });
  });

  describe('warehouse_operator scope on GET /orders/:id', () => {
    it('admits a "warehouse_operator" reading an order in THEIR OWN warehouse -> 200', async () => {
      await app.close();
      service.findById.mockResolvedValue(sampleResponse);
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer()).get('/orders/order-uuid-1');
      expect(response.status).toBe(200);
    });

    it('rejects a "warehouse_operator" reading an order in ANOTHER warehouse with 403', async () => {
      await app.close();
      service.findById.mockResolvedValue({ ...sampleResponse, warehouseId: OTHER_WAREHOUSE_ID });
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer()).get('/orders/order-uuid-1');
      expect(response.status).toBe(403);
    });
  });

  describe('sales_agent scope on GET /orders (list)', () => {
    const OTHER_AGENT_ORDER = {
      ...sampleResponse,
      id: 'order-uuid-2',
      attributedCompanyUserId: 'cu-other-agent',
    };

    it("filters the list to the agent's OWN attributions", async () => {
      await app.close();
      service.list.mockResolvedValue([sampleResponse, OTHER_AGENT_ORDER]);
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer()).get('/orders');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleResponse]);
    });

    it('hides a legacy unattributed order from every agent', async () => {
      // `null` must match NOBODY. A predicate written as "not someone else's"
      // rather than "mine" would leak every pre-attribution order to every
      // agent — including its prices and credit terms.
      await app.close();
      const legacyOrder = { ...sampleResponse, id: 'order-uuid-3', attributedCompanyUserId: null };
      service.list.mockResolvedValue([sampleResponse, legacyOrder]);
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer()).get('/orders');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleResponse]);
    });

    it('does NOT filter for a caller who ALSO holds a supervising role', async () => {
      await app.close();
      service.list.mockResolvedValue([sampleResponse, OTHER_AGENT_ORDER]);
      app = await buildApp(service, USER_ROLES.sales_agent | USER_ROLES.sales_operator);

      const response = await request(app.getHttpServer()).get('/orders');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });
  });

  describe('sales_agent scope on GET /orders/:id', () => {
    it('admits an agent reading their OWN attributed order -> 200', async () => {
      await app.close();
      service.findById.mockResolvedValue(sampleResponse);
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer()).get('/orders/order-uuid-1');
      expect(response.status).toBe(200);
    });

    it("rejects an agent reading ANOTHER agent's order with 403", async () => {
      await app.close();
      service.findById.mockResolvedValue({ ...sampleResponse, attributedCompanyUserId: 'cu-other-agent' });
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer()).get('/orders/order-uuid-1');
      expect(response.status).toBe(403);
    });

    it('rejects an agent reading a legacy unattributed order with 403', async () => {
      await app.close();
      service.findById.mockResolvedValue({ ...sampleResponse, attributedCompanyUserId: null });
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer()).get('/orders/order-uuid-1');
      expect(response.status).toBe(403);
    });
  });

  describe('sales_agent scope on PATCH /orders/:id', () => {
    // The read path is scoped, so the write path MUST be too. An agent editing
    // a colleague's order rewrites its lines — and the lines are what the
    // commission accrual is computed from, so an unscoped PATCH is a way to
    // change what someone else gets paid.
    it("admits an agent patching their OWN attributed order -> 200", async () => {
      await app.close();
      service.findById.mockResolvedValue(sampleResponse);
      service.update.mockResolvedValue({ ...sampleResponse, deliveryMode: 'delivery' });
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer())
        .patch('/orders/order-uuid-1')
        .send({ deliveryMode: 'delivery' });

      expect(response.status).toBe(200);
    });

    it("rejects an agent patching ANOTHER agent's order with 403, writing nothing", async () => {
      await app.close();
      service.findById.mockResolvedValue({ ...sampleResponse, attributedCompanyUserId: 'cu-other-agent' });
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer())
        .patch('/orders/order-uuid-1')
        .send({ deliveryMode: 'delivery' });

      expect(response.status).toBe(403);
      expect(service.update).not.toHaveBeenCalled();
    });

    it('rejects an agent patching a legacy unattributed order with 403', async () => {
      await app.close();
      service.findById.mockResolvedValue({ ...sampleResponse, attributedCompanyUserId: null });
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer())
        .patch('/orders/order-uuid-1')
        .send({ deliveryMode: 'delivery' });

      expect(response.status).toBe(403);
      expect(service.update).not.toHaveBeenCalled();
    });

    it('does NOT scope — nor issue the scope read — for a caller who ALSO supervises', async () => {
      await app.close();
      service.findById.mockResolvedValue({ ...sampleResponse, attributedCompanyUserId: 'cu-other-agent' });
      service.update.mockResolvedValue(sampleResponse);
      app = await buildApp(service, USER_ROLES.sales_agent | USER_ROLES.sales_operator);

      const response = await request(app.getHttpServer())
        .patch('/orders/order-uuid-1')
        .send({ deliveryMode: 'delivery' });

      expect(response.status).toBe(200);
      expect(service.findById).not.toHaveBeenCalled();
    });
  });

  describe('warehouse_operator scope on POST /orders/:id/deliver', () => {
    it('rejects a "sales_operator" caller with 403 — deliver is a warehouse-floor action', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.sales_operator);

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/deliver');
      expect(response.status).toBe(403);
    });

    it('admits a "warehouse_operator" delivering an order in THEIR OWN warehouse -> 200', async () => {
      await app.close();
      service.findById.mockResolvedValue(sampleResponse);
      service.deliver.mockResolvedValue({ ...sampleResponse, status: 'delivered' });
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/deliver');
      expect(response.status).toBe(200);
    });

    it('rejects a "warehouse_operator" delivering an order in ANOTHER warehouse with 403', async () => {
      await app.close();
      service.findById.mockResolvedValue({ ...sampleResponse, warehouseId: OTHER_WAREHOUSE_ID });
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/deliver');
      expect(response.status).toBe(403);
      expect(service.deliver).not.toHaveBeenCalled();
    });
  });
});
