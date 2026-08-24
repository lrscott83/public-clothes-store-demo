# Delta for salesops-identity

## ADDED Requirements

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

## MODIFIED Requirements

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
