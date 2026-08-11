import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { COMPANY_REPOSITORY } from '@store-mgmt/domain';
import request from 'supertest';
import { overridePublicTenant, SAMPLE_TENANT } from '../test-support/tenant-test-helpers.js';
import { StoreController } from './store.controller.js';

type CompanyRepositoryMock = { findById: jest.Mock };

async function buildApp(companyRepository: CompanyRepositoryMock): Promise<INestApplication> {
  const builder = overridePublicTenant(
    Test.createTestingModule({
      controllers: [StoreController],
      providers: [{ provide: COMPANY_REPOSITORY, useValue: companyRepository }],
    }),
  );
  const module: TestingModule = await builder.compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('StoreController', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('GET /public/store returns only { name, slug } for the resolved tenant', async () => {
    const companyRepository: CompanyRepositoryMock = {
      findById: jest.fn().mockResolvedValue({
        id: SAMPLE_TENANT.companyId,
        name: 'Tienda Prueba',
        slug: 'acme',
        isActive: true,
        schemaName: SAMPLE_TENANT.schemaName,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    };
    app = await buildApp(companyRepository);

    const response = await request(app.getHttpServer()).get('/public/store');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'Tienda Prueba', slug: 'acme' });
    expect(companyRepository.findById).toHaveBeenCalledWith(SAMPLE_TENANT.companyId);
  });

  it('returns 404 if the company vanished between the guard and the handler (defensive)', async () => {
    const companyRepository: CompanyRepositoryMock = { findById: jest.fn().mockResolvedValue(null) };
    app = await buildApp(companyRepository);

    const response = await request(app.getHttpServer()).get('/public/store');

    expect(response.status).toBe(404);
  });
});
