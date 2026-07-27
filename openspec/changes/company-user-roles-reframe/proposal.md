# Proposal: CompanyUser / roles reframe (single schema)

## Lineage

- Backlog origin: engram `#1516`, item 3.
- Exploration: engram `sdd/multi-tenant-by-schema/explore` (`#1562`) · file twin `./explore.md`.
- Renamed from `multi-tenant-by-schema` — the delivered scope is NOT schema tenancy.
  The old name would mislead future readers; the engram explore topic key keeps the old name.

## Intent

Roles live on `User.roles Int` (`schema.prisma:345`), which conflates *who you are*
(identity) with *what you may do inside a business* (authorization). Move authorization
onto a `CompanyUser` row keyed by `(userId, companyId)`, inside the **existing single
schema**. This is the domain improvement the backlog actually names, delivered at about
half the blast radius of full schema-per-tenant, and fully reversible.

**Owner decision (locked):** Approach 2 from the exploration. There is no committed
second tenant near-term, so schema-per-tenant infrastructure is deferred.

## Scope

### In Scope

- New `Company` and `CompanyUser` tables in the existing `schema.prisma`.
- `User.roles` → `CompanyUser.role` (same `Int` bitmask, same values, same `can()` semantics).
- `Company`/`CompanyUser` domain models + ports in `packages/domain/src/company/`.
- Prisma adapters in `packages/infra-db` + two hand-written SQL migrations.
- `JwtStrategy` resolves the caller's `CompanyUser` and exposes the role bitmask on `req.user`.
- `api-idp` signup and admin user-management write `CompanyUser.role`.
- Test fixtures/helpers across `api-idp` and `api-salesops` seed `CompanyUser`.

### Out of Scope (deferred, with named reasons)

| Deferred | Why | Where it lands later |
|---|---|---|
| Dual Prisma clients / `TenantPrismaFactory` / per-schema `pg.Pool` | No second tenant exists | Approach 1 change |
| `TenantContextService` / `TenantContextGuard` / `X-Company-Id` middleware | Single company ⇒ nothing to resolve | Approach 1 change |
| Tenant provisioning + `tenant-deploy-all` scripts | Nothing to provision | Approach 1 change |
| `ALTER TABLE … SET SCHEMA` data cutover | No target schema | Approach 1 change |
| `Membership` table | Under one schema it duplicates `CompanyUser` (see decision D3) | Approach 1 change |
| `Invitation` model / invite-accept flow | Auto-assign covers today (D5) | When company #2 is real |
| `templates/apps/salesops-mvp` | Verified zero backend calls — pure localStorage prototype | n/a |
| `templates/apps/static-store` | Public storefront, no auth surface | n/a |

## Decisions

### D1 — `CompanyUser` adopts the soft-FK shape NOW

`CompanyUser` carries **no `@relation` back to `User`** — `userId String @db.Uuid` as a
plain column, integrity enforced in application code, with a schema comment naming the
reason. This is poolops's verified shape (`CompanyUser.id String @id`, "User ID from
master database — must be provided explicitly").

**Rationale:** `CompanyUser` is the one table whose shape the deferred change depends on.
It has no data and no consumers today, so getting it right is free. Adding a `@relation`
now and dropping it later means redoing exactly the model this change exists to future-proof.

**Cost accepted:** no `include: { user: true }` traversal on `CompanyUser`, and no DB-level
protection against orphan rows if a `User` is hard-deleted. `sdd-design` MUST confirm
whether a hard user delete path exists and, if so, specify the compensating cleanup.

### D2 — `Customer.userId` and `WarehouseOperator.userId` keep their real `@relation` FKs

No softening. These are populated, working, DB-enforced 1:1 FKs (`schema.prisma:190`, `:395`).

**Rationale:** the asymmetry with D1 is deliberate. `CompanyUser` is new and free to shape;
these two are existing integrity guarantees that would be surrendered today against an
uncommitted future change. Whether `Customer` and `WarehouseOperator` even land tenant-side
under Approach 1 is itself an open design question. Softening later is one
`DROP CONSTRAINT` statement — cheap and mechanical.

### D3 — `Company` + `CompanyUser` only; NO `Membership`

Under one schema, poolops's master-side `Membership` and tenant-side `CompanyUser` would
be two rows for the same fact in the same schema. `CompanyUser` carries **both** `role`
and `status`. The future split is then a clean field extraction (`status` → master
`Membership`, `role` → tenant `CompanyUser`), not a redesign.

`Company` carries a nullable `schemaName` column from day one — unused, reserved, and
documented as the deferred change's hook.

### D4 — Role resolution moves into `JwtStrategy`, NOT into a new guard

`JwtStrategy.validate()` continues to re-fetch `User` fresh per request (ADR-2), and
**additionally** loads the caller's `CompanyUser`. `SanitizedUser` keeps the field name
`roles`, now sourced from `CompanyUser.role`, and gains `companyId`.

**This is the single most important risk-reduction decision in the change.** The
exploration's silent-full-lockout hazard comes entirely from introducing a third guard
that must run *before* `RolesGuard`. Passport runs `JwtStrategy.validate()` before any
guard, structurally, so resolving there eliminates the ordering hazard rather than
mitigating it. Consequences:

- `RolesGuard` logic is **unchanged** (doc comment only).
- All 9 `api-salesops` controllers keep `@UseGuards(JwtAuthGuard, RolesGuard)` — untouched.
- `order.controller.ts:221-224` and `stock.controller.ts:94-95` read `user.roles` directly
  outside the guard; they keep working with **zero edits**. (The exploration flagged these
  as unaudited; this proposal confirms they exist and are covered.)
- **JWT payload is unchanged** — still `sub` only. No `companyId` baked in, preserving
  ADR-2's "role change takes effect within `USER_CACHE_TTL_MS`" property.
- Extra DB roundtrip per request is absorbed by the existing `TtlCache` (30s), which now
  caches the joined `User` + `CompanyUser` projection.
- **Fail closed and loud:** an authenticated `User` with no `CompanyUser` row raises a
  distinct, logged `MISSING_COMPANY_USER` 403 — never a silent `roles: 0`.

### D5 — `api-idp` signup auto-assigns when exactly one Company exists

| Company count | Behavior |
|---|---|
| exactly 1 | Auto-assign: create `CompanyUser` with the `user` bit (1), status active |
| 0 | Fail loudly (500, logged) — misconfigured deployment |
| more than 1 | Fail loudly (409, logged) — unreachable today; forces the Invitation flow to be designed when company #2 is actually created |

Public `POST /auth/signup` contract is unchanged. `POST /users` and `PATCH /users/:id`
write `CompanyUser.role` instead of `User.roles`; `assertNoUnauthorizedAdminGrant` logic
is unchanged. `UserResponseDto.roles` / `roleLabels` keep their exact shape — **no
client-visible API break**.

### D6 — `ExchangeRate` is declared tenant-scoped (decision recorded, no code change now)

Rates are per-store commercial policy, not a global market feed — the model already stores
`PaymentChannel`-specific rates, which is a per-business judgment. Therefore `ExchangeRate`,
`Currency` and `PaymentChannel` belong **tenant-side** under Approach 1. No code changes in
this change; recorded so the deferred change inherits a decision instead of an open question.

### D7 — Two migrations, not one

Repo precedent: `20260725170000_rename_enum_values_to_english/migration.sql` is hand-written
because Prisma's auto-diff would be destructive. Both migrations here are hand-written.

**Migration 001 (additive + backfill), shipped with the code cutover:**

1. `CREATE TABLE company` (id, name, slug, `is_active`, `schema_name` NULL, timestamps).
2. Seed exactly one `company` row — the implicit tenant.
3. `CREATE TABLE company_user` (`user_id` uuid, `company_id` uuid, `role` int NOT NULL,
   `status`, timestamps, `UNIQUE(user_id, company_id)`, FK to `company` only — **no FK to
   `app_user`** per D1).
4. `INSERT INTO company_user (user_id, company_id, role, status)
   SELECT id, '<company-id>', roles, 'active' FROM app_user;` — verbatim bitmask copy,
   so `can()` evaluates bit-for-bit identically before and after.

**Migration 002 (`ALTER TABLE app_user DROP COLUMN roles`), shipped separately** after 001
is verified in the target environment. Keeping the column alive through the risky window is
what makes rollback a code revert instead of a data recovery.

## Capabilities

### New Capabilities

- `salesops-companies`: `Company` and `CompanyUser` entities, the `(userId, companyId)`
  role assignment model, single-company auto-assignment policy, and the ports/adapters
  that persist them.

### Modified Capabilities

- `salesops-identity`: roles move off `User` onto `CompanyUser`; `JwtStrategy` resolves
  and exposes the company-scoped role bitmask; signup assigns a company; the
  "No multi-tenant tables exist" non-goal in the existing spec is superseded.

> **Dependency for `sdd-spec`:** `salesops-identity` is NOT yet in `openspec/specs/`. Its
> source of truth is `openspec/changes/backend-users-roles/specs/salesops-identity/spec.md`
> (that change is still unarchived). Read the delta from there, not from `openspec/specs/`.

## Approach

Per `docs/system/architecture.md`'s "¿Dónde va X?" table, every new component has a row:

| Component | Location | Table row |
|---|---|---|
| `Company`, `CompanyUser` entities | `packages/domain/src/company/models.ts` | Business entity → `packages/domain/src/<concept>/models` |
| `ICompanyRepository`, `ICompanyUserRepository` | `packages/domain/src/company/` | Repository interface (port) |
| `PrismaCompanyRepository`, `PrismaCompanyUserRepository` | `packages/infra-db/src/repositories/` | Repository implementation (adapter) |
| Role resolution in `JwtStrategy` | `packages/api-common/src/auth/` | Existing shared delivery concern |
| Signup company assignment | `apps/api-idp/src/auth/` | Endpoint/controller → app feature folder |

New concept `company/` is a per-concept subfolder of the shared-kernel `@store-mgmt/domain`,
not a new package — matches the doc's stated shared-kernel decision.

> **Doc debt:** `docs/system/architecture.md` still claims "HTTP backend: does not exist"
> and lists no `infra-db`/`api-common`/`api-*` components. It is stale relative to the repo.
> Not this change's job to rewrite, but `sdd-design` should note it.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `packages/domain/src/company/` | New | Models + 2 ports (~4 files) |
| `packages/domain/src/users/user.ts` | Modified | Drops `roles` from the `User` model |
| `packages/domain/src/users/roles.ts` | Unchanged | Bitmask helpers reused verbatim — zero risk |
| `packages/infra-db/prisma/schema.prisma` | Modified | +2 models, −1 column |
| `packages/infra-db/prisma/migrations/` | New | 2 hand-written SQL migrations (D7) |
| `packages/infra-db/src/repositories/` | New + Modified | 2 new adapters; `prisma-user.repository.ts` drops `roles` |
| `packages/api-common/src/auth/jwt.strategy.ts` | Modified | Resolves `CompanyUser`; real logic change |
| `packages/api-common/src/auth/roles.guard.ts` | Modified | Doc comment only — logic untouched |
| `apps/api-idp/src/auth/`, `src/users/` | Modified | Signup assignment, role writes, mapper source |
| `apps/api-salesops/src/**/*.controller.ts` | Unchanged | Protected by D4 |
| `apps/api-salesops/test/support/`, `src/test-support/` | Modified | e2e/unit helpers seed `CompanyUser` |

## Sizing Estimate

| Bucket | Files | Nature |
|---|---|---|
| Domain models + ports | ~4-6 | Design |
| Prisma schema + 2 migrations | ~3 | Design + high-care (irreversible DDL) |
| infra-db adapters | ~5-7 | Mostly mechanical once the ports land |
| `api-common` auth | ~3 | Design (D4 is the crux) |
| `api-idp` | ~5 | Design (D5 policy) then mechanical |
| Test fixtures / helpers / specs | ~12-15 | Mechanical, but high file count |
| **Total** | **~32-39** | Roughly 1/3 design, 2/3 mechanical |

Higher than the exploration's 20-25 because that figure excluded tests. Estimated changed
lines **700-1100**.

> **Review Workload signal for `sdd-tasks`:** this WILL exceed the 400-line PR budget.
> Recommend chained slices along these seams: (1) domain + schema + migration 001,
> (2) `api-common` role resolution + `api-idp` writes, (3) test fixture migration +
> migration 002. Each slice is independently verifiable and revertible.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Silent full lockout: role source resolves to `undefined`, every `@Roles()` fails closed | Low (was High) | D4 removes the guard-ordering hazard structurally; `MISSING_COMPANY_USER` is an explicit logged 403, never `roles: 0` |
| Stale `User.roles` read somewhere and silently returning `0` | Low | Migration 002 physically drops the column, making any missed reader a compile/query error rather than a wrong-answer bug |
| Cross-boundary `include: { user: true }` eager-loads break | **Resolved** | Grepped `templates/` — **zero matches**. Closes an exploration open item. `Customer.user` relation also survives per D2 |
| Extra `CompanyUser` query per authenticated request | Med | Absorbed by the existing 30s `TtlCache` in `JwtStrategy`; measure before optimizing further |
| Orphan `CompanyUser` rows (no DB FK, per D1) | Low | `sdd-design` MUST audit for a hard user-delete path; add compensating cleanup if one exists |
| Migration 001 backfill misses users created mid-deploy | Low | Ship 001 + code together; 002 only after verification |
| `salesops-identity` spec delta targets an unarchived change folder | Med | Called out explicitly in Capabilities; `sdd-spec` must read from the change folder |
| E2E/test-helper churn inflates the diff and hides real changes | Med | Isolate fixture migration into its own chained slice |

## Rollback Plan

- **Before migration 002:** pure code revert. `app_user.roles` is still present and
  populated, so reverting `JwtStrategy` restores the prior behavior with zero data work.
  `company` / `company_user` become inert orphan tables — harmless, droppable at leisure.
- **After migration 002:** compensating migration — `ALTER TABLE app_user ADD COLUMN roles
  INT NOT NULL DEFAULT 1`, then `UPDATE app_user SET roles = cu.role FROM company_user cu
  WHERE cu.user_id = app_user.id`. **No data is lost**: `company_user.role` holds the
  authoritative bitmask. Then revert the code.
- The two-migration split (D7) exists precisely to keep the risky window in the cheap
  rollback regime.

## Dependencies

- `openspec/changes/backend-users-roles/` must remain readable (unarchived) for `sdd-spec`
  to build the `salesops-identity` delta.
- No new runtime dependencies, no new packages, no new env vars.
- `DATABASE_URL` semantics unchanged — single schema, single client.

## Success Criteria

- [ ] `app_user.roles` no longer exists; `company_user.role` is the single source of authorization.
- [ ] Exactly one `company` row exists and every pre-existing `User` has a matching
      `company_user` row with a bit-for-bit identical bitmask.
- [ ] All 9 `api-salesops` controllers pass their existing `@Roles()` tests with **zero
      changes to controller source**.
- [ ] `order.controller.ts` and `stock.controller.ts` still read `user.roles` unmodified.
- [ ] JWT payload shape unchanged; `UserResponseDto` shape unchanged (no client break).
- [ ] An authenticated user without a `CompanyUser` row gets a logged 403, not a silent allow/deny.
- [ ] `CompanyUser` has no `@relation` to `User`; `Customer.user` and
      `WarehouseOperator.user` relations still exist and still eager-load.
- [ ] Rollback rehearsed: migration 002 reversed and `roles` restored from `company_user`
      on a scratch database.
