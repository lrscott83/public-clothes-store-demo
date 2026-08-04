import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import {
  CUSTOMER_REPOSITORY,
  DuplicateCustomerDocumentError,
  DuplicateCustomerUserError,
  DuplicateLoginError,
  MEMBERSHIP_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLES,
} from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import {
  SAMPLE_AUTH_USER,
  mockTenantContextService,
  overrideJwtAuth,
  overrideTenantContext,
} from '../test-support/auth-test-helpers.js';
import { CustomerIdentityController } from './customer-identity.controller.js';
import { CustomerIdentityService } from './customer-identity.service.js';

type RepoMock = Record<string, jest.Mock>;

const VALID_BODY = {
  fullName: 'Ana Torres',
  login: 'ana.torres',
  password: 'sup3rsecret',
};

const CREATED_USER = { id: 'user-minted-1', login: 'ana.torres', fullName: 'Ana Torres' };

const CREATED_CUSTOMER = {
  id: 'customer-1',
  companyUserId: 'user-minted-1',
  fullName: 'Ana Torres',
  documentId: null,
  cellPhone: null,
  email: null,
  address: null,
  note: null,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/**
 * Builds the route with the REAL `CustomerIdentityService` and the REAL
 * `RolesGuard` — only the repositories (and the tenant Prisma client
 * `TenantContextGuard`/`TenantContextService` stand in for) are mocked.
 * Mocking the service would make the load-bearing assertion below (what role
 * actually reaches the assignment write) vacuous, and that assertion is the
 * whole point of R21.
 */
async function buildApp(
  repos: { user: RepoMock; companyUserCreate: jest.Mock; customer: RepoMock; membership: RepoMock },
  roles: number | null,
): Promise<INestApplication> {
  const tenantContext = {
    ...mockTenantContextService(),
    getClient: jest.fn().mockReturnValue({ companyUser: { create: repos.companyUserCreate } }),
  };
  const builder = overrideTenantContext(
    overrideJwtAuth(
      Test.createTestingModule({
        controllers: [CustomerIdentityController],
        providers: [
          CustomerIdentityService,
          RolesGuard,
          { provide: USER_REPOSITORY, useValue: repos.user },
          { provide: CUSTOMER_REPOSITORY, useValue: repos.customer },
          { provide: MEMBERSHIP_REPOSITORY, useValue: repos.membership },
          { provide: TenantContextService, useValue: tenantContext },
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

describe('CustomerIdentityController', () => {
  let app: INestApplication;
  let repos: { user: RepoMock; companyUserCreate: jest.Mock; customer: RepoMock; membership: RepoMock };

  beforeEach(async () => {
    repos = {
      user: { create: jest.fn().mockResolvedValue(CREATED_USER) },
      companyUserCreate: jest.fn().mockResolvedValue({ id: 'user-minted-1' }),
      customer: { create: jest.fn().mockResolvedValue(CREATED_CUSTOMER) },
      membership: { create: jest.fn().mockResolvedValue({ id: 'membership-1' }) },
    };
    app = await buildApp(repos, USER_ROLES.sales_agent);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 201 with the created customer', async () => {
    const response = await request(app.getHttpServer())
      .post('/customers/with-identity')
      .send(VALID_BODY);

    expect(response.status).toBe(201);
    expect(response.body.id).toBe(CREATED_CUSTOMER.id);
    expect(response.body.userId).toBe(CREATED_USER.id);
  });

  /**
   * R21 — THE load-bearing test. `api-salesops` installs no `ValidationPipe`
   * (design §0.13), so the DTO is erased at runtime: it strips nothing and
   * rejects nothing. Whatever a caller puts in the body arrives intact at the
   * controller. The ONLY thing standing between a `sales_agent` and minting
   * itself an admin is that no code path reads a role from that body.
   */
  describe('R21 — privilege escalation through the body is impossible', () => {
    const escalationPayloads = [
      { label: 'roles: sales_operator bit', extra: { roles: USER_ROLES.sales_operator } },
      { label: 'roles: admin bit', extra: { roles: USER_ROLES.admin } },
      { label: 'singular `role` key', extra: { role: USER_ROLES.owner } },
      { label: 'roles as a string', extra: { roles: String(USER_ROLES.admin) } },
      { label: 'every escalation shape at once', extra: { roles: 8, role: 16, isAdmin: true } },
    ];

    it.each(escalationPayloads)(
      'assigns exactly the `user` bit despite $label',
      async ({ extra }) => {
        const response = await request(app.getHttpServer())
          .post('/customers/with-identity')
          .send({ ...VALID_BODY, ...extra });

        expect(response.status).toBe(201);
        expect(repos.companyUserCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({ role: USER_ROLES.user }),
        });
      },
    );

    it('ignores a caller-supplied `userId` — this route MINTS the identity, it never links one', async () => {
      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .send({ ...VALID_BODY, userId: 'the-owners-user-id' });

      expect(response.status).toBe(201);
      // The Customer is linked to the freshly minted User, not to the id the
      // caller named — otherwise an agent could bind a customer record to the
      // owner's identity, which is precisely what A14 keeps off this route.
      expect(repos.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyUserId: CREATED_USER.id }),
      );
      expect(repos.user.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ id: 'the-owners-user-id' }),
      );
    });
  });

  describe('boundary validation (no ValidationPipe — these asserts ARE the validation)', () => {
    it.each([
      ['a blank fullName', { fullName: '   ' }],
      ['a missing fullName', { fullName: undefined }],
      ['a blank login', { login: '' }],
      ['a missing login', { login: undefined }],
      ['a password under 8 characters', { password: 'short7c' }],
      ['a non-string password', { password: 12345678 }],
    ])('rejects %s -> 400, nothing written', async (_label, override) => {
      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .send({ ...VALID_BODY, ...override });

      expect(response.status).toBe(400);
      expect(repos.user.create).not.toHaveBeenCalled();
      expect(repos.companyUserCreate).not.toHaveBeenCalled();
      expect(repos.customer.create).not.toHaveBeenCalled();
    });
  });

  describe('error mapping', () => {
    it('maps DuplicateLoginError to 409', async () => {
      repos.user.create.mockRejectedValue(new DuplicateLoginError('login "ana.torres" is taken'));

      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .send(VALID_BODY);

      expect(response.status).toBe(409);
    });

    it('maps DuplicateCustomerDocumentError to 409', async () => {
      repos.customer.create.mockRejectedValue(
        new DuplicateCustomerDocumentError('documentId "D1" is already in use'),
      );

      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .send({ ...VALID_BODY, documentId: 'D1' });

      expect(response.status).toBe(409);
    });

    it('maps DuplicateCustomerUserError to 409', async () => {
      repos.customer.create.mockRejectedValue(
        new DuplicateCustomerUserError('userId "user-minted-1" already has a Customer'),
      );

      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .send(VALID_BODY);

      expect(response.status).toBe(409);
    });
  });

  describe('RolesGuard enforcement', () => {
    async function rebuild(roles: number | null): Promise<void> {
      await app.close();
      app = await buildApp(repos, roles);
    }

    it('rejects an unauthenticated request with 401', async () => {
      await rebuild(null);

      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .send(VALID_BODY);
      expect(response.status).toBe(401);
    });

    it.each([
      ['owner', USER_ROLES.owner],
      ['admin', USER_ROLES.admin],
      ['sales_operator', USER_ROLES.sales_operator],
      ['sales_agent', USER_ROLES.sales_agent],
    ])('admits a %s caller -> 201', async (_label, roles) => {
      await rebuild(roles);

      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .send(VALID_BODY);
      expect(response.status).toBe(201);
    });

    it.each([
      ['a plain "user"', USER_ROLES.user],
      ['a warehouse_operator', USER_ROLES.warehouse_operator],
    ])('rejects %s with 403, nothing written', async (_label, roles) => {
      await rebuild(roles);

      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .send(VALID_BODY);
      expect(response.status).toBe(403);
      expect(repos.user.create).not.toHaveBeenCalled();
    });
  });

  it("attributes the assignment to the authenticated caller's companyUserId, never to the body", async () => {
    await request(app.getHttpServer())
      .post('/customers/with-identity')
      .send({ ...VALID_BODY, createdByCompanyUserId: 'somebody-else', companyId: 'other-company' })
      .expect(201);

    expect(repos.companyUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ createdByCompanyUserId: SAMPLE_AUTH_USER.companyUserId }),
    });
  });
});
