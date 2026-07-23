import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  InsufficientStockError,
  InvalidOrderError,
  InvalidOrderStateError,
  NegativeStockError,
  RateNotFoundError,
} from '@store-mgmt/domain';
import request from 'supertest';
import { VentasController } from './ventas.controller.js';
import { VentasService } from './ventas.service.js';

type VentasServiceMock = {
  create: jest.Mock;
  update: jest.Mock;
  findById: jest.Mock;
  list: jest.Mock;
  confirm: jest.Mock;
  deliver: jest.Mock;
  cancel: jest.Mock;
};

const sampleResponse = {
  id: 'order-uuid-1',
  customerId: 'customer-uuid-1',
  customerName: 'Ana Torres',
  warehouseId: 'warehouse-uuid-1',
  deliveryMode: 'recogida',
  currency: 'USD',
  status: 'creado',
  subtotal: '100.00',
  discountTotal: '0.00',
  total: '100.00',
  lines: [],
  payments: [],
  saleCredit: null,
  orderDate: '2026-01-01T00:00:00.000Z',
  verifiedAt: null,
  deliveredAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const validCreateBody = {
  customerId: 'customer-uuid-1',
  customerName: 'Ana Torres',
  warehouseId: 'warehouse-uuid-1',
  deliveryMode: 'recogida',
  lines: [
    {
      productId: 'product-uuid-1',
      productName: 'Cafetera Express',
      categoryName: 'Cafeteras',
      price: { amount: '100.00', currency: 'USD' },
      quantity: 1,
    },
  ],
  payments: [{ channel: 'USD_EFECTIVO', amount: { amount: '100.00', currency: 'USD' } }],
};

describe('VentasController', () => {
  let app: INestApplication;
  let service: VentasServiceMock;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      confirm: jest.fn(),
      deliver: jest.fn(),
      cancel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VentasController],
      providers: [{ provide: VentasService, useValue: service }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /orders', () => {
    it('returns 201 with the created order', async () => {
      service.create.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer()).post('/orders').send(validCreateBody);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleResponse);
    });

    it('maps InvalidOrderError to 400', async () => {
      service.create.mockRejectedValue(new InvalidOrderError('Order requires at least one OrderLine'));

      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validCreateBody, lines: [] });

      expect(response.status).toBe(400);
    });

    it('maps RateNotFoundError to 409', async () => {
      service.create.mockRejectedValue(new RateNotFoundError('no rate for EUR_EFECTIVO'));

      const response = await request(app.getHttpServer()).post('/orders').send(validCreateBody);

      expect(response.status).toBe(409);
    });

    it('rejects an unknown line currency with 400 before reaching the service', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({
          ...validCreateBody,
          lines: [{ ...validCreateBody.lines[0], price: { amount: '100.00', currency: 'XYZ' } }],
        });

      expect(response.status).toBe(400);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown payment channel with 400 before reaching the service', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send({ ...validCreateBody, payments: [{ channel: 'BOGUS', amount: { amount: '100.00', currency: 'USD' } }] });

      expect(response.status).toBe(400);
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /orders', () => {
    it('returns the full list', async () => {
      service.list.mockResolvedValue([sampleResponse]);

      const response = await request(app.getHttpServer()).get('/orders');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleResponse]);
      expect(service.list).toHaveBeenCalledWith();
    });
  });

  describe('GET /orders/:id', () => {
    it('returns 200 for a found order', async () => {
      service.findById.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer()).get('/orders/order-uuid-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleResponse);
    });

    it('returns 404 for an unknown id', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/orders/unknown-id');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /orders/:id', () => {
    it('returns 200 with the updated order (creado only)', async () => {
      service.update.mockResolvedValue({ ...sampleResponse, customerName: 'New Name' });

      const response = await request(app.getHttpServer())
        .patch('/orders/order-uuid-1')
        .send({ customerName: 'New Name' });

      expect(response.status).toBe(200);
      expect(response.body.customerName).toBe('New Name');
    });

    it('maps InvalidOrderStateError (not creado) to 409', async () => {
      service.update.mockRejectedValue(new InvalidOrderStateError('order-uuid-1', 'creado', 'verificado'));

      const response = await request(app.getHttpServer())
        .patch('/orders/order-uuid-1')
        .send({ customerName: 'New Name' });

      expect(response.status).toBe(409);
    });

    it('returns 404 for an unknown id', async () => {
      service.update.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .patch('/orders/unknown-id')
        .send({ customerName: 'X' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /orders/:id', () => {
    it('does not exist — an Order is an immutable event and is never deleted', async () => {
      const response = await request(app.getHttpServer()).delete('/orders/order-uuid-1');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /orders/:id/confirm', () => {
    it('returns 200 with the frozen snapshot + reserved stock', async () => {
      service.confirm.mockResolvedValue({ ...sampleResponse, status: 'verificado', verifiedAt: '2026-01-02T00:00:00.000Z' });

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/confirm');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('verificado');
    });

    it('maps InsufficientStockError to 409', async () => {
      service.confirm.mockRejectedValue(new InsufficientStockError('not enough available stock'));

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/confirm');

      expect(response.status).toBe(409);
    });

    it('maps InvalidOrderStateError to 409', async () => {
      service.confirm.mockRejectedValue(new InvalidOrderStateError('order-uuid-1', 'creado', 'entregado'));

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/confirm');

      expect(response.status).toBe(409);
    });

    it('returns 404 for an unknown id', async () => {
      service.confirm.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).post('/orders/unknown-id/confirm');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /orders/:id/deliver', () => {
    it('returns 200 with consumed stock + deliveredAt', async () => {
      service.deliver.mockResolvedValue({ ...sampleResponse, status: 'entregado', deliveredAt: '2026-01-03T00:00:00.000Z' });

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/deliver');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('entregado');
    });

    it('maps NegativeStockError to 409', async () => {
      service.deliver.mockRejectedValue(new NegativeStockError('onHand would go negative'));

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/deliver');

      expect(response.status).toBe(409);
    });
  });

  describe('POST /orders/:id/cancel', () => {
    it('returns 200', async () => {
      service.cancel.mockResolvedValue({ ...sampleResponse, status: 'cancelado' });

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/cancel');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('cancelado');
    });

    it('maps InvalidOrderStateError (entregado terminal) to 409', async () => {
      service.cancel.mockRejectedValue(new InvalidOrderStateError('order-uuid-1', 'creado|verificado', 'entregado'));

      const response = await request(app.getHttpServer()).post('/orders/order-uuid-1/cancel');

      expect(response.status).toBe(409);
    });
  });
});
