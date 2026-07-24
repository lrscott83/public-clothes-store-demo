# Tasks: Users / Roles / Autenticación (isolated identity module — api-idp pattern)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~4200-4900 (domain users ~700 incl. 5 files+RoleHelpers+factory+ports+errors+vitest; infra-db ~1300 incl. schema+migration/backfill+4 repos+seed+jest; NEW `api-common` package ~450 incl. jwt.config+JwtStrategy+guard+decorator+turbo/tsconfig wiring+tests; NEW `apps/api-idp` ~1400 incl. LocalStrategy+auth.service/controller+users CRUD+DTOs+jest unit+e2e; api-salesops wiring ~350 incl. guard/`@Roles()` on existing endpoints+user reads+Customer.userId integration+e2e updates; human-authored, excludes generated Prisma client/migration SQL) |
| 400-line budget risk | High |
| Chained PRs recommended | No — project delivery is owner-locked (Engram `sdd-init/public-clothes-store-demo`): single branch, work-unit commits, push at end, NO PR |
| Suggested split | N/A (no PR flow). Work units below are **commit** boundaries only, each independently revertible via `git revert` |
| Delivery strategy | single branch + work-unit commits, no PR (owner-selected, out of band from `ask-on-risk/auto-chain/single-pr/exception-ok`) |
| Chain strategy | size-exception (closest analogue: no splitting, single continuous branch — likely `salesops-identity` or similar new branch) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

Honest size report only — per owner instruction (repeated from the `backend-ventas`
precedent), do NOT open a PR and do NOT split into chained/stacked PRs. `sdd-apply`
proceeds on a single branch, one work-unit commit per unit below, pushed at the end.

### Suggested Work Units (commit boundaries, not PR boundaries)

| Unit | Goal | Phase | Depends on |
|------|------|-------|-----------|
| 1 | Domain: identity core (`User`+`RoleHelpers`+`OperadorAlmacen`+token models+ports+errors) | Phase 1 | none |
| 2 | infra-db: schema+migration+backfill+4 Prisma repos+seed | Phase 2 | Unit 1 (port contracts) |
| 3 | NEW `packages/api-common`: shared JWT/roles kit + boundary-lint wiring | Phase 3 | Unit 1 (`RoleHelpers`/ports types) |
| 4 | NEW `apps/api-idp`: LocalStrategy/auth/users delivery | Phase 4 | Unit 2 (repos), Unit 3 (kit) |
| 5 | `apps/api-salesops`: guard+`@Roles()` wiring, Customer.userId integration | Phase 5 | Unit 2, Unit 3, Unit 4 (shared secret/token shape) |
| 6 | Cross-cutting verification | Phase 6 | Units 1-5 |

## Phase 1: Domain — Identity Core (vitest, `pnpm --filter @store-mgmt/domain test`)

- [x] 1.1 [RED] `domain/src/users/roles.test.ts`: `hasRole`/`addRole`/`removeRole`/`getRoles` bit ops per spec scenarios (multi-role hold, targeted clear).
- [x] 1.2 [RED] same file: `effectiveRoles` — admin returns union of ALL bits; owner returns union of business bits (not admin); else unchanged; `can(roles, requiredMask)` union-satisfies test.
- [x] 1.3 [GREEN] `domain/src/users/roles.ts`: `USER_ROLES` bitmask const + `RoleHelpers` + `effectiveRoles`/`can`, to pass 1.1-1.2.
- [x] 1.4 [RED] `domain/src/users/user.test.ts`: `createUser` — unique/required `login`, optional `email`/`cellPhone` resolve `null`, no `isEmailVerified` field, `passwordHash` bcrypt-shape invariant throws `InvalidUserError` on bad hash, empty/whitespace `login`/`fullName` rejected.
- [x] 1.5 [GREEN] `domain/src/users/user.ts`: `User` entity + `CreateUserInput` + `createUser` factory, to pass 1.4.
- [x] 1.6 [RED] `domain/src/users/operador-almacen.test.ts`: `OperadorAlmacen` shape — `userId` PK/FK, `warehouseId` NOT unique.
- [x] 1.7 [GREEN] `domain/src/users/operador-almacen.ts` to pass 1.6.
- [x] 1.8 `domain/src/users/refresh-token.ts` + `password-reset-token.ts`: pure domain models (no behavior beyond shape), mirrors design §2.
- [x] 1.9 `domain/src/users/{user-repository,refresh-token-repository,password-reset-token-repository,operador-almacen-repository}.port.ts`: interfaces + Symbols (`USER_REPOSITORY`, etc.) per design §5/§6.
- [x] 1.10 `domain/src/users/errors.ts`: `InvalidUserError`, `DuplicateLoginError`.
- [x] 1.11 `domain/src/users/index.ts` barrel; add `export * from './users/index.js'` to `domain/src/index.ts`; DROP the `export * from './models/auth.js'` line and delete `domain/src/models/auth.ts`. Verify via `rg` that no consumer imports `AuthModel`/`UserModel`/`LoginRequest`/`RegisterRequest`/`Credentials`/`StoreModuleFeatures` from `@store-mgmt/domain` before deleting.
- [x] 1.12 Run `pnpm --filter @store-mgmt/domain test && pnpm --filter @store-mgmt/domain typecheck` — full domain suite green, zero regressions, no ambiguous re-export.

## Phase 2: infra-db — Prisma + Migration/Backfill (jest + real Postgres, `pnpm --filter @store-mgmt/infra-db test`)

DONE — committed in `5298951 feat(users): infra-db persistence + Customer.userId 1:1 migration (Phase 2)`. Naming deviation: `OperadorAlmacen`/`operador_almacen` renamed to English `WarehouseOperator`/`warehouse_operator` (code/DB-in-English convention) — same model, English identifiers.

- [x] 2.1 Append `model User @@map("app_user")`, `model RefreshToken @@map("refresh_token")`, `model PasswordResetToken @@map("password_reset_token")`, `model WarehouseOperator @@map("warehouse_operator")` to `infra-db/prisma/schema.prisma` (exact shapes, design §2); add `Warehouse` inverse relation only — additive.
- [x] 2.2 MODIFY `Customer` in schema.prisma: add `userId String @unique @db.Uuid @map("user_id")` + `user User @relation(...)` (design §2) — schema-level only, migration handles the NOT-NULL sequencing.
- [x] 2.3 Generate migration `add_users_roles_module` (`20260723030000_add_users_roles_module`) with the 5-step raw-SQL sequence from design §3 (create 4 tables → add nullable `customer.user_id` → mint+correlate backfill CTE → `SET NOT NULL` → unique index + FK), applied via `prisma migrate deploy`; fresh-DB no-op path and non-empty-DB backfill path both documented in the migration file comment.
- [x] 2.4 [RED] `infra-db/src/users/prisma-user.repository.spec.ts`: `create` persists + rejects duplicate `login` (`DuplicateLoginError`, P2002 translation); `findByLogin`/`findById` round-trip; `email`/`cellPhone` resolve `null` when omitted.
- [x] 2.5 [GREEN] `infra-db/src/users/prisma-user.repository.ts` to pass 2.4.
- [x] 2.6 [RED] `infra-db/src/users/prisma-refresh-token.repository.spec.ts`: `create`/`findByToken`/`revokeIfActive` (returns 0 on already-revoked, atomic guarded UPDATE)/`revokeByUserId`/`deleteExpired`.
- [x] 2.7 [GREEN] `infra-db/src/users/prisma-refresh-token.repository.ts` to pass 2.6.
- [x] 2.8 [RED] `infra-db/src/users/prisma-password-reset-token.repository.spec.ts`: `create`/`findByToken`/`markAsUsed`/`revokeByUserId`/`deleteExpired`, single-use enforced at repo level (second `markAsUsed` on a used token is a no-op-safe path — actual single-use business check lives in the app service).
- [x] 2.9 [GREEN] `infra-db/src/users/prisma-password-reset-token.repository.ts` to pass 2.8.
- [x] 2.10 [RED] `infra-db/src/users/prisma-warehouse-operator.repository.spec.ts`: create/find by `userId`; two operators can share one `warehouseId` (NOT unique, per spec scenario).
- [x] 2.11 [GREEN] `infra-db/src/users/prisma-warehouse-operator.repository.ts` to pass 2.10.
- [x] 2.12 [RED] `infra-db/src/users/seed.spec.ts`: `seedUsers` idempotently upserts (keyed on `login`) the cockpit accounts with bcrypt-hashed dev passwords; running twice does not duplicate.
- [x] 2.13 [GREEN] `infra-db/src/users/seed.ts` to pass 2.12.
- [x] 2.14 [RED] `infra-db/src/customer/prisma-customer.repository.spec.ts` (extend): `create` now requires an existing `userId`; creating with a non-existent `userId` is rejected (FK violation surfaces as a named error); duplicate `userId` on a second Customer rejected (1:1).
- [x] 2.15 [GREEN] adjust `infra-db/src/customer/prisma-customer.repository.ts` mapping/error-translation to pass 2.14 (design §2, Customer MODIFIED).
- [x] 2.16 [RED] `infra-db/src/customer/seed.spec.ts` (extend): `seedCustomers` find-or-creates a matching `app_user` (`deriveLogin(fullName)`, bcrypt dev password, `roles=user`) per demo customer, then links `userId`; idempotent on both sides.
- [x] 2.17 [GREEN] `infra-db/src/customer/seed.ts` (modified) — shared `deriveLogin(fullName)` helper (reused by the migration's login-shape, kept consistent per design §3/ADR-5) to pass 2.16.
- [x] 2.18 `infra-db/prisma/seed.js`: reorder to products → warehouses → **users** → customers.
- [x] 2.19 Export the 4 new repos from `infra-db/src/index.ts`.
- [x] 2.20 Run `pnpm --filter @store-mgmt/infra-db test` full-green (existing currency/product/inventory/customer/ventas suites + new users suites, `maxWorkers:1`); `lint`/`typecheck`/`build` exit 0. (Re-confirmed during Phase 3 apply: 119/119 tests green.)

## Phase 3: `packages/api-common` (NEW package — shared auth kit, ADR-3)

- [x] 3.1 Scaffold `packages/api-common/` (`package.json`, `tsconfig.json`, `eslint.config.mjs`, `jest.config.js`, turbo wiring) mirroring `packages/infra-db`'s NestJS-adjacent config; `pnpm-workspace.yaml` already globs `packages/*` (no change needed there); added `JWT_SECRET`/`REFRESH_TOKEN_SECRET`/`ACCESS_TOKEN_EXPIRES_IN`/`REFRESH_TOKEN_EXPIRES_IN` to `turbo.json` `globalEnv`.
- [x] 3.2 `api-common/src/auth/jwt.config.ts`: `JWT_CONFIG`/`REFRESH_TOKEN_CONFIG` reading `JWT_SECRET`/`REFRESH_TOKEN_SECRET`/`ACCESS_TOKEN_EXPIRES_IN`/`REFRESH_TOKEN_EXPIRES_IN` env vars (ADR-4), single source of truth.
- [x] 3.3 [RED] `api-common/src/auth/jwt.strategy.spec.ts`: `validate(payload)` resolves `req.user` FRESH via `IUserRepository.findById`; rejects missing/inactive user; strips `passwordHash`; short TTL cache (~30s) bounds repeated lookups (ADR-2). (Also added `cache/ttl-cache.spec.ts` RED for the underlying `TtlCache` util.)
- [x] 3.4 [GREEN] `api-common/src/auth/jwt.strategy.ts` to pass 3.3 (+ `cache/ttl-cache.ts` GREEN).
- [x] 3.5 `api-common/src/auth/jwt-auth.guard.ts`: `AuthGuard('jwt')`.
- [x] 3.6 [RED] `api-common/src/auth/roles.guard.spec.ts`: no `@Roles()` metadata → allow; admin bit → allow regardless of required mask; union-satisfies (`owner` passes a business-role check); holding the exact role → allow; missing role → `ForbiddenException`; defensive no-`req.user` case → `ForbiddenException`.
- [x] 3.7 [GREEN] `api-common/src/auth/roles.decorator.ts` (`@Roles(...bits)`, `SetMetadata`) + `api-common/src/auth/roles.guard.ts` to pass 3.6.
- [x] 3.8 `api-common/src/index.ts` barrel exporting the auth kit.
- [x] 3.9 Extended `eslint-config/backend-boundaries.config.js`: `@store-mgmt/api-common` added to `webBackendBoundaryRule` (web apps forbidden from importing it, alongside `infra-db`/`api-salesops`); confirmed `domainBoundaryRule`'s existing `@store-mgmt/api-*` glob already matches `@store-mgmt/api-common` (no change needed there).
- [x] 3.10 Ran `pnpm --filter @store-mgmt/api-common test && typecheck && build && lint` full-green (20/20 tests).

## Phase 4: `apps/api-idp` (NEW app — LocalStrategy, the only app that owns it)

- [ ] 4.1 Scaffold `apps/api-idp/` (`package.json`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `main.ts`, `test/jest-e2e.json`) mirroring `apps/api-salesops`'s NestJS scaffold; wire into root turbo pipeline.
- [ ] 4.2 `api-idp/src/auth/local.strategy.ts`: `usernameField:'login'`, delegates to `AuthService.validateUser`.
- [ ] 4.3 [RED] `api-idp/src/auth/auth.service.spec.ts`: `validateUser` — correct login+password (bcrypt.compare) returns user sans hash; wrong password / unknown login both reject with the SAME error class (no enumeration leak, spec scenario); inactive user rejected.
- [ ] 4.4 [RED] same file: `login` issues access JWT (`{sub,login}` only, ADR-2) + refresh JWT with persisted opaque `rtid`.
- [ ] 4.5 [RED] same file: `refresh` — valid unused token rotates (new access+refresh, old `rtid` marked used); replaying an already-rotated token revokes the WHOLE family (reuse-detection, design §5 steps 1-7); concurrent-rotation race (`revokeIfActive` returns 0) also revokes family.
- [ ] 4.6 [RED] same file: `changePassword` — verifies current hash, updates, calls `revokeByUserId` (all refresh tokens die).
- [ ] 4.7 [RED] same file: `initiatePasswordReset`/`resetPassword` — mints single-use opaque token (15-min expiry), second use of the same token rejected, success revokes all refresh tokens; enumeration-safe generic response on unknown login/email.
- [ ] 4.8 [GREEN] `api-idp/src/auth/auth.service.ts`: implement `validateUser`/`login`/`refresh`/`changePassword`/`initiatePasswordReset`/`resetPassword` per design §5, to pass 4.3-4.7.
- [ ] 4.9 `api-idp/src/auth/dto/*.ts` (`login.dto.ts`, `signup.dto.ts`, `change-password.dto.ts`, `refresh.dto.ts`, `password-reset.dto.ts`) + `mappers/user.mapper.ts` (strips `passwordHash`).
- [ ] 4.10 [RED] `api-idp/src/auth/auth.controller.spec.ts`: `POST /auth/login` 200+tokens / 401 on bad credentials; `POST /auth/signup` 201 (creates `User` via `createUser`+bcrypt hash at the edge); `POST /auth/change-password` 200, revokes sessions; `POST /auth/refresh` 200 rotated pair / 401 on reuse; `POST /auth/password-reset/*` 200 generic response.
- [ ] 4.11 [GREEN] `api-idp/src/auth/auth.controller.ts` + `auth.module.ts` to pass 4.10.
- [ ] 4.12 [RED] `api-idp/src/users/users.controller.spec.ts`: admin/owner CRUD — list/get/update roles/deactivate a user; non-admin/owner rejected 403 (delegates to `RolesGuard`).
- [ ] 4.13 [GREEN] `api-idp/src/users/{users.service,users.controller,users.module}.ts` + `dto/*` to pass 4.12.
- [ ] 4.14 `api-idp/src/app/app.module.ts`: wire `InfraDbModule`, `AuthModule`, `UsersModule`, Passport (`Local`+`Jwt` strategies), `ConfigModule`.
- [ ] 4.15 [RED→GREEN] `api-idp/test/auth.e2e-spec.ts`: full HTTP lifecycle against real Postgres — signup→login→refresh-rotation→reuse-detection-revokes-family→change-password-revokes-sessions→password-reset-single-use; unknown-login and wrong-password both 401 with identical error shape.
- [ ] 4.16 Run `pnpm --filter @store-mgmt/api-idp test && test:e2e && typecheck && build && lint` full-green.

## Phase 5: `apps/api-salesops` — Consume JWT + RolesGuard + Customer.userId

- [ ] 5.1 `apps/api-salesops/src/app.module.ts`: wire `USER_REPOSITORY → PrismaUserRepository`, Passport `JwtStrategy` (from `@store-mgmt/api-common`), global or per-module `JwtAuthGuard`.
- [ ] 5.2 [RED] `stock.controller.spec.ts` / `ventas.controller.spec.ts` / other guarded controllers (extend, additive cases): unauthenticated request → 401; authenticated user lacking the required role → 403; user holding the role (or `admin`) → 200 (spec scenarios, RolesGuard Enforcement requirement).
- [ ] 5.3 [GREEN] Apply `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` to existing endpoints per the permission matrix (owner/admin: full business; `operador_almacen`: warehouse-scoped stock reads; `operador_gestores`: TBD per matrix; plain `user`: customer-facing reads only) — one controller at a time, to pass 5.2.
- [ ] 5.4 [RED] `customer.controller.spec.ts` / `customer.service.spec.ts` (extend): `create` now requires an existing `userId` in the payload; missing/non-existent `userId` rejected 400/404.
- [ ] 5.5 [GREEN] `customer.service.ts`/`customer.controller.ts`/`create-customer.dto.ts` (extend) to pass 5.4 — `userId` becomes a required DTO field.
- [ ] 5.6 [RED] `apps/api-salesops/test/customer.e2e-spec.ts` (extend, rebuild domain+infra-db dist first): create-Customer-without-User → 400/404; create-Customer-with-User → 201, `userId` round-trips.
- [ ] 5.7 [GREEN] Confirm 5.6 passes against 5.4/5.5 wiring.
- [ ] 5.8 [RED→GREEN] any e2e spec exercising a now-guarded endpoint (Phase 5.2-5.3): add an `Authorization: Bearer <token issued by api-idp test helper>` fixture so existing e2e suites don't regress into 401.
- [ ] 5.9 Run `pnpm --filter @store-mgmt/api-salesops test && test:e2e` full-green (rebuild `domain`+`infra-db` dist first per strict-TDD note); `typecheck`/`build`/`lint` exit 0.

## Phase 6: Cross-cutting Verification

- [ ] 6.1 `pnpm --filter @store-mgmt/domain lint && pnpm --filter @store-mgmt/infra-db lint && pnpm --filter @store-mgmt/api-common lint && pnpm --filter @store-mgmt/api-idp lint && pnpm --filter @store-mgmt/api-salesops lint` — `backend-boundaries --max-warnings 0` stays green; confirm `domain` never imports `infra-*`/`api-*`; confirm web apps never import `api-common`/`infra-db`/`api-salesops`.
- [ ] 6.2 `rg -n "bcrypt|passwordHash" templates/packages/domain/src/users/` — confirm hashing itself never runs in the domain (only the bcrypt-shape invariant check); hashing lives in `api-idp`'s `auth.service.ts`.
- [ ] 6.3 Run all suites together (domain vitest; infra-db jest w/ real Postgres; api-common jest; api-idp jest+e2e; api-salesops jest+e2e); confirm every scenario in `specs/salesops-identity/spec.md` and the `salesops-customers` delta spec is covered by at least one test.
- [ ] 6.4 Confirm `typecheck`/`build` green across all five packages/apps together (domain → infra-db → api-common rebuilt first, so `api-idp`/`api-salesops` e2e sees fresh dist, per strict-TDD note).
- [ ] 6.5 Commit work-unit by work-unit per the table above, then push the branch — no PR opened, per owner delivery decision (Engram `sdd-init/public-clothes-store-demo`).

## Out of Scope (per design.md §8)

Multi-tenant-by-schema machinery (Company/Membership/tenant-context/schema-routing) ·
`gestor` role · fine-grained owner-finance permissions · email verification ·
transactional email delivery (reset token surfaced via response/log only) ·
actor-tracking wiring into `Order` (`createdBy`/`verifiedBy`).
