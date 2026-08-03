# Delta for salesops-identity (further amendment)

**Merge target**: `openspec/changes/backend-users-roles/specs/salesops-identity/spec.md`,
as already amended by
`openspec/changes/archive/2026-08-02-sales-agents-commissions/specs/salesops-identity/spec.md`.
Not yet promoted to `openspec/specs/`. This document layers a further
amendment on top of both, scoped to the guard-order-invariant collision found
while designing this change (D4).

## MODIFIED Requirements

### Requirement: Role Resolution at Authentication Time

`JwtStrategy.validate()` MUST resolve ONLY master-side data —
`{ id, login, isActive }` — and MUST NOT resolve `CompanyUser` or any role
bitmask; the table it currently reads lives in a tenant schema whose
identity is not yet known when Passport runs. Role/company resolution moves
to `TenantContextGuard` (see `salesops-tenancy`), which MUST populate
`req.user.roles`/`companyId`/`companyUserId` after `JwtAuthGuard` runs.
`SanitizedUser` MUST keep the field name `roles`. An authenticated user with
no ACTIVE `Membership` or no matching tenant `CompanyUser` MUST still be
rejected with a distinct, logged `403` — never a silent `roles: 0` — but that
rejection now originates in `TenantContextGuard`, not `JwtStrategy`.

(Previously: `JwtStrategy.validate()` resolved the caller's `CompanyUser`
for "the implicit company" directly and populated `roles`/`companyId`
itself.)

#### Scenario: JwtStrategy output carries no roles or companyId

- GIVEN a valid access token
- WHEN `JwtAuthGuard` runs (before `TenantContextGuard`)
- THEN `req.user` has `{ id, login, isActive }` and no
  `roles`/`companyId`/`companyUserId` field yet

#### Scenario: TenantContextGuard populates roles after JwtAuthGuard

- GIVEN `req.user` set by `JwtAuthGuard` and a resolved tenant context
- WHEN `TenantContextGuard` completes
- THEN `req.user.roles`/`companyId`/`companyUserId` are all set from the
  tenant `CompanyUser`

#### Scenario: Missing tenant CompanyUser still fails loud, from the new location

- GIVEN a user with an ACTIVE `Membership` but no matching tenant
  `CompanyUser` row
- WHEN `TenantContextGuard` runs
- THEN the response is `403`, logged as `MISSING_COMPANY_USER` — never a
  silent `roles: 0`

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
