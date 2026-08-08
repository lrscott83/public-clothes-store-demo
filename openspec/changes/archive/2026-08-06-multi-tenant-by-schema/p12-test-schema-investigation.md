# P12 — what schema-per-tenant costs the existing test suite

Investigated 2026-08-03. File twin of engram `sdd/multi-tenant-by-schema/p12-test-strategy` (#1792).
Resolves the last open input blocking `sdd-design` for `multi-tenant-by-schema`.

**Method and its limit.** Static analysis only — `Read`/`Grep`/`Glob`. The suite was NOT executed, so
every count below is a grep-derived lower bound (it undercounts `it.each`/`describe.each`
expansions), and no runtime figure is measured. Claims are marked where they are reasoned rather
than observed.

## Measured numbers

| Group | Files | `it`/`test` | Real DB? | Workers |
|---|---|---|---|---|
| `packages/domain` | 24 | 272 | No, pure | parallel |
| `packages/infra-db` (`*.spec.ts`) | 26 | 201 | **Real Postgres** | `maxWorkers: 1` |
| `packages/api-common` | 4 | 30 | No | parallel |
| `apps/api-salesops/src` (unit) | 21 | 275 | No — mocked repos | parallel |
| `apps/api-idp/src` (unit) | 4 | 54 | No — mocked | parallel |
| `apps/api-salesops/test` (e2e) | 7 | 73 | **Real Postgres**, full HTTP | `maxWorkers: 1` |
| `apps/api-idp/test` (e2e) | 2 | 11 | **Real Postgres** | `maxWorkers: 1` |

Backend total: **88 files, 916 cases**.

**The "974 tests" figure in the decisions doc is approximate and was never confirmed** — nobody had
run the suite. The gap is most likely the frontend Vitest suites (`salesops-mvp` ~73 files,
`static-store` ~18), which are pure/component tests and irrelevant to a database question.

**The surface P12 is actually about: 35 files, 285 cases — all `maxWorkers: 1`, all against ONE
shared `store_mgmt_test` database with `?schema=public`.**

## Harness map

- [`packages/infra-db/jest.config.js:6-10,29`](../../../templates/packages/infra-db/jest.config.js#L6-L29) —
  `maxWorkers: 1` forced. The comment at `:18-28` names the reason outright: parallel workers on the
  shared DB caused unique/FK races in "backend-ventas Phase 4", and one worker is *"the only
  execution mode that was ever actually safe."*
- **`?schema=public` is hardcoded in THREE places** — `packages/infra-db/jest.setup.js:44-46`,
  `apps/api-salesops/jest.setup.js:37-39`, `apps/api-idp/jest.setup.js:37-39`.
- `packages/infra-db/jest.global-setup.js:27-53` — refuses to run unless the URL contains
  `store_mgmt_test` (`:33-37`), then enumerates via `WHERE schemaname = 'public'` (`:42-45`) and
  `TRUNCATE … CASCADE` (`:48`). The table list is read from Postgres rather than hand-written
  *because a hand-written list went stale three times.*
- `packages/infra-db/src/db-cleanup.spec-helper.ts` — `wipeCommissionTables` (`:30-34`) and
  `wipeCompanyUserDependents` (`:45-54`), both born directly from the three contamination bugs of
  the week of 2026-07-27; the doc comment at `:1-16` names them.
- `packages/infra-db/prisma/schema.prisma:1-10` — ONE `datasource`, **no `multiSchema` preview
  feature**. The split has not started at the Prisma level.
- `packages/infra-db/src/prisma-client.ts:16-21` — `PrismaService` builds one adapter from
  `DATABASE_URL` at construction. No schema parameter.
- **25 of 26** infra-db specs call `new PrismaService()` directly, bypassing Nest DI. The 9 e2e
  files get it from `AppModule` — same limitation, one layer removed.

## What breaks

**The dominant failure class is fixtures, not raw SQL.** Any helper that creates master-side
(`Company`/`User`) and tenant-side (`CompanyUser`/`Order`) rows through ONE client in one call chain
breaks once those models live in separate schema files, because Prisma forbids cross-schema
relations — already established for `Customer`/`WarehouseOperator` in P7.

- `commission/commission-fixtures.spec-helper.ts:25-34`
- `sales/verify-order-attribution.spec.ts:38-39`
- `company/prisma-company-user.repository.spec.ts:44`
- `db-cleanup.spec-helper.ts:45-54`
- **`apps/api-salesops/test/support/auth-e2e-helper.ts:23-45`** — `createAuthedUser` does
  User + `Company.upsert` + `CompanyUser.create` through one injected `PrismaService`, and **all 9
  e2e files (84 cases) call it**, mostly in `beforeEach`. Single highest-leverage breakage point.

Also: `jest.global-setup.js` needs to stop assuming `'public'`, and the three `jest.setup.js` files
need a tenant-aware URL construction path.

**Raw SQL is NOT a problem.** `inventory/apply-reservation.ts:68-72` and
`apply-stock-movement.ts:101-103` use unqualified table names in `$executeRaw`, so they ride on
`search_path` and need zero changes — provided the tenant connection sets it, which is poolops's
own `-c search_path="<schema>",public` pattern from P3. Worth stating because this is exactly the
kind of thing that looks like a landmine and isn't.

## Options costed

| Option | Build | Runtime | Proves isolation? | Hosts P5? |
|---|---|---|---|---|
| **A. One fixed test schema** (poolops's pattern) | Low | Same as today | **No** — the decisions doc already flags this as *why poolops proves nothing* | **No** — one schema ever exists |
| **B. Schema-per-worker** | Medium-High — no native per-worker hook; lazy provision off `JEST_WORKER_ID` | Could shrink wall-clock (unmeasured) but **re-opens the exact failure mode `maxWorkers: 1` exists to prevent**; master tables stay shared, so workers still race on `Company.slug` | Yes, if built right | Incidentally |
| **C. Schema-per-suite** | Medium — a `tenant-schema.spec-helper.ts` (CREATE SCHEMA + static DDL) and ~12 spec refactors. `PrismaService` gains a schema param — **the same code production needs for `TenantPrismaFactory` (P3)**, so not test-only waste | ~Today + CREATE/DROP per file | Yes between suites; `DROP SCHEMA CASCADE` also **removes the RESTRICT-ordering cleanup problem** for tenant tables | **Yes** |
| **D. Create/drop per test** | High | Prohibitive at 285 DB cases | Trivially | Overkill |

## Recommendation — Option C, scoped

**Schema-per-suite, applied only to the tenant-side repository specs (~12 of infra-db's 17) and the
e2e suites. Leave master-side specs (`company`, `users` — Company/User/RefreshToken/
PasswordResetToken, ~5 repos) on the current shared-schema pattern, because those tables do not
move. Keep `maxWorkers: 1`.**

Do not attempt Option B now. The isolation goal is met by an explicit two-schema test, not by
concurrent workers, and B reopens a documented, expensive-to-diagnose failure class for no
necessity.

Build P5's deliverable as ONE new spec on top of C's provisioning helper: two named tenant schemas
in a single run, asserting a query scoped to A never returns B's rows.

## Two things the design must state plainly

**1. This is the largest uncosted work surface found so far outside the provisioning saga.** A new
schema-provisioning helper; refactored setup/teardown across ~12 infra-db specs plus both
spec-helpers; and the biggest single item — `auth-e2e-helper.ts` needs a second tenant client and a
real `X-Company-Id`-driven resolution path wired through all 9 e2e files. That e2e rewiring follows
from the split itself and is unavoidable under **every** option including A, but it had not been
itemized anywhere before now.

**2. The fix is partial, not total.** Schema-per-tenant does NOT eliminate the contamination bug
class fixed the week of 2026-07-27. It removes it only for tables that move. Master-side tables —
Company, User, RefreshToken, PasswordResetToken, and the future `Membership` — stay in ONE shared
schema under every option above. The RESTRICT-ordering discipline encoded in
`db-cleanup.spec-helper.ts` must still be maintained for master-side tests after the split.
P12's premise was correct; the relief is one-sided.

## Not verified

- Wall-clock runtime of the current suite — the suite was not run. Runtime claims for B/C/D are
  reasoned from structure, not measured.
- The 974-vs-916 count gap.
- That `api-common`'s 4 spec files are fully DB-free — inferred from the absence of `setupFiles`
  wiring in its jest config, not from reading all 30 test bodies.
