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
  tenantClientFor,
  type AuthedUser,
  type TenantServices,
} from './support/auth-e2e-helper.js';

/**
 * Phase 13 (P5) — this is the change's actual proof obligation, not a chore
 * (spec salesops-tenancy "Cross-Schema Isolation Is Proven, Not Assumed").
 * Every other phase's tests assert that the plumbing works; this file is the
 * only one whose job is to prove the product claim itself: one company
 * cannot read another company's data. Two real tenants, provisioned over the
 * SAME real HTTP surface (`POST /companies` → `CreateCompanySaga` in spirit,
 * `createAuthedUser`'s direct-primitive equivalent in practice — see its own
 * doc comment) every other e2e spec uses, in ONE process, ONE test run.
 *
 * A test that only creates two tenants and asserts each sees its own row is
 * weak — it would pass even if isolation were accidental (e.g. two tenants
 * that both, by luck, only ever query by an id nobody guesses). This file
 * additionally proves the NEGATIVE: that tenant B genuinely CANNOT see
 * tenant A's rows, and that the attempts fail the way the design says they
 * should (403 / 404 / empty-and-independently-verified-absent), never merely
 * "returns something different". It is written to catch, specifically:
 *
 * 1. A tenant client whose `search_path` regained a `,public` fallback (a
 *    real regression, fixed by commit `747a2b6` after a probe table planted
 *    in `public` was read straight through a tenant client) — see the
 *    dedicated `search_path` assertion below.
 * 2. A request resolving to the WRONG tenant when `X-Company-Id` names one
 *    company but the caller's membership is in another — see the two
 *    mismatched-header tests and the dual-membership test below.
 * 3. A repository/service that silently fell back to a shared/default
 *    client instead of the tenant-scoped one — caught by querying tenant
 *    B's OWN Prisma client directly for a row created under tenant A,
 *    bypassing the HTTP/service layer entirely (a wrong-client bug would
 *    still 404 over HTTP for the wrong reason; the direct client query
 *    proves the row's PHYSICAL absence from B's schema, not just that some
 *    query filtered it out).
 * 4. Rows created under tenant A leaking into a client scoped to tenant B —
 *    the direct-client check above, plus the shared-slug test, which proves
 *    two genuinely SEPARATE physical tables (a `@unique` constraint on
 *    `Category.slug` would reject the second insert if both tenants shared
 *    one table or a single default client).
 *
 * Real `TenantContextGuard` throughout — zero `overrideGuard` anywhere in
 * this file (spec salesops-tenancy "The test exercises the real guard, not
 * a stub").
 */
describe('Cross-schema tenant isolation (e2e)', () => {
  let app: INestApplication;
  let services: TenantServices;
  let companyA: AuthedUser;
  let companyB: AuthedUser;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    services = getTenantServices(moduleFixture);
    // Two SEPARATE tenants, no `existingCompanyId` — each call provisions
    // its own `CREATE SCHEMA` + applies the tenant DDL (Phase 4/10
    // primitives, D7's saga in spirit).
    companyA = await createAuthedUser(services, USER_ROLES.admin);
    companyB = await createAuthedUser(services, USER_ROLES.admin);
  });

  afterAll(async () => {
    // Hygiene (owner instruction): both schemas MUST be dropped, including
    // on failure — never leave a `store_mgmt_tenant_%` schema behind, and
    // never touch anything in `public`.
    await dropTenantSchemas(services, [companyA.companyId, companyB.companyId]);
    await services.masterPrisma.user.deleteMany({});
    await app.close();
  });

  it('sanity: A and B resolve to two DIFFERENT physical schemas', () => {
    expect(companyA.companyId).not.toBe(companyB.companyId);
    expect(schemaNameFor(companyA.companyId)).not.toBe(schemaNameFor(companyB.companyId));
  });

  it("each tenant client's search_path holds ONLY its own schema — no `,public` fallback (regression guard, commit 747a2b6)", async () => {
    const clientA = tenantClientFor(services, companyA.companyId);
    const clientB = tenantClientFor(services, companyB.companyId);

    const [rowsA, rowsB] = await Promise.all([
      clientA.$queryRawUnsafe<{ search_path: string }[]>('SHOW search_path'),
      clientB.$queryRawUnsafe<{ search_path: string }[]>('SHOW search_path'),
    ]);

    // Exact equality, not `.toContain('public')` negated — a `,public`
    // suffix would still contain the tenant schema name, so only an exact
    // match catches the regression reliably.
    expect(rowsA[0].search_path).toBe(`"${schemaNameFor(companyA.companyId)}"`);
    expect(rowsB[0].search_path).toBe(`"${schemaNameFor(companyB.companyId)}"`);
  });

  it('a row written in tenant A is genuinely absent from tenant B — not filtered, not found at all', async () => {
    const created = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(companyA.token))
      .set(...companyIdHeader(companyA.companyId))
      .send({ name: 'A-only category', slug: `a-only-${companyA.companyId}`, order: 1 });
    expect(created.status).toBe(201);

    // Real HTTP path, real guard, scoped to B — B's list must not contain A's row.
    const listB = await request(app.getHttpServer())
      .get('/categories')
      .set(...authHeader(companyB.token))
      .set(...companyIdHeader(companyB.companyId));
    expect(listB.status).toBe(200);
    expect(
      (listB.body as { id: string }[]).some((category) => category.id === created.body.id),
    ).toBe(false);

    // Direct by-id read, scoped to B — must 404, not merely omit from a list.
    const readB = await request(app.getHttpServer())
      .get(`/categories/${created.body.id}`)
      .set(...authHeader(companyB.token))
      .set(...companyIdHeader(companyB.companyId));
    expect(readB.status).toBe(404);

    // Bypasses the HTTP/service/controller layer entirely — proves the row
    // is PHYSICALLY absent from B's schema via B's own tenant-scoped Prisma
    // client, not merely filtered by a query clause a buggy repository could
    // get wrong in the opposite direction (e.g. querying a shared/default
    // client that happens to still 404 for an unrelated reason).
    const rawB = await tenantClientFor(services, companyB.companyId).category.findUnique({
      where: { id: created.body.id },
    });
    expect(rawB).toBeNull();

    // And the row genuinely exists on A's side, scoped to A — the negative
    // above is meaningful only alongside this positive.
    const rawA = await tenantClientFor(services, companyA.companyId).category.findUnique({
      where: { id: created.body.id },
    });
    expect(rawA).not.toBeNull();
  });

  it('the SAME slug can exist independently in both tenants — proof of two physically separate tables, not one filtered table', async () => {
    const sharedSlug = `shared-slug-${Date.now()}`;

    const resA = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(companyA.token))
      .set(...companyIdHeader(companyA.companyId))
      .send({ name: 'Shared name A', slug: sharedSlug, order: 2 });
    const resB = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(companyB.token))
      .set(...companyIdHeader(companyB.companyId))
      .send({ name: 'Shared name B', slug: sharedSlug, order: 2 });

    // `Category.slug` is `@unique` (prisma/tenant/schema.prisma). If both
    // tenants shared ONE physical table — or a repository fell back to a
    // single default/master client — the second insert would collide with a
    // unique-constraint violation instead of succeeding independently.
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body.id).not.toBe(resB.body.id);
  });

  it('X-Company-Id naming company A is rejected for a caller whose membership is only in company B', async () => {
    const response = await request(app.getHttpServer())
      .get('/categories')
      .set(...authHeader(companyB.token))
      .set(...companyIdHeader(companyA.companyId));

    expect(response.status).toBe(403);
  });

  it('X-Company-Id naming company B is rejected for a caller whose membership is only in company A', async () => {
    const response = await request(app.getHttpServer())
      .get('/categories')
      .set(...authHeader(companyA.token))
      .set(...companyIdHeader(companyB.companyId));

    expect(response.status).toBe(403);
  });

  it('a caller belonging to BOTH companies is scoped ONLY to the one named by X-Company-Id, and must disambiguate when the header is absent', async () => {
    // A THIRD user, minted with an ACTIVE Membership + tenant CompanyUser in
    // company A via the existing helper, then manually granted the SAME in
    // company B — genuinely holds access to both tenants, unlike every other
    // caller in this file. Proves resolution is per-request, not
    // sticky/cached from a prior request to a different company in this
    // same process.
    const dual = await createAuthedUser(services, USER_ROLES.admin, companyA.companyId);
    await services.masterPrisma.membership.create({
      data: { userId: dual.userId, companyId: companyB.companyId, status: 'ACTIVE' },
    });
    await tenantClientFor(services, companyB.companyId).companyUser.create({
      data: { id: dual.userId, role: USER_ROLES.admin, createdByCompanyUserId: null },
    });

    const onlyInA = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(companyA.token))
      .set(...companyIdHeader(companyA.companyId))
      .send({ name: 'Dual-visible in A only', slug: `dual-a-${dual.userId}`, order: 3 });
    const onlyInB = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(companyB.token))
      .set(...companyIdHeader(companyB.companyId))
      .send({ name: 'Dual-visible in B only', slug: `dual-b-${dual.userId}`, order: 3 });
    expect(onlyInA.status).toBe(201);
    expect(onlyInB.status).toBe(201);

    const dualScopedToA = await request(app.getHttpServer())
      .get('/categories')
      .set(...authHeader(dual.token))
      .set(...companyIdHeader(companyA.companyId));
    expect(dualScopedToA.status).toBe(200);
    const idsSeenInA = (dualScopedToA.body as { id: string }[]).map((category) => category.id);
    expect(idsSeenInA).toContain(onlyInA.body.id);
    expect(idsSeenInA).not.toContain(onlyInB.body.id);

    const dualScopedToB = await request(app.getHttpServer())
      .get('/categories')
      .set(...authHeader(dual.token))
      .set(...companyIdHeader(companyB.companyId));
    expect(dualScopedToB.status).toBe(200);
    const idsSeenInB = (dualScopedToB.body as { id: string }[]).map((category) => category.id);
    expect(idsSeenInB).toContain(onlyInB.body.id);
    expect(idsSeenInB).not.toContain(onlyInA.body.id);

    // No header at all, and TWO ACTIVE memberships — ambiguous, must be
    // rejected rather than silently picking one (TenantContextGuard's own
    // "sole ACTIVE membership" fallback discipline, Phase 7).
    const dualNoHeader = await request(app.getHttpServer())
      .get('/categories')
      .set(...authHeader(dual.token));
    expect(dualNoHeader.status).toBe(400);
  });
});
