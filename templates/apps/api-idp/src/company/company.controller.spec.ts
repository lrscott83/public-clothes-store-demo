import { UnauthorizedException, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DuplicateCompanySlugError, InvalidCompanyError } from '@store-mgmt/domain';
import { JwtAuthGuard } from '@store-mgmt/api-common';
import { CompanyController } from './company.controller.js';
import { CreateCompanySaga } from './create-company.saga.js';

type SagaMock = { run: jest.Mock };

const AUTH_USER = {
  id: 'user-1',
  login: 'jdoe',
  fullName: 'John Doe',
  email: null,
  cellPhone: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const SAGA_RESULT = {
  companyId: 'company-1',
  schemaName: 'store_mgmt_tenant_company_1',
  ownerCompanyUserId: 'user-1',
  categoriesCopied: 11,
  productsCopied: 99,
};

/** Builds a test app with `JwtAuthGuard` overridden to inject `req.user`, exercising the REAL controller (no `TenantContextGuard`/`RolesGuard` — this endpoint provisions the tenant, it does not consume one). */
async function buildApp(saga: SagaMock, authenticated: boolean): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [CompanyController],
    providers: [{ provide: CreateCompanySaga, useValue: saga }],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context: ExecutionContext) => {
        if (!authenticated) {
          throw new UnauthorizedException();
        }
        const req = context.switchToHttp().getRequest();
        req.user = AUTH_USER;
        return true;
      },
    })
    .compile();

  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('CompanyController', () => {
  let saga: SagaMock;

  beforeEach(() => {
    saga = { run: jest.fn() };
  });

  describe('POST /companies', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const app = await buildApp(saga, false);

      const response = await request(app.getHttpServer())
        .post('/companies')
        .send({ name: 'Tienda Nueva', slug: 'tienda-nueva' });

      expect(response.status).toBe(401);
      expect(saga.run).not.toHaveBeenCalled();
      await app.close();
    });

    it('calls the saga with the AUTHENTICATED caller as ownerId — never from the request body', async () => {
      const app = await buildApp(saga, true);
      saga.run.mockResolvedValue(SAGA_RESULT);

      const response = await request(app.getHttpServer())
        .post('/companies')
        .send({ name: 'Tienda Nueva', slug: 'tienda-nueva', ownerId: 'someone-else' });

      expect(response.status).toBe(201);
      expect(saga.run).toHaveBeenCalledWith({ name: 'Tienda Nueva', slug: 'tienda-nueva', ownerId: AUTH_USER.id });
      expect(response.body).toEqual(SAGA_RESULT);
      await app.close();
    });

    it('maps InvalidCompanyError to 400', async () => {
      const app = await buildApp(saga, true);
      saga.run.mockRejectedValue(new InvalidCompanyError('Company name must not be empty or whitespace-only'));

      const response = await request(app.getHttpServer())
        .post('/companies')
        .send({ name: 'Tienda Nueva', slug: 'tienda-nueva' });

      expect(response.status).toBe(400);
      await app.close();
    });

    it('maps DuplicateCompanySlugError to 409', async () => {
      const app = await buildApp(saga, true);
      saga.run.mockRejectedValue(new DuplicateCompanySlugError('slug "tienda-nueva" is already in use'));

      const response = await request(app.getHttpServer())
        .post('/companies')
        .send({ name: 'Tienda Nueva', slug: 'tienda-nueva' });

      expect(response.status).toBe(409);
      await app.close();
    });
  });
});
