# Delta for salesops-identity

> Base capability spec is UNARCHIVED. Source of truth for this delta is
> `openspec/changes/backend-users-roles/specs/salesops-identity/spec.md`, not
> `openspec/specs/` (no entry exists there yet). `sdd-tasks`/`sdd-apply` MUST
> treat that path as the merge target; this delta does not modify or archive
> the `backend-users-roles` change.

## ADDED Requirements

### Requirement: Role Resolution at Authentication Time

`JwtStrategy.validate()` MUST, in addition to re-fetching `User` fresh per
request, resolve the caller's `CompanyUser` for the implicit company.
`SanitizedUser` (`req.user`) MUST keep the field name `roles` — now sourced
from `CompanyUser.role` — and MUST gain `companyId`. The JWT payload MUST
remain unchanged (`sub` only); `companyId` MUST NOT be embedded in the token.
An authenticated `User` with no matching `CompanyUser` row MUST be rejected
with a distinct, logged `403 MISSING_COMPANY_USER` — never a silent
`roles: 0`. Every existing `@Roles()` decorator MUST continue to work with
zero source changes.

#### Scenario: Successful validate populates roles and companyId

- GIVEN an authenticated `User` with an active `CompanyUser` row
- WHEN `JwtStrategy.validate()` runs
- THEN `req.user.roles` equals `CompanyUser.role` and `req.user.companyId`
  is set

#### Scenario: JWT payload never carries companyId

- GIVEN a freshly issued access token
- WHEN its payload is inspected
- THEN it contains only `sub` — no `companyId` or role data

#### Scenario: Missing CompanyUser fails loud and distinct

- GIVEN an authenticated `User` with NO matching `CompanyUser` row
- WHEN any `@Roles(...)`-guarded (or unguarded direct `user.roles` read)
  endpoint is called
- THEN the response is `403` with a logged `MISSING_COMPANY_USER` reason —
  never a silent `roles: 0` fallthrough

#### Scenario: Existing @Roles() decorators need no source changes

- GIVEN the 7 `api-salesops` controllers using `@UseGuards(JwtAuthGuard,
  RolesGuard)` and `@Roles(...)`
- WHEN this change ships
- THEN all pass their existing tests with zero edits to controller source

## MODIFIED Requirements

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

### Requirement: Bitmask Multi-Role with Union Permissions

The effective role bitmask MUST support simultaneous multi-role membership:
`user | operador_almacen | operador_gestores | owner | admin`, now sourced
from `CompanyUser.role` instead of `User.roles`. Effective permissions MUST
be the UNION of all held bits. `admin` is the system super-root. `owner`
holds full power within its business. A bitmask value of `0` MUST be a valid
state meaning zero permissions — not an error.

(Previously: bitmask was read directly from `User.roles`; helper semantics
`hasRole`/`addRole`/`removeRole`/`getRoles` are unchanged — only the storage
location moved.)

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
- THEN only that bit clears on `CompanyUser.role`; `owner` remains held

#### Scenario: Effective permission is the union of held roles

- GIVEN a `CompanyUser.role` of `operador_almacen | operador_gestores`
- WHEN checked against any permission granted by either role
- THEN access is granted — permissions from both roles apply simultaneously

#### Scenario: admin is super-root regardless of other bits

- GIVEN a `CompanyUser.role` of only `admin`
- WHEN checked against ANY role requirement
- THEN access is granted

#### Scenario: Role bitmask of 0 denies every specific check but is not an error

- GIVEN a `CompanyUser.role` of `0`
- WHEN any `hasRole` check runs
- THEN every check returns `false` and every `@Roles(...)`-guarded endpoint
  returns `403` for that user — this is a valid zero-permission account, not
  a `MISSING_COMPANY_USER` failure

### Requirement: @Roles()/RolesGuard Enforcement

An endpoint annotated with `@Roles(...)` MUST reject an unauthenticated
request with `401`, MUST reject an authenticated user lacking every required
role with `403`, and MUST admit a user holding at least one required role —
either directly or via `admin` super-root. `RolesGuard`'s own logic is
UNCHANGED by this capability's move to `CompanyUser` — it evaluates whatever
bitmask `req.user.roles` carries, resolved upstream in `JwtStrategy`.

(Previously: identical behavior, evaluating `User.roles`; guard logic itself
does not change — only the upstream source of `req.user.roles` does, per the
`Role Resolution at Authentication Time` requirement above.)

#### Scenario: Unauthenticated request rejected

- GIVEN a request with no valid access token
- WHEN it hits a `@Roles(...)`-guarded endpoint
- THEN the response is `401`

#### Scenario: Authenticated user lacking the role rejected

- GIVEN a `CompanyUser` holding only `user`
- WHEN it calls an endpoint requiring `owner`
- THEN the response is `403`

#### Scenario: User holding the required role is admitted

- GIVEN a `CompanyUser` holding `owner`
- WHEN it calls an endpoint requiring `owner`
- THEN the request is admitted

#### Scenario: admin super-root passes every role gate

- GIVEN a `CompanyUser` whose only role is `admin`
- WHEN it calls an endpoint requiring `owner` (or any other role)
- THEN the request is admitted

### Requirement: Deferred / Non-Goals

The following MUST NOT be implemented in this capability: the `gestor` role,
fine-grained owner-finance permissions (owner remains coarse full-business
power), and email verification. `Company`/`CompanyUser` tables NOW EXIST
(this change's own scope) but `Membership`, tenant-context resolution, and
schema-routing machinery remain deferred to the schema-per-tenant change.

(Previously: asserted NO `Company`/`Membership`/tenant-context tables existed
at all; superseded because `Company`/`CompanyUser` are this change's explicit
deliverable. `Membership` and tenant-context machinery remain deferred.)

#### Scenario: Company/CompanyUser exist, tenant-context machinery does not

- GIVEN the persisted schema after this change
- WHEN inspected
- THEN `company` and `company_user` tables exist, but no `Membership` table,
  tenant-context service, or schema-routing exists

#### Scenario: gestor role does not exist

- GIVEN the roles bitmask enum
- WHEN inspected
- THEN no `gestor` role bit is defined
