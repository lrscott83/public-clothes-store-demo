# Spec — salesops-identity

## Purpose

Define the testable contract for `salesops-identity`: a `User` identity+credentials
entity with `login`-based authentication (NOT email), an Int-bitmask multi-role model
with union permissions, an api-idp-style JWT access/refresh auth mechanism (bcrypt,
rotation + reuse-detection, change-password/reset), `@Roles()`/`RolesGuard`
enforcement, and an `OperadorAlmacen` per-warehouse scope detail. Built single-tenant,
isolated so identity can move to a master schema later without touching business
tables.

## Requirements

### Requirement: User Identity Entity

The system MUST persist a `User` entity where `login` is the UNIQUE, REQUIRED
authentication identifier — NEVER `email`. `email` and `cellPhone` are OPTIONAL.
`passwordHash` MUST never store plaintext. No email-verification field exists.

| Field | Type | Constraint |
|---|---|---|
| id | UUID | PK |
| login | string | UNIQUE, required — auth identifier |
| passwordHash | string | required, never plaintext |
| fullName | string | required |
| email | string \| null | optional |
| cellPhone | string \| null | optional |
| isActive | boolean | default true |
| roles | Int bitmask | required, see Roles requirement |
| createdAt / updatedAt | datetime | audit |

#### Scenario: User created with only login and password

- GIVEN a valid unique `login`, password, and `fullName`, with no `email`/`cellPhone`
- WHEN the user is created
- THEN it persists and `email`/`cellPhone` resolve to `null`

#### Scenario: Duplicate login rejected

- GIVEN an existing user with `login="jdoe"`
- WHEN a second user is created with `login="jdoe"`
- THEN the system MUST reject it with a named error — never silently overwrite or
  accept it

#### Scenario: Password never stored as plaintext

- GIVEN a user-creation payload carrying a plaintext password
- WHEN the user is persisted
- THEN only `passwordHash` is stored — no plaintext password field exists anywhere on
  the entity

#### Scenario: No email-verification field exists

- GIVEN the `User` entity fields
- WHEN inspected
- THEN no `isEmailVerified` (or equivalent) field exists

### Requirement: Bitmask Multi-Role with Union Permissions

`roles` MUST be an Int bitmask supporting simultaneous multi-role membership: `user |
operador_almacen | operador_gestores | owner | admin`. Effective permissions MUST be
the UNION of all held roles. `admin` is the system super-root (implicitly satisfies
every role/permission check). `owner` holds full power within its business, including
managing its own users.

#### Scenario: hasRole checks a single bit

- GIVEN a user with roles `operador_almacen | owner`
- WHEN `hasRole(user, 'owner')` is evaluated
- THEN it returns `true`; `hasRole(user, 'admin')` returns `false`

#### Scenario: A user can hold multiple roles at once

- GIVEN a user assigned both `operador_almacen` and `operador_gestores`
- WHEN roles are added via `addRole`
- THEN both bits are set and `getRoles` returns both — one does not evict the other

#### Scenario: removeRole clears only the targeted bit

- GIVEN a user with `operador_almacen | owner`
- WHEN `removeRole(user, 'operador_almacen')` runs
- THEN only that bit clears; `owner` remains held

#### Scenario: Effective permission is the union of held roles

- GIVEN a user holding `operador_almacen | operador_gestores`
- WHEN checked against any permission granted by either role
- THEN access is granted — permissions from both roles apply simultaneously

#### Scenario: admin is super-root regardless of other bits

- GIVEN a user whose only role is `admin`
- WHEN checked against ANY role requirement (`owner`, `operador_almacen`, etc.)
- THEN access is granted — `admin` satisfies every role check

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

### Requirement: @Roles()/RolesGuard Enforcement

An endpoint annotated with `@Roles(...)` MUST reject an unauthenticated request with
`401`, MUST reject an authenticated user lacking every required role with `403`, and
MUST admit a user holding at least one required role — either directly or via `admin`
super-root.

#### Scenario: Unauthenticated request rejected

- GIVEN a request with no valid access token
- WHEN it hits a `@Roles(...)`-guarded endpoint
- THEN the response is `401`

#### Scenario: Authenticated user lacking the role rejected

- GIVEN a user holding only `user`
- WHEN it calls an endpoint requiring `owner`
- THEN the response is `403`

#### Scenario: User holding the required role is admitted

- GIVEN a user holding `owner`
- WHEN it calls an endpoint requiring `owner`
- THEN the request is admitted

#### Scenario: admin super-root passes every role gate

- GIVEN a user whose only role is `admin`
- WHEN it calls an endpoint requiring `owner` (or any other role)
- THEN the request is admitted

### Requirement: OperadorAlmacen Warehouse Scope

A user holding `operador_almacen` MUST have exactly ONE `warehouseId` via an
`OperadorAlmacen` detail row (`userId` PK/FK, `warehouseId` NOT unique). A single
`Warehouse` MAY have many operators. Role-scoped reads/actions for that user MUST be
filtered to that `warehouseId`.

#### Scenario: Operator has exactly one warehouse

- GIVEN a user with the `operador_almacen` role
- WHEN their `OperadorAlmacen` row is inspected
- THEN it carries exactly one `warehouseId`

#### Scenario: A warehouse can have many operators

- GIVEN two different users, each with `operador_almacen` and the same `warehouseId`
- WHEN both `OperadorAlmacen` rows are persisted
- THEN both succeed — `warehouseId` is NOT unique

#### Scenario: Scoped reads are filtered to the operator's warehouse

- GIVEN an `operador_almacen` user scoped to warehouse `W1`
- WHEN they request warehouse-scoped stock/inventory data
- THEN only `W1` data is returned, never another warehouse's

### Requirement: Deferred / Non-Goals

The following MUST NOT be implemented in this capability: multi-tenant-by-schema
machinery (`Company`/`Membership`/tenant-context/schema-routing), the `gestor` role,
fine-grained owner-finance permissions (owner is coarse full-business power this
build), and email verification.

#### Scenario: No multi-tenant tables exist

- GIVEN the persisted schema after this change
- WHEN inspected
- THEN no `Company`/`Membership`/tenant-context tables exist

#### Scenario: gestor role does not exist

- GIVEN the roles bitmask enum
- WHEN inspected
- THEN no `gestor` role bit is defined
