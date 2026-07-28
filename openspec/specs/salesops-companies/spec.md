# Spec — salesops-companies (NEW capability)

## Purpose

Define `Company` and `CompanyUser`: the single-schema authorization model that
replaces `User.roles`. `CompanyUser` keys a role bitmask + status to
`(userId, companyId)`. Ships with a nullable, unread `schemaName` hook on
`Company` for a deferred schema-per-tenant change. No dual Prisma clients, no
tenant provisioning — single implicit company only.

## Requirements

### Requirement: Company Entity

The system MUST persist a `Company` with `id`, `name`, `slug`, `isActive`,
a nullable `schemaName`, and timestamps. `schemaName` MUST exist as a reserved
column but MUST NOT be read by any code path in this change.

#### Scenario: Company persists with schemaName null

- GIVEN the seeded implicit company
- WHEN it is inspected
- THEN `schemaName` is `null`

#### Scenario: schemaName is an inert hook

- GIVEN a `Company` row with a non-null `schemaName`
- WHEN any request is processed by the system
- THEN request behavior is unaffected — no code path queries `schemaName`

### Requirement: CompanyUser Soft-FK Shape

`CompanyUser` MUST persist `id`, `userId` (plain `String`, NO `@relation` to
`User`), `companyId` (`@relation` to `Company`), `role` (Int bitmask,
NOT NULL), `status`, and timestamps, with a UNIQUE constraint on
`(userId, companyId)`. Referential integrity to `User` is enforced in
application code, not the database.

#### Scenario: CompanyUser persists without a matching User row

- GIVEN a `userId` with no corresponding `User` row
- WHEN a `CompanyUser` is persisted with that `userId`
- THEN it succeeds — no DB-level FK rejects it (per D1's accepted cost)

#### Scenario: Duplicate (userId, companyId) rejected

- GIVEN an existing `CompanyUser` for `(userId=U1, companyId=C1)`
- WHEN a second `CompanyUser` is created for the same pair
- THEN the UNIQUE constraint rejects it

### Requirement: Single-Company Auto-Assignment on Signup

On signup, the system MUST create a `CompanyUser` (`user` bit, `status=active`)
for the caller ONLY when exactly one `Company` exists. Zero or multiple
companies MUST fail loudly and be logged — never silently default.

#### Scenario: Exactly one company auto-assigns

- GIVEN exactly one `Company` row exists
- WHEN a new user signs up
- THEN a `CompanyUser` is created with the `user` bit and `status=active`

#### Scenario: Zero companies fails loudly

- GIVEN no `Company` row exists
- WHEN a user signs up
- THEN the request fails with `500` and the failure is logged as a
  misconfigured-deployment error

#### Scenario: Multiple companies fails loudly

- GIVEN more than one `Company` row exists
- WHEN a user signs up
- THEN the request fails with `409` and the failure is logged — no company
  is guessed or defaulted

### Requirement: CompanyUser Status Gates Access

A `CompanyUser` MUST support at least `active` and a non-active status
(e.g. `inactive`). A non-active `CompanyUser` MUST be treated as NOT
authorized for that company — equivalent in effect to having no
`CompanyUser` row at all.

#### Scenario: Active CompanyUser is authorized normally

- GIVEN a `CompanyUser` with `status=active` and role bit `owner`
- WHEN the user calls an endpoint requiring `owner`
- THEN the request is admitted

#### Scenario: Non-active CompanyUser denies access

- GIVEN a `CompanyUser` with a non-active `status`
- WHEN that user calls any `@Roles(...)`-guarded endpoint
- THEN the request is denied — the same failure class as a missing
  `CompanyUser` row

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
