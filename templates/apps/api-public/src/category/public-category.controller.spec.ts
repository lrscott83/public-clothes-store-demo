import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CATEGORY_REPOSITORY } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { mockTenantContextService, overridePublicTenant } from '../test-support/tenant-test-helpers.js';
import { PublicCategoryController } from './public-category.controller.js';

type CategoryRepositoryMock = { list: jest.Mock };

async function buildApp(categoryRepository: CategoryRepositoryMock): Promise<INestApplication> {
  const builder = overridePublicTenant(
    Test.createTestingModule({
      controllers: [PublicCategoryController],
      providers: [
        { provide: CATEGORY_REPOSITORY, useValue: categoryRepository },
        { provide: TenantContextService, useValue: mockTenantContextService() },
      ],
    }),
  );
  const module: TestingModule = await builder.compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('PublicCategoryController', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('GET /public/categories returns only id/slug/name/image/order, active-only (no includeInactive override)', async () => {
    const categoryRepository: CategoryRepositoryMock = {
      list: jest.fn().mockResolvedValue([
        {
          id: 'cat-1',
          name: 'Cafeteras',
          slug: 'cafeteras',
          image: 'cafeteras.png',
          icon: 'coffee',
          order: 1,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
    };
    app = await buildApp(categoryRepository);

    const response = await request(app.getHttpServer()).get('/public/categories');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 'cat-1', slug: 'cafeteras', name: 'Cafeteras', image: 'cafeteras.png', order: 1 },
    ]);
    // No args -> ICategoryRepository.list()'s own default excludes
    // active:false; this handler never passes includeInactive.
    expect(categoryRepository.list).toHaveBeenCalledWith();
  });

  it('a category with no image maps to null, never undefined (valid JSON)', async () => {
    const categoryRepository: CategoryRepositoryMock = {
      list: jest.fn().mockResolvedValue([
        {
          id: 'cat-2',
          name: 'Remeras',
          slug: 'remeras',
          image: undefined,
          icon: undefined,
          order: 2,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
    };
    app = await buildApp(categoryRepository);

    const response = await request(app.getHttpServer()).get('/public/categories');

    expect(response.body[0].image).toBeNull();
  });
});
