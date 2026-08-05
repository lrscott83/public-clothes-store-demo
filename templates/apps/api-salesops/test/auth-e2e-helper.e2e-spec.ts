import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { USER_ROLES } from '@store-mgmt/domain';
import { schemaNameFor } from '@store-mgmt/infra-db';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  authHeader,
  companyIdHeader,
  createAuthedUser,
  dropTenantSchemas,
  getTenantServices,
  type TenantServices,
} from './support/auth-e2e-helper.js';

/**
 * Task 12.1 (P12) — pins the contract `auth-e2e-helper.ts` must satisfy:
 * `createAuthedUser` provisions a REAL tenant schema and returns a working
 * `X-Company-Id` header pair, resolved through the REAL `TenantContextGuard`
 * — not a `Company.upsert` into `public` with no tenant behind it. The
 * pre-12.2 helper only ever wrote a `Company` row (never `CREATE SCHEMA`,
 * never set `schemaName`), so every one of these assertions fails against
 * it: `schemaName` stays `null` forever, no `store_mgmt_tenant_*` schema
 * ever exists, and a real guard check 403s because
 * `TenantContextGuard`'s "Company inactive or unprovisioned" branch fires
 * on a null `schemaName` every time (spec: salesops-tenancy "Company
 * inactive or unprovisioned is rejected").
 */
describe('auth-e2e-helper (createAuthedUser provisions a REAL tenant)', () => {
  let app: INestApplication;
  let services: TenantServices;
  const createdCompanyIds = new Set<string>();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    services = getTenantServices(moduleFixture);
  });

  afterAll(async () => {
    // Hygiene: every schema this suite created MUST be dropped, even if an
    // assertion above it failed.
    await dropTenantSchemas(services, createdCompanyIds);
    await services.masterPrisma.user.deleteMany({});
    await app.close();
  });

  it("sets Company.schemaName to schemaNameFor(companyId)'s exact value", async () => {
    const admin = await createAuthedUser(services, USER_ROLES.admin);
    createdCompanyIds.add(admin.companyId);

    const company = await services.masterPrisma.company.findUniqueOrThrow({
      where: { id: admin.companyId },
    });
    expect(company.schemaName).toBe(schemaNameFor(admin.companyId));
  });

  it('actually CREATEs the Postgres schema — not just a Company row claiming one', async () => {
    const admin = await createAuthedUser(services, USER_ROLES.admin);
    createdCompanyIds.add(admin.companyId);

    // `TenantDatabaseService.schemaExists` (Phase 4/10, reused rather than a
    // raw `pg` query duplicating it) queries `information_schema.schemata`
    // directly — real Postgres, not a Prisma model read.
    const exists = await services.tenantDatabaseService.schemaExists(schemaNameFor(admin.companyId));
    expect(exists).toBe(true);
  });

  it('the X-Company-Id header resolves through the REAL TenantContextGuard — no overrideGuard anywhere', async () => {
    const admin = await createAuthedUser(services, USER_ROLES.admin);
    createdCompanyIds.add(admin.companyId);

    const response = await request(app.getHttpServer())
      .get('/categories')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(admin.companyId));

    expect(response.status).toBe(200);
  });

  it('companyUserId equals userId (D1: tenant CompanyUser.id IS the master User.id)', async () => {
    const admin = await createAuthedUser(services, USER_ROLES.admin);
    createdCompanyIds.add(admin.companyId);

    expect(admin.companyUserId).toBe(admin.userId);
  });

  it('a caller with no X-Company-Id header still resolves via the sole ACTIVE Membership fallback', async () => {
    const admin = await createAuthedUser(services, USER_ROLES.admin);
    createdCompanyIds.add(admin.companyId);

    const response = await request(app.getHttpServer()).get('/categories').set(...authHeader(admin.token));

    expect(response.status).toBe(200);
  });
});
