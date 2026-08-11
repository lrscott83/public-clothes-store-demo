# Delta for salesops-companies

## ADDED Requirements

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
