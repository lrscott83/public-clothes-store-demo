import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaMasterService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { AppModule } from '../src/app/app.module.js';
import { installGlobalPipes } from '../src/main-setup.js';
import {
  authHeader,
  companyIdHeader,
  createCompany,
  dropCompanies,
  getTenantServices,
  signupAndLogin,
  uniqueLogin,
  type TenantServices,
} from './support/auth-e2e-helper.js';

/**
 * Full HTTP lifecycle against the real `store_mgmt` Postgres database (no
 * mocks, no `overrideGuard` — task 12.4) — covers SECURITY FIX 4
 * (mass-assignment / non-whitelisted DTO fields) against the REAL
 * `ValidationPipe` wired in `main.ts`, behind the REAL guard chain
 * (`JwtAuthGuard -> TenantContextGuard -> RolesGuard`, design D4). The
 * "admin" caller in this suite is a real, saga-provisioned company OWNER
 * (`POST /companies`) — `owner` is one of the two roles `@Roles(admin,
 * owner)` admits on `UsersController`, and provisioning an actual `admin`
 * caller would require a separate seed/bootstrap path this suite has no
 * business inventing. The `target` user PATCHed below is a plain `User`
 * row with NO tenant `CompanyUser`/`Membership` at all — valid here because
 * neither assertion below sends `roles` in the body, so
 * `UsersService.update` never reaches its tenant-scoped `companyUser.update`
 * branch (see its own doc comment: "`roles` is optional on the patch — only
 * touch the assignment when the caller actually asked to change it").
 */
describe('Users (e2e) — mass-assignment guard', () => {
  let app: INestApplication;
  let masterPrisma: PrismaMasterService;
  let services: TenantServices;
  let createdCompanyIds: string[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    installGlobalPipes(app);
    await app.init();

    masterPrisma = moduleFixture.get(PrismaMasterService);
    services = getTenantServices(moduleFixture);
  });

  beforeEach(() => {
    createdCompanyIds = [];
  });

  afterEach(async () => {
    await dropCompanies(services, createdCompanyIds);
    // `Membership` cascades from `User` (master/schema.prisma:131,
    // `onDelete: Cascade`) — no separate cleanup needed for it.
    await masterPrisma.user.deleteMany({ where: { login: { startsWith: 'e2e.massassign.' } } });
  });

  afterAll(async () => {
    await app.close();
  });

  async function hashDevPassword(password: string): Promise<string> {
    const bcrypt = await import('bcrypt');
    return bcrypt.hash(password, 10);
  }

  /** Signs up + logs in a fresh owner, then provisions their company via the REAL saga (`POST /companies`). Registers the schema for teardown. */
  async function loginAsOwner(): Promise<{ accessToken: string; companyId: string }> {
    const owner = await signupAndLogin(app, 'massassign.owner');
    const company = await createCompany(app, owner.accessToken, 'massassign');
    createdCompanyIds.push(company.companyId);
    return { accessToken: owner.accessToken, companyId: company.companyId };
  }

  it('PATCH /users/:id with a non-whitelisted "passwordHash" field is REJECTED and the stored hash is unchanged', async () => {
    const owner = await loginAsOwner();

    const targetLogin = uniqueLogin('massassign.target');
    const originalHash = await hashDevPassword('OriginalPass1!');
    const target = await masterPrisma.user.create({
      data: { login: targetLogin, passwordHash: originalHash, fullName: 'Target User' },
    });

    const evilHash = '$2b$10$evilInjectedHashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const response = await request(app.getHttpServer())
      .patch(`/users/${target.id}`)
      .set(...authHeader(owner.accessToken))
      .set(...companyIdHeader(owner.companyId))
      .send({ passwordHash: evilHash });

    // Rejected by the global ValidationPipe (whitelist + forbidNonWhitelisted).
    expect(response.status).toBe(400);

    const persisted = await masterPrisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(persisted.passwordHash).toBe(originalHash);
    expect(persisted.passwordHash).not.toBe(evilHash);
  });

  it('PATCH /users/:id with an allowed field (fullName) still succeeds', async () => {
    const owner = await loginAsOwner();

    const targetLogin = uniqueLogin('massassign.target2');
    const originalHash = await hashDevPassword('OriginalPass1!');
    const target = await masterPrisma.user.create({
      data: { login: targetLogin, passwordHash: originalHash, fullName: 'Old Name' },
    });

    const response = await request(app.getHttpServer())
      .patch(`/users/${target.id}`)
      .set(...authHeader(owner.accessToken))
      .set(...companyIdHeader(owner.companyId))
      .send({ fullName: 'New Name' });

    expect(response.status).toBe(200);
    expect(response.body.fullName).toBe('New Name');
  });
});
