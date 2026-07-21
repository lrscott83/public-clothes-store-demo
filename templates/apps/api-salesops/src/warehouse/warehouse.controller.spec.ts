import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvalidWarehouseError } from '@store-mgmt/domain';
import request from 'supertest';
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WarehouseController],
      providers: [{ provide: WarehouseService, useValue: service }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
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
});
