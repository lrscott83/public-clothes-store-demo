import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import { USER_ROLES } from '@store-mgmt/domain';
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
};

const sampleCarrier = {
  id: 'carrier-uuid-1',
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
    service = { listCarriers: jest.fn(), findCarrierById: jest.fn() };
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

      const response = await request(app.getHttpServer()).get('/delivery/carriers?warehouseId=wh-1');

      expect(response.status).toBe(200);
      expect(service.listCarriers).toHaveBeenCalledWith({ warehouseId: 'wh-1' });
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

      const response = await request(app.getHttpServer()).get('/delivery/carriers/carrier-uuid-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleCarrier);
    });

    it('returns 404 when the carrier does not exist', async () => {
      app = await buildApp(service, USER_ROLES.admin);
      service.findCarrierById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/delivery/carriers/unknown');

      expect(response.status).toBe(404);
    });
  });
});
