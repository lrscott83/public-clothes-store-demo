# Spec — salesops-companies (NEW capability)

## Purpose

Define `Company` and `CompanyUser` in a multi-tenant schema-per-tenant topology:
master `Company` entity with authoritative `schemaName`, master `Membership` gates
access, tenant-side `CompanyUser` with collapsed primary key. No implicit company,
no auto-assignment — explicit `Membership` required for access.

## Requirements

### Requirement: Company Entity

The system MUST persist a `Company` with `id`, `name`, `slug`, `isActive`,
`schemaName`, and timestamps. `schemaName` MUST be READ and authoritative for
tenant routing (see `salesops-tenancy`) — every provisioned company MUST have
a non-null `schemaName`, and an unprovisioned company (`schemaName=null`)
MUST be treated as not-yet-accessible.

#### Scenario: Company persists with a non-null schemaName once provisioned

- GIVEN a company that finished provisioning
- WHEN it is inspected
- THEN `schemaName` is set and matches the tenant schema created for it

#### Scenario: A Company with schemaName=null is not yet accessible

- GIVEN a `Company` row with `schemaName=null`
- WHEN any tenant-scoped request targets it
- THEN the request is rejected with `403` — provisioning is not complete

### Requirement: CompanyUser Collapsed-PK Shape (Tenant-Side)

`CompanyUser` MUST live in the tenant schema and MUST persist `id` (the
master `User.id`, provided explicitly — no auto-generation), `role` (Int
bitmask), `createdByCompanyUserId`, and timestamps. It MUST NOT carry a
`userId` column or a `companyId` column, and MUST NOT hold a `@relation` to
any master-schema model — company identity is expressed by the schema
itself, not by a column.

#### Scenario: CompanyUser.id equals the master User.id

- GIVEN a tenant `CompanyUser` row
- WHEN its `id` is compared to the master `User.id` it represents
- THEN they are identical — no separate soft-FK column exists

#### Scenario: No companyId column exists on CompanyUser

- GIVEN the tenant `CompanyUser` schema
- WHEN inspected
- THEN no `companyId` field exists — which company it belongs to is
  determined entirely by which schema the row lives in

### Requirement: Master Membership Gates Company Access

The system MUST introduce a master `Membership` (`userId`, `companyId`,
`status`) as the single source of "is this person active in this company".
Access to a company's tenant schema MUST require an ACTIVE `Membership` for
that `(userId, companyId)` pair — there is no implicit default company.

#### Scenario: A user with an ACTIVE Membership can access that company

- GIVEN a `Membership` with `status=ACTIVE` for `(userId=U, companyId=C)`
- WHEN `U` requests a tenant-scoped endpoint with `X-Company-Id: C`
- THEN the request proceeds to tenant resolution

#### Scenario: A user with no Membership for the company is rejected

- GIVEN no `Membership` row exists for `(userId=U, companyId=C)`
- WHEN `U` requests a tenant-scoped endpoint with `X-Company-Id: C`
- THEN the response is `403` — no company is guessed or defaulted

### Requirement: Membership Status Gates Company Access

A `Membership` MUST support at least `ACTIVE`, `REVOKED`, and `SUSPENDED`. A
non-`ACTIVE` `Membership` MUST be treated as NOT authorized for that company
— equivalent in effect to having no `Membership` row at all. `CompanyUser`
(tenant-side) MUST NOT carry its own active/inactive flag — status lives in
exactly one place.

#### Scenario: REVOKED Membership denies access

- GIVEN a `Membership` with `status=REVOKED` for `(U, C)`
- WHEN `U` requests a tenant-scoped endpoint for `C`
- THEN the response is `403` — the same failure class as a missing
  `Membership`

#### Scenario: CompanyUser carries no independent status field

- GIVEN the tenant `CompanyUser` schema
- WHEN inspected
- THEN no `status`/`isActive` field exists on it — only `Membership.status`
  gates access

### Requirement: Additive-Then-Drop Migration Lifecycle

Persisting `Company`/`CompanyUser` MUST happen in two migrations. Migration
001 MUST be additive-only (create tables, seed one `Company`, backfill
`CompanyUser` from `app_user.roles` bit-for-bit) and MUST leave
`app_user.roles` intact. Migration 002 MUST drop `app_user.roles` and MUST
NOT run until 001's backfill is verified.

#### Scenario: After migration 001 — dual source, both correct

- GIVEN migration 001 has run
- WHEN `app_user.roles` and the matching `company_user.role` are compared for
  every user
- THEN the bitmask values are identical, and `app_user.roles` still exists
  and is still readable

#### Scenario: After migration 002 — single source of truth

- GIVEN migration 002 has run
- WHEN the `app_user` table is inspected
- THEN the `roles` column no longer exists, and `company_user.role` is the
  only persisted authorization source

### Requirement: Company Repository Exposes findBySlug
`ICompanyRepository` MUST expose
`findBySlug(slug: string): Promise<Company | null>`, and
`PrismaCompanyRepository` MUST implement it, resolving on the existing
unique `slug` column — no database migration required.

#### Scenario: findBySlug resolves an existing company
- GIVEN a persisted `Company` with `slug="acme"`
- WHEN `findBySlug("acme")` is called
- THEN it returns that `Company`, including its `isActive` and `schemaName`

#### Scenario: findBySlug returns null for an unknown slug
- GIVEN no `Company` has `slug="doesnotexist"`
- WHEN `findBySlug("doesnotexist")` is called
- THEN it returns `null`, matching `findById`'s existing not-found
  convention — it never throws
