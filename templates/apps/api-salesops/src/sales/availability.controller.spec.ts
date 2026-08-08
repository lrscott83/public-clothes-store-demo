import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import { USER_ROLES, type Warehouse } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import {
  mockTenantContextService,
  overrideJwtAuth,
  overrideTenantContext,
} from '../test-support/auth-test-helpers.js';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';

function warehouse(id: string, name: string): Warehouse {
  return {
    id,
    name,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as Warehouse;
}

async function buildApp(roles: number | null, eligible: Warehouse[] = []): Promise<INestApplication> {
  const service = { eligibleWarehousesFor: jest.fn().mockResolvedValue(eligible) };
  const builder = Test.createTestingModule({
    controllers: [AvailabilityController],
    providers: [
      RolesGuard,
      { provide: AvailabilityService, useValue: service },
      { provide: TenantContextService, useValue: mockTenantContextService() },
    ],
  });
  const moduleRef = await overrideTenantContext(overrideJwtAuth(builder, roles)).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return app;
}

describe('AvailabilityController — GET /orders/availability', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  const basket = [{ productId: 'p-1', quantity: 2 }];

  it('admits a sales_agent — the role that needs this read', async () => {
    app = await buildApp(USER_ROLES.sales_agent, [warehouse('w-1', 'Central')]);

    const response = await request(app.getHttpServer())
      .post('/orders/availability')
      .send({ lines: basket });

    expect(response.status).toBe(200);
    expect(response.body.warehouses).toEqual([{ id: 'w-1', name: 'Central' }]);
  });

  it('admits owner and admin', async () => {
    app = await buildApp(USER_ROLES.owner, []);
    await request(app.getHttpServer()).post('/orders/availability').send({ lines: basket }).expect(200);
  });

  it('rejects an unauthenticated request with 401', async () => {
    app = await buildApp(null);
    await request(app.getHttpServer()).post('/orders/availability').send({ lines: basket }).expect(401);
  });

  it('rejects a role holding none of the required bits with 403', async () => {
    app = await buildApp(USER_ROLES.user);
    await request(app.getHttpServer()).post('/orders/availability').send({ lines: basket }).expect(403);
  });

  it('returns 200 with an empty list when nothing qualifies — not 404, not an error', async () => {
    app = await buildApp(USER_ROLES.sales_agent, []);

    const response = await request(app.getHttpServer())
      .post('/orders/availability')
      .send({ lines: basket });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ warehouses: [] });
  });

  it('rejects an empty basket with 400', async () => {
    app = await buildApp(USER_ROLES.sales_agent);
    await request(app.getHttpServer()).post('/orders/availability').send({ lines: [] }).expect(400);
  });

  it('rejects a line with a non-positive or non-integer quantity with 400', async () => {
    app = await buildApp(USER_ROLES.sales_agent);
    await request(app.getHttpServer())
      .post('/orders/availability')
      .send({ lines: [{ productId: 'p-1', quantity: 0 }] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/orders/availability')
      .send({ lines: [{ productId: 'p-1', quantity: 1.5 }] })
      .expect(400);
  });
});
