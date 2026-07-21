import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvalidStockMovementError, NegativeStockError } from '@store-mgmt/domain';
import request from 'supertest';
import { StockController } from './stock.controller.js';
import { StockService } from './stock.service.js';

type StockServiceMock = {
  getLevel: jest.Mock;
  recordMovement: jest.Mock;
};

const sampleLevelResponse = {
  productId: 'product-uuid-1',
  warehouseId: 'warehouse-uuid-1',
  onHand: '10',
  reserved: '3',
  available: '7',
};

const sampleMovementResponse = {
  id: 'movement-uuid-1',
  productId: 'product-uuid-1',
  warehouseId: 'warehouse-uuid-1',
  type: 'purchase_in',
  reason: null,
  quantity: '10',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: null,
  stockLevel: { ...sampleLevelResponse, onHand: '20', available: '17' },
};

describe('StockController', () => {
  let app: INestApplication;
  let service: StockServiceMock;

  beforeEach(async () => {
    service = {
      getLevel: jest.fn(),
      recordMovement: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockController],
      providers: [{ provide: StockService, useValue: service }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /stock', () => {
    it('returns 200 with string available', async () => {
      service.getLevel.mockResolvedValue(sampleLevelResponse);

      const response = await request(app.getHttpServer()).get(
        '/stock?productId=product-uuid-1&warehouseId=warehouse-uuid-1',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleLevelResponse);
      expect(service.getLevel).toHaveBeenCalledWith('product-uuid-1', 'warehouse-uuid-1');
    });
  });

  describe('POST /stock/movements', () => {
    it('returns 201 with the movement + resulting level', async () => {
      service.recordMovement.mockResolvedValue(sampleMovementResponse);

      const response = await request(app.getHttpServer()).post('/stock/movements').send({
        productId: 'product-uuid-1',
        warehouseId: 'warehouse-uuid-1',
        type: 'purchase_in',
        quantity: '10',
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleMovementResponse);
    });

    it('rejects an unknown movement type with 400 — never a silent 500', async () => {
      const response = await request(app.getHttpServer()).post('/stock/movements').send({
        productId: 'product-uuid-1',
        warehouseId: 'warehouse-uuid-1',
        type: 'not-a-real-type',
        quantity: '10',
      });

      expect(response.status).toBe(400);
      expect(service.recordMovement).not.toHaveBeenCalled();
    });

    it('maps an unknown-product InvalidStockMovementError to 400', async () => {
      service.recordMovement.mockRejectedValue(
        new InvalidStockMovementError('Product "unknown" does not exist'),
      );

      const response = await request(app.getHttpServer()).post('/stock/movements').send({
        productId: 'unknown',
        warehouseId: 'warehouse-uuid-1',
        type: 'purchase_in',
        quantity: '10',
      });

      expect(response.status).toBe(400);
    });

    it('maps a NegativeStockError to 400', async () => {
      service.recordMovement.mockRejectedValue(
        new NegativeStockError('Movement sale_out of 10 would drive onHand negative (have 5)'),
      );

      const response = await request(app.getHttpServer()).post('/stock/movements').send({
        productId: 'product-uuid-1',
        warehouseId: 'warehouse-uuid-1',
        type: 'sale_out',
        quantity: '10',
      });

      expect(response.status).toBe(400);
    });

    it('rejects a non-positive quantity with 400 via a mapped InvalidStockMovementError', async () => {
      service.recordMovement.mockRejectedValue(
        new InvalidStockMovementError('StockMovement quantity must be a positive integer (got 0)'),
      );

      const response = await request(app.getHttpServer()).post('/stock/movements').send({
        productId: 'product-uuid-1',
        warehouseId: 'warehouse-uuid-1',
        type: 'purchase_in',
        quantity: '0',
      });

      expect(response.status).toBe(400);
    });
  });
});
