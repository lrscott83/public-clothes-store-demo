# Tasks: multi-tenant-by-schema

> **Size deviation flagged**: this artifact exceeds the nominal 530-word budget from
> sdd-tasks/SKILL.md. The change is sized by its own proposal as "the largest in the
> repo's history" (~60–90 files, 2000+ lines); P5, P12's e2e rewiring, and D4's
> invariant rewrite are each required as explicit, un-buried tasks. Chose completeness
> over the word cap — same tradeoff `sdd-spec` made on the six delta specs.

## Review Workload Forecast

This repo's delivery is **owner-locked**: single branch, work-unit commits, push once
at the end, **no pull requests** (`sdd-init` #492). The generic PR/400-line chain guard
does not apply as a gate — there is no PR to split. What replaces it: 18 work-unit
commits below, each independently revertable, sized so no single sitting reviews more
than one commit's diff. Two are flagged oversized regardless (WU3a, WU3b) because
Prisma's schema is validated as one atomic file and cannot be split further without an
intermediate broken build.

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3,000–4,000 hand-written + ~1,500–2,000 generated (migration SQL, tenant-schema.sql) |
| Estimated files touched | ~85–90 |
| 400-line budget risk | High (moot — no PR exists to budget) |
| Chained PRs recommended | No — owner-locked to single branch, no PRs |
| Suggested split | 18 work-unit commits (below), not PRs |
| Delivery strategy | owner-locked (single branch, work-unit commits, push at end) |
| Chain strategy | pending (not applicable — recorded per SKILL contract, not acted on) |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units (commits, not PRs)

| # | Commit boundary (goal) | Files | Lines | Split risk |
|---|---|---|---|---|
| 1 | `feat(domain): add Membership model and tenant-access policy port` | 4 | ~180 | Low |
| 2 | `feat(infra-db): add schemaNameFor/assertSchemaName helper` | 2 | ~90 | Low |
| 3a | `feat(infra-db): split Prisma schema into master + tenant` | ~9 | ~1,100–1,500 (mostly generated) | **High — flagged, not splittable further** (one Prisma validation unit) |
| 3b | `feat(infra-db): re-source repos to split clients, add Membership/ProvisioningIncident repos` | ~19 | ~350–450 | Medium — mechanical but wide |
| 4 | `feat(infra-db): bounded per-schema tenant client factory (D2)` | 4 | ~350 | Low |
| 5 | `test(infra-db): schema-per-suite tenant test helper (P12)` | 3 | ~200 | Low |
| 6a–c | `test(infra-db): re-source {currency+customer, sales+commission, inventory+warehouse+product} repos to tenant client` | ~8 each | ~300 each | Medium — 3 sub-commits by domain group |
| 7 | `feat(api-common): TenantContextGuard + rewrite JwtStrategy/RolesGuard invariant (D4)` | 8 | ~450 | Medium — includes comment + spec rewrite by constraint |
| 8 | `feat(api-salesops): wire TenantContextGuard into 10 controllers (D5)` | ~18 | ~400 | Low — mechanical, one line per handler |
| 9 | `feat(infra-db): template catalog copy at provisioning (P8/P9)` | 4 | ~200 | Low |
| 10 | `feat(api-idp): provisioning saga with orphan detection (D7)` | ~8 | ~500 | Medium |
| 11 | `feat(infra-db): fleet migration tool + drift check (D6)` | 4 | ~350 | Low — spike gates the rest |
| 12a | `test(api-salesops): rewire e2e auth helper + 7 e2e specs for real tenant resolution (P12)` | 8 | ~450 | **High — flagged**, could split per resource (customer/order/commission vs category/product/warehouse) if it drags |
| 12b | `test(api-idp): rewire 2 e2e specs for real tenant resolution (P12)` | 3 | ~150 | Low |
| 13 | `test: cross-schema isolation proof, two tenants in one run (P5)` | 2 | ~200 | Low — must stay its own commit, not bundled |
| 14 | `chore: eslint tenant-repo boundary + collapse TenantCompanyUser alias + pnpm seed wiring + flag stale architecture.md` | 6 | ~150 | Low |

---

## Phase 1: Domain foundations

- [x] 1.1 [RED] `packages/domain/src/company/models.test.ts` — failing tests for reshaped `CompanyUser` (no `userId`/`companyId`), `Membership` (status transitions), `resolveTenantAccess` policy (ACTIVE Membership + tenant CompanyUser → access; anything else → denied).
- [x] 1.2 [GREEN] `packages/domain/src/company/models.ts`, `imembership.repository.ts` (port), `resolve-tenant-access.ts` — implement to pass 1.1. Satisfies spec: salesops-companies "Master Membership Gates Company Access", "Membership Status Gates Company Access".
- [x] 1.3 Export new types from `packages/domain/src/index.ts`.

## Phase 2: schemaName helper (D3)

- [x] 2.1 [RED] `packages/infra-db/src/tenant/schema-name.spec.ts` — `schemaNameFor(companyId)` UUID validation + format, `assertSchemaName(name)` rejection of malformed names.
- [x] 2.2 [GREEN] `packages/infra-db/src/tenant/schema-name.ts`. Satisfies spec: salesops-tenancy "Schema-Per-Tenant Topology" (validated-everywhere requirement).

## Phase 3: Prisma schema split

- [x] 3.1 (WU3a) Create `packages/infra-db/prisma/master/schema.prisma` (`User`, `Company`+`schemaName`, `Membership`, `TemplateCategory`, `TemplateProduct`, `ProvisioningIncident`, `RefreshToken`, `PasswordResetToken`, enum `MembershipStatus`) + its own `prisma.config.ts`.
- [x] 3.2 (WU3a) Create `packages/infra-db/prisma/tenant/schema.prisma` (`CompanyUser` collapsed-PK, `Customer`/`WarehouseOperator` reshaped onto `companyUserId`, all remaining business tables + enums) + its own `prisma.config.ts`. `CompanyUser.company → Company` relation is dropped (D1). Both new schema files declare `provider` only in `datasource` — Prisma 7 rejects `url` in a schema file (P1012, confirmed by 11.1's spike).
- [x] 3.3 (WU3a) Generate the master migration (`prisma migrate dev`) and `packages/infra-db/scripts/generate-tenant-schema-sql.ts` (`prisma migrate diff --from-empty`) producing committed `packages/infra-db/prisma/tenant-schema.sql`.
- [x] 3.4 (WU3b) Add `PrismaMembershipRepository`, `PrismaProvisioningIncidentRepository` (master-side, `packages/infra-db/src/company/`).
- [x] 3.5 (WU3b) Re-type the ~17 repository files' Prisma client import to the correct generated client (5 master repos unchanged in behavior; ~12 tenant repos temporarily bind a single default-schema client so the package compiles — full tenant-context wiring lands in Phase 6). Update `prisma/seed.js` to seed master only for now.

No cutover/migration-of-existing-rows tasks anywhere in this phase or elsewhere — provisioning always starts from an empty schema (spec: "Provisioning Creates, Never Migrates, Existing Data").

## Phase 4: Tenant client factory (D2)

- [x] 4.1 [RED] `packages/infra-db/src/tenant/tenant-prisma-factory.spec.ts`, `tenant-context.service.spec.ts` — bounded pool (`max`, idle timeout, LRU cap), `getClient()` throws with no active context, `disposeClient` called on eviction and `onModuleDestroy`. Scope enhanced with a third RED spec, `tenant-database.service.spec.ts`, proving 4.2's search_path correctness against the real DB (not explicitly listed here but required by this phase's own hard constraint).
- [x] 4.2 [GREEN] `packages/infra-db/src/tenant/tenant-prisma-factory.ts`, `tenant-context.service.ts`, `tenant-database.service.ts` (`createSchema`/`deleteSchema`/`schemaExists`, raw `pg.Client`, applies `tenant-schema.sql` — the generated DDL is schema-unqualified, so the client MUST `SET search_path` to the tenant schema first or it writes into `public`; confirmed by 11.1's spike). Satisfies spec: salesops-tenancy "Tenant Client Acquisition Fails Loud, Never Falls Back".

## Phase 5: Test infra — schema-per-suite (P12, Option C scoped)

- [x] 5.1 [GREEN — new test infra, no separate RED] `packages/infra-db/src/tenant-schema.spec-helper.ts` — `CREATE SCHEMA` + apply `tenant-schema.sql` in `beforeAll`, `DROP SCHEMA CASCADE` in `afterAll`. Reuses Phase 4's `TenantDatabaseService`, not a parallel implementation.
- [ ] 5.2 Refactor `packages/infra-db/src/db-cleanup.spec-helper.ts` and `packages/infra-db/src/commission/commission-fixtures.spec-helper.ts` to split master-side rows (shared-schema truncate, unchanged) from tenant-side rows (now via 5.1's schema-drop, no RESTRICT-ordering cleanup needed for those tables).
- [ ] 5.3 Keep `packages/infra-db/jest.config.js` `maxWorkers: 1` as-is — do not attempt schema-per-worker (rejected option, reopens the 2026-07-27 race).

## Phase 6: Repository re-sourcing (~12 tenant-side repos)

Three sub-commits by domain group — each is [RED: update spec to use 5.1's helper + assert tenant-schema isolation] → [GREEN: switch the repo's client source from injected `PrismaService` to `TenantContextService.getClient()`]:

**Scope note added after WU3b (`f736b28`) — this phase is bigger than "switch the client source".** 3.5 bound the tenant repos to `TenantDefaultPrismaService`, which is a DI-identity placeholder that still wraps the **pre-split** generated client, not `generated/tenant`. It had to: the reshaped `Customer.companyUserId`, `WarehouseOperator.companyUserId` and collapsed-PK `CompanyUser` (D1) have no matching columns on the legacy tables still sitting in `public`, so binding the real tenant client then would have broken every fixture. So each sub-commit below must ALSO reshape the repo code and its fixtures onto the D1 shapes, against a real provisioned tenant schema from 5.1 — not merely swap the injected dependency. Budget accordingly; the ~300-lines-per-group estimate in the work-unit table predates this and is low.

- [x] 6.1 Currency + Customer repos.
- [x] 6.2 Sales (Order) + Commission (×3) repos.
- [x] 6.3 Inventory (StockLevel, StockMovement, Warehouse) + Product/Category + WarehouseOperator repos.
- [x] 6.4 Add the lint boundary check as a local `pnpm lint` run per group (full eslint rule ships in Phase 14) to confirm no tenant repo imports the master `PrismaService`.
- [x] 6.5 **Retire the pre-reshape `CompanyUser` from every consumer this phase touches.** Phase 1 left two shapes of the same concept alive: the reshaped one in `packages/domain/src/company/models.ts`, exported from the package root aliased as `TenantCompanyUser`/`createTenantCompanyUser`/`CreateTenantCompanyUserInput` (commit `f376942`), and the pre-reshape one in `company-user.ts` still reachable through `company/index.ts`'s wildcard. Both compile, so importing the wrong one is silent. Every repo re-sourced in 6.1–6.3 must bind the reshaped shape. End this phase by writing down, in the commit body, exactly which consumers still hold the old shape — expected: `packages/api-common` guards (Phase 7) and the provisioning saga (Phase 10).

**Task 6.5 audit result (2026-08-04) — the actual remainder is wider than the prediction above.** All 12 repos re-sourced in 6.1-6.3 were confirmed to bind the reshaped shape directly (they never depended on `ICompanyUserRepository`/`CompanyUser` at all — only their own domain types' `companyUserId`/`attributedCompanyUserId`/`recordedByCompanyUserId` fields, already correct). No behavioral code changes were needed in `packages/infra-db` for that reason; two stale doc comments (`tenant-default-prisma.service.ts`, `infra-db.module.ts`) that WU3b had written expecting Phase 6 to also swap `PrismaCompanyUserRepository` were corrected to match design.md's file map (that repo is one of the 5 master-side repos left unchanged, not one of the ~12). The full inventory of consumers still holding the pre-reshape `CompanyUser`, checked by hand against the current tree:

- `packages/api-common/src/auth/jwt.strategy.ts` (+ spec) — expected, Phase 7 (7.3/7.4).
- `apps/api-idp/src/auth/auth.service.ts` (+ spec), `apps/api-idp/src/auth/auth.module.ts` — expected, Phase 10 (10.2, "provisioning saga").
- `apps/api-idp/src/users/users.service.ts` (+ spec), `apps/api-idp/src/users/users.module.ts` — **not itemized in any Phase 7/10 subtask.** `UsersService` creates/updates/lists `CompanyUser` role assignments via `ICompanyUserRepository`, same as `AuthService`, but tasks 10.1-10.3 only name the saga and `AuthService.signup`. This needs an explicit task before 14.3 can delete `company-user.ts`.
- `apps/api-salesops/src/customer/customer-identity.service.ts` (+ `customer-identity.service.spec.ts`, `customer-identity.controller.spec.ts`, `customer.module.ts`'s DI binding) — **the real deviation.** This file WAS touched by 6.1 (for the `companyUserId`/`userId` DTO mapping), so it is literally "a consumer this phase touches," but it still mints a walk-in customer's role grant via `companyUserRepository.create({ userId, companyId, role, status, createdByCompanyUserId })` — the pre-reshape shape. It cannot be moved to `Membership` + tenant `CompanyUser` yet: that requires a resolved tenant client at the call site, which needs `TenantContextGuard`/`runInTenant` (Phase 7/8, not built) and a Prisma adapter that writes a tenant-side `CompanyUser` row for a walk-in signup — a runtime path Phase 10's saga does NOT cover (the saga only runs once, for the company OWNER, at company creation). No existing task (7.x, 8.x, 10.x) names this file. Flagging it here rather than force-fitting a fix that would need to invent Phase 7/8/10 infrastructure early.
- `packages/infra-db/src/company/prisma-company-user.repository.ts` (+ spec), `packages/infra-db/src/index.ts`'s export, `packages/infra-db/src/infra-db.module.ts` — the master-side repo itself (design.md file map: unchanged). Still binds `TenantDefaultPrismaService` (old client, old shape). Becomes dead code once the four consumers above are moved, deletable alongside `company-user.ts` in 14.3.
- `apps/api-salesops/src/auth/auth.module.ts`, `apps/api-idp/src/auth/auth.module.ts`, `apps/api-idp/src/users/users.module.ts`, `apps/api-salesops/src/customer/customer.module.ts` — DI bindings for the above; fall out once their consumers move.

**Net**: the prediction ("api-common guards + the saga") underestimated by two files — `UsersService` and `CustomerIdentityService` — neither previously itemized. 14.3 should not be started until Phase 7/10 also account for these, or 14.3 itself must absorb them explicitly.

## Phase 7: Guard chain — D4 (tenant resolution moves the bitmask)

This is one work unit by explicit constraint — the invariant comment and its regression test move together with the code, not after.

- [ ] 7.1 [RED] `packages/api-common/src/auth/tenant-context.guard.spec.ts` — X-Company-Id / sole-ACTIVE-Membership resolution, 403 on missing/inactive Membership, 403 on inactive/unprovisioned Company, 500 on DB error during tenant `CompanyUser` lookup vs 403 on genuinely missing row.
- [ ] 7.2 [GREEN] `packages/api-common/src/auth/tenant-context.guard.ts`, `run-in-tenant.ts` (D5 re-scoping helper). Satisfies spec: salesops-tenancy "Tenant Resolution Guard Chain", "Per-Call Tenant Re-Scoping".
- [ ] 7.3 [RED] Update `packages/api-common/src/auth/jwt.strategy.spec.ts` — `validate()` returns only `{id, login, isActive}`, no `roles`/`companyId`/`companyUserId`.
- [ ] 7.4 [GREEN] Rewrite `jwt.strategy.ts` — drop `CompanyUser` resolution and the `COMPANY_USER_REPOSITORY` dependency; rewrite the `:16-29` GUARD-ORDER INVARIANT comment to describe the new chain (JwtAuthGuard → TenantContextGuard → RolesGuard) instead of forbidding a third guard.
- [ ] 7.5 [RED then GREEN, same commit] `roles.guard.ts` — add the explicit `req.user.roles === undefined` → `403 'Tenant context not resolved'` check; rewrite `roles.guard.spec.ts:60-71`'s "guard-order invariant" test to assert this new explicit check instead of the old "no `req.user`" case (keep that case too — both are now valid failure modes). Satisfies spec: salesops-identity "Role Resolution at Authentication Time", "@Roles()/RolesGuard Enforcement".

## Phase 8: Controller wiring (D5)

- [ ] 8.1 Add `TenantContextGuard` to `@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)` on the 10 guarded `apps/api-salesops/src/**/*.controller.ts` files (health excluded — no guards).
- [ ] 8.2 Wrap each tenant-touching handler body in `runInTenant(req.tenant, () => service.x(...))` — one line per handler, per D5. Update each controller's `*.controller.spec.ts` guard mocks accordingly.
- [ ] 8.3 Retire the pre-reshape `CompanyUser` from `apps/api-salesops/src/customer/customer-identity.service.ts` (+ its 2 specs, `customer.module.ts`). **Added after 6.5's audit.** 6.1 touched this file for DTO mapping but it still mints role grants through the old shape, and 6.5 found no task named it. It needs this phase's tenant-context wiring to move, and it covers a non-owner signup path that Phase 10's saga does not — so if that path turns out to need saga work too, stop and say so rather than half-moving it.

## Phase 9: Catalog templating (P8/P9)

- [ ] 9.1 [RED] `packages/infra-db/src/product/copy-catalog.spec.ts` — copying `TemplateCategory`/`TemplateProduct` into a tenant's `Category`/`Product` is idempotent and produces independent rows (spec: salesops-products "Tenant Catalog Is Independently Editable").
- [ ] 9.2 [GREEN] `packages/infra-db/src/product/copy-catalog.ts`. Update `prisma/seed.js` to seed the 11 slugs as master `TemplateCategory`/`TemplateProduct` once (spec: "Category Catalog Seed Load").

## Phase 10: Provisioning saga (D7)

- [ ] 10.1 [RED] `apps/api-idp/src/company/create-company.saga.spec.ts` — happy path (owner + populated catalog, no follow-up request needed), mid-saga failure rolls back prior steps, failing compensation writes `ProvisioningIncident`.
- [ ] 10.2 [GREEN] `apps/api-idp/src/company/create-company.saga.ts` — 6 steps with reverse-order compensation (§D7), step 6 (catalog copy, Phase 9) AWAITED. Replace `AuthService.signup`'s `resolveSoleCompany` with explicit `Membership` lookup.
- [ ] 10.3 `packages/infra-db/scripts/tenant-orphan-sweep.ts` — reconciles orphan schemas, dangling `Company.schemaName`, `Membership` with no tenant `CompanyUser`.
- [ ] 10.4 Retire the pre-reshape `CompanyUser` from `apps/api-idp/src/users/users.service.ts` (+ spec, `users.module.ts`). **Added after 6.5's audit** — 6.5 predicted the remainder would be the api-common guards plus the saga, and it undercounted: `UsersService` holds the old shape and no task named it. While here, fix the two long-standing typecheck errors this file's spec carries (`users.service.spec.ts:30` missing `createdByCompanyUserId`, and its twin at `auth.service.spec.ts:82`) — they predate this change but Phase 10 is where these files get rewritten anyway.

## Phase 11: Migration tool + drift detection (D6)

- [x] 11.1 **SPIKE — DONE 2026-08-04, ran before Phase 1.** Executed by hand against Prisma 7.8.0 and a real throwaway Postgres schema. **Outcome: flags wrong, mechanism sound → D6 corrected, no redesign** (owner call). Three flags did not exist in 7.8 (`--from-schema-datasource`, `--to-schema-datamodel`, `db execute --url`); the per-tenant URL now travels as `DATABASE_URL` in the child process env. Everything else reproduced: `?schema=` scopes the `from` side, `--exit-code` gives 0 in sync / 2 behind, and `migrate diff` emits destructive SQL with no gate of its own. Evidence: engram `sdd/multi-tenant-by-schema/spike-11-1`; corrected mechanism in `design.md` D6.
- [ ] 11.2 [RED] `packages/infra-db/scripts/tenant-migrate.spec.ts` (or equivalent integration test) — one tenant timing out doesn't block the others; drift check names a behind tenant and fails; destructive statement refused without `--allow-destructive`.
- [ ] 11.3 [GREEN] `packages/infra-db/scripts/tenant-migrate.ts` — per-tenant timeout, continue-and-report, `--check` mode, destructive-flag guard. Per 11.1: spawn one child per tenant with `DATABASE_URL=<base>?schema=<tenant>` in its env (there is no URL flag left), and implement the destructive guard as our own scan of the emitted SQL — `migrate diff` refuses nothing. Satisfies spec: salesops-tenancy "Single Migration Tool With Loud Drift Detection".

## Phase 12: e2e test rewiring (P12 — largest uncosted surface, own explicit tasks)

- [ ] 12.1 [RED] Extend `apps/api-salesops/test/support/auth-e2e-helper.ts`'s own assertions (or a small new spec) to require `createAuthedUser` return a real provisioned tenant schema + a working `X-Company-Id` header pair, not a `Company.upsert` into `public`.
- [ ] 12.2 [GREEN] Rewrite `createAuthedUser`/`createAuthedWarehouseOperator` (`auth-e2e-helper.ts:19-77`) — provision a tenant schema (reuse Phase 4/10's `TenantDatabaseService`), create the master `User` + `Membership` + tenant `CompanyUser`, return `{userId, companyUserId, companyId, token}`.
- [ ] 12.3 Update all 7 `apps/api-salesops/test/*.e2e-spec.ts` files to send `X-Company-Id` and assert against the real `TenantContextGuard` (no `overrideGuard` stubbing — spec: salesops-tenancy "The test exercises the real guard, not a stub").
- [ ] 12.4 Update the 2 `apps/api-idp/test/*.e2e-spec.ts` files for the same real tenant-resolution path.
- [ ] 12.5 Update the 3 hardcoded `?schema=public` fallbacks (`packages/infra-db/jest.setup.js`, `apps/api-salesops/jest.setup.js`, `apps/api-idp/jest.setup.js`) and `packages/infra-db/jest.global-setup.js`'s `schemaname = 'public'` enumeration to also cover per-suite tenant schemas from Phase 5.

## Phase 13: Cross-schema isolation proof (P5 — budgeted deliverable, not a chore)

- [ ] 13.1 **NEW FILE, own commit, never bundled**: `apps/api-salesops/test/tenant-isolation.e2e-spec.ts` — provision two named tenant schemas (A, B) in one test run via Phase 10's saga (or Phase 4/5's provisioning path), write a row in A, run the same query scoped to B, assert B's result set does not contain A's row. Real `TenantContextGuard`, not stubbed. Satisfies spec: salesops-tenancy "Cross-Schema Isolation Is Proven, Not Assumed" — both scenarios ("Writes in tenant A are invisible to tenant B", "The test exercises the real guard, not a stub").

## Phase 14: Cleanup

- [ ] 14.1 `packages/eslint-config/backend-boundaries.config.js` — add the rule: tenant-side repos under `packages/infra-db/src/{currency,customer,sales,commission,inventory,product,users/warehouse-operator}/` may not import the master `PrismaService`.
- [ ] 14.2 Final `prisma/seed.js` wiring: master seed → provision one tenant via the saga (Phase 10) → seed it. Confirm `prisma migrate reset && pnpm seed` reproduces full state (spec success criteria).
- [ ] 14.3 **Collapse the `TenantCompanyUser` alias and delete the pre-reshape `CompanyUser`.** Closes what 6.5 started, once Phases 7 and 10 have moved the last consumers. Delete `packages/domain/src/company/company-user.ts` and its test, drop the aliases in `packages/domain/src/index.ts` so the reshaped type exports as plain `CompanyUser`, and let `company/index.ts`'s wildcard carry it again. **This task does not get deferred** — the alias is Phase 1 scaffolding with a stated expiry, not a permanent name. If `rg 'company-user'` still returns a live consumer at this point, that is a Phase 7/10 task left unfinished; fix it here rather than shipping two shapes.
- [ ] 14.4 Add a one-line flag comment (not a rewrite — out of scope per design §5) noting `docs/system/architecture.md`'s "HTTP backend: does not exist" line is stale relative to this change.

---

## Explicitly out of scope (per proposal/design — do not add tasks for these)

Cutover, downtime window, data migration, dual-write (P1 withdrawn — no production data);
`Invitation`/invite-accept flow; cross-tenant reporting; tenant-aware background
jobs/queues; `salesops-mvp`/`static-store` frontend apps; rewriting
`docs/system/architecture.md`; commission reconcile endpoint; Combos.
