import { UnauthorizedException, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { COMPANY_REPOSITORY, DuplicateCompanySlugError, InvalidCompanyError } from '@store-mgmt/domain';
import { JwtAuthGuard } from '@store-mgmt/api-common';
import { CompanyController } from './company.controller.js';
import { CreateCompanySaga } from './create-company.saga.js';

type SagaMock = { run: jest.Mock };
type CompanyRepositoryMock = { findBySlug: jest.Mock };

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
async function buildApp(
  saga: SagaMock,
  authenticated: boolean,
  companyRepository: CompanyRepositoryMock = { findBySlug: jest.fn() },
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [CompanyController],
    providers: [
      { provide: CreateCompanySaga, useValue: saga },
      { provide: COMPANY_REPOSITORY, useValue: companyRepository },
    ],
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

  /**
   * `web-catalog`'s admin needs the tenant's `companyId` to send as
   * `X-Company-Id` on every `api-salesops` call (design.md: `TenantContextGuard`
   * requires it, or falls back ambiguously to the caller's SOLE active
   * membership — unusable once an admin belongs to >1 company, per
   * catalog-admin spec's "no store-switcher" scenario). `JwtAuthGuard` ONLY —
   * no `TenantContextGuard` here either, same reasoning as `POST /companies`:
   * resolving a slug to a company id must work BEFORE any tenant is
   * established for the request, and slug/name are already public via the
   * storefront itself, so no membership check is needed to read them.
   */
  describe('GET /companies/:slug', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const app = await buildApp(saga, false);

      const response = await request(app.getHttpServer()).get('/companies/default');

      expect(response.status).toBe(401);
      await app.close();
    });

    it('resolves a known slug to {id, slug, name} — never the full Company row (no schemaName leak)', async () => {
      const companyRepository = {
        findBySlug: jest.fn().mockResolvedValue({
          id: 'company-1',
          name: 'Urbana Ropa',
          slug: 'default',
          isActive: true,
          schemaName: 'store_mgmt_tenant_company_1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      };
      const app = await buildApp(saga, true, companyRepository);

      const response = await request(app.getHttpServer()).get('/companies/default');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: 'company-1', slug: 'default', name: 'Urbana Ropa' });
      expect(companyRepository.findBySlug).toHaveBeenCalledWith('default');
      await app.close();
    });

    it('returns 404 for an unknown slug — never distinguishes unknown from inactive', async () => {
      const companyRepository = { findBySlug: jest.fn().mockResolvedValue(null) };
      const app = await buildApp(saga, true, companyRepository);

      const response = await request(app.getHttpServer()).get('/companies/does-not-exist');

      expect(response.status).toBe(404);
      await app.close();
    });
  });
});
