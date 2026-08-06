# Design: Users / Roles / Autenticación (backend-users-roles)

> Technical design (the HOW at architectural level) for the owner-LOCKED identity
> module. Faithful encoding of Engram `#1466` (User shape, no `isEmailVerified`),
> `#1470` (Customer 1:1 User, multi-tenant deferred) and the proposal
> (`sdd/backend-users-roles/proposal`). Mirrors the shipped Customer/Ventas
> hexagonal slices and the production reference `poolops-biz/apps/api-idp`.
> This is formalization, not redesign — no locked decision is re-opened here.

## Amendment log (added 2026-08-06 — read this before trusting anything below)

This design is an **archived historical record** of what was decided BEFORE implementation.
The original text below is preserved verbatim; the entries here record where the shipped code
diverged and why. Where the two disagree, **the shipped code and `tasks.md`'s deviation notes
win.** Each divergence was already disclosed in `tasks.md`; this log closes the two
documentation-drift WARNINGs from `verify-report.md`.

| § | Design says | Shipped reality | Superseded by |
|---|---|---|---|
| §1 map, §2 model, §3 migration | `OperadorAlmacen` / `operador-almacen.ts` / `@@map("operador_almacen")` | **`WarehouseOperator`** — `packages/domain/src/users/warehouse-operator.ts`, `warehouse-operator-repository.port.ts` | code/DB-English convention (`tasks.md` Phase 2 deviation note); later formalized by `ventas-english-rename` |
| §2 data model | ONE Prisma schema, `Customer.userId → User` | Schema **split into master + tenant**; `Customer` FKs the tenant-side **`CompanyUser`** (`companyUserId`), never the master `User`. `rg userId packages/domain/src/customer` → 0 hits | `multi-tenant-by-schema` (archived `12a3d4c`) |
| §4 roles bitmask | `User.roles` bitmask on the master user | Bitmask moved to **`CompanyUser.role`** | `company-user-roles-reframe` (archived) |
| §1 map line 69, §6 | Two-guard chain `@UseGuards(JwtAuthGuard, RolesGuard)` | **Three-guard chain** `@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)` on all 10 business controllers — `TenantContextGuard` resolves the tenant `CompanyUser` and raises `MISSING_COMPANY_USER`; `RolesGuard` is guard-order-invariant. See `apps/api-salesops/src/currency/currency.controller.ts:51` | `multi-tenant-by-schema` |
| §5 auth mechanism | `refresh-token.dto.ts`, single `password-reset.dto.ts` | `refresh.dto.ts`; reset DTOs **split** into `password-reset-request.dto.ts` + `password-reset-confirm.dto.ts` (`apps/api-idp/src/auth/dto/`) | `tasks.md` Phase 4 preamble deviation note |
| §2 `email` note | `email: string?`, non-unique, FK-adjacent concern | The master-schema reshape moved `email` off any FK-adjacent concern entirely | `multi-tenant-by-schema` |

Everything else in this document shipped as designed and was re-verified on 2026-08-06
(1022 unit + 98 e2e green). One requirement that appeared in this change's delta spec —
**Self-Service Buyer Authentication Flow** — was never designed, tasked, or built, and is
formally **DEFERRED**; see `specs/salesops-customers/spec.md` and `verify-report.md`.

## 1. Architecture approach

Pattern: **hexagonal shared-kernel** exactly as every shipped module (currency →
ventas). Pure identity domain (entities + `RoleHelpers` + ports + factory + errors)
in `@store-mgmt/domain/src/users`; Prisma adapters + seed in
`@store-mgmt/infra-db/src/users`; delivery split across TWO apps behind a NEW shared
delivery package for the auth kit. Dependency direction stays
`apps → packages(api-common, infra-db) → domain`. The domain imports ports, never
Prisma, never NestJS.

The one genuinely new architectural element is the **delivery split** and its
**shared auth kit** (§7 / ADR-1, ADR-3), because poolops solves cross-app JWT reuse
with `@poolops/api-common` and this repo has no equivalent yet.

### Component / layer map

> **Superseded in part** — `OperadorAlmacen` shipped as `WarehouseOperator`, and the
> `@UseGuards(JwtAuthGuard, RolesGuard)` line below shipped as a three-guard chain.
> See the Amendment log.

```
packages/domain/src/users/                      ← PURE identity core (framework-free)
  user.ts                 User entity + CreateUserInput + createUser factory
  roles.ts                USER_ROLES bitmask + RoleHelpers + permission-union resolver
  operador-almacen.ts     OperadorAlmacen detail entity
  refresh-token.ts        RefreshToken domain model
  password-reset-token.ts PasswordResetToken domain model
  user-repository.port.ts            IUserRepository + USER_REPOSITORY symbol
  refresh-token-repository.port.ts   IRefreshTokenRepository + REFRESH_TOKEN_REPOSITORY
  password-reset-token-repository.port.ts  IPasswordResetTokenRepository + symbol
  operador-almacen-repository.port.ts      IOperadorAlmacenRepository + symbol
  errors.ts               InvalidUserError, DuplicateLoginError
  index.ts                barrel
packages/domain/src/index.ts   ← add `export * from './users/index.js'`; DROP `models/auth.js`

packages/infra-db/prisma/schema.prisma         ← +4 models, +Customer.userId, +Warehouse inverse
packages/infra-db/prisma/migrations/<ts>_add_users_roles_module/migration.sql
packages/infra-db/src/users/
  prisma-user.repository.ts
  prisma-refresh-token.repository.ts
  prisma-password-reset-token.repository.ts
  prisma-operador-almacen.repository.ts
  seed.ts                 seedUsers (cockpit operators) + user backfill helper
packages/infra-db/src/customer/seed.ts          ← modified: each Customer mints/links its User
packages/infra-db/src/index.ts                  ← export the 4 new repos
packages/infra-db/prisma/seed.js                ← call seedUsers before seedCustomers

packages/api-common/  (NEW package — shared backend auth kit; mirrors @poolops/api-common)
  src/auth/jwt.config.ts       SINGLE source of truth for JWT_CONFIG / REFRESH_TOKEN_CONFIG
  src/auth/jwt.strategy.ts     verifies access token, resolves req.user FRESH from IUserRepository
  src/auth/jwt-auth.guard.ts   AuthGuard('jwt')
  src/auth/roles.decorator.ts  @Roles(...bits)
  src/auth/roles.guard.ts      bitmask-union check + admin super-root
  src/index.ts

apps/api-idp/  (NEW app — the ONLY app with LocalStrategy)
  src/main.ts, src/app/app.module.ts
  src/auth/{auth.module,auth.service,auth.controller,local.strategy}.ts
  src/auth/mappers/user.mapper.ts, src/auth/dto/*
  src/users/{users.module,users.service,users.controller}.ts + dto/*   ← admin/owner CRUD

apps/api-salesops/            ← MODIFIED: consumes JWT only
  src/app.module.ts           wire JwtStrategy + RolesGuard + USER_REPOSITORY→PrismaUserRepository
  src/ventas/ventas.controller.ts (+ others)  @UseGuards(JwtAuthGuard, RolesGuard) + @Roles()
```

### Data flow

- **Login (api-idp only):** `POST /auth/login {login,password}` → `LocalStrategy`
  (`usernameField:'login'`) → `AuthService.validateUser(login,password)` →
  `IUserRepository.findByLogin` → check `isActive` → `bcrypt.compare` → issue access
  JWT (`{sub,login}`) + rotating refresh JWT (opaque `rtid` persisted).
- **Protected call (api-salesops):** `Bearer <access>` → `JwtStrategy.validate` verifies
  signature (shared `JWT_SECRET`) → resolves `req.user` FRESH via
  `IUserRepository.findById` (short TTL cache) → `RolesGuard` reads `req.user.roles`,
  applies bitmask union + admin super-root against `@Roles(...)` metadata.
- **Refresh:** `POST /auth/refresh` → verify refresh JWT (`REFRESH_TOKEN_SECRET`) →
  find `rtid` row → reuse-detection + atomic rotation (§5) → new access+refresh pair.

### Integration points

- `OperadorAlmacen.warehouseId` → existing `Warehouse` (adds inverse relation).
- `Customer.userId` (NOT NULL, 1:1) → new `User`; existing rows referenced by
  `Order.customerId` / `SaleCredit.customerId` stay intact (Customer PK unchanged).
- Both apps read the same `JWT_SECRET` env var via `@store-mgmt/api-common` (no drift).

## 2. Data model / Prisma

> **Superseded** — this single-schema model was split into master + tenant schemas by
> `multi-tenant-by-schema`. `Customer` now FKs the tenant `CompanyUser` via
> `companyUserId`, not the master `User`, and the roles bitmask lives on
> `CompanyUser.role`. `OperadorAlmacen` shipped as `WarehouseOperator`. The
> authoritative model is `packages/infra-db/prisma/{master,tenant}/schema.prisma`.
> See the Amendment log.

Conventions: `uuid` PKs `@db.Uuid @default(uuid())`, snake_case `@map`, mutable rows
carry `created_at`+`updated_at`, `Warehouse`-style FK relations. **`User` maps to
table `"app_user"`, NOT `"user"`** — `USER` is a reserved word in Postgres and would
break raw-SQL migrations/seeds exactly like `Order`→`"sales_order"` did (ADR-1).

```prisma
model User {
  id           String   @id @default(uuid()) @db.Uuid
  login        String   @unique                       // access identifier, NOT email
  passwordHash String   @map("password_hash")
  fullName     String   @map("full_name")
  email        String?
  cellPhone    String?  @map("cell_phone")
  isActive     Boolean  @default(true) @map("is_active")
  roles        Int      @default(1)                    // bitmask; default = user(1)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  refreshTokens       RefreshToken[]
  passwordResetTokens PasswordResetToken[]
  operadorAlmacen     OperadorAlmacen?                 // 0..1 detail
  customer            Customer?                        // inverse of 1:1 link

  @@map("app_user")
}

model RefreshToken {
  id        String   @id @default(uuid()) @db.Uuid
  token     String   @unique                          // opaque rtid (crypto.randomBytes hex)
  userId    String   @db.Uuid @map("user_id")
  expiresAt DateTime @map("expires_at")
  isRevoked Boolean  @default(false) @map("is_revoked")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("refresh_token")
}

model PasswordResetToken {
  id        String   @id @default(uuid()) @db.Uuid
  token     String   @unique                          // opaque single-use token
  userId    String   @db.Uuid @map("user_id")
  expiresAt DateTime @map("expires_at")
  isUsed    Boolean  @default(false) @map("is_used")
  createdAt DateTime @default(now()) @map("created_at")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("password_reset_token")
}

model OperadorAlmacen {
  userId      String   @id @db.Uuid @map("user_id")   // PK == FK → 1:1 with User
  warehouseId String   @db.Uuid @map("warehouse_id")  // NOT unique: 1 wh/operator, N operators/wh
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  warehouse Warehouse @relation(fields: [warehouseId], references: [id])
  @@index([warehouseId])
  @@map("operador_almacen")
}

// MODIFIED existing model:
model Customer {
  // ...unchanged fields...
  userId String @unique @db.Uuid @map("user_id")       // NOT NULL, 1:1
  user   User   @relation(fields: [userId], references: [id])
  // ...existing orders/saleCredits inverse relations...
}

// MODIFIED existing model — add inverse only:
model Warehouse {
  // ...unchanged...
  operadores OperadorAlmacen[]
}
```

Notes: `email` is intentionally NOT unique (login is the identity; two family members
could share a contact email). `OperadorAlmacen.warehouseId` deliberately has NO
`@unique`. `RefreshToken.token` is unique (the `findByToken` lookup key), matching
poolops.

## 3. THE migration + backfill (top risk — precise, runnable ordering)

Making `Customer.userId` NOT NULL against existing populated `customer` rows
(referenced by `Order`/`SaleCredit`) is THE risk. It is solved **inside one
migration** with a real, ordered raw-SQL sequence (applied via `prisma migrate
deploy`, the house channel for raw SQL). Ordering:

1. **Create the four new tables** `app_user`, `refresh_token`, `password_reset_token`,
   `operador_almacen` (+ their indexes / FKs). No dependency on `customer` yet.
2. **Add `customer.user_id` as NULLABLE** (`ALTER TABLE "customer" ADD COLUMN
   "user_id" UUID;`). Existing rows now have `user_id = NULL` — allowed, transiently.
3. **Mint one `app_user` per existing customer AND link it, in a single correlated
   statement** so every customer ends up with a unique user:

   ```sql
   WITH new_users AS (
     INSERT INTO "app_user" (id, login, password_hash, full_name, is_active, roles, created_at, updated_at)
     SELECT
       gen_random_uuid(),
       -- deterministic, collision-free login: normalized name + short id fragment
       lower(regexp_replace(c.full_name, '[^a-zA-Z0-9]+', '.', 'g')) || '.' || left(replace(c.id::text,'-',''), 6),
       '!',                                   -- sentinel non-bcrypt hash → login IMPOSSIBLE until reset (see note)
       c.full_name,
       true,
       1,                                     -- roles = user(1)
       now(), now()
     FROM "customer" c
     WHERE c.user_id IS NULL
     RETURNING id, login
   )
   -- correlate back by the same login derivation to set customer.user_id
   UPDATE "customer" c
   SET user_id = u.id
   FROM "app_user" u
   WHERE c.user_id IS NULL
     AND u.login = lower(regexp_replace(c.full_name, '[^a-zA-Z0-9]+', '.', 'g')) || '.' || left(replace(c.id::text,'-',''), 6);
   ```

   The `id` fragment in `login` guarantees uniqueness even for duplicate names.
   `gen_random_uuid()` is core Postgres (13+); no extension needed.
   The `'!'` `password_hash` is NOT a valid bcrypt string, so `bcrypt.compare(pw,'!')`
   never matches → backfilled buyers cannot log in until they set a password via the
   password-reset flow (§5). This is deliberate: we do not fabricate real credentials.
4. **Enforce NOT NULL**: `ALTER TABLE "customer" ALTER COLUMN "user_id" SET NOT NULL;`
   (safe now — every row was backfilled in step 3).
5. **Add the 1:1 constraint + FK**:
   `CREATE UNIQUE INDEX "customer_user_id_key" ON "customer"("user_id");`
   `ALTER TABLE "customer" ADD CONSTRAINT "customer_user_id_fkey" FOREIGN KEY
   ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`

Fresh DBs (no customer rows) run steps 1,2,4,5 as no-ops on empty data — correct.

### Seed changes (dev/demo DB)

- New `seedUsers(prisma)` in `infra-db/src/users/seed.ts`: idempotent upsert (keyed on
  `login`) of the cockpit accounts — `admin` (roles = admin bit), `owner` (owner bit),
  `op.almacen` (operador_almacen bit + an `OperadorAlmacen` row pointing at the first
  seeded warehouse), `op.gestores` (operador_gestores bit). Passwords are a known DEV
  default hashed with bcrypt at seed time (never a plaintext column).
- `seedCustomers` (modified): for each of the 5 demo names, find-or-create a matching
  `app_user` (login = `deriveLogin(fullName)`, bcrypt-hashed dev password, roles=user),
  then create/link the `Customer` with `userId`. Idempotent on both sides. A shared
  `deriveLogin(fullName)` helper keeps seed and migration login-shape consistent.
- `prisma/seed.js` order becomes: products → warehouses → **users** → customers
  (customers depend on users existing; users depend on warehouses for the
  operador_almacen link). Ventas seed already calls `seedCustomers`, so it inherits the
  link with no change.

## 4. Roles bitmask design (pure domain, framework-free)

`packages/domain/src/users/roles.ts`. Bit values (owner-locked role list):

```ts
export const USER_ROLES = {
  user:              1,   // 0b00001 — buyer / base
  operador_almacen:  2,   // 0b00010
  operador_gestores: 4,   // 0b00100
  owner:             8,   // 0b01000 — full business power
  admin:            16,   // 0b10000 — system super-root
} as const;
export type UserRoleValue = number; // stored bitmask
```

`RoleHelpers` (poolops-style, `hasRole = (roles & bit) === bit`):

```ts
hasRole(roles, bit)      // (roles & bit) === bit
addRole(roles, bit)      // roles | bit
removeRole(roles, bit)   // roles & ~bit
getRoles(roles)          // decompose into held single bits
getRoleLabels(roles)     // ['owner','operador_almacen', ...] for DTOs/UI
```

**Permission-union resolver + super-root precedence** — `effectiveRoles(roles)`:

- If `admin` bit set → returns the union of ALL bits (system super-root: everything).
- Else if `owner` bit set → returns union of all BUSINESS bits
  (`user|operador_almacen|operador_gestores|owner`) but NOT `admin` — "full business
  power" per the locked model, so `@Roles(operador_almacen)` also passes for an owner.
- Else → the held bits unchanged.

Authz predicate used by the guard: `can(roles, requiredMask) =
(effectiveRoles(roles) & requiredMask) !== 0` (UNION semantics — holding ANY required
role grants). Fine-grained per-permission sets are a documented upgrade path but OUT
of scope (owner is coarse now). All of this is pure, unit-tested RED→GREEN; no NestJS
import in the domain.

## 5. Auth mechanism (mirror poolops api-idp near-verbatim)

> **Superseded in part** — DTO filenames shipped as `refresh.dto.ts` (not
> `refresh-token.dto.ts`) and the password-reset DTO was split into
> `password-reset-request.dto.ts` + `password-reset-confirm.dto.ts`. The mechanism
> itself (rotation, reuse detection) shipped as designed. See the Amendment log.

- **Hashing:** `bcrypt`, `saltRounds = 10` (poolops `auth.service.ts:153,316,843`).
  Hashing runs in `AuthService` (app edge), never in the domain; `createUser` only
  asserts the invariant (§ below).
- **Access token:** HS256, secret `JWT_SECRET`, `expiresIn = ACCESS_TOKEN_EXPIRES_IN`
  (default `15m`). Minimal payload `{ sub: user.id, login: user.login }` — NO roles
  baked in (ADR-2).
- **Refresh token:** HS256, secret `REFRESH_TOKEN_SECRET`, `expiresIn` default `7d`,
  payload `{ sub, type:'refresh', rtid }` where `rtid = crypto.randomBytes(32).hex`.
  A `refresh_token` row `{token: rtid, userId, expiresAt, isRevoked}` is persisted.
- **Rotation + reuse-detection** — copied from poolops
  `auth.service.ts:refreshAccessToken` (lines 496–587), verbatim algorithm:
  1. verify refresh JWT (`REFRESH_TOKEN_CONFIG`); reject wrong `type`/missing
     `sub`/`rtid`.
  2. `findByToken(rtid)`; reject if missing or `userId !== sub`.
  3. **Reuse detection (expiry-independent):** if `stored.isRevoked` →
     `revokeByUserId(sub)` (revoke the whole family) and reject — replay of a rotated
     token signals theft.
  4. if `expiresAt < now` → reject (live-but-expired = plain invalid).
  5. load user; reject if missing/inactive.
  6. **Atomic rotation:** `revokeIfActive(stored.id)`; if it returns `0` a concurrent
     request already rotated it (race/reuse) → `revokeByUserId(sub)` + reject.
  7. issue a fresh access + fresh refresh (new `rtid`).
- **change-password** (poolops `291–353`): verify current via `bcrypt.compare`, hash
  new, `update`, then `refreshTokenRepository.revokeByUserId(userId)` — every existing
  session dies. (Access tokens are stateless; they die within their ≤15m TTL, and
  JwtStrategy's per-request `isActive`/existence check bounds it further, ADR-2.)
- **password reset** (poolops `660–925`): `initiatePasswordReset(login-or-email)` →
  revoke prior unused reset tokens, mint opaque `randomBytes(32)` token, 15-min expiry,
  persist; `resetPassword(token,newPassword)` → validate not-expired/not-used, hash,
  update, `markAsUsed`, `revokeByUserId` (kill sessions). Single-use + enumeration-safe
  generic responses.
  - **Email delivery is deferred** (this repo has no `EmailService`; poolops injects
    `@poolops/api-common`'s). The reset token is returned in the API response (dev) /
    logged; actual email dispatch is a NON-GOAL here, consistent with email-verification
    being dropped. This is the only intentional divergence from poolops's flow.

Port method signatures (mirror poolops `refresh-token.repository.ts`):
`IRefreshTokenRepository`: `create`, `findByToken`, `revokeIfActive(id):number`,
`revokeByUserId(userId):number`, `deleteExpired():number`.
`IPasswordResetTokenRepository`: `create`, `findByToken`, `markAsUsed(id)`,
`revokeByUserId(userId)`, `deleteExpired():number`.

### `createUser` factory invariant (domain edge)

`createUser(input)` mints a `User` (mirrors `createCustomer`): defaults `id`
(`randomUUID`), `isActive=true`, `roles = input.roles ?? USER_ROLES.user`,
timestamps. Invariants (throw `InvalidUserError`, never silently accept):
`login` non-empty/non-whitespace; `fullName` non-empty; **`passwordHash` present and
bcrypt-shaped** (`/^\$2[aby]\$/`) — the "never store plaintext" guarantee at the domain
boundary. Uniqueness of `login` is enforced by the DB unique index and surfaces as
`DuplicateLoginError` (P2002 translation in the repo, mirroring
`DuplicateCustomerDocumentError`).

## 6. @Roles() / RolesGuard (net-new — poolops has none)

> **Superseded in part** — the shipped chain is THREE guards,
> `JwtAuthGuard → TenantContextGuard → RolesGuard`. `TenantContextGuard` (added by
> `multi-tenant-by-schema`) resolves the tenant `CompanyUser` and raises
> `MISSING_COMPANY_USER`; `RolesGuard` then reads the role from that `CompanyUser`, not
> from `req.user.roles`, and is guard-order-invariant. See the Amendment log.

Lives in `@store-mgmt/api-common` so BOTH apps share ONE implementation.

- **`@Roles(...bits: UserRoleValue[])`** — `SetMetadata(ROLES_KEY, bits)`; a route with
  no decorator = any authenticated user.
- **`JwtAuthGuard`** — `AuthGuard('jwt')`; runs `JwtStrategy` first to populate
  `req.user`.
- **`JwtStrategy.validate(payload)`** — verifies signature, then resolves the user
  FRESH: `IUserRepository.findById(payload.sub)`; reject if missing or `!isActive`;
  strips `passwordHash`; returns `{ id, login, fullName, roles, ... }` → becomes
  `req.user`. A short TTL cache (~30s, poolops `jwt.strategy.ts:22`) bounds DB load
  without materially staling authz.
- **`RolesGuard.canActivate(ctx)`** — reads `ROLES_KEY` metadata; if none → allow;
  reads `req.user.roles`; **admin short-circuit** (`RoleHelpers.hasRole(roles, admin)`
  → allow); else `can(roles, requiredMask)` via the §4 union resolver (which also lets
  `owner` satisfy business roles); else `ForbiddenException`.

`req.user` population source: `JwtStrategy` → `IUserRepository.findById` (NOT
`findByLogin` — the access token carries `sub`=id). `findByLogin` is used only by
`LocalStrategy`/`validateUser` at login time.

**Role resolution is per-request/fresh, NOT baked in the token (ADR-2).**

## 7. ADRs (the real forks)

### ADR-1 — Domain folder `users`, app `api-idp`, table `app_user`
- **Decision:** domain subfolder `packages/domain/src/users/`; the new NestJS app is
  `apps/api-idp`; the Prisma `User` model maps to table **`app_user`**.
- **Rationale:** `users` matches the proposal/`#1466` naming and the screaming
  per-concept convention (`customer/`, `ventas/`). `api-idp` mirrors the production
  reference `poolops-biz/apps/api-idp` and signals the isolation seam for a future
  master-schema move. `app_user` because `USER` is a Postgres reserved word — the repo
  already renamed `Order`→`"sales_order"` for the same reason; raw-SQL migrations/seeds
  here depend on it.
- **Rejected:** `identity/` folder (less consistent with existing concept folders);
  table `"user"` (reserved-word landmine in raw SQL); adding auth into `api-salesops`
  (kills the isolation seam and forces LocalStrategy into the consumer app).

### ADR-2 — Roles resolved fresh per-request, NOT baked into the access token
- **Decision:** the access token carries only `{sub, login}`; `req.user.roles` is
  resolved per request by `JwtStrategy` via `IUserRepository.findById` (short TTL
  cache). RolesGuard reads that fresh value.
- **Rationale:** role grants/revocations and user deactivation must take effect within
  seconds, not wait out the token TTL; a short access-token lifetime protects against
  theft, it is NOT an authz-freshness mechanism. api-salesops already imports
  `infra-db`, so per-request lookup adds NO new coupling for the consumer. Matches
  poolops (`jwt.strategy.ts`).
- **Rejected:** roles-in-token (stateless, zero DB read on the consumer) — rejected
  because a deactivated/demoted operator would retain access for up to the full access
  TTL, unacceptable for a cockpit that must be able to cut access immediately.

### ADR-3 — Shared auth kit lives in a NEW `packages/api-common`
- **Decision:** `jwt.config.ts`, `JwtStrategy`, `JwtAuthGuard`, `@Roles`, `RolesGuard`
  live in a new package `@store-mgmt/api-common`, consumed by both `api-idp` and
  `api-salesops`.
- **Rationale:** both apps must verify tokens and enforce roles identically; the
  architecture doc forbids app→app imports, so the shared code cannot live in
  `api-idp`. A shared reusable library is, by the "Packages vs Apps" table, a package —
  the same slot `web-common` occupies for the frontend. One implementation = zero
  drift, which is the stated top mitigation for the two-app JWT risk. Mirrors
  `@poolops/api-common`.
- **Rejected:** duplicating the ~5 small files in each app (guaranteed to drift, and
  the reason poolops centralized it); putting the kit in `infra-db` (persistence
  package, not a delivery/NestJS-passport home); putting it in `domain` (would force a
  framework dependency into the pure kernel — forbidden by `backend-boundaries`).
- **Follow-through:** extend `backend-boundaries.config.js` so `api-common` is treated
  as backend-only for web apps, and so `domain` still cannot import it.

### ADR-4 — JWT secret: symmetric HS256 via `JWT_SECRET` env var as single source
- **Decision:** HS256 symmetric secret. `JWT_CONFIG`/`REFRESH_TOKEN_CONFIG` in
  `api-common/src/auth/jwt.config.ts` read `process.env.JWT_SECRET` /
  `REFRESH_TOKEN_SECRET` (with `ACCESS_TOKEN_EXPIRES_IN`/`REFRESH_TOKEN_EXPIRES_IN`).
  Both apps import that ONE module, so signer (api-idp) and verifier (api-salesops)
  can never diverge. The env var is the contract; the shared module removes code drift.
- **Rationale:** simplest correct choice for two trusted first-party services; no key
  distribution/rotation infra needed for single-tenant MVP; mirrors poolops
  `jwt.config.ts`.
- **Rejected:** asymmetric RS256 (public/private) — real benefit only when verifiers
  are untrusted/third-party; unnecessary infra here. Per-app duplicated config files —
  drift risk (the exact failure ADR-3 exists to prevent).

### ADR-5 — Backfill login/password derivation for existing customers
- **Decision:** `login = normalize(full_name) + '.' + left(hex(id),6)`;
  `password_hash = '!'` (a deliberately invalid, un-matchable bcrypt sentinel).
- **Rationale:** the id fragment makes login collision-free even for duplicate names
  without an app round-trip; the sentinel hash lets us satisfy NOT NULL + the 1:1 FK
  today while making these accounts un-loginnable until the buyer sets a password via
  the reset flow — we never fabricate working credentials. The identical
  `deriveLogin()` is reused by the demo seed for idempotent consistency.
- **Rejected:** computing a real bcrypt hash in-migration (bcrypt is not available in
  SQL); a shared constant real password (insecure — every backfilled account would
  share known credentials); email as login (owner locked login≠email, and `email` is
  optional so many rows have none).

## 8. Explicit NON-GOALS (deferred — additive later, zero rework)

- **Multi-tenant-by-schema** (`Company`/`Membership`/tenant-context/schema-routing):
  a connection/infra concern; business tables unchanged (`#1470`). The isolated
  `api-idp` app is precisely the seam that lets identity move to a master schema later.
- **`gestor` role** → future Gestores+Comisiones module (additive bit).
- **Fine-grained owner-finance permissions** — owner is coarse full-business now.
- **Email verification** (`isEmailVerified` removed by owner) AND **transactional email
  delivery** (no `EmailService` in this repo; reset token surfaced via response/log).
- **Wiring actor-tracking into `Order`** (no `createdBy`/`verifiedBy`);
  `StockMovement.createdBy` stays a free nullable string.

## 9. Risks / assumptions to validate

- Backfill correctness on a NON-empty prod `customer` table is the highest risk — the
  CTE mint-and-link must be verified against real rows (duplicate names, odd
  characters) before `SET NOT NULL`. Assumption: Postgres ≥13 for `gen_random_uuid()`.
- `api-common` as a NEW package touches workspace wiring (pnpm/turbo, tsconfig,
  `backend-boundaries`) — a slightly larger blast radius than a pure in-`infra-db`
  change; confirm the boundary lint update lands with it.
- Per-request role resolution assumes `api-salesops` keeps `infra-db` + a wired
  `USER_REPOSITORY`; the short TTL cache is an accepted authz-staleness bound (~30s).
- Sentinel `'!'` password: confirm `bcrypt.compare(pw,'!')` resolves `false` (not
  throw) in the installed bcrypt version; `validateUser` catches either way, but the
  clean path is `false`.
- The domain `passwordHash` bcrypt-shape invariant (`/^\$2[aby]\$/`) assumes the app
  always hashes with bcrypt — true for api-idp; seed/migration paths use the sentinel,
  which is set at the SQL layer (bypasses the factory), so no conflict.
```
