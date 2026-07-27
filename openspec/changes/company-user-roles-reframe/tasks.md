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

## Phase 1: Foundation (PR1)

- [ ] 1.1 Create `domain/src/company/{company,company-user}.ts` entities
- [ ] 1.2 Create `domain/src/company/{company-,company-user-}repository.port.ts` + DI symbols
- [ ] 1.3 Create `domain/src/company/errors.ts` (NoCompanyConfigured, AmbiguousCompany, MissingCompanyUser)
- [ ] 1.4 RED: `resolve-sole-company.test.ts` — 1/0/>1 company scenarios
- [ ] 1.5 GREEN: implement `domain/src/company/resolve-sole-company.ts`
- [ ] 1.6 RED: `company-user.test.ts` — role non-negative int, status defaults ACTIVE, userId/companyId required
- [ ] 1.7 GREEN: implement CompanyUser factory validation
- [ ] 1.8 Update `domain/src/index.ts` barrel
- [ ] 1.9 RED→GREEN: `domain/src/users/user.test.ts` + `user.ts` — drop `roles` field
- [ ] 1.10 Add Prisma models `Company`/`CompanyUser`/`CompanyUserStatus` to `schema.prisma` (additive only)
- [ ] 1.11 Write migration 001 SQL per design §7 (create tables, seed company, backfill roles verbatim)
- [ ] 1.12 Create `infra-db/scripts/verify-company-user-backfill.ts` (5 SQL assertions)
- [ ] 1.13 Create `infra-db/src/company/prisma-company.repository.ts` + spec
- [ ] 1.14 Create `infra-db/src/company/prisma-company-user.repository.ts` + spec (findActiveByUserId, uniqueness, updateRole, listByCompany)
- [ ] 1.15 Create `infra-db/src/company/seed.ts` + spec (single-company seed)
- [ ] 1.16 Update `infra-db/src/index.ts` barrel
- [ ] 1.17 Update `infra-db/src/users/prisma-user.repository.ts` (+spec) drop `roles` from UserRow/toDomain/create/update
- [ ] 1.18 Run migration 001 vs `store_mgmt_test`; run verify script — all 5 assertions pass
- [ ] 1.19 Verify: `pnpm -r build` + domain (238+N) + infra-db (121+N) green

## Phase 2: Behavioral Cutover (PR2)

- [ ] 2.1 RED: `jwt.strategy.spec.ts` — roles sourced from CompanyUser.role, not User row; companyId exposed
- [ ] 2.2 RED: same spec — missing/REVOKED/SUSPENDED CompanyUser → 403 `MISSING_COMPANY_USER` logged
- [ ] 2.3 RED: same spec — cache hit skips both repositories
- [ ] 2.4 GREEN: modify `api-common/src/auth/jwt.strategy.ts` — inject `COMPANY_USER_REPOSITORY`, resolve CompanyUser
- [ ] 2.5 Update `SanitizedUser` type: `roles` non-optional, add `companyId`
- [ ] 2.6 RED→mechanical: `roles.guard.spec.ts` regression — no `req.user` → 403 (guard-order invariant); doc-comment only, logic untouched
- [ ] 2.7 Bind `COMPANY_USER_REPOSITORY` in `api-idp/src/auth/auth.module.ts` and `api-salesops/src/auth/auth.module.ts`
- [ ] 2.8 RED: `auth.service.spec.ts` — signup assigns role 1 on exactly-one company; 0→500 `NO_COMPANY_CONFIGURED`; >1→409 `AMBIGUOUS_COMPANY`
- [ ] 2.9 GREEN: modify `apps/api-idp/src/auth/auth.service.ts` signup() per design §6
- [ ] 2.10 Modify `apps/api-idp/src/auth/mappers/user.mapper.ts` — `userToResponseDto(user, roles)` signature change
- [ ] 2.11 Fix 6 call sites: `auth.service.ts:100`, `UsersService.{create,list,findById,update,deactivate}`
- [ ] 2.12 Modify `apps/api-idp/src/users/users.service.ts` — persist via `companyUserRepository.create/updateRole`; `list()` via `listByCompany(req.user.companyId)`
- [ ] 2.13 Modify `apps/api-idp/src/users/users.controller.ts` — add `@Req()` to `list()`; confirm `assertNoUnauthorizedAdminGrant` (lines 46,66) untouched
- [ ] 2.14 Update `apps/api-idp/src/users/users.module.ts` bindings
- [ ] 2.15 Confirm zero-edit readers unchanged: `api-salesops/src/sales/order.controller.ts:221-224`, `src/stock/stock.controller.ts:94-95`
- [ ] 2.16 Regression: `auth.e2e-spec.ts:53` (`body.roles===1`), `users.controller.spec.ts:111,130` green
- [ ] 2.17 GOTCHA: rebuild `dist` for domain/infra-db/api-common before any api-salesops run
- [ ] 2.18 Verify: `pnpm -r build` + full matrix — api-common 24+N, api-idp 50+11+N, api-salesops 181+50e2e unchanged, all green

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
