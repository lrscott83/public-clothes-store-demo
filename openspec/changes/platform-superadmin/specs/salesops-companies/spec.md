# Delta for salesops-companies

## ADDED Requirements

### Requirement: Company Type Metadata Field

`Company` MUST gain a nullable `type` field backed by a master
`"CompanyType"` enum whose only value today is `'catalog'`, with column
default `'catalog'`. It is DATA ONLY in this change: it MUST NOT alter
provisioning, tenant resolution, guard behavior, or any authorization path.
Existing rows MAY remain `NULL`; the default applies to new inserts that
omit it. The `CreateCompanySaga` input contract (`name`, `slug`, `ownerId`)
MUST remain unchanged.

#### Scenario: New companies default to catalog

- GIVEN a company created without an explicit type
- WHEN its row is inspected
- THEN `type` is `'catalog'`

#### Scenario: Type does not affect provisioning or access

- GIVEN two companies, one with `type='catalog'` and one with `type=NULL`
- WHEN each goes through provisioning and tenant-scoped requests
- THEN both behave identically — the saga steps, guard chain, and isolation
  guarantees are unaffected by the value of `type`
