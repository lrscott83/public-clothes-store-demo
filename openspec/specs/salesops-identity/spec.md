# Spec — salesops-identity

## Purpose

Define identity, authentication and authorization for the multi-tenant topology: the
master-side `User` entity, the role bitmask with union permissions (resolved on the
tenant-side `CompanyUser`), the JWT auth mechanism with refresh rotation and reuse
detection, tenant resolution through the guard chain, and `@Roles()` enforcement.

> **Reconstructed 2026-08-06.** This file previously held ONLY
> `multi-tenant-by-schema`'s amendment delta, copied verbatim — the amendment had
> REPLACED the base spec instead of being merged into it, silently dropping five
> requirements from the live contract. It has been rebuilt by replaying every delta
> in chronological order (`backend-users-roles` → `company-user-roles-reframe` →
> `sales-agents-commissions` → `multi-tenant-by-schema`), later change winning per
> requirement. Every requirement body below is copied verbatim from its source
> delta; nothing was re-authored. Provenance is recorded per requirement.

## Requirements

### Requirement: User Identity Entity

The system MUST persist a `User` entity where `login` is the UNIQUE, REQUIRED
authentication identifier — NEVER `email`. `email` and `cellPhone` are
OPTIONAL. `passwordHash` MUST never store plaintext. No email-verification
field exists. `roles` is NO LONGER a field of `User` — authorization now
lives on `CompanyUser.role` (see `salesops-companies`).

| Field | Type | Constraint |
|---|---|---|
| id | UUID | PK |
| login | string | UNIQUE, required — auth identifier |
| passwordHash | string | required, never plaintext |
| fullName | string | required |
| email | string \| null | optional |
| cellPhone | string \| null | optional |
| isActive | boolean | default true |
| createdAt / updatedAt | datetime | audit |

(Previously: included a `roles Int bitmask` field directly on `User`; that
field moves to `CompanyUser.role`.)

#### Scenario: User created with only login and password

- GIVEN a valid unique `login`, password, and `fullName`, with no
  `email`/`cellPhone`
- WHEN the user is created
- THEN it persists and `email`/`cellPhone` resolve to `null`

#### Scenario: Duplicate login rejected

- GIVEN an existing user with `login="jdoe"`
- WHEN a second user is created with `login="jdoe"`
- THEN the system MUST reject it with a named error — never silently
  overwrite or accept it

#### Scenario: Password never stored as plaintext

- GIVEN a user-creation payload carrying a plaintext password
- WHEN the user is persisted
- THEN only `passwordHash` is stored — no plaintext password field exists
  anywhere on the entity

#### Scenario: No email-verification field exists

- GIVEN the `User` entity fields
- WHEN inspected
- THEN no `isEmailVerified` (or equivalent) field exists

#### Scenario: No roles field on User

- GIVEN the `User` entity fields after this change
- WHEN inspected
- THEN no `roles` field exists on `User` — it lives only on `CompanyUser`

*(Source of record: `company-user-roles-reframe` delta spec — the last change to modify this requirement.)*

### Requirement: Bitmask Multi-Role with Union Permissions

The effective role bitmask MUST support simultaneous multi-role membership:
`user | operador_almacen | operador_gestores | sales_agent | owner | admin`,
sourced from `CompanyUser.role`. Effective permissions MUST be the UNION of
all held bits. `admin` is the system super-root. `owner` holds full business
power and MUST implicitly hold `sales_agent` via `BUSINESS_ROLES_MASK` (D8)
— never as an explicit bit stored on `owner`'s own row, only through the
effective-roles union. A bitmask value of `0` MUST be a valid state meaning
zero permissions — not an error.

(Previously: enumeration was `user | operador_almacen | operador_gestores |
owner | admin`, with no `sales_agent` bit and no mention of its inheritance
by `owner`.)

#### Scenario: hasRole checks a single bit

- GIVEN a `CompanyUser.role` of `operador_almacen | owner`
- WHEN `hasRole(user, 'owner')` is evaluated
- THEN it returns `true`; `hasRole(user, 'admin')` returns `false`

#### Scenario: A user can hold multiple roles at once

- GIVEN a `CompanyUser` assigned both `operador_almacen` and
  `operador_gestores`
- WHEN roles are added via `addRole`
- THEN both bits are set on `CompanyUser.role` and `getRoles` returns both

#### Scenario: removeRole clears only the targeted bit

- GIVEN a `CompanyUser.role` of `operador_almacen | owner`
- WHEN `removeRole(user, 'operador_almacen')` runs
- THEN only that bit clears; `owner` remains held

#### Scenario: Effective permission is the union of held roles

- GIVEN a `CompanyUser.role` of `operador_almacen | operador_gestores`
- WHEN checked against any permission granted by either role
- THEN access is granted

#### Scenario: admin is super-root regardless of other bits

- GIVEN a `CompanyUser.role` of only `admin`
- WHEN checked against ANY role requirement
- THEN access is granted

#### Scenario: Role bitmask of 0 denies every specific check but is not an error

- GIVEN a `CompanyUser.role` of `0`
- WHEN any `hasRole` check runs
- THEN every check returns `false` and every `@Roles(...)`-guarded endpoint
  returns `403` — a valid zero-permission account, not a
  `MISSING_COMPANY_USER` failure

#### Scenario: owner implicitly holds sales_agent without an explicit bit

- GIVEN a `CompanyUser.role` of only `owner`
- WHEN `hasRole` is evaluated against the EFFECTIVE role mask
- THEN `sales_agent` resolves as held — without `sales_agent` ever being set
  as an explicit bit on that row

*(Source of record: `sales-agents-commissions` delta spec — the last change to modify this requirement.)*

### Requirement: Authentication Mechanism (mirrors api-idp)

Login MUST be `login` + password, verified via `bcrypt`. On success the system MUST
issue a short-lived JWT **access** token and a longer-lived **refresh** token backed by
an opaque, DB-persisted `rtid`. Refresh MUST rotate the `rtid` on every use and MUST
detect reuse: replaying an already-rotated (revoked) refresh token MUST revoke the
entire token family. `change-password` MUST revoke all of a user's refresh tokens.
Password-reset MUST use a single-use, expiring token. Consumers (other apps) MUST
verify the access JWT locally via a shared secret — no round-trip to the issuing app.

#### Scenario: Correct login+password issues access and refresh tokens

- GIVEN a valid `login` and matching password
- WHEN authentication runs
- THEN it returns a JWT access token and a refresh token, and `bcrypt` verification
  succeeded

#### Scenario: Wrong password rejected

- GIVEN a valid `login` and an incorrect password
- WHEN authentication runs
- THEN it is rejected with a named auth error — no token is issued

#### Scenario: Unknown login rejected

- GIVEN a `login` with no matching user
- WHEN authentication runs
- THEN it is rejected with the same class of error as wrong-password (no
  user-enumeration leak)

#### Scenario: Refresh rotates the token

- GIVEN a valid, unused refresh token
- WHEN it is used to refresh
- THEN a NEW access token and a NEW refresh `rtid` are issued, and the old `rtid` is
  marked used/rotated

#### Scenario: Replaying a rotated refresh token revokes the family

- GIVEN a refresh token that was already rotated (superseded by a newer one)
- WHEN it is replayed
- THEN the system detects reuse and revokes the ENTIRE token family — the newest
  rotated token is also invalidated

#### Scenario: change-password revokes all refresh tokens

- GIVEN a user with one or more active refresh tokens
- WHEN that user changes their password
- THEN every refresh token for that user is revoked

#### Scenario: Password reset token is single-use

- GIVEN a valid password-reset token
- WHEN it is used to set a new password
- THEN the token MUST NOT be usable again — a second attempt is rejected

#### Scenario: Consumers verify tokens locally

- GIVEN an access JWT issued by the identity module
- WHEN another app (e.g. `api-salesops`) receives it
- THEN it verifies the signature locally with the shared secret — no call back to the
  issuing app is required

*(Source of record: `backend-users-roles` delta spec — the last change to modify this requirement.)*

### Requirement: Role Resolution at Authentication Time

`JwtStrategy.validate()` MUST resolve ONLY master-side data —
`{ id, login, isActive, isSuperadmin }` — and MUST NOT resolve
`CompanyUser` or any role bitmask; the table it currently reads lives in a
tenant schema whose identity is not yet known when Passport runs. Role/company
resolution moves to `TenantContextGuard` (see `salesops-tenancy`), which MUST
populate `req.user.roles`/`companyId`/`companyUserId` after `JwtAuthGuard`
runs. `SanitizedUser` MUST keep the field name `roles`. An authenticated user
with no ACTIVE `Membership` or no matching tenant `CompanyUser` MUST still be
rejected with a distinct, logged `403` — never a silent `roles: 0` — but that
rejection now originates in `TenantContextGuard`, not `JwtStrategy`.

(Previously: `JwtStrategy.validate()` resolved only `{ id, login, isActive }`;
this change adds `isSuperadmin` to that master-side set so platform gating can
run on `JwtAuthGuard` alone. Login response semantics are UNCHANGED: it returns
access + refresh tokens only, never `isSuperadmin`.)

#### Scenario: JwtStrategy output carries no roles or companyId but does carry isSuperadmin

- GIVEN a valid access token for a user with `isSuperadmin=true`
- WHEN `JwtAuthGuard` runs (before `TenantContextGuard`)
- THEN `req.user` has `{ id, login, isActive, isSuperadmin: true }` and no
  `roles`/`companyId`/`companyUserId` field yet

#### Scenario: Login response exposes tokens, not the flag

- GIVEN a valid login+password for a superadmin
- WHEN authentication succeeds
- THEN the response contains access and refresh tokens only — `isSuperadmin`
  travels per-request via `req.user`, never inside the token or the login body

#### Scenario: TenantContextGuard populates roles after JwtAuthGuard

- GIVEN `req.user` set by `JwtAuthGuard` and a resolved tenant context
- WHEN `TenantContextGuard` completes
- THEN `req.user.roles`/`companyId`/`companyUserId` are all set from the
  tenant `CompanyUser` — `isSuperadmin` untouched by this reassignment

#### Scenario: Missing tenant CompanyUser still fails loud, from the new location

- GIVEN a user with an ACTIVE `Membership` but no matching tenant
  `CompanyUser` row
- WHEN `TenantContextGuard` runs
- THEN the response is `403`, logged as `MISSING_COMPANY_USER` — never a
  silent `roles: 0`

*(Source of record: `multi-tenant-by-schema` delta spec — the last change to
modify this requirement before this delta.)*

### Requirement: @Roles()/RolesGuard Enforcement

An endpoint annotated with `@Roles(...)` MUST reject an unauthenticated
request with `401`, MUST reject an authenticated user lacking every required
role with `403`, and MUST admit a user holding at least one required role.
`RolesGuard` MUST ALSO reject with an explicit
`403 ('Tenant context not resolved')` when `req.user` is present but
`req.user.roles` is `undefined` — the replacement for the retired
guard-order-invariant wording: the bitmask's absence MUST fail loudly, and
MUST NEVER be allowed to evaluate `can(undefined, mask)` as a silent `0`.

(Previously: the guard-order invariant forbade introducing any third guard
to populate the bitmask. This change introduces `TenantContextGuard` as
exactly that third guard; its PURPOSE — loud failure on absence — is
preserved by this explicit `roles === undefined` check, which replaces the
old "no third guard" rule.)

#### Scenario: roles undefined fails loud, not as a silent 0

- GIVEN `req.user` is present but `req.user.roles` is `undefined` (tenant
  context never resolved)
- WHEN a `@Roles(...)`-guarded endpoint is called
- THEN the response is `403` with the message `'Tenant context not resolved'`
  — never a pass-through `can(undefined, mask) === 0` masquerading as a
  normal denial

#### Scenario: Unauthenticated request still rejected before RolesGuard runs

- GIVEN a request with no valid access token
- WHEN it hits a `@Roles(...)`-guarded endpoint
- THEN `JwtAuthGuard` rejects it with `401` before `RolesGuard` ever runs

#### Scenario: A resolved bitmask enforces exactly as before

- GIVEN `req.user.roles` resolved by `TenantContextGuard`
- WHEN a `@Roles(...)`-guarded endpoint is called
- THEN enforcement is unchanged — union semantics, `admin` super-root

*(Source of record: `multi-tenant-by-schema` delta spec — the last change to modify this requirement.)*

### Requirement: WarehouseOperator Warehouse Scope

(Previously named `OperadorAlmacen Warehouse Scope`; the entity shipped as
`WarehouseOperator` per the code/DB-English convention — see
`packages/domain/src/users/warehouse-operator.ts`. Semantics unchanged.)

A user holding `operador_almacen` MUST have exactly ONE `warehouseId` via a
`WarehouseOperator` detail row (`userId` PK/FK, `warehouseId` NOT unique). A single
`Warehouse` MAY have many operators. Role-scoped reads/actions for that user MUST be
filtered to that `warehouseId`.

#### Scenario: Operator has exactly one warehouse

- GIVEN a user with the `operador_almacen` role
- WHEN their `WarehouseOperator` row is inspected
- THEN it carries exactly one `warehouseId`

#### Scenario: A warehouse can have many operators

- GIVEN two different users, each with `operador_almacen` and the same `warehouseId`
- WHEN both `WarehouseOperator` rows are persisted
- THEN both succeed — `warehouseId` is NOT unique

#### Scenario: Scoped reads are filtered to the operator's warehouse

- GIVEN an `operador_almacen` user scoped to warehouse `W1`
- WHEN they request warehouse-scoped stock/inventory data
- THEN only `W1` data is returned, never another warehouse's

*(Source of record: `backend-users-roles` delta spec — the last change to modify this requirement.)*

### Requirement: sales_agent Role Grants

The `sales_agent` bit MUST grant READ access to customer records, CREATE
access to customer records, and READ access to cross-warehouse
stock/availability data (see `salesops-ventas`). It MUST NOT require or
create any warehouse-scope association for that user — the shape used by
`operador_almacen`/`warehouse_operator` MUST NOT be reused.

(Previously: this requirement denied `Customer` CREATE access to
`sales_agent` and deferred it to design. **D10** — owner decision landed
2026-07-28, engram `sdd/sales-agents-commissions/decisions-d10` — REVERSES
that deferral: the gestor's own definition, "usando un cliente registra una
venta," requires creating a customer on the spot for a brand-new buyer who
has no login yet. The full create-with-new-identity contract, and its three
mandatory privilege-escalation guardrails, are specified in the
`salesops-customers` delta — NOT here, since that behavior is triggered by,
and lives entirely within, the customer-creation flow that capability owns.)

#### Scenario: sales_agent can read customer records

- GIVEN a `CompanyUser` holding only `sales_agent`
- WHEN they call the customer READ endpoint
- THEN access is admitted

#### Scenario: sales_agent can create a customer together with its identity

- GIVEN a `CompanyUser` holding only `sales_agent`
- WHEN they call the create-customer-with-new-identity endpoint
- THEN access is admitted at the role-grant level — the resulting
  identity-creation and privilege-escalation contract is specified in the
  `salesops-customers` delta, not this one

#### Scenario: sales_agent is NOT granted the attach-to-existing-identity path

- GIVEN a `CompanyUser` holding only `sales_agent`
- WHEN they call the customer-creation endpoint that accepts an arbitrary
  existing `userId`
- THEN access is denied — that path can bind a customer record to ANY existing
  identity, including the owner's, so granting it would hand the agent an
  escalation vector the create-with-new-identity path structurally cannot have

#### Scenario: sales_agent can read cross-warehouse availability

- GIVEN a `CompanyUser` holding only `sales_agent`
- WHEN they query warehouse availability for a basket
- THEN access is admitted regardless of warehouse

#### Scenario: sales_agent holds no warehouse-scope row

- GIVEN a `CompanyUser` holding `sales_agent`
- WHEN checked for a warehouse-scope association (the shape used by
  `operador_almacen`)
- THEN no such scope row exists or is required

*(Source of record: `sales-agents-commissions` delta spec — the last change to modify this requirement.)*

### Requirement: Deferred / Non-Goals

The following remain out of scope: fine-grained owner-finance permissions,
and email verification. The `Invitation`/invite-accept flow remains
deferred.

(Previously: also deferred `Membership`, tenant-context resolution, and
schema-routing machinery — those are now IMPLEMENTED by this change, not
deferred.)

#### Scenario: Membership and tenant-context machinery now exist

- GIVEN the persisted schema and guard chain after this change
- WHEN inspected
- THEN a master `Membership` table, `TenantContextGuard`, and schema-routing
  all exist — none of them is still deferred

*(Source of record: `multi-tenant-by-schema` delta spec — the last change to modify this requirement.)*

### Requirement: Platform Superadmin Flag on Master User

Master `User` MUST gain a boolean `isSuperadmin` field
(`is_superadmin BOOLEAN NOT NULL DEFAULT false`). It is a MASTER-level
platform authorization fact: it MUST NOT be a bit in the company-scoped
`USER_ROLES` mask, MUST NOT live on tenant `CompanyUser`, and MUST NOT
require any `Membership`. The JWT access payload remains `{ sub, login }`
ONLY — `isSuperadmin` is NEVER baked into the token (ADR-2: resolved fresh
per request).

#### Scenario: Default users are not superadmin

- GIVEN any user created before or after this change without the flag
- WHEN their master row is inspected
- THEN `isSuperadmin` is `false`

#### Scenario: Flag lives on User, not in the role bitmask

- GIVEN a user with `isSuperadmin=true` and no Membership anywhere
- WHEN `USER_ROLES` helpers evaluate their effective roles
- THEN no platform bit exists in the mask — the flag and the company-scoped
  bitmask remain independent mechanisms
