# Tasks: Platform Superadmin Console

Commits on `main`. **No PRs, no PR chaining — no chained-PR split.** Strict TDD
per task: RED (failing test, run it) → GREEN (implement, run green) → commit;
pure migration/config steps are verify-only. Runners: NestJS → jest co-located
`*.spec.ts`; `web-catalog` → vitest + jsdom + testing-library. Lint: NestJS
`--max-warnings 0`, `web-catalog` `--max-warnings 5`. Conventional commits, no
AI attribution. Code/comments English, UI copy Spanish.

## Review Workload Forecast

| Field | Value |
|---|---|
| Delivery strategy | Commits only on `main` — explicitly NO PRs, so NO chained-PR split is suggested |
| Estimated changed lines | Production ~398 (design File Changes table); tests ~450 live OUTSIDE the production budget |
| 400-line budget risk | Borderline-low: production sits just under 400; advisory only under commits-only delivery |
| Chained PRs recommended | No |
| Suggested split | Not applicable — single linear commit series on `main`, one commit per task |
| Largest phase | Phase 2 (~171 production lines) already split into 4 commit-sized tasks |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: N/A (commits-only delivery)
400-line budget risk: Low

## Phase 1 — Master Migration + Domain Foundation

- [x] 1.1 Create `templates/packages/infra-db/prisma/master/migrations/20260824120000_platform_superadmin_and_company_type/migration.sql` per D5: `ALTER TABLE "app_user" ADD COLUMN "is_superadmin" BOOLEAN NOT NULL DEFAULT false; CREATE TYPE "CompanyType" AS ENUM ('catalog'); ALTER TABLE "company" ADD COLUMN "type" "CompanyType" DEFAULT 'catalog';` Mirror in `prisma/master/schema.prisma` (+7). Verify: `prisma:generate` + package `typecheck` pass; additive-only, old code unaffected. Commit: `feat(infra-db): add is_superadmin and CompanyType to master schema`.
- [x] 1.2 RED: users unit suite — a user built without the flag reads `isSuperadmin === false` (spec `salesops-identity` "Default users are not superadmin"). GREEN: `templates/packages/domain/src/users/user.ts` gains `isSuperadmin: boolean`, defaulted false by the factory. Run red→green. Commit.
- [x] 1.3 RED: company unit test — `type: 'catalog' | null` passes through untouched, exported `CompanyType` (spec `salesops-companies` "New companies default to catalog"). GREEN: `templates/packages/domain/src/company/company.ts` adds field + export. Regression proof: existing `create-company.saga.spec.ts` green UNCHANGED = saga input contract intact (spec `salesops-companies` "Type does not affect provisioning or access"). Commit.

## Phase 2 — api-idp Platform Surface

- [x] 2.1 RED: modify `jwt.strategy.spec.ts` — `validate()` returns `{id,login,isActive,isSuperadmin}` and NO `roles`/`companyId`/`companyUserId`; login response stays tokens-only (spec `salesops-identity` modified requirement: all 4 scenarios; TenantContextGuard scenarios stay covered by existing green `roles.guard.spec.ts`). GREEN: add `isSuperadmin` to the sanitize map in `templates/apps/api-common/src/auth/jwt.strategy.ts` (+2). Commit.
- [x] 2.2 RED: create `templates/apps/api-idp/src/platform/superadmin.guard.spec.ts` — admits `isSuperadmin=true` with NO Membership; `isSuperadmin=false` → 403; asserts `JwtAuthGuard` ran ALONE and an unauthenticated request never reaches the gate (spec `salesops-platform` "Superadmin passes the gate…", "Non-superadmin is rejected…", "Unauthenticated request…"). GREEN: `superadmin.guard.ts` (single boolean check, app-local per D1) + `platform.module.ts`; register module in `src/app/app.module.ts`. Commit.
- [x] 2.3 RED: create `platform.service.spec.ts` — composition ORDER: `bcrypt.hash(pw,10)` → owner `userRepository.create` → `createCompanySaga.run({name,slug,ownerId})`; dup owner login → 409 AND saga NOT called; dup slug → 409 from saga; plaintext returned exactly once, never logged, only the hash persists (spec `salesops-platform` "Happy path…", "Duplicate slug…", "Duplicate owner login…", "Password appears once…"). GREEN: `platform.service.ts` per D3 — saga byte-for-byte untouched, no compensation. Commit.
- [x] 2.4 RED: create `platform.controller.spec.ts` — GET returns ALL companies incl. `schemaName=null` shaped `{id,name,slug,isActive,type}`; POST 201 `{company,ownerLogin,temporaryPassword}`; invalid slug regex / empty name / `type!=='catalog'` → 400 BEFORE any write (spec `salesops-platform` "Listing includes unprovisioned…", "Listing is gated", "Invalid input returns 400"). GREEN: value-import `dto/create-platform-company.dto.ts` (FIX-4 comment precedent) + `platform.controller.ts` (D2: full-array list). Commit.
- [x] 2.5 Verify: full `pnpm --filter api-idp test:cov` + lint `--max-warnings 0`; `roles.guard.spec.ts` and `auth.controller.spec.ts` green UNCHANGED (regression proof: default-false, not-a-bitmask, login body has no flag). Commit only if fixes were needed.

## Phase 3 — web-catalog Admin-Host Console

- [x] 3.1 RED: `app/shared/lib/tenant.server.test.ts` — `isPlatformAdminHost` truth table (`labels[0]==='admin'`, empty labels, other label). GREEN: +12 in `tenant.server.ts`. Commit.
- [x] 3.2 RED: create `app/__tests__/platform-host.test.tsx` — D4 host×path matrix: tenant×`/tiendas` → generic 404 identical to unknown path; tenant other paths unchanged; admin×`/` → redirect `/tiendas`; admin×`/productos` → redirect `/tiendas`; admin×`/tiendas` serves platform shell (spec `salesops-platform` "Tenant host cannot reach…", "Admin host root redirects…", "Admin host storefront paths…"). GREEN: `root.tsx` loader branch (skip StoreConfig on admin host) + minimal shell when `loaderData.platform`; `routes.ts` registers the `_platform` sibling branch outside `_auth.tsx` (+5). Commit.
- [x] 3.3 RED: create `app/platform/routes/__tests__/tiendas.test.tsx` — anonymous → `/admin/login?returnTo=…`; valid NON-superadmin session → SAME status and destination (indistinguishable, spec "Authenticated non-superadmin gets the same redirect"); superadmin session lists all companies (spec "Console lists stores…"). GREEN: `shared/routes/_platform.tsx` layout — throws the SAME generic 404 as `store-config.server.ts` on non-admin hosts, calls the platform list via `platform-api.server.ts` (new, mirrors `api.server.ts` MINUS `X-Company-Id`, base `apiIdpBaseUrl()`; one refresh-retry, destroy on second 401) — plus `platform/routes/tiendas.tsx` Spanish list. Cookie isolation needs no code (domain omitted). Commit.
- [x] 3.4 RED: extend `tiendas.test.tsx` — `/tiendas/nueva` renders name, slug, type (`'catalog'` only option), owner login, temporary password; submit posts to the platform endpoint; SUCCESS state renders the plaintext ONCE and no other element/state retains it (spec "Temporary Password Show-Once Semantics" console side). GREEN: `platform/routes/tiendas-nueva.tsx` (+68) with show-once success state. Commit.

## Phase 4 — Final Verification

- [x] 4.1 Full gates: `pnpm turbo run lint typecheck test` monorepo-wide; coverage ratchet per package (`test:cov`) at each package's last touched task. Fix commits standalone if needed.
- [x] 4.2 Runtime proof of the FULL D4 host×path matrix against running `web-catalog` (all five cells), including admin-host cookie never reaching tenant subdomains.
- [x] 4.3 No-password-retrieval proof: server logs contain no password; no later endpoint returns it; DB row holds only the bcrypt hash; owner logs in successfully with the displayed temp password (proposal Success Criteria #3).
- [x] 4.4 Diff audit: `create-company.dto.ts`, `create-company.saga.ts`, and self-service `POST /companies` byte-for-byte untouched; JWT payload stays `{sub, login}`.

## Spec Scenario Map

| Spec scenario | Task |
|---|---|
| identity: Default users are not superadmin / flag-not-bitmask / login-body-no-flag | 1.2, 2.5 |
| identity MODIFIED: jwt output / tokens-only / TenantContextGuard / fail-loud | 2.1 (guard rows: existing green suites) |
| companies: default catalog / no provisioning effect | 1.3 |
| platform: gate ×3 scenarios | 2.2 |
| platform: list ×2, create-on-behalf ×4, show-once ×1 | 2.3, 2.4, 3.4 |
| platform: admin-host routing ×3 | 3.2 |
| platform: session guard ×3 | 3.3, 3.4 |
