import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import { InvalidWarehouseError, USER_ROLES } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import {
  mockTenantContextService,
  overrideJwtAuth,
  overrideTenantContext,
} from '../test-support/auth-test-helpers.js';
import { WarehouseController } from './warehouse.controller.js';
import { WarehouseService } from './warehouse.service.js';

type WarehouseServiceMock = {
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  findById: jest.Mock;
  list: jest.Mock;
};

const sampleResponse = {
  id: 'warehouse-uuid-1',
  name: 'Pinar del Río',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Builds a test app with `JwtAuthGuard`/`TenantContextGuard` overridden to inject `req.user`/`req.tenant` (`roles: null` -> 401), keeping the REAL `RolesGuard`. */
async function buildApp(service: WarehouseServiceMock, roles: number | null): Promise<INestApplication> {
  const builder = overrideTenantContext(
    overrideJwtAuth(
      Test.createTestingModule({
        controllers: [WarehouseController],
        providers: [
          { provide: WarehouseService, useValue: service },
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

describe('WarehouseController', () => {
  let app: INestApplication;
  let service: WarehouseServiceMock;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
    };

    // `admin` passes every role gate (super-root) — keeps pre-existing tests
    // focused on behavior, not on the role matrix (that's covered below).
    app = await buildApp(service, USER_ROLES.admin);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /warehouses', () => {
    it('returns 201 with the created warehouse', async () => {
      service.create.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer())
        .post('/warehouses')
        .send({ name: 'Pinar del Río' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleResponse);
    });

    it('maps an empty-name InvalidWarehouseError to 400', async () => {
      service.create.mockRejectedValue(new InvalidWarehouseError('Warehouse name must not be empty'));

      const response = await request(app.getHttpServer()).post('/warehouses').send({ name: '' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /warehouses', () => {
    it('returns the active-only list by default', async () => {
      service.list.mockResolvedValue([sampleResponse]);

      const response = await request(app.getHttpServer()).get('/warehouses');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleResponse]);
      expect(service.list).toHaveBeenCalledWith(false);
    });
  });

  describe('GET /warehouses/:id', () => {
    it('returns 200 for a found warehouse', async () => {
      service.findById.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer()).get('/warehouses/warehouse-uuid-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleResponse);
    });

    it('returns 404 for an unknown id', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/warehouses/unknown-id');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /warehouses/:id', () => {
    it('returns 200 with the updated warehouse', async () => {
      service.update.mockResolvedValue({ ...sampleResponse, name: 'Renamed' });

      const response = await request(app.getHttpServer())
        .patch('/warehouses/warehouse-uuid-1')
        .send({ name: 'Renamed' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Renamed');
    });
  });

  describe('DELETE /warehouses/:id', () => {
    it('soft-deletes and returns 200, never a hard delete', async () => {
      const response = await request(app.getHttpServer()).delete('/warehouses/warehouse-uuid-1');

      expect(response.status).toBe(200);
      expect(service.softDelete).toHaveBeenCalledWith('warehouse-uuid-1');
    });
  });

  describe('RolesGuard enforcement (reads: any authenticated user; writes: owner/admin)', () => {
    it('rejects an unauthenticated read with 401', async () => {
      await app.close();
      app = await buildApp(service, null);

      const response = await request(app.getHttpServer()).get('/warehouses');
      expect(response.status).toBe(401);
    });

    it('admits a plain "user" caller on a read route', async () => {
      await app.close();
      service.list.mockResolvedValue([sampleResponse]);
      app = await buildApp(service, USER_ROLES.user);

      const response = await request(app.getHttpServer()).get('/warehouses');
      expect(response.status).toBe(200);
    });

    it('rejects a plain "user" caller writing with 403', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.user);

      const response = await request(app.getHttpServer()).delete('/warehouses/warehouse-uuid-1');
      expect(response.status).toBe(403);
    });

    it('admits an "owner" caller writing -> 200', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.owner);

      const response = await request(app.getHttpServer()).delete('/warehouses/warehouse-uuid-1');
      expect(response.status).toBe(200);
    });
  });
});
