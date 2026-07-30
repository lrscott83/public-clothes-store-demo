import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import { CommissionAlreadySettledError, USER_ROLES } from '@store-mgmt/domain';
import request from 'supertest';
import { SAMPLE_AUTH_USER, overrideJwtAuth } from '../test-support/auth-test-helpers.js';
import { CommissionController } from './commission.controller.js';
import { AccrualNotFoundError, CommissionService } from './commission.service.js';

type ServiceMock = {
  listAccruals: jest.Mock;
  recordPayment: jest.Mock;
  report: jest.Mock;
};

const SAMPLE_PAYMENT = {
  id: 'payment-1',
  accrualId: 'accrual-1',
  amount: { amount: '800.00', currency: 'MN' },
  paidAt: '2026-07-31T09:00:00.000Z',
  recordedByCompanyUserId: SAMPLE_AUTH_USER.companyUserId,
  note: null,
};

async function buildApp(service: ServiceMock, roles: number | null): Promise<INestApplication> {
  const builder = overrideJwtAuth(
    Test.createTestingModule({
      controllers: [CommissionController],
      providers: [{ provide: CommissionService, useValue: service }, RolesGuard],
    }),
    roles,
  );
  const module: TestingModule = await builder.compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('CommissionController', () => {
  let app: INestApplication;
  let service: ServiceMock;

  beforeEach(async () => {
    service = {
      listAccruals: jest.fn().mockResolvedValue([]),
      recordPayment: jest.fn().mockResolvedValue(SAMPLE_PAYMENT),
      report: jest.fn().mockResolvedValue([]),
    };
    app = await buildApp(service, USER_ROLES.admin);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /commissions/payments', () => {
    it('records a settlement -> 201, attributed to the authenticated recorder', async () => {
      const response = await request(app.getHttpServer())
        .post('/commissions/payments')
        .send({ accrualId: 'accrual-1' });

      expect(response.status).toBe(201);
      expect(service.recordPayment).toHaveBeenCalledWith(
        expect.objectContaining({ accrualId: 'accrual-1' }),
        SAMPLE_AUTH_USER.companyUserId,
      );
    });

    // R14 — the load-bearing half.
    it('never accepts an amount from the caller — what is owed is the accrual\'s frozen total', async () => {
      await request(app.getHttpServer())
        .post('/commissions/payments')
        .send({ accrualId: 'accrual-1', amount: '999999.00', total: '999999.00' })
        .expect(201);

      const [dto] = service.recordPayment.mock.calls[0] as [Record<string, unknown>];
      expect(dto.amount).toBeUndefined();
      expect(dto.total).toBeUndefined();
    });

    it('rejects a second payment on the same accrual with 409', async () => {
      service.recordPayment.mockRejectedValue(
        new CommissionAlreadySettledError('Accrual "accrual-1" was already settled'),
      );

      const response = await request(app.getHttpServer())
        .post('/commissions/payments')
        .send({ accrualId: 'accrual-1' });

      expect(response.status).toBe(409);
    });

    it('maps an unknown accrual to 404', async () => {
      service.recordPayment.mockRejectedValue(new AccrualNotFoundError('Accrual "ghost" not found'));

      const response = await request(app.getHttpServer())
        .post('/commissions/payments')
        .send({ accrualId: 'ghost' });

      expect(response.status).toBe(404);
    });

    it.each([
      ['a missing accrualId', {}],
      ['a blank accrualId', { accrualId: '   ' }],
      ['an invalid paidAt', { accrualId: 'accrual-1', paidAt: 'no-es-una-fecha' }],
    ])('rejects %s -> 400, nothing recorded', async (_label, body) => {
      const response = await request(app.getHttpServer())
        .post('/commissions/payments')
        .send(body);

      expect(response.status).toBe(400);
      expect(service.recordPayment).not.toHaveBeenCalled();
    });

    it.each([
      ['a sales_agent', USER_ROLES.sales_agent],
      ['a sales_operator', USER_ROLES.sales_operator],
      ['a plain user', USER_ROLES.user],
    ])('DENIES %s -> 403 — nobody marks their own commission as paid', async (_label, roles) => {
      await app.close();
      app = await buildApp(service, roles);

      const response = await request(app.getHttpServer())
        .post('/commissions/payments')
        .send({ accrualId: 'accrual-1' });

      expect(response.status).toBe(403);
      expect(service.recordPayment).not.toHaveBeenCalled();
    });
  });

  describe('GET /commissions/accruals — scoping', () => {
    it('scopes a sales_agent to their OWN accruals', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.sales_agent);

      await request(app.getHttpServer()).get('/commissions/accruals').expect(200);

      expect(service.listAccruals).toHaveBeenCalledWith(SAMPLE_AUTH_USER.companyUserId);
    });

    it.each([
      ['owner', USER_ROLES.owner],
      ['admin', USER_ROLES.admin],
      ['sales_operator', USER_ROLES.sales_operator],
    ])('does NOT scope a %s — a supervisor sees the whole company', async (_label, roles) => {
      await app.close();
      app = await buildApp(service, roles);

      await request(app.getHttpServer()).get('/commissions/accruals').expect(200);

      expect(service.listAccruals).toHaveBeenCalledWith(undefined);
    });

    it('does not scope an owner who ALSO holds the agent bit', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.owner | USER_ROLES.sales_agent);

      await request(app.getHttpServer()).get('/commissions/accruals').expect(200);

      expect(service.listAccruals).toHaveBeenCalledWith(undefined);
    });
  });

  // R16
  describe('GET /commissions/report', () => {
    it('includes an owner who registered and delivered a sale — never filtered by role', async () => {
      // An owner who makes a sale earns on it like anybody else. Filtering
      // them out of the report would silently withhold money they earned.
      service.report.mockResolvedValue([
        {
          companyUserId: 'company-user-owner',
          accrualCount: 1,
          totalAccrued: { amount: '800.00', currency: 'MN' },
          totalPaid: { amount: '0.00', currency: 'MN' },
          totalOutstanding: { amount: '800.00', currency: 'MN' },
          unresolvedLines: 0,
        },
      ]);

      const response = await request(app.getHttpServer()).get('/commissions/report');

      expect(response.status).toBe(200);
      expect(response.body[0].companyUserId).toBe('company-user-owner');
      expect(response.body[0].totalAccrued.amount).toBe('800.00');
    });

    it('admits a sales_agent, scoped to themselves', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.sales_agent);

      await request(app.getHttpServer()).get('/commissions/report').expect(200);

      expect(service.report).toHaveBeenCalledWith(SAMPLE_AUTH_USER.companyUserId);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await app.close();
      app = await buildApp(service, null);

      await request(app.getHttpServer()).get('/commissions/report').expect(401);
    });
  });

  /**
   * R17 / D6 — the combo brackets ("1 y 2 equipos → 3000") are an ORDER-LEVEL
   * rule that conflicts with this module's per-product table. They were left
   * out deliberately, and this asserts they did not creep back in as a
   * convenience helper somewhere in the capability's surface.
   *
   * A structural assertion because the property is "this does not exist" —
   * there is no behavior to exercise, and a behavioral test would pass
   * vacuously whether or not the code was there.
   */
  describe('D6 — no combo-bracket computation exists in this capability', () => {
    const sources = [
      'commission.controller.ts',
      'commission.service.ts',
      'commission-accrual.recorder.ts',
    ].map((file) => readFileSync(join(__dirname, file), 'utf8'));

    it.each([
      ['equipment-count brackets', /\b(1 y 2|3, 4 y 5|6 y 7)\b/],
      ['a combo helper', /combo(Bracket|Commission|Rule)/i],
      ['an equipment-count threshold', /equipmentCount|cantidadEquipos/i],
    ])('contains no %s', (_label, pattern) => {
      for (const source of sources) {
        expect(source).not.toMatch(pattern);
      }
    });
  });
});
