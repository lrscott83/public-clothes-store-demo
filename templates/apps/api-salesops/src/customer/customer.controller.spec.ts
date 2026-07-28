import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import {
  CustomerUserNotFoundError,
  DuplicateCustomerDocumentError,
  DuplicateCustomerUserError,
  InvalidCustomerError,
  USER_ROLES,
} from '@store-mgmt/domain';
import request from 'supertest';
import { overrideJwtAuth } from '../test-support/auth-test-helpers.js';
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

/** Builds a test app with `JwtAuthGuard` overridden to inject `req.user` with `roles` (`null` -> 401), keeping the REAL `RolesGuard`. */
async function buildApp(service: CustomerServiceMock, roles: number | null): Promise<INestApplication> {
  const builder = overrideJwtAuth(
    Test.createTestingModule({
      controllers: [CustomerController],
      providers: [{ provide: CustomerService, useValue: service }, RolesGuard],
    }),
    roles,
  );
  const module: TestingModule = await builder.compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

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

    // `admin` passes every role gate (super-root) — keeps pre-existing tests
    // focused on behavior, not on the role matrix (that's covered below).
    app = await buildApp(service, USER_ROLES.admin);
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

  describe('RolesGuard enforcement (every route: owner/admin/sales_operator only)', () => {
    it('rejects an unauthenticated request with 401', async () => {
      await app.close();
      app = await buildApp(service, null);

      const response = await request(app.getHttpServer()).get('/customers');
      expect(response.status).toBe(401);
    });

    it('rejects a plain "user" caller with 403 — customer data is cockpit-internal', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.user);

      const response = await request(app.getHttpServer()).get('/customers');
      expect(response.status).toBe(403);
    });

    it('admits a "sales_operator" caller -> 200', async () => {
      await app.close();
      service.list.mockResolvedValue([sampleResponse]);
      app = await buildApp(service, USER_ROLES.sales_operator);

      const response = await request(app.getHttpServer()).get('/customers');
      expect(response.status).toBe(200);
    });

    it('admits an "admin" caller (super-root) -> 200', async () => {
      await app.close();
      service.list.mockResolvedValue([sampleResponse]);
      app = await buildApp(service, USER_ROLES.admin);

      const response = await request(app.getHttpServer()).get('/customers');
      expect(response.status).toBe(200);
    });
  });

  describe('sales_agent — READ only', () => {
    // A sales agent books orders for customers, so it must be able to find
    // one. The WRITE routes stay closed here on purpose: `POST /customers`
    // takes an arbitrary existing `userId`, so granting it would let an agent
    // bind a customer record to ANY identity, the owner's included. The
    // agent's own create path is a separate endpoint that mints the identity
    // itself and never accepts a caller-supplied `userId`.
    it('admits a sales_agent on GET /customers -> 200', async () => {
      await app.close();
      service.list.mockResolvedValue([sampleResponse]);
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer()).get('/customers');
      expect(response.status).toBe(200);
    });

    it('admits a sales_agent on GET /customers/:id -> 200', async () => {
      await app.close();
      service.findById.mockResolvedValue(sampleResponse);
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer()).get('/customers/customer-1');
      expect(response.status).toBe(200);
    });

    it('DENIES a sales_agent on POST /customers -> 403 (attach-to-existing-identity path)', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.sales_agent);

      const response = await request(app.getHttpServer())
        .post('/customers')
        .send({ fullName: 'Ana Torres', userId: 'someone-elses-user-id' });
      expect(response.status).toBe(403);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('DENIES a sales_agent on PATCH and DELETE -> 403', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.sales_agent);

      await request(app.getHttpServer())
        .patch('/customers/customer-1')
        .send({ fullName: 'Nuevo' })
        .expect(403);
      await request(app.getHttpServer()).delete('/customers/customer-1').expect(403);
      expect(service.update).not.toHaveBeenCalled();
      expect(service.softDelete).not.toHaveBeenCalled();
    });
  });
});
