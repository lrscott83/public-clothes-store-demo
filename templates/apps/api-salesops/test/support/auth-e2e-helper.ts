import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import { JWT_CONFIG } from '@store-mgmt/api-common';
import { USER_ROLES } from '@store-mgmt/domain';
import {
  PrismaMasterService,
  TenantDatabaseService,
  TenantPrismaFactory,
  schemaNameFor,
} from '@store-mgmt/infra-db';
import jwt, { type SignOptions } from 'jsonwebtoken';

/** Bcrypt hash shape accepted by the domain `passwordHash` invariant — never a real credential (mirrors `test/customer.e2e-spec.ts`). */
const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

export interface AuthedUser {
  readonly userId: string;
  readonly companyUserId: string;
  readonly companyId: string;
  readonly token: string;
}

/**
 * The three `infra-db` providers e2e fixtures need to mint a REAL tenant
 * (Phase 4/10's provisioning primitives, reused here rather than
 * reimplemented — task 12.2's own instruction). `PrismaMasterService` writes
 * `User`/`Company`/`Membership` (master schema); `TenantDatabaseService`
 * `CREATE SCHEMA`s + applies the tenant DDL; `TenantPrismaFactory` resolves
 * the bounded per-schema client the fixture writes tenant `CompanyUser`
 * rows through — the same client production's `TenantContextService` sits
 * on top of (D2), just addressed directly by schema name here since fixture
 * setup has no HTTP request/guard to open an `AsyncLocalStorage` scope for
 * it (mirrors `tenant-schema.spec-helper.ts`'s `useTenantSchema()`
 * precedent — direct `TenantPrismaFactory.getClient(schemaName)` access is
 * an established, real-DB test convention, not a stub).
 */
export interface TenantServices {
  readonly masterPrisma: PrismaMasterService;
  readonly tenantDatabaseService: TenantDatabaseService;
  readonly tenantPrismaFactory: TenantPrismaFactory;
}

/** Same shape `TenantContextService.getClient()` resolves to — see `create-company.saga.ts`'s identical pattern for why this is typed via `ReturnType` rather than a deep import into `infra-db`'s generated client (not part of the package's public surface). */
export type TenantPrismaClient = ReturnType<TenantPrismaFactory['getClient']>;

/** Resolves the three tenant-provisioning providers ONCE from a compiled `TestingModule` — call this once per suite in `beforeAll`, after `app.init()`. */
export function getTenantServices(moduleFixture: TestingModule): TenantServices {
  return {
    masterPrisma: moduleFixture.get(PrismaMasterService),
    tenantDatabaseService: moduleFixture.get(TenantDatabaseService),
    tenantPrismaFactory: moduleFixture.get(TenantPrismaFactory),
  };
}

/**
 * Mints a REAL `User` row (master schema) plus a REAL access JWT signed
 * with the shared `JWT_SECRET` (`JWT_CONFIG`, from `@store-mgmt/api-common`
 * — the exact secret `JwtStrategy` verifies with). No round-trip to
 * `apps/api-idp` needed: this app trusts the signature locally (design.md's
 * "Consumers verify tokens locally" requirement), so signing directly with
 * the shared secret is a faithful e2e substitute for an actual login.
 *
 * Unlike the pre-12.2 shape (`Company.upsert` into `public`, no tenant ever
 * provisioned), this now drives the REAL D7 provisioning primitives: when
 * `existingCompanyId` is omitted, it creates a brand-new master `Company`,
 * `CREATE SCHEMA`s + applies the tenant DDL for it (`TenantDatabaseService`,
 * Phase 4/10 — reused, not reimplemented), and only then sets
 * `Company.schemaName`. An ACTIVE master `Membership` and the tenant
 * `CompanyUser` (`id` IS the master `User.id`, D1) are always created,
 * whichever branch provisioned the company.
 *
 * `existingCompanyId` is a deliberate elaboration beyond task 12.2's literal
 * "provision a tenant schema" wording, flagged here rather than silently
 * added: several specs need SEVERAL company members inside the SAME tenant
 * (e.g. commission.e2e-spec.ts's "shows an owner the whole company" needs
 * two agents and an owner sharing one schema; order.e2e-spec.ts's
 * warehouse-operator scope tests need an operator who can see the admin's
 * OWN warehouse). Provisioning a fresh schema per caller would make those
 * assertions structurally impossible to express, not just slower.
 */
export async function createAuthedUser(
  services: TenantServices,
  roles: number,
  existingCompanyId?: string,
): Promise<AuthedUser> {
  const user = await services.masterPrisma.user.create({
    data: {
      login: `e2e.${randomUUID()}`,
      passwordHash: VALID_HASH,
      fullName: 'E2E Test User',
    },
  });

  const companyId = existingCompanyId ?? (await provisionTenant(services));

  // Access requires BOTH an ACTIVE master Membership AND a tenant
  // CompanyUser (`resolveTenantAccess`, `TenantContextGuard` — commit
  // `3dd3000`'s fix). Minting only one produces a user that cannot
  // authenticate anywhere.
  await services.masterPrisma.membership.create({
    data: { userId: user.id, companyId, status: 'ACTIVE' },
  });

  const companyUser = await services.tenantPrismaFactory
    .getClient(schemaNameFor(companyId))
    .companyUser.create({
      data: { id: user.id, role: roles, createdByCompanyUserId: null },
    });

  const token = signAccessToken(user.id, user.login);

  return { userId: user.id, companyUserId: companyUser.id, companyId, token };
}

/** Step 1-3 of design.md D7's saga, minus the owner CompanyUser/catalog copy (out of scope for a bare test fixture — no template catalog is needed to exercise the guard chain). */
async function provisionTenant(services: TenantServices): Promise<string> {
  const company = await services.masterPrisma.company.create({
    data: { name: `E2E Co ${randomUUID()}`, slug: `e2e-${randomUUID()}` },
  });
  const schemaName = schemaNameFor(company.id);
  await services.tenantDatabaseService.createSchema(schemaName);
  await services.masterPrisma.company.update({
    where: { id: company.id },
    data: { schemaName },
  });
  return company.id;
}

function signAccessToken(userId: string, login: string): string {
  // `JWT_CONFIG.signOptions.expiresIn` is a plain `string` in api-common
  // (env-var friendly); `jsonwebtoken`'s `SignOptions` types it against the
  // stricter `StringValue` template-literal type. The runtime value
  // (`'15m'`) is valid either way — this cast only bridges the two type
  // definitions (same bridge `apps/api-idp/src/auth/auth.module.ts` uses).
  return jwt.sign({ sub: userId, login }, JWT_CONFIG.secret, {
    expiresIn: JWT_CONFIG.signOptions.expiresIn,
  } as SignOptions);
}

/** `supertest`'s `.set(...authHeader(token))` — a valid `Authorization: Bearer <token>` header pair. */
export function authHeader(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

/** `supertest`'s `.set(...companyIdHeader(companyId))` — the `X-Company-Id` pair `TenantContextGuard` reads (spec: salesops-tenancy "Tenant Resolution Guard Chain"). */
export function companyIdHeader(companyId: string): [string, string] {
  return ['X-Company-Id', companyId];
}

/**
 * Mints a `warehouse_operator` user PLUS its `WarehouseOperator` detail row
 * (`companyUserId` PK/FK — D1 reshape, `warehouseId` scoped), inside
 * `companyId`'s EXISTING tenant schema. There is no admin endpoint for this
 * yet (out of Phase 5 scope), so e2e specs insert the row directly via the
 * tenant client, same discipline as `createAuthedUser`. `companyId` is
 * REQUIRED (not optional, unlike `createAuthedUser`) because every real
 * caller of this needs the operator scoped to an ALREADY-provisioned
 * warehouse's own company — a fresh company would have no warehouse to be
 * scoped to at all.
 */
export async function createAuthedWarehouseOperator(
  services: TenantServices,
  companyId: string,
  warehouseId: string,
): Promise<AuthedUser> {
  const operator = await createAuthedUser(services, USER_ROLES.warehouse_operator, companyId);
  await services.tenantPrismaFactory
    .getClient(schemaNameFor(companyId))
    .warehouseOperator.create({ data: { companyUserId: operator.companyUserId, warehouseId } });
  return operator;
}

/**
 * Mints a master `User` PLUS a tenant `CompanyUser` in `companyId`'s schema
 * with NO master `Membership` — this identity is never meant to log in or
 * be authenticated in these specs, only to exist as the FK target for
 * `Customer.companyUserId` / `CreateCustomerDto.userId` (identical value,
 * D1: `CompanyUser.id` IS the master `User.id`). Distinct from
 * `createAuthedUser`: a Customer's linked identity is never the one calling
 * the API in these specs. Returns the id shared by both rows.
 */
export async function createLinkedCompanyMember(
  services: TenantServices,
  companyId: string,
  fullName: string,
): Promise<string> {
  const user = await services.masterPrisma.user.create({
    data: { login: `e2e.${randomUUID()}`, passwordHash: VALID_HASH, fullName },
  });
  const companyUser = await services.tenantPrismaFactory
    .getClient(schemaNameFor(companyId))
    .companyUser.create({ data: { id: user.id, role: USER_ROLES.user, createdByCompanyUserId: null } });
  return companyUser.id;
}

/** The bounded, cached client for `companyId`'s tenant schema — for specs' own out-of-band setup/assertions/cleanup, same client `TenantContextService` resolves to inside a real request. */
export function tenantClientFor(services: TenantServices, companyId: string): TenantPrismaClient {
  return services.tenantPrismaFactory.getClient(schemaNameFor(companyId));
}

/**
 * Hygiene (owner instruction): every tenant schema an e2e run creates MUST
 * be dropped afterwards, including on failure — call this, unconditionally,
 * from every suite's `afterAll`. Disposes the cached client BEFORE dropping
 * the schema (mirrors `useTenantSchema()`'s precedent) and clears the
 * master `Company` row (cascades to any remaining `Membership` rows).
 */
export async function dropTenantSchemas(
  services: TenantServices,
  companyIds: Iterable<string>,
): Promise<void> {
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
