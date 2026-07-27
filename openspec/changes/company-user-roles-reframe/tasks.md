# Tasks: CompanyUser / Roles Reframe

> Merge target for `salesops-identity` delta stays `openspec/changes/backend-users-roles/specs/salesops-identity/spec.md` (unarchived). Do NOT modify/archive `backend-users-roles` from this change.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 750-1150 (32-39 files; incl. unbudgeted `user.mapper.ts`, 6 call sites) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 Foundation → PR2 Behavioral cutover → PR3 Test-fixture + migration 002 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (user decision required) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Notes |
|------|------|----|-------|
| 1 | Domain + schema + migration 001 + verify script | PR1 | Nothing consumes it; app still reads `app_user.roles`. Rollback: drop 3 new objects. |
| 2 | api-common role resolution + api-idp writes + mapper fix + module bindings | PR2 | The behavioral cutover. Rollback: code revert; `app_user.roles` still populated. |
| 3 | Test fixtures + migration 002 | PR3 | Only after PR2 verified + gate passes. Point of no cheap return. |

## Phase 1: Foundation (PR1) — DONE

> **Sequencing correction applied during apply.** Tasks 1.9 (drop `roles` from the domain
> `User`) and 1.17 (drop `roles` from `prisma-user.repository`) were moved OUT of Phase 1 to
> Phase 3 (now 3.11/3.12). They contradicted this slice's own definition — design §10 says
> slice 1 leaves "the app still reads `app_user.roles`" — and they are not implementable here:
> `apps/api-idp/src/auth/mappers/user.mapper.ts:13` reads `roles` off the domain `User`, so
> dropping the field breaks `pnpm -r build`, which task 1.19 requires to be green. Phase 1 is
> therefore purely ADDITIVE and genuinely inert, which is what makes its rollback cheap.

- [x] 1.1 Create `domain/src/company/{company,company-user}.ts` entities
- [x] 1.2 Create `domain/src/company/{company-,company-user-}repository.port.ts` + DI symbols
- [x] 1.3 Create `domain/src/company/errors.ts` (NoCompanyConfigured, AmbiguousCompany, MissingCompanyUser)
- [x] 1.4 RED: `resolve-sole-company.test.ts` — 1/0/>1 company scenarios
- [x] 1.5 GREEN: implement `domain/src/company/resolve-sole-company.ts`
- [x] 1.6 RED: `company-user.test.ts` — role non-negative int, status defaults ACTIVE, userId/companyId required
- [x] 1.7 GREEN: implement CompanyUser factory validation
- [x] 1.8 Update `domain/src/index.ts` barrel
- [~] 1.9 MOVED to 3.11 — see sequencing correction above
- [x] 1.10 Add Prisma models `Company`/`CompanyUser`/`CompanyUserStatus` to `schema.prisma` (additive only)
- [x] 1.11 Write migration 001 SQL per design §7 (create tables, seed company, backfill roles verbatim)
- [x] 1.12 Create `infra-db/scripts/verify-company-user-backfill.ts` (5 SQL assertions)
- [x] 1.13 Create `infra-db/src/company/prisma-company.repository.ts` + spec
- [x] 1.14 Create `infra-db/src/company/prisma-company-user.repository.ts` + spec (findActiveByUserId, uniqueness, updateRole, listByCompany)
- [x] 1.15 Create `infra-db/src/company/seed.ts` + spec (single-company seed)
- [x] 1.16 Update `infra-db/src/index.ts` barrel
- [~] 1.17 MOVED to 3.12 — see sequencing correction above
- [x] 1.18 Run migration 001 vs `store_mgmt_test`; run verify script — all 5 assertions pass
- [x] 1.19 Verify: `pnpm -r build` + domain (250) + infra-db (139) green

### Phase 1 verification evidence (all real, all exit 0)

| Gate | Result |
|---|---|
| `pnpm -r build` | exit 0 |
| domain | 250/250 (22 suites) — baseline 238 + 12 new |
| infra-db | 139/139 (21 suites, real Postgres) — baseline 121 + 18 new |
| api-common | 24/24 unchanged |
| api-idp | 50/50 + 11 e2e unchanged |
| api-salesops | 181/181 + 50 e2e unchanged |
| `api-salesops lint --max-warnings 0` | clean |

Migration 001 applied to `store_mgmt_test` via `prisma migrate deploy`. The §7 gate was
exercised on BOTH paths, not just the happy one: replaying the migration's backfill statement
against users with bitmasks `1`, `8`, `24` (multi-bit) and `0` (zero-permission) copied every
mask verbatim and the script exited 0; deliberately corrupting the result (mismatched role +
orphan row) made it exit 1 with both violations named.

**Gate weakness worth knowing**: the `company_user count == app_user count` assertion can be
masked — a user missing its assignment plus one orphan row cancel out in the counts. The orphan
assertion catches that case, and `companies = 1` prevents a user hiding behind a second
company, so the five assertions ARE sound in combination. The count check alone is weaker than
it looks.

**Spec fix applied during apply**: all three `infra-db/src/company/*.spec.ts` files wiped the
`company` table only in `afterEach`, so the first test against a freshly migrated database hit
the `slug` unique index against migration 001's seeded `default` company. Added the same wipe to
`beforeEach` so the suites no longer depend on whether the target database has been migrated.
Consequence to know: running the infra-db suite leaves `store_mgmt_test` with zero companies, so
the §7 gate must be run right after migrating, not after a test run.

## Phase 2: Behavioral Cutover (PR2) — DONE

> **Second sequencing correction.** Tasks 3.2 and 3.4 (e2e fixture migration) were pulled
> FORWARD into this phase. Phase 2 makes an ACTIVE `CompanyUser` mandatory at authentication
> time, so every e2e user without one 403s — 48 e2e failures. Task 2.18 requires the full
> matrix green, which is unreachable while the fixtures live in Phase 3. Same class of bug as
> the 1.9/1.17 correction: a phase cannot defer the work that its own gate depends on.

- [x] 2.1 RED: `jwt.strategy.spec.ts` — roles sourced from CompanyUser.role, not User row; companyId exposed
- [x] 2.2 RED: same spec — missing/REVOKED/SUSPENDED CompanyUser → 403 `MISSING_COMPANY_USER` logged
- [x] 2.3 RED: same spec — cache hit skips both repositories
- [x] 2.4 GREEN: modify `api-common/src/auth/jwt.strategy.ts` — inject `COMPANY_USER_REPOSITORY`, resolve CompanyUser
- [x] 2.5 Update `SanitizedUser` type: `roles` non-optional, add `companyId`
- [x] 2.6 RED→mechanical: `roles.guard.spec.ts` regression — no `req.user` → 403 (guard-order invariant); doc-comment only, logic untouched
- [x] 2.7 Bind `COMPANY_USER_REPOSITORY` in `api-idp/src/auth/auth.module.ts` and `api-salesops/src/auth/auth.module.ts` (+ `COMPANY_REPOSITORY` in api-idp for signup)
- [x] 2.8 RED: `auth.service.spec.ts` — signup assigns role 1 on exactly-one company; 0→500 `NO_COMPANY_CONFIGURED`; >1→409 `AMBIGUOUS_COMPANY`
- [x] 2.9 GREEN: modify `apps/api-idp/src/auth/auth.service.ts` signup() per design §6
- [x] 2.10 Modify `apps/api-idp/src/auth/mappers/user.mapper.ts` — `userToResponseDto(user, roles)` signature change
- [x] 2.11 Fix call sites — **SEVEN, not six** (see finding below)
- [x] 2.12 Modify `apps/api-idp/src/users/users.service.ts` — persist via `companyUserRepository.create/updateRole`; `list()` via `listByCompany(req.user.companyId)`
- [x] 2.13 Modify `apps/api-idp/src/users/users.controller.ts` — `@Req()` on `list()`; `assertNoUnauthorizedAdminGrant` confirmed untouched
- [x] 2.14 Update `apps/api-idp/src/users/users.module.ts` bindings
- [x] 2.15 Confirm zero-edit readers unchanged — api-salesops 181/181 with ZERO controller edits
- [x] 2.16 Regression: `auth.e2e-spec.ts` (`body.roles===1`) and `users.controller.spec.ts` green
- [x] 2.17 GOTCHA: rebuild `dist` for domain/infra-db/api-common before any api-salesops run
- [x] 2.18 Verify: `pnpm -r build` + full matrix, all green
- [x] 2.19 (pulled from 3.2) `api-salesops/test/support/auth-e2e-helper.ts` — `createAuthedUser` seeds Company + assignment
- [x] 2.20 (pulled from 3.4) api-idp e2e specs — seed the Company, assign directly-minted users, scope `company_user` cleanup

### Two findings the design did not have

**1. Seven `userToResponseDto` call sites, not six.** The design's inventory missed
`apps/api-idp/src/auth/auth.service.ts` `issueTokens` — the LOGIN and REFRESH response DTOs
also carry `roles`. Login therefore resolves the CompanyUser too (`AuthService.resolveRole`,
same fail-closed 403 rule as `JwtStrategy`).

**2. Role writes must DUAL-WRITE while `app_user.roles` still exists.** The §7 gate asserts
`company_user.role == app_user.roles`. Had Phase 2 written only the assignment, every user
created between Phase 2 and Phase 3 would have been a mismatch, and the gate guarding
migration 002 would have failed — blocking Phase 3 entirely. `AuthService.signup` and
`UsersService.create` therefore write BOTH until 002 drops the column. This is the ordinary
expand/contract pattern, and it is the actual reason the column survives Phase 2.

### Phase 2 verification evidence (all real, all exit 0)

| Gate | Result |
|---|---|
| `pnpm -r build` | exit 0 |
| domain | 250/250 |
| infra-db | 139/139 (real Postgres) |
| api-common | 31/31 — baseline 24 + 7 new |
| api-idp | 54/54 (baseline 50 + 4 signup-policy) + 11/11 e2e |
| api-salesops | 181/181 + 50/50 e2e — **zero controller edits** |
| `api-salesops lint --max-warnings 0` | clean |

api-salesops passing untouched IS the D4 verification: the bitmask stayed on `req.user.roles`,
so all 7 guarded controllers and both `SanitizedUser` readers needed no change. The single
compile error the change produced was `auth-test-helpers.ts` missing `companyId` — enforcement
layer 2 (type-time) doing exactly its job.

## Phase 3: Test Fixtures + Migration 002 (PR3)

- [ ] 3.1 Update `infra-db/src/users/seed.ts` (+spec) — cockpit roles → `company_user` row
- [ ] 3.2 Update `api-salesops/test/support/auth-e2e-helper.ts` `createAuthedUser` to also seed `company_user`
- [ ] 3.3 Update ~8 infra-db spec cleanup blocks: add `companyUser.deleteMany` alongside `user.deleteMany({})`
- [ ] 3.4 Update `api-idp/test/auth.e2e-spec.ts:33` and `users.e2e-spec.ts:31` cleanup to also delete `company_user` rows
- [ ] 3.5 Optionally add `companyId` to `api-salesops/src/test-support/auth-test-helpers.ts`
- [ ] 3.6 Re-run `verify-company-user-backfill.ts` against test DB — reconfirm gate before authoring 002
- [ ] 3.7 Write migration 002: `ALTER TABLE "app_user" DROP COLUMN "roles"`
- [ ] 3.8 Update `schema.prisma` — remove `roles` from `User` model
- [ ] 3.9 Verify: full matrix rerun post-drop — domain 238, infra-db 121+N, api-common 24+N, api-idp 50+11+N, api-salesops 181+50e2e green
- [ ] 3.10 Compile-error sweep: confirm no remaining reference to `app_user.roles`
- [ ] 3.11 RED→GREEN: `domain/src/users/user.test.ts` + `user.ts` — drop `roles` field (moved from 1.9)
- [ ] 3.12 Update `infra-db/src/users/prisma-user.repository.ts` (+spec) drop `roles` from UserRow/toDomain/create/update (moved from 1.17)

> 3.11 and 3.12 must land in the SAME commit as 3.7/3.8 (the column drop) and after 2.10-2.11
> (the `user.mapper.ts` signature change). Dropping the domain field is what turns every stale
> reader into a compile error instead of a silent `0` — that is the whole reason the field and
> the column go together.
