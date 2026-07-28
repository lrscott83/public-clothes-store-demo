# Exploration: multi-tenant-by-schema

Artifact store `hybrid`. Engram twin: `sdd/multi-tenant-by-schema/explore`.

> **No locked decision exists.** Backlog #1516 links `[[architecture/multi-tenant-by-schema]]`,
> which does not exist anywhere (verified across all projects). It was a forward link, never
> written. Everything below is derived from reading real code in this repo and in `poolops-biz`.

## Current State

Single-tenant, single Postgres schema, zero multi-tenant concept anywhere — confirmed by
`grep -i "companyId"` across `templates/` returning zero matches.

Key files:

- `templates/packages/infra-db/prisma/schema.prisma` — one schema, one generated client, one
  global `PrismaService`.
- `templates/packages/domain/src/users/roles.ts` — `User` already carries an `Int` bitmask,
  structurally identical to poolops's `RoleHelpers`.
- `templates/packages/api-common/src/auth/{roles.guard.ts,jwt.strategy.ts}` — reads
  `request.user.roles` directly; the JWT payload has no `companyId`.
- `Customer.userId` (`schema.prisma:190`) and `WarehouseOperator.userId` (`schema.prisma:395`)
  are REAL Prisma `@relation` FKs to `User`.
- `templates/apps/salesops-mvp` — confirmed zero backend calls (`fetch`/`axios`/`API_URL`
  grep = 0 hits). Stays out of scope.

Migration precedent: `20260725170000_rename_enum_values_to_english/migration.sql` proves Prisma
Migrate already needed hand-written SQL in this repo (auto-diff was destructive).

## What poolops-biz actually does (file paths verified)

Two physically separate Prisma schemas/clients over ONE physical Postgres database:

- `packages/infra-db/prisma/master/schema.prisma` — `User`, `Company`, `Membership`, `Invitation`
- `packages/infra-db/prisma/tenant/schema.prisma` — business tables + `CompanyUser`

`CompanyUser` has **no** `@relation` back to master `User` — just `id String @id`, a soft FK only,
because Prisma cannot relate across two independently-generated clients.

**Tenant resolution**: `TenantContextMiddleware` (extracts `X-Company-Id`) → `JwtAuthGuard` →
`TenantContextGuard` (`packages/api-common/src/guards/tenant-context.guard.ts`) which validates the
master `Membership`, runs `TenantContextService.runAsync`, and verifies the tenant `CompanyUser`
exists (flagging `MISSING_COMPANY_USER` inconsistencies).

**Client instantiation**: `TenantPrismaFactory`
(`packages/infra-db/src/tenant/tenant-prisma-factory.ts`) — one `pg.Pool` per schema with
`options: -c search_path="<schema>",public` plus `PrismaPg({schema})`, cached by schema name.

**Migrations**: real Prisma migration history exists (`prisma/tenant/migrations/*`), but rollout
uses two DIFFERENT mechanisms — `tenant-deploy-all.ts` (`prisma migrate deploy` per tenant via the
`?schema=` query param, the production path) vs `migrate-all-tenants.ts`
(`prisma db push --accept-data-loss`, explicitly dev/CI-only). New tenants get a full-schema SQL
script (`generate-tenant-schema-sql.ts`, `prisma migrate diff --from-empty`), not migration replay.

## Verdict on the backlog's "tables unchanged" claim: REFUTED (partially)

`Customer.userId @relation` and `WarehouseOperator.userId @relation` cannot survive as Prisma
relations once split across master/tenant clients — poolops's own `CompanyUser` proves this with
zero `@relation` back to master. That is a real table-definition change, not merely a
connection/infra concern.

What IS true: business tables (`Product`, `Order`, `Warehouse`, …) need no new columns under
schema-per-tenant — isolation is by schema, not by a `companyId` discriminator.

## Affected Areas (by layer)

| Layer | What changes |
|---|---|
| `packages/domain/src/users/roles.ts`, new `company/` folder | CompanyUser / Membership / Company models + ports |
| `packages/infra-db/prisma/schema.prisma` | Split master/tenant; `Customer`/`WarehouseOperator` relations dropped or softened |
| `packages/infra-db` repositories (9) | `prisma-currency`, `prisma-customer`, `prisma-category`, `prisma-product`, `prisma-warehouse`, `prisma-stock-level`, `prisma-stock-movement`, `prisma-order`, `prisma-warehouse-operator` — DI swaps from constructor-injected `PrismaService` to `TenantContextService.getClient()` |
| `packages/api-common/src/auth/` | `roles.guard.ts`, `jwt.strategy.ts` — role source moves from `user.roles` to `request.companyUserRole`; new `tenant-context.guard.ts` / middleware |
| `apps/api-salesops` | 9 controllers' guard chains, `app.module.ts` middleware registration |
| `apps/api-idp/src/auth/auth.service.ts` | Signup must assign a Membership / CompanyUser |

## Approaches

### 1. Full schema-per-tenant (mirror poolops exactly)

Dual Prisma clients, `TenantPrismaFactory`, guard chain, provisioning scripts, one-time cutover.

- **Pros**: proven pattern; real physical isolation; matches `docs/system/architecture.md`'s stated intent.
- **Cons**: ~45–55 files touched; real new ops surface; zero second tenant exists today to validate against.
- **Effort**: High.

### 2. CompanyUser/roles reframe only, single schema

`User.roles` → `CompanyUser.role` inside the existing schema. No dual clients, no tenant provisioning.

- **Pros**: delivers the domain improvement the backlog names, ~20–25 files, reversible, a valid
  stepping stone to Approach 1 later.
- **Cons**: no physical data isolation; partial rework if schema-per-tenant becomes certain later.
- **Effort**: Medium.

### 3. Row-level `companyId` tenancy

Single schema, `companyId` column, repository-enforced filtering.

- **Pros**: simplest mental model; single client.
- **Cons**: explicitly deviates from the architecture doc's "mirror poolops" intent (would need to
  be argued and written in); weaker isolation — one missing `WHERE` clause leaks cross-tenant data.
- **Effort**: Medium.

## Recommendation

Scope the next change as **Approach 2** unless the owner confirms a committed near-term second
tenant (Open Question 1). It delivers the concrete domain fix the backlog names at roughly half the
blast radius, without foreclosing Approach 1 later.

## Risks

- **Guard-order regression**: if `TenantContextGuard` does not run before `RolesGuard`, every
  `@Roles()` check fails closed — a silent full lockout.
- **Unaudited eager-loads**: `Customer`/`WarehouseOperator` `include: { user: true }` usages were
  not grepped in this pass. They MUST be searched in `sdd-design` before the schema split, or they
  silently return `undefined` post-split.
- **No Prisma-native path**: neither the master/tenant split nor the existing-data cutover can be
  auto-generated. Hand-written SQL plus imperative TS scripts are required — the same pattern as the
  enum-rename precedent already in this repo.
- **Deferral cost**: data migration is greenfield-feasible NOW (zero real tenants) and gets costlier
  the longer it is deferred as more single-schema data accumulates.
- **Undecided scoping**: `ExchangeRate` tenant-vs-master placement affects which repositories move
  to `TenantContextService.getClient()`.

## Open Questions for the Owner

1. Is there a committed second tenant/company near-term, or is this "get the architecture right
   early"? **Gates Approach 1 vs 2.**
2. Is `ExchangeRate` tenant-scoped, or shared master data across all future tenants?
3. If multi-company is coming: schema-per-tenant (Approach 1) or row-level `companyId` (Approach 3)?
4. For the one-time cutover: is `ALTER TABLE … SET SCHEMA` (fast, zero-copy) acceptable, or must
   `public` keep functioning during a phased cutover?
5. New signup: auto-assign to the single existing company, or block until an Invitation flow exists?
