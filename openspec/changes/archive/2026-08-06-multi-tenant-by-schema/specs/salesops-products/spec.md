# Delta for salesops-products

## MODIFIED Requirements

### Requirement: Category Catalog Seed Load

The system MUST seed exactly the 11 existing catalog slugs as MASTER
`TemplateCategory`/`TemplateProduct` rows once. Every provisioned tenant
MUST receive its OWN copy of those rows, written into its own
`Category`/`Product` tables at provisioning time (see `salesops-tenancy`'s
provisioning saga) — never a live reference to the master templates. The
seed MUST remain idempotent at the master-template level; the per-tenant
copy step MUST also be idempotent for the seed path that provisions the demo
tenant.

(Previously: seeded 11 `Category` rows directly and globally, with no
per-tenant copy step — there was only ever one implicit schema.)

#### Scenario: Master templates seed once

- GIVEN a fresh master schema
- WHEN the seed runs
- THEN exactly 11 `TemplateCategory` rows exist, sourced from the same 11
  slugs as before

#### Scenario: Each tenant gets its own physical copy

- GIVEN two provisioned tenants, A and B
- WHEN each tenant's `Category`/`Product` tables are inspected
- THEN each holds its own rows, copied independently from the master
  templates — neither references the other's or the master's rows at
  runtime

#### Scenario: Re-provisioning path stays idempotent

- GIVEN the demo tenant is provisioned and seeded twice via `pnpm seed`
- WHEN its `Category`/`Product` rows are counted
- THEN the count is unchanged between runs — no duplicates

## ADDED Requirements

### Requirement: Tenant Catalog Is Independently Editable

Editing a `Product` or `Category` in one tenant's schema MUST NOT affect any
other tenant's rows, even though both originated from the same master
templates.

#### Scenario: An edit in tenant A does not leak into tenant B

- GIVEN tenant A and tenant B, both provisioned from the same master
  templates
- WHEN a `Product` price is edited in tenant A
- THEN the corresponding `Product` in tenant B is unchanged
