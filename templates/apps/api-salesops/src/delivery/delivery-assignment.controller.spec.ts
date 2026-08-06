import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import { CarrierNotFoundError, OrderAlreadyAssignedError, USER_ROLES } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import {
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
};

const sampleAssignment = {
  id: 'assignment-uuid-1',
  orderId: 'order-uuid-1',
  carrierId: 'carrier-uuid-1',
  status: 'in_transit',
  assignedAt: '2026-08-01T00:00:00.000Z',
  deliveredAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const sampleCapacity = {
  carriers: [
    { carrierId: 'carrier-uuid-1', carrierName: 'Envíos Rápidos', busy: true, inTransitCount: 1, deliveredCount: 4 },
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
    };
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /delivery/assignments', () => {
    it('returns the assignment list, forwarding status and carrierId filters', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.listAssignments.mockResolvedValue([sampleAssignment]);

      const response = await request(app.getHttpServer()).get(
        '/delivery/assignments?status=in_transit&carrierId=carrier-uuid-1',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleAssignment]);
      expect(service.listAssignments).toHaveBeenCalledWith({
        status: 'in_transit',
        carrierId: 'carrier-uuid-1',
      });
    });

    it('admits a caller with only sales_agent — reads carry no role restriction', async () => {
      app = await buildApp(service, USER_ROLES.sales_agent);
      service.listAssignments.mockResolvedValue([]);

      const response = await request(app.getHttpServer()).get('/delivery/assignments');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /delivery/assignments/by-order/:orderId', () => {
    it('returns the assignment when one exists', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.findAssignmentByOrderId.mockResolvedValue(sampleAssignment);

      const response = await request(app.getHttpServer()).get(
        '/delivery/assignments/by-order/order-uuid-1',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleAssignment);
    });

    it('returns 200 with an empty body (never 404) for an order with no assignment', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.findAssignmentByOrderId.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get(
        '/delivery/assignments/by-order/order-without-assignment',
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

    it('admits a caller with only sales_agent — reads carry no role restriction', async () => {
      app = await buildApp(service, USER_ROLES.sales_agent);
      service.getCarrierCapacity.mockResolvedValue(sampleCapacity);

      const response = await request(app.getHttpServer()).get('/delivery/capacity');

      expect(response.status).toBe(200);
    });
  });

  describe('POST /delivery/assignments', () => {
    it('returns 201 with the created assignment, in_transit', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockResolvedValue(sampleAssignment);

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: 'order-uuid-1', carrierId: 'carrier-uuid-1' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleAssignment);
      expect(response.body.status).toBe('in_transit');
      expect(service.assign).toHaveBeenCalledWith({
        orderId: 'order-uuid-1',
        carrierId: 'carrier-uuid-1',
      });
    });

    it('maps CarrierNotFoundError to 404 for an unknown or inactive carrier', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockRejectedValue(new CarrierNotFoundError('unknown-carrier'));

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: 'order-uuid-1', carrierId: 'unknown-carrier' });

      expect(response.status).toBe(404);
    });

    it('maps OrderAlreadyAssignedError to 409 when the order already has an assignment', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockRejectedValue(new OrderAlreadyAssignedError('order-uuid-1'));

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: 'order-uuid-1', carrierId: 'carrier-uuid-1' });

      expect(response.status).toBe(409);
    });

    it('succeeds with 201 and carries NO warning field even on a coverage mismatch — coverage is advisory (ADR-4)', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.assign.mockResolvedValue(sampleAssignment);

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: 'order-uuid-1', carrierId: 'carrier-uuid-1' });

      expect(response.status).toBe(201);
      expect(response.body).not.toHaveProperty('warning');
    });

    it('admits a warehouse_operator caller -> 201', async () => {
      app = await buildApp(service, USER_ROLES.warehouse_operator);
      service.assign.mockResolvedValue(sampleAssignment);

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: 'order-uuid-1', carrierId: 'carrier-uuid-1' });

      expect(response.status).toBe(201);
    });

    it('rejects a sales_agent caller with 403', async () => {
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer())
        .post('/delivery/assignments')
        .send({ orderId: 'order-uuid-1', carrierId: 'carrier-uuid-1' });

      expect(response.status).toBe(403);
    });
  });
});
