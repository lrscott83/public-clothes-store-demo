import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvalidCategoryError } from '@store-mgmt/domain';
import request from 'supertest';
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoryController],
      providers: [{ provide: CategoryService, useValue: service }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
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
});
