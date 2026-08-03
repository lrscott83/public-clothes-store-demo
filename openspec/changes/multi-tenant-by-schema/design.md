# Design: multi-tenant-by-schema

Master schema (`public`) holds identity; each company gets its own Postgres schema holding every
business table. One database, one `DATABASE_URL`. Shape copied from `poolops-biz`, with each of its
six landmines corrected at the point of copying.

Inputs: [`proposal.md`](./proposal.md) · [`decisions-pending.md`](./decisions-pending.md) (P2–P11
decided, P1/P13 withdrawn) · [`p12-test-schema-investigation.md`](./p12-test-schema-investigation.md).
Every `file:line` below was read, not recalled.

## 1. The split

| Master (`public`) | Tenant (`<schema>`) |
|---|---|
| `User`, `RefreshToken`, `PasswordResetToken` | `CompanyUser`, `Customer`, `WarehouseOperator` |
| `Company` (`schemaName` now read and authoritative) | `Category`, `Product`, `Warehouse`, `StockLevel`, `StockMovement`, `ExchangeRate` |
| **`Membership`** (new: userId, companyId, `status`) | `Order`, `OrderLine`, `OrderPayment`, `SaleCredit` |
| **`TemplateCategory`, `TemplateProduct`** (new, P8) | `ProductCommissionReference`, `CommissionAccrual(+Line, +Unresolved)`, `CommissionPayment` |
| enum `MembershipStatus` (renamed from `CompanyUserStatus`) | enums `PaymentChannel`, `Currency`, `StockMovementType`, `OrderStatus`, `DeliveryMode` |

Three relations cannot survive and are reshaped, not deleted — Prisma forbids cross-schema
`@relation`, so this is tooling-enforced:

| Today | Becomes |
|---|---|
| `Customer.userId → User` (`schema.prisma:192`) | `Customer.companyUserId → CompanyUser.id` |
| `WarehouseOperator.userId @id → User` (`schema.prisma:509`) | `WarehouseOperator.companyUserId @id → CompanyUser.id` |
| `CompanyUser.company → Company` (`schema.prisma:561`) | dropped — see D1 |

## 2. Architecture decisions

### D1 — `CompanyUser` is `{ id, role, createdBy… }`. No `userId`, no `companyId`.

| Option | Verdict |
|---|---|
| Keep `id` + `userId` + `companyId` | Rejected. `companyId` cannot hold a `@relation` to master `Company` and is constant per schema — a redundant, unvalidatable column is drift bait. |
| **`id` IS the master `User.id`, sole PK; company identity IS the schema** | **Chosen.** P2 literally. poolops's tenant `CompanyUser` carries no `companyId` either (`tenant/schema.prisma:246-272`). |

Consequence: `SanitizedUser.companyId` is sourced from the tenant context, not from the row.
This is the one decision this design takes beyond P2's literal text; it follows from P7's constraint.

### D2 — Tenant client: per-schema pool, bounded, disposable.

| Option | Verdict |
|---|---|
| Single shared client + `SET LOCAL search_path` (poolops spec 045) | Rejected for now — needs Prisma `multiSchema`; poolops drafted it and never shipped it. Recorded as the known next step. |
| **`Map<schemaName, {client, pool}>`, `new Pool({ max, idleTimeoutMillis, options: '-c search_path="<schema>",public' })` + `PrismaPg(pool, { schema })`** | **Chosen.** Same construction as `tenant-prisma-factory.ts:49-54`, plus: explicit `max` (default 5, env-tunable), idle timeout, LRU cap on the cache, and `disposeClient` actually called — from cache eviction and from `onModuleDestroy`, not only from process exit. |

Landmine 1 fixed: poolops passes no `max` (pg default 10), never evicts, and `disposeClient()` has
zero call sites repo-wide.

`getClient()` **throws** when no tenant context is active. It never falls back to the global
`PrismaService`. That is what makes a missed re-scope a loud 500 instead of a silent cross-tenant read.

### D3 — `schemaName` is re-validated at every interpolation site.

One exported helper owns both derivation and validation: `schemaNameFor(companyId)` (UUID-checked,
`store_mgmt_tenant_<uuid_with_underscores>`) and `assertSchemaName(name)` called by the factory, the
provisioner and the migration tool. poolops validates only at creation (landmine 5) and interpolates
freely afterwards.

### D4 — Tenant resolution moves the role bitmask out of `JwtStrategy`.

This is the change's sharpest existing-code conflict, and it is not in the proposal.
`jwt.strategy.ts:105` resolves `CompanyUser` today — a table that will live in a tenant schema whose
identity is not yet known when Passport runs. It cannot stay.

```
JwtAuthGuard          → req.user = { id, login, isActive }        (master only)
TenantContextGuard    → X-Company-Id | sole ACTIVE Membership
                        → Membership (403 if absent/not ACTIVE)
                        → Company (403 if inactive or schemaName null)
                        → runAsync(ctx) → tenant CompanyUser by id === user.id
                        → req.tenant = { companyId, schemaName }
                        → req.user.roles / .companyUserId / .companyId
RolesGuard            → unchanged: reads req.user.roles
```

`jwt.strategy.ts:16-29` records a GUARD-ORDER INVARIANT saying *"no third guard may be introduced to
populate"* the bitmask. This change introduces exactly that guard. The invariant's **purpose** —
absence must fail loudly, never evaluate to `can(undefined, mask) === 0` — is preserved by keeping
`roles` on `req.user` and adding an explicit check in `RolesGuard`: `user` present but
`roles === undefined` throws `ForbiddenException('Tenant context not resolved')`. The comment and its
regression test (`roles.guard.spec.ts`) must be rewritten in the same commit, not left contradicting
the code.

Placement: `packages/api-common/src/auth/` (P6, D4 precedent), **not** poolops's `guards/`.
The policy decision *"does this (user, company) pair get access"* is a domain port
(`IMembershipRepository` + `resolveTenantAccess` in `packages/domain/src/company/`); the guard is
delivery, the ALS carrier is infra. poolops smuggles all three into the guard.

Also not copied: poolops's guard catches DB errors inside `verifyCompanyUserExists` and returns
`null` (`tenant-context.guard.ts:199-214`), so a connection failure is reported to the operator as
`DATA INCONSISTENCY`. Infrastructure failure is a 500; a missing row is a 403.

### D5 — ALS is re-scoped per call site, deliberately.

Every api-salesops handler that touches tenant data wraps its service call:
`runInTenant(req.tenant, () => this.service.x(...))`.

**Why, written down so nobody optimizes it back:** the guard's ALS scope ends when
`canActivate` resolves — poolops's own comment at `tenant-context.guard.ts:170-172` claims the scope
stays open through the handler, and it is wrong; that is why 100+ downstream sites there re-open it
from `request.company`. Wrapping the handler in an interceptor instead would bet on ALS surviving
NestJS's RxJS pipeline. Re-scoping is idempotent, cheap, and fails loudly (D2) when forgotten.
Do not replace it with an interceptor.

### D6 — One migration tool; drift check is the same primitive in report mode.

Tenant schemas carry **no** `_prisma_migrations` history. Their truth is `prisma/tenant/schema.prisma`.

| Path | Mechanism |
|---|---|
| Provision (runtime, in-request) | apply generated `tenant-schema.sql` via `pg.Client` in one transaction. No CLI in the request path. |
| Evolve the fleet (`scripts/tenant-migrate.ts`) | per tenant: `prisma migrate diff --from-schema-datasource <url?schema=X> --to-schema-datamodel prisma/tenant/schema.prisma --script` → apply in a transaction, **per-tenant timeout**, continue-and-report, exit non-zero. |
| Drift check (`--check`, CI + startup assertion) | same diff, `--exit-code`, no apply. Any tenant with a non-empty diff is named and the run FAILS. |

Destructive statements (`DROP TABLE`/`DROP COLUMN`) are refused unless `--allow-destructive` is passed
explicitly — the inverse of poolops's habitual `--accept-data-loss` (landmine 2). Master keeps normal
`prisma migrate dev/deploy` history.

*Unverified:* the exact `migrate diff` flag set is written from Prisma 7.8 semantics, not executed.
Validate it in the first task of this slice before building on it.

### D7 — Provisioning saga in `api-idp`, with orphan detection.

```
createCompany(input)
  1 master Company (schemaName NULL)     ↺ delete Company
  2 CREATE SCHEMA + tenant-schema.sql    ↺ DROP SCHEMA CASCADE
  3 Company.schemaName = <name>          ↺ set NULL
  4 master Membership (ACTIVE)           ↺ delete
  5 tenant CompanyUser (owner role)      ↺ delete
  6 copy TemplateCategory/TemplateProduct → tenant, AWAITED (P9)
```

Steps 1–6 are not one transaction (DDL + two schemas). Compensation runs in reverse. **A failing
compensation step is not trusted**: it writes a `ProvisioningIncident` row in master and
`scripts/tenant-orphan-sweep.ts` reconciles — schemas with no `Company`, `Company` rows with a
`schemaName` pointing at a missing schema, `Membership` with no tenant `CompanyUser`. poolops only
logs (landmine 5). Step 6 is awaited: poolops's `void seedNewCompany(...)` leaves a real window where
a new tenant has an owner and an empty catalog (P9).

`AuthService.signup`'s `resolveSoleCompany` (`auth.service.ts:113,155`) is replaced by explicit
`Membership` lookup.

## 3. File map

| Path | Action |
|---|---|
| `prisma/schema.prisma` | Delete → `prisma/master/schema.prisma` + `prisma/tenant/schema.prisma`, each with its own `prisma.config.ts` and generator output (`generated/master/client`, `generated/tenant/client`) — poolops's layout, verified present |
| `src/tenant/{tenant-prisma-factory,tenant-context.service,tenant-database.service,schema-name}.ts` | Create |
| `src/tenant/tenant-schema.sql` + `scripts/generate-tenant-schema-sql.ts` | Create (generated artifact, committed) |
| `scripts/tenant-migrate.ts`, `scripts/tenant-orphan-sweep.ts` | Create |
| `src/{currency,customer,sales,commission,inventory,product,users/warehouse-operator}/prisma-*.repository.ts` | Modify — ~12 tenant-side repos take the client from `TenantContextService`, not injected `PrismaService` |
| `src/{users,company}/prisma-{user,refresh-token,password-reset-token,company,company-user}.repository.ts` | ~5 master-side repos unchanged (`company-user` moves tenant-side) |
| `packages/api-common/src/auth/{tenant-context.guard,run-in-tenant,jwt.strategy,roles.guard}.ts` | Create / Modify per D4, D5 |
| `packages/domain/src/company/{models,imembership.repository,resolve-tenant-access}.ts` | Create / Modify |
| `apps/api-idp/src/company/` | Create — saga (P11) |
| `apps/api-salesops/src/**/*.controller.ts` | Modify — 10 files carry `@UseGuards(JwtAuthGuard, RolesGuard)`; verified by grep |
| `packages/eslint-config` | Modify — tenant repos may not import `PrismaService` |
| `prisma/seed.js` + `src/*/seed.ts` | Modify — master seed (users, company, templates) then provision one tenant and seed it |

## 4. Test strategy (P12 — Option C, scoped)

| Surface | Approach |
|---|---|
| `packages/domain` (24 files, 272 cases) | Unaffected — pure |
| Tenant-side `infra-db` specs (~12 files) | **Schema per suite.** New `tenant-schema.spec-helper.ts`: `CREATE SCHEMA` + apply static DDL in `beforeAll`, `DROP SCHEMA CASCADE` in `afterAll`. Also removes the RESTRICT-ordering cleanup problem for those tables. |
| Master-side `infra-db` specs (~5 files) | Unchanged shared `public` + existing `db-cleanup.spec-helper.ts` discipline |
| e2e (9 files, 84 cases) | `auth-e2e-helper.ts:23-45` (`createAuthedUser`) is the single highest-leverage break: it writes `User` + `Company` + `CompanyUser` through one client. It gains a tenant client and drives a real `X-Company-Id` resolution path. Guards are **not** stubbed. |
| Isolation proof (P5) | ONE new spec: provision two named tenant schemas in a single run, assert a query scoped to A never returns B's rows. First of its kind in either codebase. |
| Workers | `maxWorkers: 1` stays. Schema-per-worker (Option B) is rejected: it reopens the exact race `maxWorkers: 1` exists to prevent (`infra-db/jest.config.js:18-28`) for no necessity. |

`PrismaService` gains a schema parameter — the same code production needs for the factory, so this is
not test-only work.

**Two things stated plainly, per P12:**

1. **This is the largest uncosted surface outside the saga.** The e2e rewiring across all 9 files
   follows from the split under *every* option, including the do-nothing one, and had never been
   itemized before P12.
2. **The relief is one-sided.** Schema-per-tenant does NOT retire the cross-suite contamination class
   fixed the week of 2026-07-27. Master tables — `User`, `Company`, `RefreshToken`,
   `PasswordResetToken`, `Membership` — stay in one shared schema under every option. Keep the
   RESTRICT-ordering discipline in `db-cleanup.spec-helper.ts`.

Raw SQL is **not** a problem: `apply-reservation.ts:68-72` and `apply-stock-movement.ts:101-103` use
unqualified table names and ride `search_path`, which D2's pool option sets.

## 5. Placement and doc debt

`docs/system/architecture.md`'s "¿Dónde va X?" table is honoured for every row that exists. Two
components have **no row**: the tenant guard (governed by the D4 `JwtStrategy` precedent) and
`scripts/` tooling. Said plainly rather than forced. That document is also stale — it still claims
"HTTP backend: does not exist" and lists no `infra-db`/`api-common`/`api-*`. Fixing it is out of
scope here and stays flagged.

## 6. Migration / rollout

No cutover, no downtime window, no dual-write, no data migration — there is no production data (P1
withdrawn). The path is: create schema → apply tenant DDL → `pnpm seed`. Rollback is `git revert` +
`DROP SCHEMA … CASCADE` + `prisma migrate reset` + `pnpm seed`.

**This rollback plan expires the day a real tenant holds real rows.** It must be rewritten then.

## 7. Open items

- [ ] D6's `migrate diff` flags are unverified against Prisma 7.8 — validate before building on them.
- [ ] `TemplateCategory`/`TemplateProduct` columns mirror what `seedProducts` writes from
      `catalog.json` today; the exact column list is settled in tasks, not here.
- [ ] Pool `max` default of 5 is a starting value, not a measured one.
