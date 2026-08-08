import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import { InvalidMoneyError, RateNotFoundError, USER_ROLES } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import {
  mockTenantContextService,
  overrideJwtAuth,
  overrideTenantContext,
} from '../test-support/auth-test-helpers.js';
import { CurrencyController } from './currency.controller.js';
import { CurrencyService } from './currency.service.js';

type CurrencyServiceMock = {
  createRate: jest.Mock;
  getLatestRate: jest.Mock;
  convert: jest.Mock;
};

/** Builds a test app with `JwtAuthGuard`/`TenantContextGuard` overridden to inject `req.user`/`req.tenant` (`roles: null` -> 401), keeping the REAL `RolesGuard`. */
async function buildApp(service: CurrencyServiceMock, roles: number | null): Promise<INestApplication> {
  const builder = overrideTenantContext(
    overrideJwtAuth(
      Test.createTestingModule({
        controllers: [CurrencyController],
        providers: [
          { provide: CurrencyService, useValue: service },
          { provide: TenantContextService, useValue: mockTenantContextService() },
          RolesGuard,
        ],
      }),
      roles,
    ),
  );
  const module: TestingModule = await builder.compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('CurrencyController', () => {
  let app: INestApplication;
  let service: CurrencyServiceMock;

  beforeEach(async () => {
    service = {
      createRate: jest.fn(),
      getLatestRate: jest.fn(),
      convert: jest.fn(),
    };

    // `admin` passes every role gate (super-root) — keeps pre-existing tests
    // focused on behavior, not on the role matrix (that's covered below).
    app = await buildApp(service, USER_ROLES.admin);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /currency/rates', () => {
    it('returns 201 with every money/rate field as a string, plus the persisted row id', async () => {
      service.createRate.mockResolvedValue({
        id: 'rate-uuid-1',
        channel: 'ZELLE',
        rate: '350.455000',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });

      const response = await request(app.getHttpServer())
        .post('/currency/rates')
        .send({ channel: 'ZELLE', rate: '350.455', effectiveFrom: '2026-01-01T00:00:00.000Z' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: 'rate-uuid-1',
        channel: 'ZELLE',
        rate: '350.455000',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });
    });

    it('rejects an unknown channel with 400 without reaching the service', async () => {
      const response = await request(app.getHttpServer())
        .post('/currency/rates')
        .send({ channel: 'BITCOIN', rate: '1', effectiveFrom: '2026-01-01T00:00:00.000Z' });

      expect(response.status).toBe(400);
      expect(service.createRate).not.toHaveBeenCalled();
    });
  });

  describe('GET /currency/rates', () => {
    it('returns the latest rate as a string, plus the persisted row id', async () => {
      service.getLatestRate.mockResolvedValue({
        id: 'rate-uuid-2',
        channel: 'ZELLE',
        rate: '350.455000',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });

      const response = await request(app.getHttpServer())
        .get('/currency/rates')
        .query({ channel: 'ZELLE', at: '2026-02-01T00:00:00.000Z' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'rate-uuid-2',
        channel: 'ZELLE',
        rate: '350.455000',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });
    });

    it('returns id: null when the resolved rate came from a synthetic pivot with no persisted row', async () => {
      service.getLatestRate.mockResolvedValue({
        id: null,
        channel: 'USD_CASH',
        rate: '1.000000',
        effectiveFrom: '2026-02-01T00:00:00.000Z',
      });

      const response = await request(app.getHttpServer())
        .get('/currency/rates')
        .query({ channel: 'USD_CASH' });

      expect(response.status).toBe(200);
      expect(response.body.id).toBeNull();
    });

    it('maps RateNotFoundError to 404, never a 0/null body', async () => {
      service.getLatestRate.mockRejectedValue(new RateNotFoundError('no rate resolvable'));

      const response = await request(app.getHttpServer())
        .get('/currency/rates')
        .query({ channel: 'ZELLE' });

      expect(response.status).toBe(404);
      expect(response.body.rate).toBeUndefined();
    });
  });

  describe('GET /currency/convert', () => {
    it('returns the converted amount and applied rate as strings', async () => {
      service.convert.mockResolvedValue({
        amount: '35045.50',
        currency: 'MN',
        rateApplied: '350.455000',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });

      const response = await request(app.getHttpServer())
        .get('/currency/convert')
        .query({ amount: '100.00', from: 'USD', channel: 'ZELLE', to: 'MN' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        amount: '35045.50',
        currency: 'MN',
        rateApplied: '350.455000',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });
    });

    it('maps RateNotFoundError to 404/422, never 0/null', async () => {
      service.convert.mockRejectedValue(new RateNotFoundError('no rate resolvable'));

      const response = await request(app.getHttpServer())
        .get('/currency/convert')
        .query({ amount: '100.00', from: 'USD', channel: 'ZELLE', to: 'MN' });

      expect(response.status).toBe(404);
      expect(response.body.amount).toBeUndefined();
    });

    it('maps InvalidMoneyError to 400 for a malformed decimal amount', async () => {
      service.convert.mockRejectedValue(new InvalidMoneyError('Invalid decimal string: "not-a-number"'));

      const response = await request(app.getHttpServer())
        .get('/currency/convert')
        .query({ amount: 'not-a-number', from: 'USD', channel: 'ZELLE', to: 'MN' });

      expect(response.status).toBe(400);
    });

    it('rejects an unknown "from" currency with 400 without reaching the service', async () => {
      const response = await request(app.getHttpServer())
        .get('/currency/convert')
        .query({ amount: '100.00', from: 'YEN', channel: 'ZELLE', to: 'MN' });

      expect(response.status).toBe(400);
      expect(service.convert).not.toHaveBeenCalled();
    });
  });

  describe('RolesGuard enforcement (rate reads: any authenticated user; rate writes: owner/admin)', () => {
    it('rejects an unauthenticated read with 401', async () => {
      await app.close();
      app = await buildApp(service, null);

      const response = await request(app.getHttpServer()).get('/currency/rates').query({ channel: 'ZELLE' });
      expect(response.status).toBe(401);
    });

    it('admits a plain "user" caller on a read route', async () => {
      await app.close();
      service.getLatestRate.mockResolvedValue({
        id: 'rate-uuid-2',
        channel: 'ZELLE',
        rate: '350.455000',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });
      app = await buildApp(service, USER_ROLES.user);

      const response = await request(app.getHttpServer()).get('/currency/rates').query({ channel: 'ZELLE' });
      expect(response.status).toBe(200);
    });

    it('rejects a plain "user" caller writing a rate with 403', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.user);

      const response = await request(app.getHttpServer())
        .post('/currency/rates')
        .send({ channel: 'ZELLE', rate: '350.455', effectiveFrom: '2026-01-01T00:00:00.000Z' });
      expect(response.status).toBe(403);
    });

    it('admits an "owner" caller writing a rate -> 201', async () => {
      await app.close();
      service.createRate.mockResolvedValue({
        id: 'rate-uuid-1',
        channel: 'ZELLE',
        rate: '350.455000',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });
      app = await buildApp(service, USER_ROLES.owner);

      const response = await request(app.getHttpServer())
        .post('/currency/rates')
        .send({ channel: 'ZELLE', rate: '350.455', effectiveFrom: '2026-01-01T00:00:00.000Z' });
      expect(response.status).toBe(201);
    });
  });
});
