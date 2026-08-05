import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { USER_ROLES } from '@store-mgmt/domain';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  authHeader,
  companyIdHeader,
  createAuthedUser,
  createLinkedCompanyMember,
  dropTenantSchemas,
  getTenantServices,
  tenantClientFor,
  type AuthedUser,
  type TenantPrismaClient,
  type TenantServices,
} from './support/auth-e2e-helper.js';

/**
 * Full HTTP lifecycle against a real, provisioned tenant schema (no mocks,
 * no `overrideGuard` — the REAL `TenantContextGuard` resolves `caller` from
 * the `X-Company-Id` header, spec: salesops-tenancy "The test exercises the
 * real guard, not a stub") -- same discipline as the domain/infra-db
 * suites. Covers the spec's CRUD + documentId-conflict + soft-delete +
 * not-found scenarios end-to-end. Every `Customer` now requires an existing
 * tenant `CompanyUser` via `userId` (1:1, backend-users-roles, D1's
 * `companyUserId` FK) -- `createLinkedCompanyMember` mints a fresh one per
 * call, in the SAME tenant schema as the caller (the customer's OWN linked
 * identity, distinct from the AUTHENTICATED caller below). Every route is
 * `owner`/`admin`/`sales_operator`-only -- every request authenticates as a
 * `sales_operator` caller.
 */
describe('Customer (e2e)', () => {
  let app: INestApplication;
  let services: TenantServices;
  let tenant: TenantPrismaClient;
  let companyId: string;
  let caller: AuthedUser;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    services = getTenantServices(moduleFixture);
    // One tenant provisioned once for the whole suite -- callers below are
    // minted fresh per test into this SAME company (mirrors the pre-12.2
    // "one company, many company_users" fixture rhythm).
    const seed = await createAuthedUser(services, USER_ROLES.sales_operator);
    companyId = seed.companyId;
    tenant = tenantClientFor(services, companyId);
  });

  beforeEach(async () => {
    caller = await createAuthedUser(services, USER_ROLES.sales_operator, companyId);
  });

  afterEach(async () => {
    await tenant.customer.deleteMany({});
    // `created_by_company_user_id` is a SELF-FK with `ON DELETE RESTRICT`, and
    // RESTRICT is checked per row rather than at end-of-statement — so a single
    // `deleteMany({})` covering both an assignment and the one that created it
    // fails. Provisioned assignments (the ones carrying a creator) go first.
    await tenant.companyUser.deleteMany({ where: { createdByCompanyUserId: { not: null } } });
    await tenant.companyUser.deleteMany({});
    await services.masterPrisma.user.deleteMany({});
  });

  afterAll(async () => {
    await dropTenantSchemas(services, [companyId]);
    await app.close();
  });

  async function createTestUser(fullName: string): Promise<string> {
    return createLinkedCompanyMember(services, companyId, fullName);
  }

  it('creates a customer -> 201', async () => {
    const userId = await createTestUser('Ana Torres');

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'Ana Torres', userId });

    expect(response.status).toBe(201);
    expect(response.body.fullName).toBe('Ana Torres');
    expect(response.body.userId).toBe(userId);
    expect(response.body.active).toBe(true);
  });

  it('rejects an empty fullName -> 400, never persisted', async () => {
    const userId = await createTestUser('Empty Name Owner');

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: '', userId });

    expect(response.status).toBe(400);
    const rows = await tenant.customer.findMany({ where: { fullName: '' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a whitespace-only fullName -> 400, never persisted', async () => {
    const userId = await createTestUser('Whitespace Name Owner');

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: '   ', userId });

    expect(response.status).toBe(400);
    const rows = await tenant.customer.findMany({ where: { fullName: '   ' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a missing userId -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'No User Given' });

    expect(response.status).toBe(400);
    const rows = await tenant.customer.findMany({ where: { fullName: 'No User Given' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a userId that does not reference an existing User -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'Ghost User', userId: '00000000-0000-0000-0000-000000000000' });

    expect(response.status).toBe(400);
    const rows = await tenant.customer.findMany({ where: { fullName: 'Ghost User' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a second customer with the same userId -> 409 (1:1)', async () => {
    const userId = await createTestUser('Shared User');
    await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'First Owner', userId })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'Second Owner', userId });

    expect(response.status).toBe(409);
  });

  it('rejects clearing fullName to empty on update -> 400, original name untouched', async () => {
    const userId = await createTestUser('Sofía Ramos');
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'Sofía Ramos', userId });

    const response = await request(app.getHttpServer())
      .patch(`/customers/${created.body.id}`)
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: '' });

    expect(response.status).toBe(400);
    const found = await request(app.getHttpServer())
      .get(`/customers/${created.body.id}`)
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId));
    expect(found.body.fullName).toBe('Sofía Ramos');
  });

  it('rejects a second customer with the same documentId -> 409', async () => {
    const userIdA = await createTestUser('Ana Torres');
    const userIdB = await createTestUser('Luis Pérez');
    await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'Ana Torres', userId: userIdA, documentId: 'E2E-D1' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'Luis Pérez', userId: userIdB, documentId: 'E2E-D1' });

    expect(response.status).toBe(409);
  });

  it('gets a customer by id -> 200', async () => {
    const userId = await createTestUser('Marta Gómez');
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'Marta Gómez', userId });

    const response = await request(app.getHttpServer())
      .get(`/customers/${created.body.id}`)
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId));

    expect(response.status).toBe(200);
    expect(response.body.fullName).toBe('Marta Gómez');
  });

  it('lists only active customers by default', async () => {
    const userId = await createTestUser('José Díaz');
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'José Díaz', userId });
    await request(app.getHttpServer())
      .delete(`/customers/${created.body.id}`)
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId));

    const response = await request(app.getHttpServer())
      .get('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId));

    expect(response.status).toBe(200);
    expect(response.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });

  it('deletes a customer -> soft-delete, still retrievable with active=false, never a hard delete', async () => {
    const userId = await createTestUser('Yanet Cruz');
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId))
      .send({ fullName: 'Yanet Cruz', userId });

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/customers/${created.body.id}`)
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId));
    expect(deleteResponse.status).toBe(200);

    const found = await request(app.getHttpServer())
      .get(`/customers/${created.body.id}`)
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId));
    expect(found.status).toBe(200);
    expect(found.body.active).toBe(false);
  });

  it('returns 404 for an unknown id', async () => {
    const response = await request(app.getHttpServer())
      .get('/customers/00000000-0000-0000-0000-000000000000')
      .set(...authHeader(caller.token))
      .set(...companyIdHeader(companyId));

    expect(response.status).toBe(404);
  });

  /**
   * `POST /customers/with-identity` — the route a `sales_agent` uses to sign a
   * walk-in customer up. It MINTS the login instead of linking an existing one,
   * which is the whole reason the agent may call it at all (A14). These cases
   * run against the real DB precisely because the guarantee being asserted is
   * what ends up in `company_user.role` — a mocked repository could not tell
   * the difference between "the constant won" and "the body won".
   */
  describe('POST /customers/with-identity', () => {
    const VALID_BODY = {
      fullName: 'Nadia Sosa',
      login: 'nadia.sosa.e2e',
      password: 'sup3rsecret',
    };

    it('mints an identity a sales_agent can create, and links the customer to it -> 201', async () => {
      const { token } = await createAuthedUser(services, USER_ROLES.sales_agent, companyId);

      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .set(...authHeader(token))
        .set(...companyIdHeader(companyId))
        .send(VALID_BODY);

      expect(response.status).toBe(201);
      expect(response.body.fullName).toBe(VALID_BODY.fullName);

      const minted = await services.masterPrisma.user.findUnique({ where: { login: VALID_BODY.login } });
      expect(minted).not.toBeNull();
      expect(response.body.userId).toBe(minted?.id);
      expect(minted?.passwordHash).not.toBe(VALID_BODY.password);
    });

    // The load-bearing one (R21). No `ValidationPipe` runs in this app, so the
    // body reaches the controller byte-for-byte as sent.
    it('assigns exactly the `user` bit no matter what the body claims', async () => {
      const { token } = await createAuthedUser(services, USER_ROLES.sales_agent, companyId);

      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .set(...authHeader(token))
        .set(...companyIdHeader(companyId))
        .send({
          ...VALID_BODY,
          roles: USER_ROLES.admin,
          role: USER_ROLES.owner,
          userId: '00000000-0000-0000-0000-000000000000',
        });

      expect(response.status).toBe(201);
      const minted = await services.masterPrisma.user.findUniqueOrThrow({
        where: { login: VALID_BODY.login },
      });
      // `id` IS the FK/PK, so a `findUniqueOrThrow` by it also proves the row
      // lives in THIS company's tenant schema — a mismatched schema would
      // simply not find it (D1: CompanyUser.id IS the master User.id).
      const assignment = await tenant.companyUser.findUniqueOrThrow({ where: { id: minted.id } });
      expect(assignment.role).toBe(USER_ROLES.user);
      // The caller-supplied `userId` was ignored: the Customer points at the
      // minted identity, never at the one the body named.
      expect(response.body.userId).toBe(minted.id);
    });

    it("records the caller's companyUser as the creator, in the caller's own tenant schema", async () => {
      const agent = await createAuthedUser(services, USER_ROLES.sales_agent, companyId);

      await request(app.getHttpServer())
        .post('/customers/with-identity')
        .set(...authHeader(agent.token))
        .set(...companyIdHeader(companyId))
        .send(VALID_BODY)
        .expect(201);

      const minted = await services.masterPrisma.user.findUniqueOrThrow({
        where: { login: VALID_BODY.login },
      });
      // Found via `tenant` (bound to `companyId`'s schema alone, D2 — no
      // `,public` fallback) -- that IS the proof the assignment lives in the
      // caller's own company, since CompanyUser carries no companyId column
      // to assert against directly (D1).
      const assignment = await tenant.companyUser.findUniqueOrThrow({ where: { id: minted.id } });
      expect(assignment.createdByCompanyUserId).toBe(agent.companyUserId);
    });

    it('rejects a duplicate login -> 409, with no customer and no assignment left behind', async () => {
      const { token } = await createAuthedUser(services, USER_ROLES.sales_agent, companyId);
      await request(app.getHttpServer())
        .post('/customers/with-identity')
        .set(...authHeader(token))
        .set(...companyIdHeader(companyId))
        .send(VALID_BODY)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .set(...authHeader(token))
        .set(...companyIdHeader(companyId))
        .send({ ...VALID_BODY, fullName: 'Otra Persona' });

      expect(response.status).toBe(409);
      const customers = await tenant.customer.findMany({ where: { fullName: 'Otra Persona' } });
      expect(customers).toHaveLength(0);
    });

    it('rejects a password under 8 characters -> 400, nothing persisted', async () => {
      const { token } = await createAuthedUser(services, USER_ROLES.sales_agent, companyId);

      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .set(...authHeader(token))
        .set(...companyIdHeader(companyId))
        .send({ ...VALID_BODY, password: 'short7c' });

      expect(response.status).toBe(400);
      const minted = await services.masterPrisma.user.findUnique({ where: { login: VALID_BODY.login } });
      expect(minted).toBeNull();
    });

    it('rejects a plain "user" caller with 403 — minting logins is not a customer-facing power', async () => {
      const { token } = await createAuthedUser(services, USER_ROLES.user, companyId);

      const response = await request(app.getHttpServer())
        .post('/customers/with-identity')
        .set(...authHeader(token))
        .set(...companyIdHeader(companyId))
        .send(VALID_BODY);

      expect(response.status).toBe(403);
      const minted = await services.masterPrisma.user.findUnique({ where: { login: VALID_BODY.login } });
      expect(minted).toBeNull();
    });
  });

  describe('RolesGuard enforcement (owner/admin/sales_operator only)', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const response = await request(app.getHttpServer()).get('/customers');
      expect(response.status).toBe(401);
    });

    it('rejects a plain "user" caller with 403 -- customer data is cockpit-internal', async () => {
      const { token } = await createAuthedUser(services, USER_ROLES.user, companyId);

      const response = await request(app.getHttpServer())
        .get('/customers')
        .set(...authHeader(token))
        .set(...companyIdHeader(companyId));
      expect(response.status).toBe(403);
    });
  });
});
