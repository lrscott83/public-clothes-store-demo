import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import {
  CarrierNotFoundError,
  InsufficientStockError,
  InvalidAssignmentStateError,
  ConcurrentWriteConflictError,
  InvalidOrderStateError,
  OrderNotAssignableStateError,
  PersistenceTimeoutError,
  NegativeStockError,
  OrderAlreadyAssignedError,
  OrderNotFoundForDeliveryError,
  PickupOrderCannotBeAssignedError,
  USER_ROLES,
  WarehouseScopeViolationError,
} from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import {
  SAMPLE_AUTH_USER,
  mockTenantContextService,
  overrideJwtAuth,
  overrideTenantContext,
} from '../test-support/auth-test-helpers.js';
import { DeliveryAssignmentController } from './delivery-assignment.controller.js';
import { DeliveryService } from './delivery.service.js';

type DeliveryServiceMock = {
  listAssignments: jest.Mock;
  findAssignmentByOrderId: jest.Mock;
  getCarrierCapacity: jest.Mock;
  assign: jest.Mock;
  markDelivered: jest.Mock;
};

/**
 * Real UUIDs, not readable placeholders: `:id`, `:orderId` and the `assign`
 * body's `orderId`/`carrierId` all reach `@db.Uuid` columns and are validated
 * at the boundary now (`assertUuid`), so a spec using `${ORDER_ID}` would be
 * asserting a 400.
 */
const ASSIGNMENT_ID = '6b0d4f18-1c2a-4e7d-8f31-5a9c7e2b4d60';
const ORDER_ID = '9a1f3c74-5e28-4b6a-a0d9-1c7e8f2b3a45';
const CARRIER_ID = '3f9a5c22-0a7e-4c1b-9a55-2e6d4b8f1c03';
const GHOST_ORDER_ID = '00000000-0000-4000-8000-0000000000aa';
const UNKNOWN_CARRIER_ID = '00000000-0000-4000-8000-0000000000bb';
const UNKNOWN_ASSIGNMENT_ID = '00000000-0000-4000-8000-0000000000cc';
const ORDER_WITHOUT_ASSIGNMENT_ID = '00000000-0000-4000-8000-0000000000dd';

const sampleCapacityWindow = { from: null, to: null };

const sampleAssignment = {
  id: ASSIGNMENT_ID,
  orderId: ORDER_ID,
  carrierId: CARRIER_ID,
  status: 'in_transit',
  assignedAt: '2026-08-01T00:00:00.000Z',
  deliveredAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const sampleCapacity = {
  throughputWindow: sampleCapacityWindow,
  carriers: [
    { carrierId: CARRIER_ID, carrierName: 'Envíos Rápidos', busy: true, inTransitCount: 1, deliveredCount: 4 },
  ],
  busyCount: 1,
  freeCount: 0,
  ordersAwaitingCarrier: 2,
};

async function buildApp(service: DeliveryServiceMock, roles: number | null): Promise<INestApplication> {
  const builder = overrideTenantContext(
    overrideJwtAuth(
      Test.createTestingModule({
        controllers: [DeliveryAssignmentController],
        providers: [
          { provide: DeliveryService, useValue: service },
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

describe('DeliveryAssignmentController', () => {
  let app: INestApplication;
  let service: DeliveryServiceMock;

  beforeEach(() => {
    service = {
      listAssignments: jest.fn(),
      findAssignmentByOrderId: jest.fn(),
      getCarrierCapacity: jest.fn(),
      assign: jest.fn(),
      markDelivered: jest.fn(),
    };
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /delivery/assignments', () => {
    it('returns the assignment list, forwarding status and carrierId filters', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.listAssignments.mockResolvedValue([sampleAssignment]);

      // A REAL uuid: `carrierId` is a `@db.Uuid` column, and the endpoint now
      // says so at the boundary instead of letting a malformed value reach
      // Prisma and come back a 500.
      const carrierUuid = '3f1d9d2a-4c9e-4c1b-9a3e-2b7f5c8d1e40';
      const response = await request(app.getHttpServer()).get(
        `/delivery/assignments?status=in_transit&carrierId=${carrierUuid}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleAssignment]);
      expect(service.listAssignments).toHaveBeenCalledWith(
        { status: 'in_transit', carrierId: carrierUuid },
        expect.objectContaining({ id: SAMPLE_AUTH_USER.id }),
      );
    });

    /**
     * CLASS D3 — this list names an `orderId` for every delivery order in the
     * tenant. `OrderController` filters an agent's own list to their
     * attributions and 403s a foreign `GET /orders/:id`; an unrestricted
     * Delivery read was a second door onto the same identifiers. Delivery
     * carries no attribution column to scope BY, so the role is excluded
     * outright.
     */
    it('REFUSES a caller with only sales_agent — Delivery is not a second door onto every order id', async () => {
      app = await buildApp(service, USER_ROLES.sales_agent);
      service.listAssignments.mockResolvedValue([]);

      const response = await request(app.getHttpServer()).get('/delivery/assignments');

      expect(response.status).toBe(403);
      expect(service.listAssignments).not.toHaveBeenCalled();
    });

    it('admits a warehouse_operator — scoped to their own warehouse inside the service', async () => {
      app = await buildApp(service, USER_ROLES.warehouse_operator);
      service.listAssignments.mockResolvedValue([]);

      const response = await request(app.getHttpServer()).get('/delivery/assignments');

      expect(response.status).toBe(200);
      expect(service.listAssignments).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: SAMPLE_AUTH_USER.id }),
      );
    });

    it('rejects an unknown status value with 400, never reaching the service', async () => {
      app = await buildApp(service, USER_ROLES.admin);

      const response = await request(app.getHttpServer()).get('/delivery/assignments?status=bogus');

      expect(response.status).toBe(400);
      expect(service.listAssignments).not.toHaveBeenCalled();
    });

    it('accepts cancelled as a status filter', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.listAssignments.mockResolvedValue([]);

      const response = await request(app.getHttpServer()).get('/delivery/assignments?status=cancelled');

      expect(response.status).toBe(200);
      expect(service.listAssignments).toHaveBeenCalledWith(
        { status: 'cancelled', carrierId: undefined },
        expect.objectContaining({ id: SAMPLE_AUTH_USER.id }),
      );
    });

    it('rejects a carrierId that is not a UUID with 400', async () => {
      app = await buildApp(service, USER_ROLES.admin);

      const response = await request(app.getHttpServer()).get(
        '/delivery/assignments?carrierId=not-a-uuid',
      );

      expect(response.status).toBe(400);
      expect(service.listAssignments).not.toHaveBeenCalled();
    });
  });

  describe('GET /delivery/assignments/by-order/:orderId', () => {
    it('returns the assignment when one exists', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.findAssignmentByOrderId.mockResolvedValue(sampleAssignment);

      const response = await request(app.getHttpServer()).get(
        `/delivery/assignments/by-order/${ORDER_ID}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleAssignment);
    });

    it('returns 200 with an empty body (never 404) for an order with no assignment', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.findAssignmentByOrderId.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get(
        `/delivery/assignments/by-order/${ORDER_WITHOUT_ASSIGNMENT_ID}`,
      );

      // NestJS's Express adapter treats a `null`/`undefined` return as
      // `isNil` and calls `response.send()` with no body — 200, not 404,
      // which is the modelled contract (design §6: "never a 404").
      expect(response.status).toBe(200);
      expect(response.text).toBe('');
    });
  });

  describe('GET /delivery/capacity', () => {
    it('returns the capacity snapshot', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.getCarrierCapacity.mockResolvedValue(sampleCapacity);

      const response = await request(app.getHttpServer()).get('/delivery/capacity');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleCapacity);
      expect(service.getCarrierCapacity).toHaveBeenCalledWith({ from: undefined, to: undefined });
    });

    it('forwards from/to query params as the throughput window', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.getCarrierCapacity.mockResolvedValue(sampleCapacity);

      await request(app.getHttpServer()).get(
        '/delivery/capacity?from=2026-08-01T00:00:00.000Z&to=2026-08-31T00:00:00.000Z',
      );

      expect(service.getCarrierCapacity).toHaveBeenCalledWith({
        from: new Date('2026-08-01T00:00:00.000Z'),
        to: new Date('2026-08-31T00:00:00.000Z'),
      });
    });

    it('REFUSES a caller with only sales_agent — same grant as the assignment reads', async () => {
      app = await buildApp(service, USER_ROLES.sales_agent);
      service.getCarrierCapacity.mockResolvedValue(sampleCapacity);

      const response = await request(app.getHttpServer()).get('/delivery/capacity');

      expect(response.status).toBe(403);
      expect(service.getCarrierCapacity).not.toHaveBeenCalled();
    });

    /**
     * CLASS G3 — an inverted range matches no row, so every carrier reports
     * `deliveredCount: 0` while `busy`/`inTransitCount` stay real: a
     * dashboard that looks operational and says nothing was ever delivered.
     */
    it('rejects an inverted from/to range with 400 instead of reporting zero deliveries', async () => {
      app = await buildApp(service, USER_ROLES.admin);

      const response = await request(app.getHttpServer()).get(
        '/delivery/capacity?from=2026-08-31T00:00:00.000Z&to=2026-08-01T00:00:00.000Z',
      );

      expect(response.status).toBe(400);
      expect(service.getCarrierCapacity).not.toHaveBeenCalled();
    });

    it('accepts from === to — both bounds are inclusive, so an equal pair is a single instant, not an empty window', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.getCarrierCapacity.mockResolvedValue(sampleCapacity);

      const response = await request(app.getHttpServer()).get(
        '/delivery/capacity?from=2026-08-01T00:00:00.000Z&to=2026-08-01T00:00:00.000Z',
      );

      expect(response.status).toBe(200);
    });

    /**
     * `capacity` was the ONE handler not wrapped in `withDomainErrorMapping`,
     * so a domain error raised under it came back a 500 from this door and a
     * clean 409/503 from every sibling. Both concurrency errors are reachable
     * from any tenant read now that the pool carries
     * `lock_timeout`/`statement_timeout`.
     */
    it('wraps the handler in the SAME domain error mapping as every sibling', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.getCarrierCapacity.mockRejectedValue(
        new ConcurrentWriteConflictError('Repo.list'),
      );

      const conflict = await request(app.getHttpServer()).get('/delivery/capacity');
      expect(conflict.status).toBe(409);

      service.getCarrierCapacity.mockRejectedValue(new PersistenceTimeoutError('Repo.list'));
      const timeout = await request(app.getHttpServer()).get('/delivery/capacity');
      expect(timeout.status).toBe(503);
    });

    it.each(['from', 'to'])('rejects an unparseable %s with 400 instead of silently dropping the window', async (param) => {
      app = await buildApp(service, USER_ROLES.admin);

      const response = await request(app.getHttpServer()).get(`/delivery/capacity?${param}=garbage`);

      // `new Date('garbage')` is an Invalid Date, and every comparison
      // against NaN is false — so the fold silently returned ALL-TIME
      // throughput while the caller believed the answer was windowed. Scream,
      // do not guess.
      expect(response.status).toBe(400);
      expect(service.getCarrierCapacity).not.toHaveBeenCalled();
    });
  });

  describe('POST /delivery/assignments', () => {
    it('returns 201 with the created assignment, in_transit', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockResolvedValue(sampleAssignment);

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleAssignment);
      expect(response.body.status).toBe('in_transit');
      // The authenticated ACTOR is forwarded: the service applies the same
      // warehouse scope `POST /orders/:id/deliver` applies, so the two doors
      // onto the same transition cannot diverge.
      expect(service.assign).toHaveBeenCalledWith(
        { orderId: ORDER_ID, carrierId: CARRIER_ID },
        expect.objectContaining({ id: SAMPLE_AUTH_USER.id }),
      );
    });

    describe('boundary validation (this app installs no global ValidationPipe)', () => {
      it.each([
        ['an empty body', {}],
        ['a missing orderId', { carrierId: CARRIER_ID }],
        ['a missing carrierId', { orderId: ORDER_ID }],
        ['a non-string orderId', { orderId: 42, carrierId: CARRIER_ID }],
        ['a blank orderId', { orderId: '   ', carrierId: CARRIER_ID }],
        ['a blank carrierId', { orderId: ORDER_ID, carrierId: '' }],
      ])('rejects %s with 400, never reaching the service', async (_label, body) => {
        app = await buildApp(service, USER_ROLES.owner);

        const response = await request(app.getHttpServer()).post('/delivery/assignments').send(body);

        expect(response.status).toBe(400);
        expect(service.assign).not.toHaveBeenCalled();
      });
    });

    it('maps OrderNotFoundForDeliveryError to 404 for an unknown orderId — never a raw 500', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockRejectedValue(new OrderNotFoundForDeliveryError(GHOST_ORDER_ID));

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: GHOST_ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(404);
    });

    it('maps PickupOrderCannotBeAssignedError to 409 — pickup orders MUST NEVER get an assignment', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockRejectedValue(new PickupOrderCannotBeAssignedError(ORDER_ID));

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(409);
    });

    it('maps InvalidOrderStateError to 409 for a non-verified order', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockRejectedValue(new InvalidOrderStateError(ORDER_ID, 'verified', 'created'));

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(409);
    });

    /**
     * Delivery's OWN "this order cannot be assigned right now", which replaced
     * the borrowed Sales `InvalidOrderStateError` in `assertOrderAssignable`.
     * Mapped to the SAME 409 — the observable contract did not change when
     * ownership of the vocabulary did.
     */
    it('maps OrderNotAssignableStateError to the same 409 as InvalidOrderStateError', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockRejectedValue(
        new OrderNotAssignableStateError(ORDER_ID, 'verified', 'created'),
      );

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(409);
    });

    /**
     * The two failures the explicit LOCKING made reachable. Both used to be
     * 500s: `translateCreateConstraintError` returned anything unrecognised
     * unchanged and `withDomainErrorMapping` had no branch for either — so the
     * mechanism added to stop a class of 500 produced another class of 500,
     * on the very endpoint it was added for.
     */
    it('maps ConcurrentWriteConflictError to 409 — a retryable race, not a server fault', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockRejectedValue(new ConcurrentWriteConflictError('Repo.create'));

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(409);
    });

    it('maps PersistenceTimeoutError to 503 — an availability statement, not a bad request', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockRejectedValue(new PersistenceTimeoutError('Repo.create'));

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(503);
    });

    it('maps CarrierNotFoundError to 404 for an unknown or inactive carrier', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockRejectedValue(new CarrierNotFoundError(UNKNOWN_CARRIER_ID));

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: UNKNOWN_CARRIER_ID });

      expect(response.status).toBe(404);
    });

    it('maps OrderAlreadyAssignedError to 409 when the order already has an assignment', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockRejectedValue(new OrderAlreadyAssignedError(ORDER_ID));

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(409);
    });

    it('succeeds with 201 and carries NO warning field even on a coverage mismatch — coverage is advisory (ADR-4)', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockResolvedValue(sampleAssignment);

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(201);
      expect(response.body).not.toHaveProperty('warning');
    });

    it('admits a warehouse_operator caller -> 201', async () => {
      app = await buildApp(service, USER_ROLES.warehouse_operator);
      service.assign.mockResolvedValue(sampleAssignment);

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(201);
    });

    it('rejects a sales_agent caller with 403', async () => {
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /delivery/assignments/:id/deliver', () => {
    it('returns 200 with the re-read (delivered) assignment on success', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.markDelivered.mockResolvedValue({
        ...sampleAssignment,
        status: 'delivered',
        deliveredAt: '2026-08-06T12:00:00.000Z',
      });

      const response = await request(app.getHttpServer()).post(
        `/delivery/assignments/${ASSIGNMENT_ID}/deliver`,
      );

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('delivered');
      expect(service.markDelivered).toHaveBeenCalledWith(
        ASSIGNMENT_ID,
        expect.objectContaining({ id: SAMPLE_AUTH_USER.id }),
      );
    });

    describe('domain errors from the SALES path (this endpoint runs the whole delivery transaction)', () => {
      it.each([
        ['InvalidOrderStateError', () => new InvalidOrderStateError(ORDER_ID, 'verified', 'created')],
        ['InsufficientStockError', () => new InsufficientStockError('not enough stock for product-1')],
        ['NegativeStockError', () => new NegativeStockError('stock would go negative for product-1')],
      ])('maps %s to 409, the same class OrderController maps it to', async (_label, build) => {
        app = await buildApp(service, USER_ROLES.owner);
        service.markDelivered.mockRejectedValue(build());

        const response = await request(app.getHttpServer()).post(
          `/delivery/assignments/${ASSIGNMENT_ID}/deliver`,
        );

        // Unmapped, every one of these was a 500 through this door while
        // being a clean 409 through `POST /orders/:id/deliver` — the same
        // transaction, the same failure, two different answers.
        expect(response.status).toBe(409);
      });

      it('maps OrderNotFoundForDeliveryError from the gateway to 404', async () => {
        app = await buildApp(service, USER_ROLES.owner);
        service.markDelivered.mockRejectedValue(new OrderNotFoundForDeliveryError(ORDER_ID));

        const response = await request(app.getHttpServer()).post(
          `/delivery/assignments/${ASSIGNMENT_ID}/deliver`,
        );

        expect(response.status).toBe(404);
      });
    });

    it('maps an unknown assignment id (service returns null) to 404', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.markDelivered.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).post(
        `/delivery/assignments/${UNKNOWN_ASSIGNMENT_ID}/deliver`,
      );

      expect(response.status).toBe(404);
    });

    it('maps InvalidAssignmentStateError to 409 when the assignment is not in_transit', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.markDelivered.mockRejectedValue(
        new InvalidAssignmentStateError(ASSIGNMENT_ID, 'in_transit', 'delivered'),
      );

      const response = await request(app.getHttpServer()).post(
        `/delivery/assignments/${ASSIGNMENT_ID}/deliver`,
      );

      expect(response.status).toBe(409);
    });

    it('admits a warehouse_operator caller -> 200', async () => {
      app = await buildApp(service, USER_ROLES.warehouse_operator);
      service.markDelivered.mockResolvedValue(sampleAssignment);

      const response = await request(app.getHttpServer()).post(
        `/delivery/assignments/${ASSIGNMENT_ID}/deliver`,
      );

      expect(response.status).toBe(200);
    });

    it('rejects a sales_agent caller with 403', async () => {
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer()).post(
        `/delivery/assignments/${ASSIGNMENT_ID}/deliver`,
      );

      expect(response.status).toBe(403);
    });
  });

  /** CLASS A — same sweep, this controller's own params. */
  describe('every uuid-bound param is validated (CLASS A)', () => {
    const MALFORMED = 'not-a-uuid';

    beforeEach(async () => {
      app = await buildApp(service, USER_ROLES.owner);
    });

    it('POST /delivery/assignments -> 400 on a malformed body orderId', async () => {
      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: MALFORMED, carrierId: CARRIER_ID });

      expect(response.status).toBe(400);
      expect(service.assign).not.toHaveBeenCalled();
    });

    it('POST /delivery/assignments -> 400 on a malformed body carrierId', async () => {
      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: MALFORMED });

      expect(response.status).toBe(400);
      expect(service.assign).not.toHaveBeenCalled();
    });

    it('POST /delivery/assignments/:id/deliver -> 400', async () => {
      const response = await request(app.getHttpServer()).post(
        `/delivery/assignments/${MALFORMED}/deliver`,
      );

      expect(response.status).toBe(400);
      expect(service.markDelivered).not.toHaveBeenCalled();
    });

    it('GET /delivery/assignments/by-order/:orderId -> 400', async () => {
      const response = await request(app.getHttpServer()).get(
        `/delivery/assignments/by-order/${MALFORMED}`,
      );

      expect(response.status).toBe(400);
      expect(service.findAssignmentByOrderId).not.toHaveBeenCalled();
    });
  });

  /** CLASS D2 — the scope violation is a DOMAIN error now; the controller maps it. */
  describe('WarehouseScopeViolationError maps to 403 on every handler that can raise it', () => {
    beforeEach(async () => {
      app = await buildApp(service, USER_ROLES.warehouse_operator);
    });

    it('POST /delivery/assignments -> 403', async () => {
      service.assign.mockRejectedValue(new WarehouseScopeViolationError('warehouse-A'));

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: ORDER_ID, carrierId: CARRIER_ID });

      expect(response.status).toBe(403);
    });

    it('POST /delivery/assignments/:id/deliver -> 403', async () => {
      service.markDelivered.mockRejectedValue(new WarehouseScopeViolationError('warehouse-A'));

      const response = await request(app.getHttpServer()).post(
        `/delivery/assignments/${ASSIGNMENT_ID}/deliver`,
      );

      expect(response.status).toBe(403);
    });

    it('GET /delivery/assignments/by-order/:orderId -> 403', async () => {
      service.findAssignmentByOrderId.mockRejectedValue(
        new WarehouseScopeViolationError('warehouse-A'),
      );

      const response = await request(app.getHttpServer()).get(
        `/delivery/assignments/by-order/${ORDER_ID}`,
      );

      expect(response.status).toBe(403);
    });
  });
});
