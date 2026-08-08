# Proposal: multi-tenant-by-schema

Split store-mgmt's single Postgres schema into **master + one schema per tenant**, mirroring
`poolops-biz` minus its six documented defects. Shape is owner-locked; this proposal states
scope, placement and risk — it does not re-derive decisions already taken.

## Lineage

- Exploration: [`explore.md`](./explore.md) · engram `sdd/multi-tenant-by-schema/explore` (#1562)
- Decisions (RESOLVED 2026-08-03): [`decisions-pending.md`](./decisions-pending.md) — P2–P11 taken,
  P1 and P13 withdrawn, P12 open
- poolops references: engram `reference/poolops-tenancy-verified` (#1779),
  `reference/poolops-cutover-precedent` (#1787)
- Supersedes `company-isolation`; builds on archived `2026-07-28-company-user-roles-reframe`

## Intent

`Company` and `CompanyUser` exist today but are **inert** — one implicit company, one schema,
`Company.schemaName` reserved and never read. The owner has confirmed **several companies are
coming**, which expired the 2026-07-28 deferral. Every tenant-side table is currently reachable
by every authenticated request; isolation is an assertion, not a property.

**Why now, and why cheaply:** there is **no production**. Every row is reproducible from
[`prisma/seed.js`](../../../templates/packages/infra-db/prisma/seed.js). store-mgmt is in exactly
the condition poolops declared when it chose its own approach (`specs/045/spec.md:182`, *"No
production data exists yet"*). The schema reshapes that would normally be expensive — collapsing
`CompanyUser` to the master user id, reshaping `Customer`/`WarehouseOperator` — are **nearly free
today and expensive forever after**.

## Scope

### In Scope

| # | Deliverable |
|---|---|
| 1 | Prisma split into `prisma/master/` (User, Company, Membership, token tables) and `prisma/tenant/` (all business tables + CompanyUser) |
| 2 | `CompanyUser.id` collapsed to the master `User.id` as **sole PK**; `userId` column dropped (P2) |
| 3 | Master `Membership` introduced; `status` lives there and **only** there (P10) |
| 4 | `Customer` / `WarehouseOperator` reshaped off their `@relation` to master `User` onto tenant `CompanyUser` (P7) |
| 5 | Tenant client acquisition: bounded per-schema pool factory + `TenantContextService` (P3) |
| 6 | Tenant resolution guard in `packages/api-common/src/auth/`, with deliberate per-call re-scoping (P6) |
| 7 | ~12 tenant-side repositories re-sourced from global `PrismaService` to the tenant client |
| 8 | Guard chain added to the 10 guarded `api-salesops` controllers |
| 9 | Provisioning saga owned solely by `api-idp`, with orphan detection (P11) |
| 10 | **One** migration tool, with per-tenant timeout and a loud drift check (P4) |
| 11 | Catalog templated in master, **copied** into each new tenant, seeded **synchronously** (P8, P9) |
| 12 | Cross-schema isolation test as a first-class deliverable, not a chore (P5) |
| 13 | Reseed path: `pnpm seed` produces master + one provisioned tenant |

### Out of Scope

| Excluded | Why |
|---|---|
| **Cutover, downtime window, data migration, dual-write** | No production data. Migration is: create schema → apply tenant DDL → reseed. P1 withdrawn. |
| Single shared client + `SET LOCAL search_path` (poolops spec 045 target) | Recorded as the known future step. Not built now — it needs Prisma `multiSchema`, and poolops has not shipped it either (P3). |
| `Invitation` model / invite-accept flow | Not needed until a user must join a second company |
| Cross-tenant reporting, tenant-aware background jobs / queues | No worker app exists yet; poolops's `runAsync`-per-tenant cron pattern is recorded for when one does |
| `templates/apps/salesops-mvp`, `templates/apps/static-store` | Zero backend calls / no auth surface |
| Rewriting stale `docs/system/architecture.md` | Doc debt, flagged again below — not this change's job |
| Commission reconcile endpoint, Combos | Unrelated backlog (`decisions-pending.md` tail) |

### Explicitly NOT inherited from poolops

Unbounded pool cache with no `max` and no disposal · two redundant migration tools, one running
`--accept-data-loss` · zero drift detection · nothing testing isolation · `schemaName` interpolated
into raw SQL without re-validation at read sites · docs describing unbuilt architecture as fact.
Each maps to a taken decision (P3, P4, P5) or an implementation rule.

## Capabilities

### New Capabilities

- `salesops-tenancy`: schema-per-tenant topology, tenant provisioning saga, request-time tenant
  resolution and context, tenant client acquisition, fleet migration + drift detection, and the
  cross-schema isolation guarantee.

### Modified Capabilities

- `salesops-companies`: `schemaName` becomes **read and authoritative** (today's spec requires the
  opposite); `CompanyUser` shape changes to master-user-id-as-sole-PK; `status` moves to a new
  master `Membership`; single-company auto-assignment is replaced by explicit membership.
- `salesops-identity`: tenant resolution joins JWT/role resolution; `Membership` gates access.
- `salesops-customers`: `Customer` FKs tenant `CompanyUser`, not master `User`.
- `salesops-inventory`: `WarehouseOperator` FKs tenant `CompanyUser`, not master `User`.
- `salesops-products`: catalog is master-templated and tenant-owned, not global.

> **Dependency for `sdd-spec`:** `salesops-identity` is still NOT in `openspec/specs/`. Its most
> recent source is `openspec/changes/archive/2026-08-02-sales-agents-commissions/specs/salesops-identity/spec.md`
> (plus the unarchived `openspec/changes/backend-users-roles/`). Read the delta from there.

## Approach

Copy poolops's **shape** — verified at `file:line` in `explore.md` §6 — and correct its six known
defects at the point of copying, rather than re-deriving the architecture or inheriting the defects
and fixing them later.

Placement follows the "¿Dónde va X?" table in [`docs/system/architecture.md`](../../../docs/system/architecture.md):

| Component | Location | Table row |
|---|---|---|
| `Membership` entity, reshaped `CompanyUser` | `packages/domain/src/company/models.ts` | Business entity |
| `IMembershipRepository`, tenant-access policy port | `packages/domain/src/company/` | Repository interface (port) |
| Reshaped tenant-side repositories (~12) | `packages/infra-db/src/*/` | Repository implementation (adapter) |
| `TenantDatabaseService`, tenant client factory, `TenantContextService` | `packages/infra-db/src/tenant/` | External-service adapter — infra |
| `prisma/master/`, `prisma/tenant/`, generated `tenant-schema.sql`, migration + drift CLI | `packages/infra-db/prisma/`, `scripts/` | Adapter-side tooling |
| Tenant resolution guard + `X-Company-Id` extraction | `packages/api-common/src/auth/` | **No row exists** — governed by the D4 precedent (`JwtStrategy` in `api-common/src/auth/`), not poolops's `guards/` |
| Provisioning saga | `apps/api-idp/src/` | Endpoint/controller → app feature folder |
| Guard-chain wiring | `apps/api-salesops/src/**/*.controller.ts` | Delivery only |
| "Tenant repos may not inject the global client" | `packages/eslint-config` | Cross-layer boundary rule — **enforced, not convention** |

Two placement notes for `sdd-design`:

1. The **decision** "does this user/company pair get access" is domain policy and belongs behind a
   port in `packages/domain`; only the ALS carrier and client locator are infra. poolops smuggles
   the whole thing into the guard — we do not.
2. `docs/system/architecture.md` is stale (still claims "HTTP backend: does not exist", lists no
   `infra-db`/`api-common`/`api-*`). The table rows above are the intended reading, not a stretch.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `templates/packages/infra-db/prisma/schema.prisma` | Removed | Split into `master/` + `tenant/` |
| `templates/packages/infra-db/prisma/migrations/` | New | Master migrations + generated tenant DDL |
| `templates/packages/infra-db/src/tenant/` | New | Factory, context service, database service |
| `templates/packages/infra-db/src/*/prisma-*.repository.ts` | Modified | **17 repos inject `PrismaService` today**; ~12 tenant-side switch client source, ~5 master-side stay |
| `templates/packages/infra-db/prisma/seed.js` + `company/`, `commission/` seeds | Modified | Master seed + per-tenant seed, run synchronously |
| `templates/packages/domain/src/company/` | New + Modified | `Membership`, reshaped `CompanyUser`, new ports |
| `templates/packages/api-common/src/auth/` | Modified | Tenant guard, resolution, re-scoping pattern |
| `templates/apps/api-idp/src/` | Modified | Provisioning saga, membership writes, orphan sweep |
| `templates/apps/api-salesops/src/**/*.controller.ts` | Modified | **10 of 11 controllers carry `@UseGuards`** (health does not) — corrects explore §5's "7 of 10", which was accurate at archive time and is now stale |
| `templates/apps/api-salesops/test/`, `src/test-support/` | Modified | Gated on P12 |
| `templates/packages/eslint-config` | Modified | New boundary rule |

**Sizing signal for `sdd-tasks`:** this is the largest change in the repo's history — roughly 60–90
files and well over 2000 changed lines. It **will** blow the 400-line review budget many times
over. Recommended slice seams: (1) schema split + migrations + reseed, (2) tenant client + context
+ repository re-sourcing, (3) guard + controller wiring, (4) provisioning saga, (5) migration tool
+ drift check, (6) isolation test. Each is independently verifiable.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A tenant-side repository is missed and silently reads `public` — cross-tenant leak or empty result | **High** | The isolation test (P5) is the primary detector; the eslint boundary rule is the secondary; enumerate all 17 repos explicitly in `tasks.md` |
| P12 unresolved: 974 tests on a shared Postgres, `maxWorkers:1`, with three cross-suite contamination bugs already fixed in this harness | **High** | Investigation runs in parallel; **design MUST NOT finalize test strategy before it lands** |
| Guard-chain ordering mistake causes silent lockout or, worse, silent bypass | Med | Guard runs after `JwtAuthGuard`, before `RolesGuard`; missing `CompanyUser` despite valid `Membership` fails loud and logged (D4 fail-loud precedent) |
| `schemaName` interpolated into raw SQL at read sites without re-validation (landmine 5) | Med | Re-validate at every interpolation site, not only at creation; single helper, no ad-hoc string building |
| Connection exhaustion as tenant count grows (landmine 1) | Med | Explicit pool `max` + real disposal wired into server lifecycle, not only process exit |
| Fleet drifts across migrations, invisibly (landmine 3) | Med | One tool, per-tenant timeout, drift check that fails loudly |
| Provisioning saga leaves orphans when compensation itself fails (landmine 5) | Med | Detection sweep, not trust in rollback |
| Prisma forbids cross-schema relations — an unnoticed `@relation` blocks the split late | Low | Tooling-enforced: it fails at generate time, not at runtime |
| Change size overwhelms review | **High** | Chained slices per the seams above |

## Rollback Plan

Cheap by construction, because there is no data to lose.

1. `git revert` the slice(s).
2. `DROP SCHEMA <tenant> CASCADE` for every provisioned tenant.
3. `prisma migrate reset` + `pnpm seed` restores the single-schema state exactly.

No compensating data migration exists or is needed. This property holds only while there is no
production data — once a real tenant has real rows, this rollback plan expires and must be
rewritten. Say so in the design.

## Dependencies

- **P12 investigation** (test-harness impact) must land before `sdd-design` finalizes test strategy.
- `openspec/changes/backend-users-roles/` must stay readable for the `salesops-identity` delta.
- No new runtime services. Single `DATABASE_URL`, single Postgres database — master and all tenant
  schemas share it (poolops's stale two-URL `.env.example` describes a topology no code reads).

## Open Items

| Item | Status | Blocks |
|---|---|---|
| **P12 — how do the existing 974 tests deal with schemas?** | **Open investigation, running in parallel** | `sdd-design` test strategy. Potentially the largest hidden cost in the change, and the one item the no-production premise did **not** make cheaper. |

Everything else (P2–P11) is decided. P1 and P13 are withdrawn — do not reopen them.

## Success Criteria

- [ ] Master and tenant schemas exist; `Company.schemaName` is read and authoritative.
- [ ] `CompanyUser.id` IS the master `User.id` and is the sole PK — no `userId` column exists.
- [ ] `Membership.status` is the only home for "is this person active in this company".
- [ ] No tenant-side model holds a `@relation` to a master-side model.
- [ ] All ~12 tenant-side repositories obtain their client from tenant context; zero inject the
      global `PrismaService`, enforced by lint.
- [ ] A test provisions **two** tenant schemas in one run and proves writes in one are invisible
      to the other — the first such test in either codebase.
- [ ] Provisioning a new company yields a working owner account **and** a populated catalog in the
      same request; no window where the catalog is empty.
- [ ] The migration tool reports a tenant that is behind, and fails loudly rather than continuing.
- [ ] `prisma migrate reset` + `pnpm seed` reproduces the full state from scratch.
