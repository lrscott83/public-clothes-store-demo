import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvalidMoneyError, RateNotFoundError } from '@store-mgmt/domain';
import request from 'supertest';
import { CurrencyController } from './currency.controller.js';
import { CurrencyService } from './currency.service.js';

type CurrencyServiceMock = {
  createRate: jest.Mock;
  getLatestRate: jest.Mock;
  convert: jest.Mock;
};

describe('CurrencyController', () => {
  let app: INestApplication;
  let service: CurrencyServiceMock;

  beforeEach(async () => {
    service = {
      createRate: jest.fn(),
      getLatestRate: jest.fn(),
      convert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CurrencyController],
      providers: [{ provide: CurrencyService, useValue: service }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
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
        channel: 'USD_EFECTIVO',
        rate: '1.000000',
        effectiveFrom: '2026-02-01T00:00:00.000Z',
      });

      const response = await request(app.getHttpServer())
        .get('/currency/rates')
        .query({ channel: 'USD_EFECTIVO' });

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
});
