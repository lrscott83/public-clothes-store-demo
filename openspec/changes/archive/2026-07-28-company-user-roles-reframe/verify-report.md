# Verification Report

**Change**: company-user-roles-reframe
**Mode**: Strict TDD
**Verified against**: HEAD `f254f14` on `salesops-company-user-roles` (9 commits, pushed, working tree clean)

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 51 (49 `[x]` + 2 `[~]` deliberately resequenced into later `[x]` tasks) |
| Tasks complete | 51/51 (0 incomplete) |
| Resequencing corrections | 4, all confirmed real in code (see Correctness) |

## Build & Tests Execution

**Build**: `pnpm -r build` → ✅ exit 0, zero errors (verified directly, not from prior claims)

**Tests** (all re-run live, real Postgres for infra-db/api-idp/api-salesops):

| Suite | Result | vs. claimed |
|---|---|---|
| `@store-mgmt/domain` (vitest) | ✅ 249/249 (22 files) | matches |
| `@store-mgmt/infra-db` (jest, real PG) | ⚠️ 126/142 passed, 16 failed (1 file) | see WARNING-1 |
| `@store-mgmt/api-common` (jest) | ✅ 31/31 | matches |
| `api-idp` unit | ✅ 54/54 | matches |
| `api-idp` e2e | ✅ 11/11 | matches |
| `api-salesops` unit | ✅ 181/181 | matches |
| `api-salesops` e2e | ✅ 50/50 | matches |
| lint `domain`/`infra-db`/`api-idp`/`api-salesops` (`--max-warnings 0`) | ✅ clean | matches |
| lint `api-common` (`--max-warnings 0`) | ⚠️ 4 warnings (`SOME_SECRET`, `turbo/no-undeclared-env-vars`) | confirmed pre-existing (see SUGGESTION-1) |

**Coverage** (domain/company/* only, informational): `company-user.ts` 100%, `resolve-sole-company.ts` 100%, `errors.ts` 87.5% (uncovered: one error-class constructor, not consumed within `domain`'s own test boundary — consumed cross-package), interfaces (`company.ts`, ports, `index.ts`) 0% — expected, no executable code. Not a gate; informational only.

### infra-db: why 16/142 failed, and why this is not attributed to the change

I could not independently reset `store_mgmt_test` to empty before running this suite: `prisma migrate reset --force` triggered Prisma's own AI-safety gate ("Prisma Migrate detected that it was invoked by Claude Code... forbidden ... without explicit consent"), which requires live human consent I cannot fabricate as an autonomous verify pass. I did **not** bypass it. Instead I ran the suite against the DB as I found it (seeded: 1 company / 9 users / 9 company_user / 5 customers, left over from apply's own §7 gate rehearsal) and root-caused every failure:

- All 16 failures are in **one file**: `packages/infra-db/src/sales/prisma-order.repository.spec.ts`.
- Root cause: that spec's `beforeEach` cleanup deletes `warehouse` rows (line 52) before `warehouseOperator` rows are cleared, and the pre-seeded cockpit account `warehouse.operator` (from `infra-db/src/users/seed.ts`) had already created a real `WarehouseOperator` row tied to a seeded `Warehouse` — so the delete trips a live FK (`warehouse_operator_warehouse_id_fkey`), which cascades into unique-`login`/fixture failures in every test after it.
- **This FK-ordering gap in the cleanup block predates this change** — confirmed via `git diff c4b51dd..HEAD -- packages/infra-db/src/sales/prisma-order.repository.spec.ts`: this change's only edit to that file is the addition of `companyUser.deleteMany()` (line 57); the pre-existing `warehouse.deleteMany()` at line 52 (the actual failure site) is untouched.
- Conclusion: **not a regression introduced by company-user-roles-reframe** — an environmental artifact of the shared test DB plus a pre-existing, unrelated test-isolation gap. Flagged as WARNING-1 below because I could not close the loop with a clean-DB run myself.

## Spec Compliance Matrix

### salesops-companies (NEW)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Company Entity | schemaName null on seed | `prisma-company.repository.spec.ts`, `seed.spec.ts` | ✅ COMPLIANT |
| Company Entity | schemaName inert (no code path reads it) | static: full-repo grep, zero production readers | ✅ COMPLIANT (static + absence-of-reader proof) |
| CompanyUser Soft-FK Shape | persists without matching User | `prisma-company-user.repository.spec.ts` "soft FK, D1" | ✅ COMPLIANT |
| CompanyUser Soft-FK Shape | duplicate (userId,companyId) rejected | same file, "rejects a duplicate…" | ✅ COMPLIANT |
| Single-Company Auto-Assignment | exactly one → auto-assign | `auth.service.spec.ts` "assigns the new user to the sole Company…" | ✅ COMPLIANT |
| Single-Company Auto-Assignment | zero → 500, logged | `auth.service.spec.ts` "zero Companies → 500…" + live log `NO_COMPANY_CONFIGURED` seen during `api-idp` unit run | ✅ COMPLIANT |
| Single-Company Auto-Assignment | >1 → 409, logged | `auth.service.spec.ts` "more than one Company → 409…" + live log `AMBIGUOUS_COMPANY` seen | ✅ COMPLIANT |
| CompanyUser Status Gates Access | active admitted | `jwt.strategy.spec.ts` (role resolution tests) | ✅ COMPLIANT |
| CompanyUser Status Gates Access | non-active denies, same class as missing | `jwt.strategy.spec.ts` `it.each(['REVOKED','SUSPENDED'])` | ✅ COMPLIANT |
| Migration Lifecycle | post-001 dual source correct | manual §7 gate run (documented, real, both happy + corrupted-negative path) | ✅ COMPLIANT (manual, evidenced) |
| Migration Lifecycle | post-002 single source | migration 002 applied to `store_mgmt_test`; compile sweep; schema.prisma has no `roles` on User | ✅ COMPLIANT |

### salesops-identity (MODIFIED delta)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Role Resolution at Auth Time | validate populates roles+companyId | `jwt.strategy.spec.ts` "sources roles from CompanyUser.role…" | ✅ COMPLIANT |
| Role Resolution at Auth Time | JWT payload never carries companyId | — | ❌ UNTESTED (static-only: `JwtAccessPayload={sub,login}` type; no test decodes an issued token to assert absence of `companyId`) — see WARNING-5 |
| Role Resolution at Auth Time | missing CompanyUser → 403 MISSING_COMPANY_USER | `jwt.strategy.spec.ts` + live e2e log `MISSING_COMPANY_USER` during `api-idp` e2e | ✅ COMPLIANT |
| Role Resolution at Auth Time | existing @Roles() decorators need zero source changes | `git diff c4b51dd..HEAD --stat` on all `apps/api-salesops/src/**/*.controller.ts` = empty; 181+50e2e green | ✅ COMPLIANT (spec says "9 controllers", actual is 7 — see WARNING-4) |
| User Identity Entity | no roles field on User | `packages/domain/src/users/user.ts`, `schema.prisma` — confirmed absent | ✅ COMPLIANT |
| Bitmask Multi-Role | role 0 valid, not MISSING_COMPANY_USER | `jwt.strategy.spec.ts` "role bitmask 0 is a VALID zero-permission assignment…" | ✅ COMPLIANT |
| @Roles()/RolesGuard Enforcement | guard logic unchanged, upstream source moved | `roles.guard.spec.ts` full suite + guard-order regression test | ✅ COMPLIANT |
| Deferred/Non-Goals | Company/CompanyUser exist, tenant machinery doesn't | static: grep confirms no Membership/tenant-context/schema-routing code | ✅ COMPLIANT |

**Compliance summary**: 18/19 scenarios COMPLIANT with a passing runtime test; 1/19 (JWT-payload-excludes-companyId) UNTESTED at runtime (type-level only).

## Correctness — the 4 "plan bugs" apply reported fixing (independently confirmed in code, not just prose)

| # | Claimed fix | Verified in code | Result |
|---|---|---|---|
| 1 | 1.9/1.17 moved to Phase 3 — domain `User`/`prisma-user.repository` drop `roles` only after mapper is ready | `git log`; `user.ts`/`prisma-user.repository.ts` have zero `roles` references today; commit `fd0a44c` carries the drop together with 3.7/3.8/3.11/3.12 as required | ✅ Real |
| 2 | 2.19/2.20 pulled forward — e2e fixtures must seed CompanyUser in Phase 2, not deferred to Phase 3 | `auth-e2e-helper.ts` (api-salesops) and `auth.e2e-spec.ts`/`users.e2e-spec.ts` (api-idp) all create `companyUser` rows for every minted test user | ✅ Real |
| 3 | 7th `userToResponseDto` call site (`issueTokens`, login/refresh) missed by design's inventory of 6 | `auth.service.ts:329` `resolveRole(user)` called inside `issueTokens`, feeding `userToResponseDto(user, roles)` | ✅ Real |
| 4 | 4th sequencing bug — `customer/seed.ts` also mints `app_user` rows and needed CompanyUser assignment | `customer/seed.ts` imports and calls `ensureDefaultCompanyId`/`seedCompanyUser`, sharing the path with `users/seed.ts` via extracted `company/seed.ts` | ✅ Real |

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| A1 `SanitizedUser.roles` stays named `roles`, non-optional, +`companyId` | ✅ Yes | `jwt.strategy.ts:29-32` |
| A2 `resolveSoleCompany` pure fn, DB-free | ✅ Yes | `resolve-sole-company.ts`, unit-tested without mocks |
| A3 `CompanyUserStatus` enum (ACTIVE/REVOKED/SUSPENDED) | ✅ Yes | `schema.prisma` |
| A4 surrogate `id` + `@@unique([userId,companyId])` | ✅ Yes | `schema.prisma`, tested |
| A5 resolve Company before any write, non-transactional | ✅ Yes | `auth.service.ts:signup` order matches exactly |
| A6 `ForbiddenException` (403) on missing/non-ACTIVE CompanyUser | ✅ Yes | `jwt.strategy.ts`, `auth.service.ts:resolveRole` |
| A7 `TtlCache` caches the JOINED projection, one invalidation window | ✅ Yes | `jwt.strategy.ts` cache-hit test confirms both repos skipped |
| §0.1 Guard-order invariant (bitmask only on `req.user`, never a sibling, no 3rd guard) | ✅ Yes | `jwt.strategy.ts`/`roles.guard.ts` doc comments + regression test; structurally verified — no `APP_GUARD`/global guards, no sibling `req.*Role*` field anywhere |
| §0.3 mapper/7-call-site fix | ✅ Yes | see Correctness #3 |
| §7 additive-then-drop migrations, compensating rollback documented | ✅ Yes | both migration files, rollback SQL in comments |
| §9 test-plan row 11 (permanent spec around the backfill-verify script) | ⚠️ Partial — deviation | see WARNING-3 |
| §10 rollout slices (3 chained PRs) | N/A for verify | delivered as 3 sequential slices on one branch (owner's explicit choice per apply-progress), not 3 PRs — a delivery-strategy choice, not a code defect |

## Issues Found

**CRITICAL**: None.

**WARNING**:
1. **infra-db suite not independently re-verified against a clean DB.** `prisma migrate reset` is gated by Prisma's own AI-safety check requiring live human consent, which I will not fabricate. Ran as-is instead: 126/142 passed, 16 failed, all in one file, all root-caused to pre-existing seeded fixture data (from apply's manual §7 gate run) tripping a pre-existing FK-ordering gap in `sales/prisma-order.repository.spec.ts`'s cleanup block — confirmed via diff to be unrelated/unchanged by this SDD change. Action needed: a human should run `prisma migrate reset --force` against `store_mgmt_test` (never `store_mgmt`) and re-run `pnpm --filter @store-mgmt/infra-db test` to close this loop before archive.
2. **`packages/api-common/src/auth/jwt.strategy.spec.ts:117`** has a genuine `TS2353` compile error: `activeUser({ roles: USER_ROLES.user })` — `roles` does not exist on `Partial<User>` (confirmed via direct `tsc --noEmit` against the file). Left over from `fd0a44c`, which removed the *default* `roles` value from the `activeUser` factory (line 12 of the old file) but missed this one override call site. Neither `pnpm -r build` (tsconfig excludes `**/*.spec.ts`) nor `pnpm --filter @store-mgmt/api-common test` (ts-jest doesn't fully type-check files outside the tsconfig `include`) catches it — no production impact, the test still passes and behaviorally verifies the right thing (a decoy `roles` value on the mock `User` row proves `JwtStrategy` doesn't read it). But **tasks.md's task 3.10 claim ("compile-error sweep… confirm no remaining reference to `app_user.roles`") is not fully accurate** — this is exactly the class of leftover reference that sweep was meant to catch. Fix: cast the override (`activeUser({...}) as User & {roles: number}`) or drop the property.
3. **Design §9 test-plan row 11 gap is real but the deviation is reasonable.** No `verify-company-user-backfill.spec.ts` exists. Apply's rationale (gate only meaningful in the 001→002 window) is directionally sound, and the script already has a defensive "gate no longer applies" branch for the post-002 case — meaning a cheap, DB-state-independent spec asserting that branch was achievable and wasn't written. Ruling: **acceptable deviation**, not blocking, but design.md should be updated to record the accepted gap rather than silently diverging from its own test plan.
4. **Spec/design inconsistency**: `salesops-identity` spec's ADDED requirement scenario states "the 9 api-salesops controllers" — design §0.1 independently corrected this to **7** (currency, category, customer, sales/order, warehouse, product, stock; `health.controller.ts` is unguarded). Confirmed 7 via `rg -n "@UseGuards" apps/api-salesops/src`. Functionally harmless (all 7 pass unedited) but the spec file was never synced to the design's own correction.
5. **"JWT payload never carries companyId" scenario is untested at runtime** — enforced only by the `JwtAccessPayload` TypeScript interface (`{sub, login}`); no spec/e2e decodes an actual issued token and asserts `companyId` is absent. Low risk given the type constraint, but per strict-TDD verify rules a scenario needs a passing runtime test to count as COMPLIANT.

**SUGGESTION**:
1. `api-common` lint: 4 `turbo/no-undeclared-env-vars` warnings for `SOME_SECRET` in `jwt.config.spec.ts` — confirmed pre-existing via `git diff c4b51dd..HEAD` (zero changes to that file) and its last real edit at commit `6618f01` (an older, unrelated Phase-6 change). Out of scope for this change; no action needed here.
2. Migration 001's checksum change after being applied (`f254f14`, display-name-only edit `'Tienda Principal'` → `'Tienda Prueba'`, `slug` unchanged) is **acceptable** — confirmed via diff it's a one-line value change, the commit message documents the tradeoff, and 001/002 have only ever run against the disposable `store_mgmt_test` (never `store_mgmt`, per the environment constraints). No further action needed unless a shared/production environment applies 001 before this is squashed/finalized.

## Post-verify resolution (2026-07-28, same session)

Every WARNING was acted on rather than carried into archive.

| # | Resolution |
|---|---|
| WARNING-1 | **Not reproducible — verifier artifact.** `prisma migrate reset --force --skip-seed` was run against `store_mgmt_test` (guarded by a `case` check on the resolved URL) and the suite re-run: **142/142 green**. The 16 failures came from the verifier's own §7 gate run seeding the DB before the suite; it could not reset because of Prisma's consent gate. This is exactly the documented reset-between-gate-and-suite gotcha. No code defect. |
| WARNING-2 | **Confirmed and fixed.** `jwt.strategy.spec.ts:117` really did carry a dropped field. The root cause is broader than one call site: `tsconfig.json` excludes `**/*.spec.ts`, so `pnpm -r build` type-checks NO spec file in any package. Task 3.10's sweep was regex-based over sources and could not have caught it. The decoy-value technique is obsolete anyway — since 002 the `User` row *cannot* carry a bitmask, so the mock now just calls `activeUser()`. |
| WARNING-3 | **Accepted, and now recorded** in design.md §9 row 11 instead of silently diverging — including the honest admission that the script's post-002 branch was cheaply testable and is not covered. |
| WARNING-4 | **Confirmed and fixed.** `rg -l '@UseGuards' apps/api-salesops/src --glob '*.controller.ts'` returns 7. The `salesops-identity` spec now says 7. |
| WARNING-5 | **Closed with a real runtime test.** `auth.e2e-spec.ts` now base64url-decodes the issued access token and asserts `companyId` and `roles` are absent while `sub` is present. A type cannot stop a future `sign()` call from being handed extra claims; this can. |
| SUGGESTION-1 | Accepted as out of scope — the 4 `SOME_SECRET` warnings are independently confirmed pre-existing. |
| SUGGESTION-2 | Accepted as recorded. |

Post-fix matrix: build clean · domain 249/249 · infra-db 142/142 (clean DB) · api-common 31/31 ·
api-idp 54/54 + 11/11 e2e · api-salesops 181/181 + 50/50 e2e.

## Verdict

**PASS WITH WARNINGS** (all WARNINGs subsequently closed — see resolution table above)

Every spec requirement in both delta specs is implemented and behaviorally correct; all 4 previously-flagged "plan bugs" are confirmed real fixes in code (not just prose); the guard-order invariant, soft-FK shape, UNIQUE constraint, signup 0/1/>1 policy, and non-active-CompanyUser-denies-identically-to-missing-row all hold under real, live-executed tests. No CRITICAL defect found. Five WARNINGs are all low-risk, well-scoped, and independently root-caused — none indicate a regression in the shipped behavior, but WARNING-1 (clean-DB infra-db re-run) and WARNING-2 (the stale test-file compile error) should be closed before archive for hygiene.
