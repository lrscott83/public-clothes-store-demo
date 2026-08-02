# Exploration: multi-tenant-by-schema (concrete path, reading poolops-biz)

Artifact store `hybrid`. Engram twin: `sdd/multi-tenant-by-schema/explore` (#1562, revision 2 —
revision 1 was the July exploration that led to deferring this; its text survives on disk at
`openspec/changes/archive/2026-07-28-company-user-roles-reframe/explore.md`).

Owner decision is LOCKED (schema-per-tenant, mirroring poolops-biz) — this document does
NOT re-open that choice. Job: map the concrete path there, primarily from poolops-biz's
real code at `/home/coder/sources/poolops/poolops-biz`.

## 1. What store-mgmt already has (2026-07-28 groundwork)

`templates/packages/infra-db/prisma/schema.prisma`:

- `Company` (id, name, slug, isActive, `schemaName String?` — line 534, "ALWAYS null today —
  no code path may read it") and `CompanyUser` (id own-uuid, `userId` soft-FK column — NO
  `@relation`, `companyId` real `@relation` to `Company`, `role Int`, `status CompanyUserStatus`
  ACTIVE/REVOKED/SUSPENDED) already exist, single schema, inert.
- `Order.attributedCompanyUserId`, `CommissionAccrual.attributedCompanyUserId`,
  `CommissionPayment.recordedByCompanyUserId` all FK to `CompanyUser.id` (Restrict/Cascade).
- `Customer.userId` and `WarehouseOperator.userId` are REAL Prisma `@relation` FKs straight to
  `User` (master-side identity) — schema.prisma:192, :509.
- `api-idp` (`templates/apps/api-idp/src/auth/auth.service.ts`) already owns User, Company,
  CompanyUser, RefreshToken, PasswordResetToken end-to-end via ports (`ICompanyRepository`,
  `ICompanyUserRepository` injected). Signup auto-assigns via `resolveSoleCompany` — fails
  loud (500) on 0 companies, 409 on >1.
- Single global `PrismaService` (`templates/packages/infra-db/src/prisma-client.ts`), injected
  into **17 repositories**. ~12 are tenant-side business repos api-salesops depends on
  (currency, customer, order, commission x3, stock-movement, warehouse, stock-level, category,
  product, warehouse-operator); ~5 are master/identity-side (user, refresh-token,
  password-reset-token, company, company-user) that stay in api-idp's world under a split.

## 2. poolops-biz — verified, reachable at the given path

### 2.1 Schema split

- `packages/infra-db/prisma/master/schema.prisma`: `User`, `Company` (+ `schemaName String?`),
  `Membership` (userId, companyId, `status MembershipStatus` ACTIVE/REVOKED/SUSPENDED — **exact
  enum-value match** with store-mgmt's CURRENT `CompanyUserStatus`), `Invitation`,
  `RefreshToken`, `PasswordResetToken`, `EmailVerificationToken`.
- `packages/infra-db/prisma/tenant/schema.prisma`: all business tables + `CompanyUser`.
  **`CompanyUser.id String @id` IS the master `User.id`, provided explicitly, "no
  auto-generation"** (line 247 comment) — collapses PK and the soft-FK into ONE field, no
  separate `userId` column at all.
- **Mismatch vs store-mgmt's D1**: store-mgmt's proposal (`company-user-roles-reframe/proposal.md`
  D1) claims its `CompanyUser` shape (own `id uuid` + separate `userId` soft-FK column, no
  `@relation`) "is poolops's verified shape." It is NOT identical — poolops has no separate
  `userId` column; `id` itself IS the master user id. The "no `@relation`, soft FK, integrity is
  an application invariant" PRINCIPLE is correctly mirrored; the concrete column shape is not.
- **D3 verified**: `status` on master `Membership`, `role`-only on tenant `CompanyUser` —
  matches poolops exactly, including the ACTIVE/REVOKED/SUSPENDED enum values.
- **D6 (Currency/PaymentChannel tenant-scoped)**: no direct poolops equivalent (different
  domain) to check 1:1. The general pattern D6 relies on ("business/commercial config is
  tenant-side") is consistent with poolops's tenant-side `CompanySettings`.
- `Customer.userId`/`WarehouseOperator.userId` real `@relation` FKs to master `User` CANNOT
  survive a literal split (confirmed by poolops's analogous tables: `CompanyCustomer.id` and
  `CompanyTechnician.id` are tenant-local ids with `companyUserId` FK to tenant
  `CompanyUser.id` — NEVER a relation to master `User`).

### 2.2 Client management — THE PART MOST LIKELY TO BITE

- `packages/infra-db/src/tenant/tenant-prisma-factory.ts` (LIVE code): a `Map<schemaName,
  {client, pool}>` — **one dedicated `pg.Pool` PER TENANT SCHEMA**, cached forever unless
  explicitly disposed. `pool.options = "-c search_path=\"<schema>\",public"`.
- **This is exactly the pattern that does NOT scale, and poolops's own team has flagged it**:
  `specs/045-schema-per-tenant/` (Status: Draft, ALL tasks unchecked, dated 2026-04-07)
  proposes replacing it with a SINGLE shared Prisma client / single `pg.Pool`, using a
  per-transaction `SET LOCAL search_path TO <schema>, public` (research R1/R6) — specifically
  because "Scale/Scope: Dozens to hundreds of tenants" makes N-pools-for-N-tenants an
  operational problem (connection exhaustion). Confirmed NOT implemented: live
  `prisma/tenant/schema.prisma` has no `previewFeatures = ["multiSchema"]` and no `@@schema(...)`
  directives, which spec 045's Phase 1 requires.
- **Conclusion for store-mgmt**: poolops's CURRENT production code is the per-schema-pool
  pattern (fine at poolops's actual tenant count), but poolops's own architects have already
  identified it as a scaling risk and drafted (unshipped) the fix. It is a known, documented,
  self-flagged interim shape at the source of truth itself — not a proven end state.

### 2.3 Request-time tenant resolution

- `TenantContextMiddleware` runs BEFORE guards, only extracts `X-Company-Id` ->
  `req.requestedCompanyId`. Zero validation here.
- `TenantContextGuard` (`packages/api-common/src/guards/tenant-context.guard.ts`), runs AFTER
  `JwtAuthGuard`: resolves `companyId` (header or `user.defaultCompanyId`) -> loads master
  `Membership` (404/403 if missing or not ACTIVE) -> loads `Company` (403 if inactive or
  `schemaName` null, "tenant schema not provisioned") -> opens `TenantContextService.runAsync`
  -> inside that AsyncLocalStorage scope, verifies a `CompanyUser` row exists in the TENANT
  schema for that user id -> attaches `request.companyUserRole`/`request.company`. Missing
  `CompanyUser` despite valid `Membership` is logged as `DATA INCONSISTENCY` /
  `MISSING_COMPANY_USER` and rejected (mirrors store-mgmt's existing D4 fail-loud pattern).
- `TenantContextService` wraps Node's `AsyncLocalStorage` — `run`/`runAsync`/`getContext`/
  `requireContext`/`getClient()` (delegates to `TenantPrismaFactory.getClient(schemaName)`).

### 2.4 Migrations across N schemas

- `tenant-deploy-all.ts`: loops all `Company` rows with non-null `schemaName`, runs
  `prisma migrate deploy` per tenant with `DATABASE_URL` rewritten to `?schema=<name>`.
  **No transaction, no drift check, no rollback of already-succeeded tenants.** On partial
  failure: logs `FAILED` per tenant, continues, exits 1 overall — leaves the fleet in a MIXED
  migration state by design, fixable only by re-running.
- `migrate-all-tenants.ts` (dev/CI only): same loop with `prisma db push --accept-data-loss`.
- `generate-tenant-schema-sql.ts`: `prisma migrate diff --from-empty` produces a full-schema
  SQL script used for NEW tenants — new tenants get the full current schema in one shot, not
  migration replay.
- **No automated drift check exists** anywhere in the repo.

### 2.5 Tenant provisioning

- `TenantDatabaseService.createSchema(companyId)`: validates companyId is a UUID, derives
  `schemaName = poolops_tenant_<uuid_with_underscores>`, `CREATE SCHEMA IF NOT EXISTS`,
  `SET search_path`, executes the pre-generated `tenant-schema.sql` — all via a raw `pg.Client`,
  NOT through the cached Prisma factory.
- Called from THREE separate app-level `CompanyService.createCompany` implementations
  (`api-manager`, `api-customer`, `api-technician`) — genuine duplication poolops carries
  because it has 3 front-door apps and no single identity app. Saga: create master `Company` ->
  `createSchema` -> update `Company.schemaName` -> create master `Membership` -> create tenant
  `CompanyUser` (Owner role) -> best-effort background catalog seed, with explicit compensating
  rollback on failure.
- **store-mgmt's `api-idp` gives this a single natural home** — only ONE saga implementation
  needed.

### 2.6 Testing — how poolops proves (or doesn't prove) isolation

- **No committed automated test proves live cross-schema isolation.** The concrete plan for one
  — `concurrent-isolation.test.ts`, 100 parallel `runWithSchema` calls alternating two tenant
  schemas — is spec 045 task **T031, unchecked**. It does not exist in the repo.
- The bulk of e2e coverage runs against ONE fixed schema (`TEST_TENANT_SCHEMA =
  'poolops_tenant_e2e_test'`) with `TenantContextGuard` and `JwtAuthGuard` explicitly **stubbed
  via `overrideGuard`** — business-logic e2e tests do NOT exercise the guard or the cross-tenant
  boundary at all.
- Net honest answer: store-mgmt cannot model its proof obligation on an existing poolops test —
  it would be writing the FIRST one of its kind for either codebase, following spec 045's
  unshipped T031 design as the closest available template.

## 3. Architecture fit (per docs/system/architecture.md)

- A `pg.Pool`/Prisma client per schema, `TenantDatabaseService`, migration scripts — infra,
  belongs in `packages/infra-db` (adapters).
- "Which tenant am I" (resolving `X-Company-Id` -> validated `companyId`/`schemaName`) is a
  request-scoped AUTHORIZATION decision, not pure infrastructure plumbing — poolops itself
  places the validation half (`TenantContextGuard`) in `packages/api-common`, and only raw
  header extraction at the app-composition edge. store-mgmt's existing D4 precedent
  (`JwtStrategy` resolving `CompanyUser`) already sets this norm. A future `TenantContextGuard`
  should follow the SAME placement: `packages/api-common/src/auth/`, not `packages/infra-db`.
- `TenantContextService`'s `AsyncLocalStorage` carrier is defensible as infra (a client
  locator), but the DECISION "does this companyId/user pair get access" is domain-adjacent
  policy that `packages/domain` should define as a port, rather than being smuggled entirely
  into the guard/infra layer as poolops currently does.

## 4. Data cutover (exactly one Company today)

- The 2026-07-28 deferral table names this explicitly. Because exactly one `Company` row exists
  by construction, moving today's data means: create the one tenant schema, then
  `ALTER TABLE <each tenant-side table> SET SCHEMA <new>` for every business table currently in
  `public` — fast, zero-copy, but requires an exclusive lock per table and a maintenance
  window. Poolops's own cutover used drop-and-recreate because "dev data is disposable" — NOT
  a model store-mgmt can use, which has a real production company's data to preserve.
- What breaks mid-flight: any in-flight query against a table mid-`SET SCHEMA` blocks on the
  lock; a partial cutover leaves cross-table joins broken (`Order.warehouseId -> Warehouse`
  would span schemas) until every affected table completes. This needs one transaction or a
  short coordinated window, not incremental per-table over time.

## 5. Blast radius on api-salesops

- 17 total `PrismaService`-injecting repositories in `infra-db`; ~12 are tenant-side business
  repos. Each needs its DI source changed from constructor-injected `PrismaService` to a
  `TenantContextService.getClient()`-equivalent call.
- api-salesops has 10 controller files; the archived `company-user-roles-reframe/archive-report.md`
  (W4) verified **7 carry `@UseGuards`** — that is the accurate count for guard-chain changes.
  Each needs `TenantContextGuard` added after `JwtAuthGuard`, before `RolesGuard`.

## Open Questions for the Owner

1. **CompanyUser shape**: adopt poolops's collapsed `id == master User.id` shape now (cheap
   today — zero real tenant-side FKs depend on the current shape yet) or keep store-mgmt's
   current two-column shape and accept it is NOT what D1 claims to mirror? **Gates whether every
   downstream FK to `CompanyUser` changes shape or stays as-is.**
2. **Client management**: copy poolops's CURRENT per-schema-pool factory (simple, proven at
   poolops's actual scale, self-flagged as not scaling past "dozens to hundreds"), or design
   directly against spec 045's target (single shared client + `SET LOCAL search_path`, requiring
   Prisma `multiSchema`) even though poolops hasn't shipped it?
3. **Migration rollout semantics**: is a partial-fleet migration failure (poolops's actual
   behavior) acceptable, or does the design need an explicit drift check/gate poolops never
   built?
4. **Isolation proof obligation**: since poolops's suite does not test live two-schema
   isolation, should store-mgmt's design commit to writing this test as new, first-of-its-kind
   work rather than "port poolops's test"?
5. **Tenant resolution placement**: confirm the `TenantContextGuard`-equivalent belongs in
   `packages/api-common/src/auth/`, not `packages/infra-db`.
6. **Data cutover mechanics**: is a short exclusive-lock maintenance window acceptable, given
   poolops's cutover approach does not transfer?
7. **`Customer`/`WarehouseOperator` reshape**: confirmed necessary (real `@relation` to master
   `User` cannot survive a literal split) — reshape to FK the tenant `CompanyUser` now, as part
   of this change, or explicitly defer to a follow-up?
