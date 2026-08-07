import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import {
  CarrierHasOpenAssignmentsError,
  CarrierNotFoundError,
  CoverageAlreadyDeclaredError,
  CoverageWarehouseNotFoundError,
  USER_ROLES,
} from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import {
  mockTenantContextService,
  overrideJwtAuth,
  overrideTenantContext,
} from '../test-support/auth-test-helpers.js';
import { CarrierController } from './carrier.controller.js';
import { DeliveryService } from './delivery.service.js';

type DeliveryServiceMock = {
  listCarriers: jest.Mock;
  findCarrierById: jest.Mock;
  createCarrier: jest.Mock;
  updateCarrier: jest.Mock;
  deactivateCarrier: jest.Mock;
  addCarrierCoverage: jest.Mock;
  removeCarrierCoverage: jest.Mock;
};

/**
 * Real UUIDs, not readable placeholders: every `:id`/`:warehouseId` on this
 * controller reaches a `@db.Uuid` column and is now validated at the boundary
 * (`assertUuid`), so a spec using `carrier-uuid-1` would be asserting a 400.
 */
const CARRIER_ID = '3f9a5c22-0a7e-4c1b-9a55-2e6d4b8f1c03';
const UNKNOWN_CARRIER_ID = '00000000-0000-4000-8000-000000000fff';

const sampleCoverage = {
  id: '2f7c1b90-9d34-4f6e-9a11-3b8e5c0d7a21',
  carrierId: CARRIER_ID,
  warehouseId: '9c1e7a30-5b42-4f88-a1d6-77e0c3b45912',
  createdAt: '2026-08-01T00:00:00.000Z',
};

const sampleCarrier = {
  id: CARRIER_ID,
  name: 'Envíos Rápidos',
  phone: null,
  active: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

async function buildApp(service: DeliveryServiceMock, roles: number | null): Promise<INestApplication> {
  const builder = overrideTenantContext(
    overrideJwtAuth(
      Test.createTestingModule({
        controllers: [CarrierController],
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

describe('CarrierController', () => {
  let app: INestApplication;
  let service: DeliveryServiceMock;

  beforeEach(() => {
    service = {
      listCarriers: jest.fn(),
      findCarrierById: jest.fn(),
      createCarrier: jest.fn(),
      updateCarrier: jest.fn(),
      deactivateCarrier: jest.fn(),
      addCarrierCoverage: jest.fn(),
      removeCarrierCoverage: jest.fn(),
    };
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /delivery/carriers', () => {
    it('returns the carrier list', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.listCarriers.mockResolvedValue([sampleCarrier]);

      const response = await request(app.getHttpServer()).get('/delivery/carriers');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleCarrier]);
      expect(service.listCarriers).toHaveBeenCalledWith({ warehouseId: undefined });
    });

    it('forwards warehouseId when given', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.listCarriers.mockResolvedValue([{ ...sampleCarrier, coversWarehouse: true }]);

      const response = await request(app.getHttpServer()).get(
        `/delivery/carriers?warehouseId=${sampleCoverage.warehouseId}`,
      );

      expect(response.status).toBe(200);
      expect(service.listCarriers).toHaveBeenCalledWith({
        warehouseId: sampleCoverage.warehouseId,
      });
    });

    it('rejects a warehouseId that is not a UUID with 400', async () => {
      app = await buildApp(service, USER_ROLES.admin);

      // `coversWarehouse` is now resolved with a single `listByWarehouse`
      // query against a `@db.Uuid` column. A malformed value reaches Postgres
      // as invalid uuid syntax (Prisma P2007) and, uncaught, is a 500.
      const response = await request(app.getHttpServer()).get('/delivery/carriers?warehouseId=wh-1');

      expect(response.status).toBe(400);
      expect(service.listCarriers).not.toHaveBeenCalled();
    });

    it('admits a caller with only sales_agent — reads carry no role restriction', async () => {
      app = await buildApp(service, USER_ROLES.sales_agent);
      service.listCarriers.mockResolvedValue([]);

      const response = await request(app.getHttpServer()).get('/delivery/carriers');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /delivery/carriers/:id', () => {
    it('returns the carrier when found', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.findCarrierById.mockResolvedValue(sampleCarrier);

      const response = await request(app.getHttpServer()).get(`/delivery/carriers/${CARRIER_ID}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleCarrier);
    });

    it('returns 404 when the carrier does not exist', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.findCarrierById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get(`/delivery/carriers/${UNKNOWN_CARRIER_ID}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /delivery/carriers', () => {
    it('returns 201 with the created carrier', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.createCarrier.mockResolvedValue(sampleCarrier);

      const response = await request(app.getHttpServer())
        .post('/delivery/carriers')
        .send({ name: 'Envíos Rápidos' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleCarrier);
      expect(service.createCarrier).toHaveBeenCalledWith({ name: 'Envíos Rápidos' });
    });

    it('admits an admin caller -> 201', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.createCarrier.mockResolvedValue(sampleCarrier);

      const response = await request(app.getHttpServer())
        .post('/delivery/carriers')
        .send({ name: 'Envíos Rápidos' });

      expect(response.status).toBe(201);
    });

    it('rejects a warehouse_operator caller with 403', async () => {
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer())
        .post('/delivery/carriers')
        .send({ name: 'Envíos Rápidos' });

      expect(response.status).toBe(403);
    });

    it('rejects a sales_agent caller with 403', async () => {
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer())
        .post('/delivery/carriers')
        .send({ name: 'Envíos Rápidos' });

      expect(response.status).toBe(403);
    });

    describe('boundary validation (this app installs no global ValidationPipe)', () => {
      it.each([
        ['an empty body', {}],
        ['a missing name', { phone: '+53 5 555 0101' }],
        ['a non-string name', { name: 42 }],
        ['a blank name', { name: '   ' }],
        ['a non-string phone', { name: 'Envíos Rápidos', phone: 42 }],
        ['a non-boolean active', { name: 'Envíos Rápidos', active: 'yes' }],
      ])('rejects %s with 400, never reaching the service', async (_label, body) => {
        app = await buildApp(service, USER_ROLES.owner);

        const response = await request(app.getHttpServer()).post('/delivery/carriers').send(body);

        expect(response.status).toBe(400);
        expect(service.createCarrier).not.toHaveBeenCalled();
      });

      it('accepts an explicit null phone — null CLEARS the column, it is not a missing value', async () => {
        app = await buildApp(service, USER_ROLES.owner);
        service.createCarrier.mockResolvedValue(sampleCarrier);

        const response = await request(app.getHttpServer())
          .post('/delivery/carriers')
          .send({ name: 'Envíos Rápidos', phone: null });

        expect(response.status).toBe(201);
      });
    });
  });

  describe('PATCH /delivery/carriers/:id', () => {
    it('returns 200 with the updated carrier', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.updateCarrier.mockResolvedValue({ ...sampleCarrier, name: 'Renamed' });

      const response = await request(app.getHttpServer())
        .patch(`/delivery/carriers/${CARRIER_ID}`)
        .send({ name: 'Renamed' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Renamed');
      expect(service.updateCarrier).toHaveBeenCalledWith(CARRIER_ID, { name: 'Renamed' });
    });

    it('rejects a warehouse_operator caller with 403', async () => {
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer())
        .patch(`/delivery/carriers/${CARRIER_ID}`)
        .send({ name: 'Renamed' });

      expect(response.status).toBe(403);
    });

    it('rejects a sales_agent caller with 403', async () => {
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer())
        .patch(`/delivery/carriers/${CARRIER_ID}`)
        .send({ name: 'Renamed' });

      expect(response.status).toBe(403);
    });

    it.each([
      ['a blank name', { name: '  ' }],
      ['a non-string name', { name: 42 }],
      ['a non-boolean active', { active: 'yes' }],
    ])('rejects %s with 400 — every field is optional, but a PRESENT one must be valid', async (_label, body) => {
      app = await buildApp(service, USER_ROLES.owner);

      const response = await request(app.getHttpServer())
        .patch(`/delivery/carriers/${CARRIER_ID}`)
        .send(body);

      expect(response.status).toBe(400);
      expect(service.updateCarrier).not.toHaveBeenCalled();
    });

    it('accepts an empty patch body — nothing present, nothing to reject', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.updateCarrier.mockResolvedValue(sampleCarrier);

      const response = await request(app.getHttpServer())
        .patch(`/delivery/carriers/${CARRIER_ID}`)
        .send({});

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /delivery/carriers/:id', () => {
    it('soft-deletes and returns 200, never a hard delete', async () => {
      app = await buildApp(service, USER_ROLES.owner);

      const response = await request(app.getHttpServer()).delete(`/delivery/carriers/${CARRIER_ID}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: CARRIER_ID });
      expect(service.deactivateCarrier).toHaveBeenCalledWith(CARRIER_ID);
    });

    it('rejects a warehouse_operator caller with 403', async () => {
      app = await buildApp(service, USER_ROLES.warehouse_operator);

      const response = await request(app.getHttpServer()).delete(`/delivery/carriers/${CARRIER_ID}`);

      expect(response.status).toBe(403);
    });

    it('rejects a sales_agent caller with 403', async () => {
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer()).delete(`/delivery/carriers/${CARRIER_ID}`);

      expect(response.status).toBe(403);
    });

    it('maps CarrierHasOpenAssignmentsError to 409 — deactivating would hide its in-flight orders', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.deactivateCarrier.mockRejectedValue(
        new CarrierHasOpenAssignmentsError(CARRIER_ID, 2),
      );

      const response = await request(app.getHttpServer()).delete(`/delivery/carriers/${CARRIER_ID}`);

      expect(response.status).toBe(409);
    });
  });

  /**
   * Without a write surface, `ICarrierWarehouseRepository.add`/`remove` were
   * implemented and tested but called from NOWHERE in production — so
   * `coversWarehouse` was uniformly `false` on every read, an actively
   * misleading advisory signal.
   */
  describe('POST /delivery/carriers/:id/warehouses', () => {
    it('returns 201 with the created coverage row', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.addCarrierCoverage.mockResolvedValue(sampleCoverage);

      const response = await request(app.getHttpServer())
        .post(`/delivery/carriers/${CARRIER_ID}/warehouses`)
        .send({ warehouseId: sampleCoverage.warehouseId });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleCoverage);
      expect(service.addCarrierCoverage).toHaveBeenCalledWith(
        CARRIER_ID,
        sampleCoverage.warehouseId,
      );
    });

    it('maps CarrierNotFoundError to 404', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.addCarrierCoverage.mockRejectedValue(new CarrierNotFoundError(UNKNOWN_CARRIER_ID));

      const response = await request(app.getHttpServer())
        .post(`/delivery/carriers/${UNKNOWN_CARRIER_ID}/warehouses`)
        .send({ warehouseId: sampleCoverage.warehouseId });

      expect(response.status).toBe(404);
    });

    it('maps CoverageWarehouseNotFoundError to 404 for an unknown warehouse', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.addCarrierCoverage.mockRejectedValue(
        new CoverageWarehouseNotFoundError(sampleCoverage.warehouseId),
      );

      const response = await request(app.getHttpServer())
        .post(`/delivery/carriers/${CARRIER_ID}/warehouses`)
        .send({ warehouseId: sampleCoverage.warehouseId });

      expect(response.status).toBe(404);
    });

    it('maps CoverageAlreadyDeclaredError to 409 for a duplicate pair', async () => {
      app = await buildApp(service, USER_ROLES.owner);
      service.addCarrierCoverage.mockRejectedValue(
        new CoverageAlreadyDeclaredError(CARRIER_ID, sampleCoverage.warehouseId),
      );

      const response = await request(app.getHttpServer())
        .post(`/delivery/carriers/${CARRIER_ID}/warehouses`)
        .send({ warehouseId: sampleCoverage.warehouseId });

      expect(response.status).toBe(409);
    });

    it.each([
      ['an empty body', {}],
      ['a blank warehouseId', { warehouseId: '  ' }],
      ['a non-string warehouseId', { warehouseId: 42 }],
      ['a warehouseId that is not a UUID', { warehouseId: 'wh-1' }],
    ])('rejects %s with 400', async (_label, body) => {
      app = await buildApp(service, USER_ROLES.owner);

      const response = await request(app.getHttpServer())
        .post(`/delivery/carriers/${CARRIER_ID}/warehouses`)
        .send(body);

      expect(response.status).toBe(400);
      expect(service.addCarrierCoverage).not.toHaveBeenCalled();
    });

    it.each([
      ['warehouse_operator', USER_ROLES.warehouse_operator],
      ['sales_agent', USER_ROLES.sales_agent],
    ])('rejects a %s caller with 403 — same posture as the other carrier writes', async (_label, roles) => {
      app = await buildApp(service, roles);

      const response = await request(app.getHttpServer())
        .post(`/delivery/carriers/${CARRIER_ID}/warehouses`)
        .send({ warehouseId: sampleCoverage.warehouseId });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /delivery/carriers/:id/warehouses/:warehouseId', () => {
    it('removes the coverage row and returns 200', async () => {
      app = await buildApp(service, USER_ROLES.owner);

      const response = await request(app.getHttpServer()).delete(
        `/delivery/carriers/${CARRIER_ID}/warehouses/${sampleCoverage.warehouseId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        carrierId: CARRIER_ID,
        warehouseId: sampleCoverage.warehouseId,
      });
      expect(service.removeCarrierCoverage).toHaveBeenCalledWith(
        CARRIER_ID,
        sampleCoverage.warehouseId,
      );
    });

    it.each([
      ['warehouse_operator', USER_ROLES.warehouse_operator],
      ['sales_agent', USER_ROLES.sales_agent],
    ])('rejects a %s caller with 403', async (_label, roles) => {
      app = await buildApp(service, roles);

      const response = await request(app.getHttpServer()).delete(
        `/delivery/carriers/${CARRIER_ID}/warehouses/${sampleCoverage.warehouseId}`,
      );

      expect(response.status).toBe(403);
    });
  });

  /**
   * CLASS A — every value that reaches a `@db.Uuid` column is validated as a
   * UUID, whatever param source it came from. NOT ONE path param on this
   * controller was validated before; `removeCoverage` even validated
   * `:warehouseId` and not `:id`, in the same signature. A malformed uuid
   * reaching Postgres is P2007 — a 500 for a plainly bad request.
   */
  describe('every uuid-bound param is validated (CLASS A)', () => {
    const MALFORMED = 'not-a-uuid';

    beforeEach(async () => {
      app = await buildApp(service, USER_ROLES.owner);
    });

    it('GET /delivery/carriers/:id -> 400', async () => {
      const response = await request(app.getHttpServer()).get(`/delivery/carriers/${MALFORMED}`);

      expect(response.status).toBe(400);
      expect(service.findCarrierById).not.toHaveBeenCalled();
    });

    it('PATCH /delivery/carriers/:id -> 400', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/delivery/carriers/${MALFORMED}`)
        .send({ name: 'Renamed' });

      expect(response.status).toBe(400);
      expect(service.updateCarrier).not.toHaveBeenCalled();
    });

    it('DELETE /delivery/carriers/:id -> 400', async () => {
      const response = await request(app.getHttpServer()).delete(`/delivery/carriers/${MALFORMED}`);

      expect(response.status).toBe(400);
      expect(service.deactivateCarrier).not.toHaveBeenCalled();
    });

    it('POST /delivery/carriers/:id/warehouses -> 400 on the PATH id', async () => {
      const response = await request(app.getHttpServer())
        .post(`/delivery/carriers/${MALFORMED}/warehouses`)
        .send({ warehouseId: sampleCoverage.warehouseId });

      expect(response.status).toBe(400);
      expect(service.addCarrierCoverage).not.toHaveBeenCalled();
    });

    it('POST /delivery/carriers/:id/warehouses -> 400 on the BODY warehouseId', async () => {
      const response = await request(app.getHttpServer())
        .post(`/delivery/carriers/${CARRIER_ID}/warehouses`)
        .send({ warehouseId: MALFORMED });

      expect(response.status).toBe(400);
      expect(service.addCarrierCoverage).not.toHaveBeenCalled();
    });

    // The asymmetry that named this class: `:warehouseId` was validated here
    // and `:id` was not, in one signature.
    it('DELETE /delivery/carriers/:id/warehouses/:warehouseId -> 400 on EITHER param', async () => {
      const badId = await request(app.getHttpServer()).delete(
        `/delivery/carriers/${MALFORMED}/warehouses/${sampleCoverage.warehouseId}`,
      );
      const badWarehouse = await request(app.getHttpServer()).delete(
        `/delivery/carriers/${CARRIER_ID}/warehouses/${MALFORMED}`,
      );

      expect(badId.status).toBe(400);
      expect(badWarehouse.status).toBe(400);
      expect(service.removeCarrierCoverage).not.toHaveBeenCalled();
    });

    it('GET /delivery/carriers?warehouseId= -> 400', async () => {
      const response = await request(app.getHttpServer()).get(
        `/delivery/carriers?warehouseId=${MALFORMED}`,
      );

      expect(response.status).toBe(400);
      expect(service.listCarriers).not.toHaveBeenCalled();
    });
  });
});
