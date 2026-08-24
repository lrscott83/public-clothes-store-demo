import { ConflictException, UnauthorizedException, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { COMPANY_REPOSITORY, USER_REPOSITORY, type Company } from '@store-mgmt/domain';
import { JwtAuthGuard } from '@store-mgmt/api-common';
import { installGlobalPipes } from '../main-setup.js';
import { CreateCompanySaga } from '../company/create-company.saga.js';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';

type CompanyRepositoryMock = { list: jest.Mock; findById: jest.Mock };
type UserRepositoryMock = { create: jest.Mock };
type SagaMock = { run: jest.Mock };

const SUPERADMIN_USER = {
  id: 'root-1',
  login: 'root',
  fullName: 'Root',
  email: null,
  cellPhone: null,
  isActive: true,
  isSuperadmin: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const PLAIN_USER = { ...SUPERADMIN_USER, id: 'user-2', login: 'jdoe', isSuperadmin: false };

const PROVISIONED: Company = {
  id: 'company-1',
  name: 'Urbana Ropa',
  slug: 'urbana',
  isActive: true,
  schemaName: 'store_mgmt_tenant_company_1',
  type: 'catalog',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

// Scenario: "Listing includes unprovisioned companies" — schemaName NULL row
// must appear in the list too.
const UNPROVISIONED: Company = {
  id: 'company-2',
  name: 'Pendiente SA',
  slug: 'pendiente',
  isActive: false,
  schemaName: null,
  type: null,
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

interface Deps {
  companyRepository: CompanyRepositoryMock;
  userRepository: UserRepositoryMock;
  saga: SagaMock;
}

const SAGA_COMPANY: Company = {
  id: 'company-new',
  name: 'Tienda Nueva',
  slug: 'tienda-nueva',
  isActive: true,
  schemaName: 'store_mgmt_tenant_company_new',
  type: 'catalog',
  createdAt: new Date('2026-01-03T00:00:00.000Z'),
  updatedAt: new Date('2026-01-03T00:00:00.000Z'),
};

function makeDeps(): Deps {
  return {
    companyRepository: {
      list: jest.fn().mockResolvedValue([PROVISIONED, UNPROVISIONED]),
      findById: jest.fn().mockResolvedValue(SAGA_COMPANY),
    },
    userRepository: {
      create: jest.fn().mockResolvedValue({ ...SUPERADMIN_USER, id: 'owner-new', login: 'nuevo.owner' }),
    },
    saga: {
      run: jest.fn().mockResolvedValue({
        companyId: 'company-new',
        schemaName: 'store_mgmt_tenant_company_new',
        ownerCompanyUserId: 'cu-new',
        categoriesCopied: 11,
        productsCopied: 99,
      }),
    },
  };
}

async function buildApp(deps: Deps, user: typeof SUPERADMIN_USER | null): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [PlatformController],
    providers: [
      PlatformService,
      { provide: COMPANY_REPOSITORY, useValue: deps.companyRepository },
      { provide: USER_REPOSITORY, useValue: deps.userRepository },
      { provide: CreateCompanySaga, useValue: deps.saga },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context: ExecutionContext) => {
        if (!user) {
          throw new UnauthorizedException();
        }
        const req = context.switchToHttp().getRequest();
        req.user = user;
        return true;
      },
    })
    .compile();

  // The REAL SuperadminGuard stays in place — only JwtAuthGuard is overridden.
  const app = module.createNestApplication();
  installGlobalPipes(app);
  await app.init();
  return app;
}

function validBody() {
  return {
    name: 'Tienda Nueva',
    slug: 'tienda-nueva',
    type: 'catalog',
    ownerLogin: 'nuevo.owner',
    temporaryPassword: 'TempPass123!',
  };
}

describe('PlatformController', () => {
  let deps: Deps;

  beforeEach(() => {
    deps = makeDeps();
  });

  describe('guard chain', () => {
    it('declares JwtAuthGuard ALONE in front of SuperadminGuard — no tenant guard ever', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const guards = (Reflect.getMetadata('__guards__', PlatformController) as any[]).map(
        (g) => g.name ?? new g().constructor.name,
      );
      expect(guards).toEqual(['JwtAuthGuard', 'SuperadminGuard']);
    });
  });

  describe('GET /platform/companies', () => {
    it('rejects an unauthenticated request with 401 — the identity gate never runs', async () => {
      deps.companyRepository.list.mockClear();
      const app = await buildApp(deps, null);

      const response = await request(app.getHttpServer()).get('/platform/companies');

      expect(response.status).toBe(401);
      expect(deps.companyRepository.list).not.toHaveBeenCalled();
      await app.close();
    });

    it('rejects a non-superadmin with 403 (listing is gated)', async () => {
      const app = await buildApp(deps, PLAIN_USER);

      const response = await request(app.getHttpServer()).get('/platform/companies');

      expect(response.status).toBe(403);
      expect(deps.companyRepository.list).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns ALL companies incl. unprovisioned, shaped {id,name,slug,isActive,type}', async () => {
      const app = await buildApp(deps, SUPERADMIN_USER);

      const response = await request(app.getHttpServer()).get('/platform/companies');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { id: 'company-1', name: 'Urbana Ropa', slug: 'urbana', isActive: true, type: 'catalog' },
        { id: 'company-2', name: 'Pendiente SA', slug: 'pendiente', isActive: false, type: null },
      ]);
      await app.close();
    });
  });

  describe('POST /platform/companies', () => {
    it('rejects an unauthenticated request with 401 before any write', async () => {
      const app = await buildApp(deps, null);

      const response = await request(app.getHttpServer()).post('/platform/companies').send(validBody());

      expect(response.status).toBe(401);
      expect(deps.userRepository.create).not.toHaveBeenCalled();
      expect(deps.saga.run).not.toHaveBeenCalled();
      await app.close();
    });

    it('rejects a non-superadmin with 403 before any write', async () => {
      const app = await buildApp(deps, PLAIN_USER);

      const response = await request(app.getHttpServer()).post('/platform/companies').send(validBody());

      expect(response.status).toBe(403);
      expect(deps.userRepository.create).not.toHaveBeenCalled();
      expect(deps.saga.run).not.toHaveBeenCalled();
      await app.close();
    });

    it('creates on behalf and responds 201 {company, ownerLogin, temporaryPassword}', async () => {
      const app = await buildApp(deps, SUPERADMIN_USER);

      const response = await request(app.getHttpServer()).post('/platform/companies').send(validBody());

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        company: { id: 'company-new', name: 'Tienda Nueva', slug: 'tienda-nueva', type: 'catalog' },
        ownerLogin: 'nuevo.owner',
        temporaryPassword: 'TempPass123!',
      });
      expect(deps.saga.run).toHaveBeenCalledWith({
        name: 'Tienda Nueva',
        slug: 'tienda-nueva',
        ownerId: 'owner-new',
      });
      await app.close();
    });

    // Scenario: "Invalid input returns 400" — validation happens BEFORE any
    // User or Company row is written.
    it.each([
      ['bad slug regex', { ...validBody(), slug: 'Tienda Nueva!' }],
      ['empty name', { ...validBody(), name: '' }],
      ['type other than catalog', { ...validBody(), type: 'restaurant' }],
      ['short temporary password', { ...validBody(), temporaryPassword: 'short' }],
    ])('rejects %s with 400 before any write', async (_label, body) => {
      const app = await buildApp(deps, SUPERADMIN_USER);

      const response = await request(app.getHttpServer())
        .post('/platform/companies')
        .send(body as Record<string, string>);

      expect(response.status).toBe(400);
      expect(deps.userRepository.create).not.toHaveBeenCalled();
      expect(deps.saga.run).not.toHaveBeenCalled();
      await app.close();
    });

    it('maps a duplicate owner login from the service to 409 without touching companies', async () => {
      deps.userRepository.create.mockRejectedValue(new Error('duplicate'));
      // The service maps DuplicateLoginError itself; here prove the pipeline
      // propagates its 409 ConflictException.
      const module: TestingModule = await Test.createTestingModule({
        controllers: [PlatformController],
        providers: [
          {
            provide: PlatformService,
            useValue: { createOnBehalf: jest.fn().mockRejectedValue(new ConflictException('login taken')) },
          },
          { provide: COMPANY_REPOSITORY, useValue: deps.companyRepository },
          { provide: USER_REPOSITORY, useValue: deps.userRepository },
          { provide: CreateCompanySaga, useValue: deps.saga },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: (context: ExecutionContext) => {
            const req = context.switchToHttp().getRequest();
            req.user = SUPERADMIN_USER;
            return true;
          },
        })
        .compile();
      const app = module.createNestApplication();
      installGlobalPipes(app);
      await app.init();

      const response = await request(app.getHttpServer()).post('/platform/companies').send(validBody());

      expect(response.status).toBe(409);
      await app.close();
    });
  });
});
