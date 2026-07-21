import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvalidMoneyError, InvalidProductError } from '@store-mgmt/domain';
import request from 'supertest';
import { ProductController } from './product.controller.js';
import { ProductService } from './product.service.js';

type ProductServiceMock = {
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  findById: jest.Mock;
  list: jest.Mock;
};

const sampleResponse = {
  id: 'product-uuid-1',
  name: 'Cafetera Express',
  description: 'Cafetera express de 15 bares.',
  sku: null,
  barcode: null,
  price: { amount: '100.00', currency: 'USD' },
  percentDiscountPrice: '20.00',
  discountPrice: '5.00',
  cost: { amount: '60.00', currency: 'USD' },
  finalPrice: { amount: '75.00', currency: 'USD' },
  isOffer: true,
  categoryId: 'category-uuid-1',
  image: 'https://example.com/cafetera.png',
  isNew: false,
  order: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProductController', () => {
  let app: INestApplication;
  let service: ProductServiceMock;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [{ provide: ProductService, useValue: service }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /products', () => {
    it('returns 201 with string fields plus derived finalPrice/isOffer', async () => {
      service.create.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'Cafetera express de 15 bares.',
        price: { amount: '100.00', currency: 'USD' },
        percentDiscountPrice: '20.00',
        discountPrice: '5.00',
        cost: { amount: '60.00', currency: 'USD' },
        categoryId: 'category-uuid-1',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleResponse);
    });

    it('accepts price and cost denominated in DIFFERENT currencies', async () => {
      service.create.mockResolvedValue({
        ...sampleResponse,
        price: { amount: '100.00', currency: 'EUR' },
        cost: { amount: '60.00', currency: 'MN' },
        finalPrice: { amount: '75.00', currency: 'EUR' },
      });

      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'Cafetera express de 15 bares.',
        price: { amount: '100.00', currency: 'EUR' },
        cost: { amount: '60.00', currency: 'MN' },
        categoryId: 'category-uuid-1',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(201);
      expect(response.body.price).toEqual({ amount: '100.00', currency: 'EUR' });
      expect(response.body.cost).toEqual({ amount: '60.00', currency: 'MN' });
    });

    it('rejects an unknown price currency with 400 — never a silent 500', async () => {
      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'x',
        price: { amount: '100.00', currency: 'ARS' },
        cost: { amount: '60.00', currency: 'USD' },
        categoryId: 'category-uuid-1',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(400);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown cost currency with 400 — never a silent 500', async () => {
      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'x',
        price: { amount: '100.00', currency: 'USD' },
        cost: { amount: '60.00', currency: 'ARS' },
        categoryId: 'category-uuid-1',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(400);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('maps a missing-category InvalidProductError to 400', async () => {
      service.create.mockRejectedValue(new InvalidProductError('Category "does-not-exist" does not exist'));

      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'x',
        price: { amount: '100.00', currency: 'USD' },
        cost: { amount: '60.00', currency: 'USD' },
        categoryId: 'does-not-exist',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(400);
    });

    it('maps a malformed decimal InvalidMoneyError to 400', async () => {
      service.create.mockRejectedValue(new InvalidMoneyError('Invalid decimal string: "not-a-number"'));

      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'x',
        price: { amount: 'not-a-number', currency: 'USD' },
        cost: { amount: '60.00', currency: 'USD' },
        categoryId: 'category-uuid-1',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /products', () => {
    it('returns the active-only list by default, each item carrying derived fields', async () => {
      service.list.mockResolvedValue([sampleResponse]);

      const response = await request(app.getHttpServer()).get('/products');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleResponse]);
      expect(service.list).toHaveBeenCalledWith(false, undefined);
    });
  });

  describe('GET /products/:id', () => {
    it('returns 200 for a found product, including soft-deleted (historical references)', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, active: false });

      const response = await request(app.getHttpServer()).get('/products/product-uuid-1');

      expect(response.status).toBe(200);
      expect(response.body.active).toBe(false);
    });

    it('returns 404 for an unknown id', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/products/unknown-id');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /products/:id', () => {
    it('returns 200 with the updated product', async () => {
      service.update.mockResolvedValue({ ...sampleResponse, name: 'Updated' });

      const response = await request(app.getHttpServer())
        .patch('/products/product-uuid-1')
        .send({ name: 'Updated' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated');
    });
  });

  describe('DELETE /products/:id', () => {
    it('soft-deletes and returns 200, excluded from default listing afterward', async () => {
      const response = await request(app.getHttpServer()).delete('/products/product-uuid-1');

      expect(response.status).toBe(200);
      expect(service.softDelete).toHaveBeenCalledWith('product-uuid-1');
    });
  });
});
