import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import {
  PrismaMasterService,
  TenantDatabaseService,
  TenantPrismaFactory,
  schemaNameFor,
} from '@store-mgmt/infra-db';
import request from 'supertest';

/**
 * `apps/api-idp` e2e fixture helper — mirrors
 * `apps/api-salesops/test/support/auth-e2e-helper.ts`'s ROLE in the suite
 * (task 12.4's own instruction: "the same real tenant-resolution path
 * api-salesops now uses"), but NOT its shape. `api-salesops` has no HTTP
 * surface of its own that provisions a tenant, so it must reach into
 * `infra-db`'s provisioning primitives directly (`TenantDatabaseService`,
 * bypassing HTTP for that one step). `apps/api-idp` is different: it OWNS
 * `POST /companies` (`CompanyController` -> `CreateCompanySaga`, design.md
 * D7) — the real, only way a tenant gets created in this system. Driving it
 * over real HTTP here is not a shortcut, it IS the real path; reaching
 * directly into `TenantDatabaseService` to fabricate a tenant, the way
 * `api-salesops` has to, would test a path production never takes in this
 * app.
 */

export interface SignedUpUser {
  readonly userId: string;
  readonly login: string;
  readonly accessToken: string;
}

/** Every login below shares this fixed password — the value itself is never asserted on, only that auth accepts it. */
const E2E_PASSWORD = 'CorrectHorse1!';

export function uniqueLogin(tag: string): string {
  return `e2e.${tag}.${Date.now()}.${Math.floor(Math.random() * 1_000_000)}`;
}

/**
 * Drives `POST /auth/signup` then `POST /auth/login` for real — no direct
 * `User` row insert. A signed-up-and-logged-in user starts with ZERO
 * companies (design D7: `AuthService.signup` mints only a `User`); callers
 * needing a tenant call `createCompany` next.
 */
export async function signupAndLogin(app: INestApplication, tag: string): Promise<SignedUpUser> {
  const login = uniqueLogin(tag);
  const signupResponse = await request(app.getHttpServer())
    .post('/auth/signup')
    .send({ login, password: E2E_PASSWORD, fullName: `E2E ${tag}` });
  if (signupResponse.status !== 201) {
    throw new Error(`signup failed for "${login}": ${signupResponse.status} ${JSON.stringify(signupResponse.body)}`);
  }

  const loginResponse = await request(app.getHttpServer()).post('/auth/login').send({ login, password: E2E_PASSWORD });
  if (loginResponse.status !== 200) {
    throw new Error(`login failed for "${login}": ${loginResponse.status} ${JSON.stringify(loginResponse.body)}`);
  }

  return { userId: signupResponse.body.id, login, accessToken: loginResponse.body.accessToken };
}

export interface ProvisionedCompany {
  readonly companyId: string;
  readonly schemaName: string;
  readonly ownerCompanyUserId: string;
}

/**
 * Drives `POST /companies` for real — the FULL saga runs (schema creation,
 * tenant DDL, the owner's ACTIVE master `Membership`, the owner's tenant
 * `CompanyUser`, the template-catalog copy). `ownerToken` must already be a
 * valid access token (`signupAndLogin`); the caller it identifies becomes
 * the new company's `owner`.
 */
export async function createCompany(
  app: INestApplication,
  ownerToken: string,
  tag: string,
): Promise<ProvisionedCompany> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const response = await request(app.getHttpServer())
    .post('/companies')
    .set(...authHeader(ownerToken))
    .send({ name: `E2E ${tag} Co`, slug: `e2e-${tag}-${suffix}` });
  if (response.status !== 201) {
    throw new Error(`company creation failed for tag "${tag}": ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body as ProvisionedCompany;
}

/** `supertest`'s `.set(...authHeader(token))` — a valid `Authorization: Bearer <token>` header pair. */
export function authHeader(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

/** `supertest`'s `.set(...companyIdHeader(companyId))` — the `X-Company-Id` pair `TenantContextGuard` reads. */
export function companyIdHeader(companyId: string): [string, string] {
  return ['X-Company-Id', companyId];
}

/**
 * The three `infra-db` providers this suite needs ONLY for hygiene teardown
 * (`dropCompanies`) — no production request path in `apps/api-idp` reaches
 * these directly outside the saga itself. Resolved once from a compiled
 * `TestingModule`, same convention as `apps/api-salesops`'s
 * `getTenantServices`.
 */
export interface TenantServices {
  readonly masterPrisma: PrismaMasterService;
  readonly tenantDatabaseService: TenantDatabaseService;
  readonly tenantPrismaFactory: TenantPrismaFactory;
}

export function getTenantServices(moduleFixture: TestingModule): TenantServices {
  return {
    masterPrisma: moduleFixture.get(PrismaMasterService),
    tenantDatabaseService: moduleFixture.get(TenantDatabaseService),
    tenantPrismaFactory: moduleFixture.get(TenantPrismaFactory),
  };
}

/**
 * Hygiene (owner instruction, mirrors `apps/api-salesops`'s
 * `dropTenantSchemas`): every tenant schema `createCompany` provisions MUST
 * be dropped afterwards, including on failure. Disposes the cached client
 * BEFORE dropping the schema, then clears the master `Company` row (cascades
 * to any remaining `Membership`).
 */
export async function dropCompanies(services: TenantServices, companyIds: Iterable<string>): Promise<void> {
  const ids = [...new Set(companyIds)];
  for (const companyId of ids) {
    const schemaName = schemaNameFor(companyId);
    await services.tenantPrismaFactory.disposeClient(schemaName);
    await services.tenantDatabaseService.deleteSchema(schemaName);
  }
  if (ids.length > 0) {
    await services.masterPrisma.company.deleteMany({ where: { id: { in: ids } } });
  }
}
