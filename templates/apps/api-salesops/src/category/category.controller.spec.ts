import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import { InvalidCategoryError, USER_ROLES } from '@store-mgmt/domain';
import request from 'supertest';
import { overrideJwtAuth } from '../test-support/auth-test-helpers.js';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';

type CategoryServiceMock = {
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  findById: jest.Mock;
  list: jest.Mock;
};

const sampleResponse = {
  id: 'category-uuid-1',
  name: 'Cafeteras',
  slug: 'cafeteras',
  image: null,
  icon: null,
  order: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Builds a test app with `JwtAuthGuard` overridden to inject `req.user` with `roles` (`null` -> 401), keeping the REAL `RolesGuard`. */
async function buildApp(service: CategoryServiceMock, roles: number | null): Promise<INestApplication> {
  const builder = overrideJwtAuth(
    Test.createTestingModule({
      controllers: [CategoryController],
      providers: [{ provide: CategoryService, useValue: service }, RolesGuard],
    }),
    roles,
  );
  const module: TestingModule = await builder.compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('CategoryController', () => {
  let app: INestApplication;
  let service: CategoryServiceMock;

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

  describe('POST /categories', () => {
    it('returns 201 with the created category', async () => {
      service.create.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleResponse);
    });

    it('maps a duplicate-slug InvalidCategoryError to 400', async () => {
      service.create.mockRejectedValue(new InvalidCategoryError('Category slug "cafeteras" already exists'));

      const response = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /categories', () => {
    it('returns the active-only list by default', async () => {
      service.list.mockResolvedValue([sampleResponse]);

      const response = await request(app.getHttpServer()).get('/categories');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleResponse]);
      expect(service.list).toHaveBeenCalledWith(false);
    });
  });

  describe('GET /categories/:id', () => {
    it('returns 200 for a found category', async () => {
      service.findById.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer()).get('/categories/category-uuid-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleResponse);
    });

    it('returns 404 for an unknown id', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/categories/unknown-id');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('returns 200 with the updated category', async () => {
      service.update.mockResolvedValue({ ...sampleResponse, name: 'Cafeteras Updated' });

      const response = await request(app.getHttpServer())
        .patch('/categories/category-uuid-1')
        .send({ name: 'Cafeteras Updated' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Cafeteras Updated');
    });
  });

  describe('DELETE /categories/:id', () => {
    it('soft-deletes and returns 200, never a hard delete', async () => {
      const response = await request(app.getHttpServer()).delete('/categories/category-uuid-1');

      expect(response.status).toBe(200);
      expect(service.softDelete).toHaveBeenCalledWith('category-uuid-1');
    });
  });

  describe('RolesGuard enforcement (reads: any authenticated user; writes: owner/admin)', () => {
    it('rejects an unauthenticated read with 401', async () => {
      await app.close();
      app = await buildApp(service, null);

      const response = await request(app.getHttpServer()).get('/categories');
      expect(response.status).toBe(401);
    });

    it('admits a plain "user" caller on a read route', async () => {
      await app.close();
      service.list.mockResolvedValue([sampleResponse]);
      app = await buildApp(service, USER_ROLES.user);

      const response = await request(app.getHttpServer()).get('/categories');
      expect(response.status).toBe(200);
    });

    it('rejects a plain "user" caller writing with 403', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.user);

      const response = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });
      expect(response.status).toBe(403);
    });

    it('admits an "owner" caller writing -> 201', async () => {
      await app.close();
      service.create.mockResolvedValue(sampleResponse);
      app = await buildApp(service, USER_ROLES.owner);

      const response = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });
      expect(response.status).toBe(201);
    });
  });
});
