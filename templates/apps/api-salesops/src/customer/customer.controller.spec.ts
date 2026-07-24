import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CustomerUserNotFoundError,
  DuplicateCustomerDocumentError,
  DuplicateCustomerUserError,
  InvalidCustomerError,
} from '@store-mgmt/domain';
import request from 'supertest';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';

type CustomerServiceMock = {
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  findById: jest.Mock;
  list: jest.Mock;
};

const sampleResponse = {
  id: 'customer-uuid-1',
  userId: 'user-uuid-1',
  fullName: 'Ana Torres',
  documentId: null,
  cellPhone: null,
  email: null,
  address: null,
  note: null,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('CustomerController', () => {
  let app: INestApplication;
  let service: CustomerServiceMock;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerController],
      providers: [{ provide: CustomerService, useValue: service }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /customers', () => {
    it('returns 201 with the created customer', async () => {
      service.create.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer())
        .post('/customers')
        .send({ fullName: 'Ana Torres', userId: 'user-uuid-1' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleResponse);
    });

    it('maps an empty-fullName InvalidCustomerError to 400', async () => {
      service.create.mockRejectedValue(new InvalidCustomerError('Customer fullName must not be empty'));

      const response = await request(app.getHttpServer())
        .post('/customers')
        .send({ fullName: '', userId: 'user-uuid-1' });

      expect(response.status).toBe(400);
    });

    it('maps a duplicate documentId DuplicateCustomerDocumentError to 409', async () => {
      service.create.mockRejectedValue(
        new DuplicateCustomerDocumentError('documentId "D1" is already in use'),
      );

      const response = await request(app.getHttpServer())
        .post('/customers')
        .send({ fullName: 'Ana Torres', userId: 'user-uuid-1', documentId: 'D1' });

      expect(response.status).toBe(409);
    });

    it('maps a non-existent userId CustomerUserNotFoundError to 400', async () => {
      service.create.mockRejectedValue(new CustomerUserNotFoundError('User "ghost" does not exist'));

      const response = await request(app.getHttpServer())
        .post('/customers')
        .send({ fullName: 'Ana Torres', userId: 'ghost' });

      expect(response.status).toBe(400);
    });

    it('maps a duplicate userId DuplicateCustomerUserError to 409', async () => {
      service.create.mockRejectedValue(
        new DuplicateCustomerUserError('userId "user-uuid-1" already has a Customer'),
      );

      const response = await request(app.getHttpServer())
        .post('/customers')
        .send({ fullName: 'Ana Torres', userId: 'user-uuid-1' });

      expect(response.status).toBe(409);
    });
  });

  describe('GET /customers', () => {
    it('returns the active-only list by default', async () => {
      service.list.mockResolvedValue([sampleResponse]);

      const response = await request(app.getHttpServer()).get('/customers');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleResponse]);
      expect(service.list).toHaveBeenCalledWith(false);
    });
  });

  describe('GET /customers/:id', () => {
    it('returns 200 for a found customer', async () => {
      service.findById.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer()).get('/customers/customer-uuid-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleResponse);
    });

    it('returns 404 for an unknown id', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/customers/unknown-id');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /customers/:id', () => {
    it('returns 200 with the updated customer', async () => {
      service.update.mockResolvedValue({ ...sampleResponse, cellPhone: '555-1234' });

      const response = await request(app.getHttpServer())
        .patch('/customers/customer-uuid-1')
        .send({ cellPhone: '555-1234' });

      expect(response.status).toBe(200);
      expect(response.body.cellPhone).toBe('555-1234');
    });

    it('maps a duplicate documentId DuplicateCustomerDocumentError to 409', async () => {
      service.update.mockRejectedValue(
        new DuplicateCustomerDocumentError('documentId "D1" is already in use'),
      );

      const response = await request(app.getHttpServer())
        .patch('/customers/customer-uuid-1')
        .send({ documentId: 'D1' });

      expect(response.status).toBe(409);
    });
  });

  describe('DELETE /customers/:id', () => {
    it('soft-deletes and returns 200, never a hard delete', async () => {
      const response = await request(app.getHttpServer()).delete('/customers/customer-uuid-1');

      expect(response.status).toBe(200);
      expect(service.softDelete).toHaveBeenCalledWith('customer-uuid-1');
    });
  });
});
