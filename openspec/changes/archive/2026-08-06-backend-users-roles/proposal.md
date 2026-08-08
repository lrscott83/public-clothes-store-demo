# Proposal: Users / Roles / Autenticación — isolated identity module (api-idp pattern)

## Intent

Users/Roles/Acceso is the **CAPA BASE** transversal module the salesops backend has
been deferring (`docs/plans/estrategia-backend-por-modulos.md`). Today the domain's
only "user" is `packages/domain/src/models/auth.ts` — a pre-hexagonal placeholder with
plaintext `password`, `storeId`/`moduleId`/`featureIds` concepts foreign to this domain,
re-exported from the barrel but consumed by nothing. It is throwaway scaffolding.

This change builds a **real identity module**: a `User` entity (login + credentials +
bitmask roles), an **api-idp-style auth mechanism** (JWT access + DB-backed rotating
refresh, bcrypt), pure `RoleHelpers`, an `@Roles()`/`RolesGuard` enforcement layer, and
the persistence + delivery to wire it — mirroring the shipped Customer/Ventas slices
end-to-end (pure domain behind ports → Prisma → thin REST → seed) and mirroring the
production reference `poolops-biz/apps/api-idp`. It lands **single-tenant**, but auth is
built **ISOLATED** (its own app/module) so identity can later move to a master schema
without touching business tables. The model is owner-LOCKED (Engram
`sdd/backend-users-roles/idp-pattern` #1466, `architecture/multi-tenant-by-schema` #1470);
this proposal formalizes it, it does not re-open it.

## Scope

### In Scope
- **Domain** (`@store-mgmt/domain/src/users`): fresh module mirroring `customer/`.
  - **`User`** identity+credentials entity: `id`, `login` (**UNIQUE, REQUIRED** — the
    access identifier, NOT the email), `passwordHash`, `fullName`, `email` (optional),
    `cellPhone` (optional), `isActive`, `roles` (**Int BITMASK**), `createdAt`,
    `updatedAt`. **NO `isEmailVerified`**. Auth = `login` + password (diverges from
    poolops which logs in by email).
  - **`createUser` factory** with a password-hash invariant (never stores plaintext —
    consistent with `customer.ts` importing `node:crypto` directly), unique-`login`
    contract, `InvalidUserError`.
  - **Roles = BITMASK, multi-role per user**: `user | operador_almacen |
    operador_gestores | owner | admin`. Effective permissions = **UNION** of held roles.
    `admin` = system super-root (everything); `owner` = full power within the business
    (manages its users, sees finances/dashboards). Pure **`RoleHelpers`**
    (`hasRole`/`addRole`/`removeRole`/`getRoles`/`getRoleLabels`), poolops-style, in the
    domain package.
  - **`OperadorAlmacen`** detail entity: `userId` (PK/FK), `warehouseId` — **1 warehouse
    per operator, N operators per warehouse** (`warehouseId` NOT unique). Roles without
    extra data (`user`/`owner`/`admin`/`operador_gestores`) get **no** detail table.
  - **Refresh + reset token** domain models + ports: `IUserRepository`,
    `IRefreshTokenRepository` (create/findByToken/revokeIfActive/revokeByUserId/
    deleteExpired), `IPasswordResetTokenRepository`, `*_REPOSITORY` Symbols, barrel.
- **Auth mechanism (mirror api-idp)**: JWT **access** (short-lived) + **refresh**
  (longer) carrying an opaque DB-backed `rtid` → **rotation on use + reuse-detection**
  (replaying a revoked token revokes the whole family). `bcrypt` hashing. `login`+password
  login; **change-password revokes all refresh tokens**; password-reset flow (opaque
  token, single-use, expiry). Consumers verify the JWT **locally** with a shared secret.
- **Enforcement (WE build, poolops didn't)**: generic **`@Roles()`** decorator +
  **`RolesGuard`** reading `request.user` roles (bitmask union), plus a `JwtStrategy`.
  Needed because one app serves multiple roles.
- **Customer ↔ User = 1:1**: add **`Customer.userId` NOT NULL** FK (every customer has a
  login). Customer stays the buyer's commercial party; User is identity.
- **Persistence** (`infra-db`): Prisma `User`/`RefreshToken`/`PasswordResetToken`/
  `OperadorAlmacen` models + repositories + additive migration + seed (admin + owner +
  demo operators; **backfill a User for every existing Customer**).
- **Delivery**: a **new isolated `apps/api-idp`** NestJS app (mirrors poolops api-idp):
  `AuthModule` (login/refresh/change-password/reset/profile) + `UsersModule` CRUD.
  Shared JWT config so `api-salesops` verifies tokens locally and applies `RolesGuard`.
- Legacy `packages/domain/src/models/auth.ts` is **replaced** (drop the dead export).

### Out of Scope (DEFERRED — additive later, zero rework)
- **Multi-tenant-by-schema machinery**: no `Company`/`Membership`/tenant-context/
  schema-routing now. It's a connection/infra concern (route PrismaClient to the tenant
  schema); business tables don't change, so deferring costs nothing. Auth built isolated
  precisely so identity can later move to a master schema.
- **`gestor` role** → future Gestores+Comisiones module (additive bit later).
- **Fine-grained owner-finance permissions** (owner is coarse full-business power now).
- **Email verification** (`isEmailVerified` removed by owner).
- **Wiring actor-tracking into `Order`** (no `createdBy`/`verifiedBy` on Order yet);
  `StockMovement.createdBy` stays a free nullable string until a later change.

## Capabilities

### New Capabilities
- `salesops-identity`: `User` identity+credentials entity with `login`-based auth and an
  **Int bitmask** `roles` field (`user`/`operador_almacen`/`operador_gestores`/`owner`/
  `admin`, permissions = union), pure `RoleHelpers`, `OperadorAlmacen` detail
  (userId PK/FK + non-unique warehouseId), the api-idp auth mechanism (JWT access +
  rotating/reuse-detecting DB-backed refresh, bcrypt, change-password, password reset),
  `@Roles()`/`RolesGuard` enforcement, Prisma persistence, an isolated `api-idp` app, and
  a demo seed. Distinct from `salesops-customers`, `salesops-ventas`, `salesops-inventory`,
  `salesops-products`, `salesops-currency`.

### Modified Capabilities
- `salesops-customers`: requirement-level change — every `Customer` MUST reference a
  `User` via a **NOT NULL `userId`** 1:1 FK (was standalone master data). Customer keeps
  its commercial-party fields; identity moves to `User`.

## Locked Model Summary (do NOT re-open — encode faithfully)

| Piece | Decision |
|---|---|
| Tenancy | **Single-tenant now**; multi-tenant-by-schema deferred; auth built ISOLATED |
| `User` | `id, login (UNIQUE/REQUIRED), passwordHash, fullName, email?, cellPhone?, isActive, roles (Int bitmask), createdAt, updatedAt` — no `isEmailVerified` |
| Auth | `login` + password (NOT email); bcrypt; JWT access + rotating DB-backed refresh w/ reuse-detection; change-password revokes refresh; password reset |
| Roles | Bitmask `user\|operador_almacen\|operador_gestores\|owner\|admin`, multi-role, perms = UNION; `admin`=super-root, `owner`=full business power |
| Detail table | `OperadorAlmacen(userId PK/FK, warehouseId non-unique)`; other roles → no table |
| Customer link | `Customer.userId` **NOT NULL**, 1:1 |
| Enforcement | `@Roles()` + `RolesGuard` reading `request.user` roles |

## Hexagonal Placement

| Piece | Layer / path |
|---|---|
| `User`, `RoleHelpers`, `OperadorAlmacen`, token models, ports, errors, `createUser` | **domain** — `packages/domain/src/users/` |
| Barrel export | `packages/domain/src/index.ts` — add `export * from './users/index.js'`, drop `models/auth.js` |
| `PrismaUserRepository`/`PrismaRefreshTokenRepository`/`PrismaPasswordResetTokenRepository`, seed | **infra-db** — `packages/infra-db/src/users/` |
| Prisma models + migration | `packages/infra-db/prisma/schema.prisma` (+ `Customer.userId`) |
| `AuthModule`/`UsersModule`, `JwtStrategy`, `@Roles()`/`RolesGuard`, DTOs, e2e | **new app** — `apps/api-idp/` |
| Shared JWT verify + `RolesGuard` reuse | consumed by `apps/api-salesops` (verifies token locally) |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `packages/domain/src/users/` | New | `User` + `RoleHelpers` + `OperadorAlmacen` + token models + ports + errors + `createUser` + tests + barrel |
| `packages/domain/src/index.ts` | Modified | Export `users`; remove dead `models/auth.js` export |
| `packages/domain/src/models/auth.ts` | Removed | Legacy plaintext placeholder deleted |
| `packages/infra-db/prisma/schema.prisma` | Modified | New `User`/`RefreshToken`/`PasswordResetToken`/`OperadorAlmacen` models + `Customer.userId` NOT NULL FK + `Warehouse` inverse relation + additive migration |
| `packages/infra-db/src/users/` | New | Repositories + seed (admin/owner/operators + Customer backfill) |
| `packages/infra-db/src/customer/` | Modified | Repository + seed now set/require `userId` |
| `apps/api-idp/` | New | Isolated NestJS app: auth + users REST + guard + e2e |
| `apps/api-salesops/` | Modified | Wire `JwtStrategy` + `RolesGuard` (shared secret) to gate operator actions |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `Customer.userId` NOT NULL breaks existing populated `customer` rows / seed | High | Same-migration backfill: mint a `User` per existing Customer; seed order Users→Customers; migration creates users before adding the NOT NULL constraint |
| Refresh-token reuse / replay after theft | Med | DB-backed `rtid`, rotate-on-use, `revokeIfActive` race guard, revoke-family on revoked-token replay (mirrors api-idp `refreshAccessToken`) |
| Plaintext password leaks into domain/logs | Med | `createUser` password-hash invariant (never store plaintext); bcrypt at the app edge; no password in DTOs/logs |
| `RolesGuard` mis-reads bitmask union → privilege escalation | Med | Pure `RoleHelpers.hasRole` unit-tested (RED→GREEN); guard tests for admin-superroot, owner, multi-role union, and deny paths |
| Multi-tenant leak into this build (Company/Membership creep) | Med | Explicit out-of-scope; isolated app is the seam so tenancy is additive later |
| Two apps drift on JWT secret/config | Med | Single shared JWT config/secret source; e2e asserts `api-salesops` accepts an `api-idp`-issued token |
| Boundary leak (domain → infra/framework) | Low | `backend-boundaries` lint `--max-warnings 0`, mirroring Customer/Ventas |

## Rollback Plan

Self-contained on the change branch: revert the branch. Prisma models are additive — drop
the migration; the only edit to shipped tables is `Customer.userId` (drop the column + FK
and the backfill in one revert). The new `apps/api-idp` is isolated (deleting it leaves
`api-salesops` running, minus the guard wiring, which is a separate revertible edit).
Restoring `models/auth.ts` is a one-file revert. Customer/Ventas/Inventory/Product/Currency
domains stay intact.

## Dependencies

- Shipped Customer slice as the reference hexagonal impl and as the aggregate gaining
  `userId`; `Warehouse` (referenced by `OperadorAlmacen.warehouseId`).
- Reference implementation to mirror: `poolops-biz/apps/api-idp/*` (auth mechanism) and
  `poolops-biz` `RoleHelpers` bitmask pattern.
- `bcrypt` + `@nestjs/jwt`/passport in the new app.
- Backend base scaffold (`api-salesops`, `infra-db`, docker Postgres).

## Success Criteria

- [ ] `User` + `createUser` invariants (unique `login`, never-plaintext hash) pass TDD.
- [ ] `RoleHelpers` bitmask union verified: `admin` super-root, `owner`, multi-role, deny.
- [ ] `OperadorAlmacen` persists 1-warehouse-per-operator, N-operators-per-warehouse.
- [ ] Auth: `login`+password login; refresh rotates + reuse-detects (family revoke);
      change-password revokes refresh; password reset single-use — e2e against Postgres.
- [ ] `@Roles()`/`RolesGuard` gate a protected route; `api-salesops` accepts an
      `api-idp`-issued JWT via shared secret.
- [ ] `Customer.userId` NOT NULL FK live; existing customers backfilled 1:1; seed idempotent.
- [ ] `models/auth.ts` removed; domain imports ports, never Prisma; `backend-boundaries` green.
