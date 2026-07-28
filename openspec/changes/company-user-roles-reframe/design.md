# Design: CompanyUser / roles reframe (single schema)

Realizes proposal `sdd/company-user-roles-reframe/proposal` (#1564). D1-D7 are locked on
intent; this document specifies HOW, and corrects three proposal statements that code
verification refuted (§0).

## 0. Adversarial verification — what the code actually says

### 0.1 D4's MECHANISM is wrong; D4's CONCLUSION is right (different reason)

The proposal claims "Passport runs `JwtStrategy.validate()` before any guard,
structurally". **This is false.** `JwtAuthGuard` is
`class JwtAuthGuard extends AuthGuard('jwt')` (`packages/api-common/src/auth/jwt-auth.guard.ts:6`).
Passport — and therefore `validate()` — runs INSIDE `JwtAuthGuard.canActivate()`. The
ordering guarantee is 100% a property of decorator order.

Real guard registration, verified:

| Fact | Evidence |
|---|---|
| No global guards at all | `APP_GUARD` / `useGlobalGuards` → **zero matches** across `templates/` |
| Guarded api-salesops controllers: **7**, not 9 | `currency:45`, `customer:40`, `product:46`, `category:29`, `warehouse:29`, `sales/order:86`, `stock:54` — all `@UseGuards(JwtAuthGuard, RolesGuard)` |
| `health.controller.ts` | no guards |
| api-idp | `users.controller.ts:38` same order; `auth.controller.ts:46` `LocalAuthGuard`, `:65` `JwtAuthGuard` alone |

So today's order is correct in every one of the 8 guarded controllers — but only by
authorial discipline, not by structure.

**D4's conclusion survives anyway, and this is the load-bearing reason:** the hazard the
exploration described is a role value living on a *sibling* request field
(`req.companyUserRole`) populated by a *third* guard. Wrong order there yields
`req.user` present + role `undefined` → `can(undefined, mask)` →
`effectiveRoles(undefined)` → `undefined & 16` → `0` → **silent 403 for everyone**.
D4 keeps the bitmask on `req.user.roles` — the exact object `RolesGuard` already
null-checks at `roles.guard.ts:33-37`. Wrong order now yields `request.user === undefined`
→ explicit `ForbiddenException('Authentication required')`. Loud, and **identical to
today's failure mode**. D4 therefore introduces no new ordering hazard; it inherits the
existing one unchanged.

**GUARD-ORDER INVARIANT (the design MUST protect this):**

> The company-scoped role bitmask MUST be a property of `req.user`. It MUST NEVER be
> attached to `req` as a sibling field, and no third guard may be introduced to populate it.

Enforcement, three loud layers — no silent path exists:
1. **Boot-time**: `JwtStrategy` gains a `COMPANY_USER_REPOSITORY` constructor injection.
   An app module that forgets to bind it fails Nest DI **at bootstrap**, not per request
   (`apps/api-idp/src/auth/auth.module.ts:38`, `apps/api-salesops/src/auth/auth.module.ts:21`).
2. **Type-time**: `SanitizedUser.roles` stays required and non-optional, so
   `RolesGuard`'s `can(user.roles, …)` can never receive `undefined` without a compile error.
3. **Test-time**: `packages/api-common/src/auth/roles.guard.spec.ts` must assert the
   no-`req.user` → `ForbiddenException('Authentication required')` path (loud-fail
   regression), and a new `jwt.strategy.spec.ts` case must assert `roles` comes from
   `CompanyUser.role`, never from the `User` row.

A future author writing `@UseGuards(RolesGuard, JwtAuthGuard)` gets a 403 on *every*
request to that controller — caught by that controller's own existing spec suite.

### 0.2 Hard user-delete audit — production convention HOLDS; tests violate it

- `IUserRepository` (`packages/domain/src/users/user-repository.port.ts:21-30`) exposes
  **no `delete`**. `DELETE /users/:id` maps to `UsersController.deactivate`
  (`users.controller.ts:70-74`) → `UsersService.deactivate` → `update(id, {isActive:false})`
  (`users.service.ts:67-75`). Soft-delete-only holds for `User` in production. **No orphan
  `company_user` row can be produced by production code today.**
- **However**, hard deletes DO exist in test cleanup: `prisma.user.deleteMany({})` in
  `infra-db/src/users/{prisma-user,prisma-refresh-token,prisma-password-reset-token,prisma-warehouse-operator,seed}.spec.ts`,
  `infra-db/src/customer/{prisma-customer.repository,seed}.spec.ts`,
  `infra-db/src/sales/{prisma-order.repository,seed}.spec.ts`, plus scoped variants in
  `api-idp/test/auth.e2e-spec.ts:33` and `users.e2e-spec.ts:31`. With no FK these leave
  orphan `company_user` rows in `store_mgmt_test` that accumulate across runs.
- **Mandated compensation** (no dead production code): every cleanup block that deletes
  `app_user` rows MUST delete the matching `company_user` rows first. The soft-FK
  invariant is recorded as a `///` schema comment on `CompanyUser.userId`:
  *"if a hard user-delete path is ever added, it MUST delete `company_user` rows in the
  same transaction."*

### 0.3 Direct `req.user.roles` readers — 2 confirmed, 2 MISSED by the proposal

| Reader | Verified | Impact |
|---|---|---|
| `apps/api-salesops/src/sales/order.controller.ts:221-224` (`isScopedWarehouseOperator`) | Exact — `RoleHelpers.hasRole(user.roles, …)` ×4, param `user: SanitizedUser` | **Zero edits** ✅ |
| `apps/api-salesops/src/stock/stock.controller.ts:94-95` (`assertWarehouseScope`) | Exact — `hasRole(user.roles, owner\|admin)`, param `user: SanitizedUser` | **Zero edits** ✅ |
| `apps/api-idp/src/users/users.controller.ts:46` and `:66` — `assertNoUnauthorizedAdminGrant(req.user.roles, …)` | **MISSED by the proposal** — same `SanitizedUser` | **Zero edits** ✅ |
| `apps/api-idp/src/auth/mappers/user.mapper.ts:13-14` — `roles: user.roles` where `user` is the **domain `User`**, not `SanitizedUser` | **MISSED by the proposal — this one BREAKS** | Signature change, 6 call sites |

D4's zero-edit claim holds for everything reading `SanitizedUser`. It does **not** hold for
`user.mapper.ts`, which reads the domain `User` this change strips `roles` from. Correction
in §5. Also stripped: `infra-db/src/users/seed.ts:76`, `seed.spec.ts:44-45`, and
`api-salesops/test/support/auth-e2e-helper.ts:28`.

### 0.4 Placement corrections vs the proposal

- `packages/infra-db/src/repositories/` **does not exist** — this repo places adapters in
  per-concept folders (`src/users/`, `src/customer/`, `src/sales/`…). Adapters go in
  **`packages/infra-db/src/company/`**.
- `packages/domain` has no `models.ts` convention (that is poolops). It uses
  `<entity>.ts` + `<entity>-repository.port.ts` + `errors.ts` + `index.ts`. Design follows
  the repo, not the proposal's table.
- `docs/system/architecture.md:152` still claims *"HTTP backend: Does not exist"* and
  `:67` marks `packages/infra-db` as *"(future)"*. **STALE** — `api-idp`, `api-salesops`,
  `infra-db`, `api-common` all exist. Recorded as follow-up doc debt; **not fixed here**.

## 1. Technical approach

One shared-kernel concept folder (`domain/src/company/`), one adapter folder
(`infra-db/src/company/`), one real behavioral change in `api-common` (`JwtStrategy`), one
policy change in `api-idp` (signup). Delivery layers in `api-salesops` are untouched. Two
hand-written migrations gated by a verification script.

## 2. Architecture decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| A1 | `SanitizedUser = Omit<User,'passwordHash'> & { roles: UserRoleValue; companyId: string }` | Rename to `companyRole`; move role to `req.companyUserRole` | Preserving the `roles` field name is what makes the 3 `SanitizedUser` readers zero-edit and keeps `RolesGuard`'s null-check the single loud failure point (§0.1) |
| A2 | Company-resolution policy is a **pure domain function** `resolveSoleCompany(companies)` | Policy inline in `AuthService`; policy in the repository | Architecture doc row *"Business rule / use case → `packages/domain/src/<concept>/`, pure function, tested"*. Testable with zero DB, reusable when the Invitation flow lands |
| A3 | `CompanyUser.status` is a Prisma enum `CompanyUserStatus {ACTIVE,REVOKED,SUSPENDED}` | `isActive Boolean` (poolops's tenant shape) | D3 says `status` extracts into a future master `Membership`. poolops's `MembershipStatus` is exactly these 3 values — the extraction becomes a column move, not a type redesign |
| A4 | `CompanyUser` has a surrogate `id` + `@@unique([userId, companyId])` | Composite PK `@@id([userId, companyId])`; PK = `userId` (poolops) | poolops's `id == userId` only works because its tenant schema is single-company. Under one schema we need both columns; a surrogate PK keeps the future extraction (drop `companyId`, keep `id`) mechanical |
| A5 | Signup resolves the Company **before** creating the `User`; the two writes are NOT transactional | Add an `IUnitOfWork`/transaction port | A new cross-aggregate transaction concept is out of scope. Resolving first means the 0/>1 failures happen before any write; a `CompanyUser` write failure leaves a user who fails login **loudly** (`MISSING_COMPANY_USER` 403), recoverable by admin |
| A6 | `JwtStrategy` throws `ForbiddenException` on missing/non-ACTIVE `CompanyUser` | Return `roles: 0`; throw `UnauthorizedException` | `roles: 0` is the silent-lockout failure mode this whole design exists to prevent. 403 (not 401) tells the operator "authenticated, not provisioned". In-repo precedent: `jwt.strategy.ts:59` already throws from `validate()` and Nest's `AuthGuard.handleRequest` rethrows it verbatim |
| A7 | `TtlCache` caches the **joined** `User`+`CompanyUser` projection under `payload.sub` | Second cache keyed by user; no cache | One cache entry, one invalidation window. Role-change propagation stays at the existing 30s `USER_CACHE_TTL_MS` — no behavior regression |

## 3. Component placement (per `docs/system/architecture.md` "Where does X go?")

| Component | Path | Doc row |
|---|---|---|
| `Company`, `CompanyUser` entities + factories | `packages/domain/src/company/{company,company-user}.ts` | Business entity |
| `resolveSoleCompany` policy | `packages/domain/src/company/resolve-sole-company.ts` | Business rule / use case |
| `NoCompanyConfiguredError`, `AmbiguousCompanyError`, `MissingCompanyUserError` | `packages/domain/src/company/errors.ts` | Business rule |
| `ICompanyRepository`, `ICompanyUserRepository` + DI symbols | `packages/domain/src/company/*-repository.port.ts` | Repository interface (port) |
| `PrismaCompanyRepository`, `PrismaCompanyUserRepository` | `packages/infra-db/src/company/` | Repository implementation (adapter) |
| Single-company seed | `packages/infra-db/src/company/seed.ts` | adapter-adjacent, mirrors `src/users/seed.ts` |
| Role resolution | `packages/api-common/src/auth/jwt.strategy.ts` | existing shared delivery concern |
| Signup assignment | `apps/api-idp/src/auth/auth.service.ts` | Endpoint/controller → app feature folder |

New `company/` is a per-concept subfolder of the shared-kernel `@store-mgmt/domain`, not a
new package.

## 4. Data model and integrity without a DB constraint

```prisma
enum CompanyUserStatus { ACTIVE  REVOKED  SUSPENDED }

model Company {
  id         String   @id @default(uuid()) @db.Uuid
  name       String
  slug       String   @unique
  isActive   Boolean  @default(true) @map("is_active")
  /// Reserved hook for the deferred schema-per-tenant change (D3). ALWAYS null today.
  schemaName String?  @map("schema_name")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt      @map("updated_at")

  companyUsers CompanyUser[]
  @@map("company")
}

model CompanyUser {
  id        String @id @default(uuid()) @db.Uuid
  /// SOFT FK to `app_user.id` — deliberately NOT a Prisma `@relation` (D1): this table is
  /// the one the deferred schema-per-tenant change moves tenant-side, where a relation to
  /// the master `User` cannot be expressed. Integrity is an APPLICATION invariant.
  /// If a hard user-delete path is ever added, it MUST delete `company_user` rows in the
  /// same transaction. Today `User` is soft-delete-only (`UsersService.deactivate`).
  userId    String            @db.Uuid @map("user_id")
  companyId String            @db.Uuid @map("company_id")
  role      Int                        // same bitmask as the former `app_user.roles`
  status    CompanyUserStatus @default(ACTIVE)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  company Company @relation(fields: [companyId], references: [id])

  @@unique([userId, companyId])
  @@index([userId])
  @@map("company_user")
}
```

`User` loses `roles`; `Customer.user` and `WarehouseOperator.user` relations are untouched (D2).

Integrity without the FK, four mechanisms:
1. **Write side** — `CompanyUser` rows are created only in `AuthService.signup` and
   `UsersService.create`, both immediately after a successful `userRepository.create`,
   using that call's returned `id`. No other write path exists.
2. **Read side** — `JwtStrategy` resolves `User` first; a `CompanyUser` is only ever
   consulted for a `userId` that just resolved to a live `User`. An orphan row is
   unreachable, not dangerous.
3. **Delete side** — no production hard delete (§0.2). Test cleanup compensates explicitly.
4. **Uniqueness** — `@@unique([userId, companyId])` still prevents duplicate assignments,
   which is the invariant that actually matters for `can()`.

Ports:

```ts
export interface ICompanyRepository {
  list(): Promise<Company[]>;
  findById(id: string): Promise<Company | null>;
}
export const COMPANY_REPOSITORY = Symbol('ICompanyRepository');

export interface ICompanyUserRepository {
  create(input: CreateCompanyUserInput): Promise<CompanyUser>;
  /** Sole ACTIVE assignment for `userId`, or null. The `JwtStrategy` hot path (per cache miss). */
  findActiveByUserId(userId: string): Promise<CompanyUser | null>;
  findByUserAndCompany(userId: string, companyId: string): Promise<CompanyUser | null>;
  updateRole(userId: string, companyId: string, role: UserRoleValue): Promise<CompanyUser>;
  /** Batch source for `UsersService.list()` — avoids N+1. */
  listByCompany(companyId: string): Promise<CompanyUser[]>;
}
export const COMPANY_USER_REPOSITORY = Symbol('ICompanyUserRepository');
```

## 5. Role-resolution flow

```
HTTP request
  │
  ├─ @UseGuards(JwtAuthGuard, RolesGuard)   ← ORDER IS THE INVARIANT (§0.1)
  │
  ├─ JwtAuthGuard.canActivate()
  │    └─ passport-jwt verifies signature + exp
  │         └─ JwtStrategy.validate({ sub })          ← payload UNCHANGED, `sub` only
  │              ├─ cache hit  → return SanitizedUser (30s TtlCache)
  │              ├─ userRepository.findById(sub)
  │              │    └─ !user || !isActive → 401 UnauthorizedException
  │              ├─ companyUserRepository.findActiveByUserId(user.id)
  │              │    └─ null → logger.error('MISSING_COMPANY_USER', {userId})
  │              │             → 403 ForbiddenException          ← FAIL CLOSED AND LOUD
  │              └─ req.user = { ...sanitize(user), roles: cu.role, companyId: cu.companyId }
  │
  └─ RolesGuard.canActivate()      ← LOGIC UNCHANGED (doc comment only)
       ├─ !req.user → 403 'Authentication required'   ← the loud wrong-order signal
       └─ can(user.roles, requiredMask)
            │
            └─ handler → order.controller.ts:221 / stock.controller.ts:94 read
                         `user.roles` off the SAME object. ZERO EDITS.
```

`api-idp` mapper correction (§0.3): `userToResponseDto(user: DomainUser)` becomes
`userToResponseDto(user: DomainUser, roles: UserRoleValue)`. Six call sites — `AuthService.signup`
(`auth.service.ts:100`) and `UsersService.{create,list,findById,update,deactivate}`. Each already
has, or can trivially obtain, the `CompanyUser`. `UserResponseDto.roles`/`roleLabels` keep their
exact shape → **no client-visible break** (regression gate: `api-idp/test/auth.e2e-spec.ts:53`
asserts `body.roles === 1`; `users.controller.spec.ts:111,130`).

## 6. `api-idp` signup (D5)

```
AuthService.signup(dto):
  companies = await companyRepository.list()
  company   = resolveSoleCompany(companies)     ← PURE, runs BEFORE any write (A5)
    │ 0 companies → NoCompanyConfiguredError → logger.error('NO_COMPANY_CONFIGURED')
    │              → InternalServerErrorException (500)
    │ >1 companies → AmbiguousCompanyError     → logger.error('AMBIGUOUS_COMPANY')
    │              → ConflictException (409)   ← forces the Invitation flow to be designed
    └ exactly 1  → continue
  user = await userRepository.create(input)                    // no `roles` field anymore
  cu   = await companyUserRepository.create({ userId: user.id, companyId: company.id,
                                              role: USER_ROLES.user, status: ACTIVE })
  return userToResponseDto(user, cu.role)
```

`POST /auth/signup` request/response contracts unchanged. `POST /users` and `PATCH /users/:id`
write `CompanyUser.role` via `create`/`updateRole` against `req.user.companyId`;
`assertNoUnauthorizedAdminGrant` (`users.controller.ts:85-91`) is untouched — it reads
`req.user.roles`, which survives (§0.3).

## 7. Migrations (D7)

Both hand-written, following the precedent of
`20260723030000_add_users_roles_module/migration.sql` (which confirms `gen_random_uuid()` is
core Postgres 13+, no extension, and that ids carry no DB-side default).

### 001 — `..._add_company_and_company_user` (ships WITH the code cutover)

```sql
CREATE TABLE "company" (
    "id" UUID NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true, "schema_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "company_slug_key" ON "company"("slug");

CREATE TYPE "CompanyUserStatus" AS ENUM ('ACTIVE', 'REVOKED', 'SUSPENDED');

CREATE TABLE "company_user" (
    "id" UUID NOT NULL, "user_id" UUID NOT NULL, "company_id" UUID NOT NULL,
    "role" INTEGER NOT NULL,
    "status" "CompanyUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_user_pkey" PRIMARY KEY ("id")
);
-- FK to `company` ONLY. NO FK to `app_user` — soft FK by design (D1).
ALTER TABLE "company_user" ADD CONSTRAINT "company_user_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "company_user_user_id_company_id_key" ON "company_user"("user_id","company_id");
CREATE INDEX "company_user_user_id_idx" ON "company_user"("user_id");

-- Seed the single implicit tenant AND backfill every user in one statement.
-- The outer INSERT joins the CTE's own RETURNING projection (not the base table), which
-- sidesteps the same-snapshot visibility trap documented in the users-roles migration.
-- A data-modifying CTE always runs to completion, so `company` is created even on a
-- fresh DB with zero `app_user` rows (backfill then affects 0 rows — correct no-op).
-- `role` is a VERBATIM bitmask copy so `can()` evaluates bit-for-bit identically.
WITH seeded_company AS (
  INSERT INTO "company" ("id","name","slug","is_active","created_at","updated_at")
  VALUES (gen_random_uuid(), 'Tienda Prueba', 'default', true, now(), now())
  RETURNING "id"
)
INSERT INTO "company_user" ("id","user_id","company_id","role","status","created_at","updated_at")
SELECT gen_random_uuid(), u."id", c."id", u."roles", 'ACTIVE', now(), now()
FROM "app_user" u CROSS JOIN seeded_company c;
```

**Rollback for 001** (before or after deploy, zero data loss — `app_user.roles` untouched):
`DROP TABLE "company_user"; DROP TYPE "CompanyUserStatus"; DROP TABLE "company";`
Or simply revert the code and leave the tables inert.

### Verification gate — MUST pass before 002 is authored or run

`packages/infra-db/scripts/verify-company-user-backfill.ts` (run in CI and manually against
each target DB), asserting all five:

```sql
SELECT
  (SELECT count(*) FROM "company")                                          AS companies,          -- MUST = 1
  (SELECT count(*) FROM "app_user")                                         AS users,
  (SELECT count(*) FROM "company_user")                                     AS company_users,      -- MUST = users
  (SELECT count(*) FROM "app_user" u JOIN "company_user" cu
     ON cu.user_id = u.id AND cu.role <> u.roles)                           AS mismatched_roles,   -- MUST = 0
  (SELECT count(*) FROM "company_user" cu LEFT JOIN "app_user" u
     ON u.id = cu.user_id WHERE u.id IS NULL)                               AS orphans;            -- MUST = 0
```

Exit non-zero on any violation. This is the only thing standing between the safe rollback
regime and the expensive one.

### 002 — `..._drop_app_user_roles` (ships SEPARATELY, after 001 verified)

```sql
ALTER TABLE "app_user" DROP COLUMN "roles";
```

**Rollback for 002** (compensating migration, no data lost — `company_user.role` is
authoritative):

```sql
ALTER TABLE "app_user" ADD COLUMN "roles" INTEGER NOT NULL DEFAULT 1;
UPDATE "app_user" u SET "roles" = cu."role" FROM "company_user" cu WHERE cu."user_id" = u."id";
```

then revert code. 002 must drop **nothing else** — `company_user` staying intact is what
makes this recoverable. Rehearse on a scratch DB before running 002 in any real environment.

## 8. File changes

| File | Action |
|---|---|
| `packages/domain/src/company/{company,company-user,resolve-sole-company,errors,index}.ts` | Create |
| `packages/domain/src/company/{company-,company-user-}repository.port.ts` | Create |
| `packages/domain/src/company/{company,company-user,resolve-sole-company}.test.ts` | Create |
| `packages/domain/src/index.ts` | Modify — export `company/` |
| `packages/domain/src/users/user.ts` (+ `user.test.ts`) | Modify — drop `roles` from `User`/`CreateUserInput`/`createUser` |
| `packages/domain/src/users/roles.ts` | **Unchanged** — reused verbatim |
| `packages/infra-db/prisma/schema.prisma` | Modify — +2 models, +1 enum, −1 column |
| `packages/infra-db/prisma/migrations/{001,002}/migration.sql` | Create |
| `packages/infra-db/scripts/verify-company-user-backfill.ts` | Create |
| `packages/infra-db/src/company/{prisma-company.repository,prisma-company-user.repository,seed}.ts` (+ specs) | Create |
| `packages/infra-db/src/index.ts` | Modify — export company adapters |
| `packages/infra-db/src/users/prisma-user.repository.ts` (+ spec) | Modify — drop `roles` from `UserRow`/`toDomain`/`create`/`update` |
| `packages/infra-db/src/users/seed.ts` (+ spec) | Modify — cockpit roles move to `company_user` |
| `packages/api-common/src/auth/jwt.strategy.ts` (+ spec) | Modify — `SanitizedUser` shape, `CompanyUser` resolution, 403 |
| `packages/api-common/src/auth/roles.guard.ts` (+ spec) | Modify — doc comment + invariant regression assertion; **logic untouched** |
| `apps/api-idp/src/auth/{auth.module,auth.service}.ts` | Modify — bind repo, D5 policy |
| `apps/api-idp/src/auth/mappers/user.mapper.ts` | Modify — `roles` becomes a parameter (§0.3) |
| `apps/api-idp/src/users/{users.module,users.service,users.controller}.ts` (+ specs) | Modify — role writes via `CompanyUser` |
| `apps/api-salesops/src/auth/auth.module.ts` | Modify — bind `COMPANY_USER_REPOSITORY` |
| `apps/api-salesops/src/**/*.controller.ts` (7 files) | **Unchanged** — D4 |
| `apps/api-salesops/src/test-support/auth-test-helpers.ts` | Unchanged or +`companyId` on `SAMPLE_AUTH_USER` |
| `apps/api-salesops/test/support/auth-e2e-helper.ts` | Modify — `createAuthedUser` also seeds `company_user` (single file covers every api-salesops e2e) |
| ~10 `*.spec.ts` cleanup blocks deleting `app_user` | Modify — add `companyUser.deleteMany` (§0.2) |

## 9. Testing strategy — STRICT TDD

Test DB `store_mgmt_test` (`TEST_URL` in `.env`, forced by `jest.setup.js` in `infra-db`,
`api-idp`, `api-salesops`).

**GOTCHA (blocking)**: `api-salesops` resolves `@store-mgmt/domain` via `dist/`. Rebuild
`domain`, `infra-db` and `api-common` **before** any `api-salesops` run, or specs test stale types.

### RED → GREEN (behavior — write the failing test first)

| # | Behavior | Layer | Home |
|---|---|---|---|
| 1 | `resolveSoleCompany`: 1 → returns it; 0 → `NoCompanyConfiguredError`; >1 → `AmbiguousCompanyError` | Unit, pure | `domain/src/company/resolve-sole-company.test.ts` |
| 2 | `createCompanyUser` invariants: role is a non-negative int; `status` defaults `ACTIVE`; `userId`/`companyId` required | Unit, pure | `domain/src/company/company-user.test.ts` |
| 3 | `JwtStrategy.validate` returns `roles` from `CompanyUser.role`, **not** from the `User` row; exposes `companyId` | Unit (mocked repos) | `api-common/.../jwt.strategy.spec.ts` |
| 4 | Missing `CompanyUser` → `ForbiddenException` (403, **not** 401) + logged `MISSING_COMPANY_USER` | Unit | same |
| 5 | `REVOKED`/`SUSPENDED` status treated as missing → 403 | Unit | same |
| 6 | Cache hit skips **both** repositories (one join cached, A7) | Unit | same |
| 7 | `RolesGuard` with no `req.user` → `ForbiddenException('Authentication required')` — **guard-order invariant regression** | Unit | `api-common/.../roles.guard.spec.ts` |
| 8 | `signup` auto-assigns `CompanyUser` role `1`; 0 companies → 500; >1 → 409; response DTO shape unchanged | Unit + e2e | `api-idp/src/auth/*.spec.ts`, `test/auth.e2e-spec.ts` |
| 9 | `POST /users` / `PATCH /users/:id` persist to `company_user.role`, not `app_user` | Integration + e2e | `api-idp/test/users.e2e-spec.ts` |
| 10 | Adapter contracts: `findActiveByUserId`, `create` uniqueness on `(userId, companyId)`, `updateRole`, `listByCompany` | Integration vs `store_mgmt_test` | `infra-db/src/company/*.spec.ts` (mirror `prisma-user.repository.spec.ts`) |
| 11 | Backfill gate: post-001 the 5 assertions of §7 hold | Integration | spec around `verify-company-user-backfill.ts` |

### Mechanical (no RED→GREEN — the compiler and existing suites are the gate)

- Dropping `roles` from `User`/`UserRow`/`toDomain` → every stale reader is a **compile error**
  (this is exactly why 002 exists: a missed reader can never silently return `0`).
- `userToResponseDto` signature change → 6 compile errors; behavior guarded by the
  already-existing `auth.e2e-spec.ts:53` and `users.controller.spec.ts:111,130`.
- `api-salesops` controller sources: zero edits — their **existing** `@Roles()` suites passing
  unchanged IS the D4 verification.
- Test cleanup blocks adding `companyUser.deleteMany`.
- `seed.ts` cockpit accounts.

## 10. Rollout slices (chained PRs, ~400-line budget)

1. **Domain + schema + migration 001 + verification script.** Nothing consumes it yet; the
   app still reads `app_user.roles`. Independently revertible (drop 3 objects).
2. **`api-common` role resolution + `api-idp` writes + module bindings.** The behavioral
   cutover. Rollback = code revert; `app_user.roles` is still populated.
3. **Test fixture migration + migration 002.** Only after slice 2 is verified in the target
   environment and the §7 gate passes.

## 11. Open questions / follow-ups

- [ ] **Doc debt (separate change)**: `docs/system/architecture.md:67,143-152` is stale —
      it lists `infra-db` as "(future)" and the HTTP backend as non-existent while
      `api-idp`/`api-salesops`/`infra-db`/`api-common` are all shipped. Out of scope here.
- [x] `Company` seed name/slug — RESOLVED 2026-07-28. Owner confirmed the name `Tienda Prueba`;
      the slug stays `'default'` (lookup key, not display text). Applied in lockstep to
      `infra-db/src/company/seed.ts` and migration 001's `INSERT`, which changed 001's
      checksum — acceptable because 001 has only ever run against `store_mgmt_test`, never a
      real environment. Any database that already applied the old 001 needs a manual
      `UPDATE "company" SET "name" = 'Tienda Prueba' WHERE "slug" = 'default';` rather than a
      re-run.
- [ ] `UsersService.list()` uses `listByCompany(req.user.companyId)`; `UsersController.list()`
      therefore needs `@Req()`. Confirm during `sdd-tasks` that no other `UsersService` method
      needs the same plumbing.
