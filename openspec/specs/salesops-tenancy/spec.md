# Spec — salesops-tenancy (NEW capability)

## Purpose

Schema-per-tenant topology: one master schema (identity) plus one Postgres schema
per company, sharing a single `DATABASE_URL`. Owns tenant provisioning,
request-time tenant resolution/context, bounded per-tenant client acquisition,
fleet migration + drift detection, and the cross-schema isolation guarantee.
No cutover — provisioning always creates an empty schema.

## Requirements

### Requirement: Schema-Per-Tenant Topology

`Company.schemaName` MUST be read and authoritative for routing every
tenant-scoped query. All schemas — master and every tenant — MUST share one
Postgres database via a single `DATABASE_URL`. A schema name MUST be derived
and validated through one shared helper (UUID-checked) at every site that
constructs or interpolates it — provisioner, client factory, and migration
tool alike.

#### Scenario: schemaName routes a tenant query

- GIVEN a `Company` with `schemaName="store_mgmt_tenant_<uuid>"`
- WHEN a tenant-scoped repository call resolves its client
- THEN the client connects with that exact schema in its search_path

#### Scenario: Invalid schema name is rejected everywhere it is used

- GIVEN a schema name string that fails the UUID-based validator
- WHEN the client factory, provisioner, or migration tool attempts to use it
- THEN each MUST reject it before issuing any SQL — never string-build a
  query with an unvalidated name

### Requirement: Tenant Client Acquisition Fails Loud, Never Falls Back

Acquiring a tenant Prisma client MUST come from a bounded, cached per-schema
pool (explicit `max`, idle timeout, real disposal on eviction and app
shutdown). Requesting a client with no active tenant context MUST throw — it
MUST NEVER fall back to the global/master client.

#### Scenario: No tenant context throws instead of silently using master

- GIVEN no `AsyncLocalStorage` tenant context is active
- WHEN tenant client acquisition is attempted
- THEN it throws, and no query reaches any schema

#### Scenario: Pool is bounded and disposed

- GIVEN a tenant schema evicted from the client cache, or the app shutting down
- WHEN eviction/shutdown runs
- THEN `disposeClient` is called for that schema's pool — connections are not
  leaked

### Requirement: Tenant Resolution Guard Chain

A `TenantContextGuard` MUST run after `JwtAuthGuard` and before `RolesGuard`.
It MUST resolve `companyId` from the `X-Company-Id` header or the caller's
sole ACTIVE `Membership`; reject with `403` when no ACTIVE `Membership`
exists for that pair; reject with `403` when the resolved `Company` is
inactive or has a null `schemaName`; then, inside a tenant context scope,
look up the tenant `CompanyUser` matching the caller's user id. A database
error during that lookup MUST surface as `500`; a genuinely missing
`CompanyUser` row MUST surface as a distinct, logged `403`. On success it
MUST set `req.tenant = { companyId, schemaName }` and populate
`req.user.roles`/`companyUserId`/`companyId`.

#### Scenario: Valid X-Company-Id with ACTIVE membership resolves tenant

- GIVEN an authenticated user with an ACTIVE `Membership` for `companyId=C1`
  and header `X-Company-Id: C1`
- WHEN the guard runs
- THEN `req.tenant.companyId` is `C1` and `req.user.roles` is set from the
  tenant `CompanyUser`

#### Scenario: No ACTIVE Membership for the requested company is rejected

- GIVEN a user with no ACTIVE `Membership` row for the requested `companyId`
- WHEN the guard runs
- THEN the response is `403`, logged, and no tenant client is ever acquired

#### Scenario: Company inactive or unprovisioned is rejected

- GIVEN a `Company` that is `isActive=false` or has `schemaName=null`
- WHEN the guard runs
- THEN the response is `403` — never a query against a nonexistent schema

#### Scenario: Infrastructure failure is a 500, not a silent inconsistency

- GIVEN the tenant `CompanyUser` lookup fails because of a database
  connection error
- WHEN the guard runs
- THEN the response is `500` — it is NEVER reported as the same class as a
  missing row

### Requirement: Per-Call Tenant Re-Scoping

Every handler that touches tenant data MUST re-open its own tenant
`AsyncLocalStorage` scope from `req.tenant` at the call site, rather than
assuming the guard's scope survives into the handler.

#### Scenario: Handler re-opens its own scope

- GIVEN a controller method wrapping its service call in
  `runInTenant(req.tenant, ...)`
- WHEN the request is processed
- THEN the tenant client used by the service call resolves from that
  re-opened scope, not from any scope left by the guard

### Requirement: Tenant Provisioning Saga With Orphan Detection

Creating a company MUST: create the master `Company` (schemaName null) →
`CREATE SCHEMA` + apply tenant DDL → set `schemaName` → create an ACTIVE
master `Membership` → create the tenant `CompanyUser` (owner role) → copy the
master catalog templates into the new tenant, AWAITED before the request
completes. Each step MUST have a compensating rollback run in reverse on
failure. A failing compensation step MUST NOT be trusted silently — it MUST
record a `ProvisioningIncident`, reconciled by a separate orphan-sweep tool.

#### Scenario: Successful provisioning leaves no window with an empty catalog

- GIVEN a provisioning request that succeeds
- WHEN the response returns
- THEN the new tenant already has its owner `CompanyUser` AND a populated
  catalog — no follow-up request is needed

#### Scenario: A mid-saga failure rolls back prior steps

- GIVEN step 4 (Membership creation) fails after steps 1–3 succeeded
- WHEN compensation runs
- THEN the schema is dropped and the master `Company` row is deleted — no
  partial tenant survives

#### Scenario: A failing compensation step is recorded, not lost

- GIVEN a compensation step itself fails
- WHEN the saga finishes
- THEN a `ProvisioningIncident` row exists in master, and the orphan-sweep
  tool later finds and reports the inconsistency

### Requirement: Single Migration Tool With Loud Drift Detection

Fleet migration MUST run through exactly one tool, applying the tenant
schema diff to each tenant with a per-tenant timeout, continuing past a
failed tenant and reporting it rather than aborting the batch. A separate
drift-check mode MUST compute the same diff without applying it; ANY tenant
with a non-empty diff MUST be named and MUST fail the run. Destructive
statements (`DROP TABLE`/`DROP COLUMN`) MUST be refused unless an explicit
override flag is passed.

#### Scenario: One tenant times out, the rest still run

- GIVEN a fleet of 5 tenants where one migration hangs past its timeout
- WHEN the migration tool runs
- THEN the other 4 tenants are migrated, the timed-out tenant is reported,
  and the tool exits non-zero

#### Scenario: Drift check fails the run when a tenant is behind

- GIVEN a tenant whose live schema does not match
  `prisma/tenant/schema.prisma`
- WHEN the drift check runs
- THEN that tenant is named in the output and the run fails — no silent pass

#### Scenario: Destructive statements require an explicit flag

- GIVEN a schema diff containing a `DROP COLUMN`
- WHEN the migration tool runs without the destructive-override flag
- THEN it refuses to apply that statement

### Requirement: Cross-Schema Isolation Is Proven, Not Assumed

An automated test MUST provision two distinct tenant schemas within a single
test run and prove that a query scoped to one schema NEVER returns rows
written to the other. This is the change's proof obligation, not a chore.

#### Scenario: Writes in tenant A are invisible to tenant B

- GIVEN tenant schema A and tenant schema B, both provisioned in the same
  test run
- WHEN a row is written in A and the same query runs scoped to B
- THEN B's result set does not contain A's row

#### Scenario: The test exercises the real guard, not a stub

- GIVEN the isolation test's HTTP requests
- WHEN they are inspected
- THEN `TenantContextGuard` is NOT stubbed via `overrideGuard` — the real
  resolution path runs

### Requirement: Provisioning Creates, Never Migrates, Existing Data

Provisioning a tenant MUST consist only of: create an empty schema, apply the
tenant DDL, and seed it. No provisioning or migration path MUST move,
preserve, or transform rows from any pre-existing schema.

#### Scenario: A freshly provisioned tenant starts empty except for the seeded catalog

- GIVEN a newly provisioned tenant
- WHEN its business tables (other than the copied catalog) are inspected
- THEN they are empty — nothing was carried over from anywhere else

### Requirement: Anonymous Subdomain Tenant Resolution
The system MUST provide an unauthenticated tenant-resolution path for public
read endpoints, served by a NEW guard — separate from "Tenant Resolution
Guard Chain" above, which stays unchanged. It MUST derive the tenant from
the first label of the request's subdomain, resolve it via
`ICompanyRepository.findBySlug` (see `salesops-companies`), and REQUIRE
NEITHER a JWT NOR a `Membership` row. On success it MUST open the tenant
context the same way the authenticated path does (`tenantContext.run(...)`).

#### Scenario: Known, active, provisioned slug resolves with no auth
- GIVEN a request whose subdomain's first label matches a Company.slug with
  `isActive=true` and a non-null `schemaName`
- WHEN the public tenant guard runs
- THEN the tenant context opens for that company's schema — no
  `Authorization` header and no `Membership` row are required or checked

#### Scenario: Public resolution never invokes the authenticated guard chain
- GIVEN a request to a public (`api-public`) endpoint
- WHEN it is processed
- THEN `JwtAuthGuard`, the Membership-resolution branch of
  `TenantContextGuard`, and `RolesGuard` are never invoked

### Requirement: Unknown Slug and Inactive Company Return an Indistinguishable 404
Public tenant resolution MUST return `404` for BOTH an unknown slug (no
matching `Company`) and an inactive/unprovisioned company (`isActive=false`
OR `schemaName=null`). The two responses MUST be indistinguishable by an
external caller — same status, same generic body, no detail that discloses
which case occurred.

#### Scenario: Unknown slug returns 404
- GIVEN a subdomain whose first label matches no `Company.slug`
- WHEN a public endpoint is requested
- THEN the response is `404`

#### Scenario: Inactive or unprovisioned company returns the same 404
- GIVEN a subdomain resolving to a `Company` with `isActive=false` OR
  `schemaName=null`
- WHEN a public endpoint is requested
- THEN the response is `404`, identical in status and body shape to the
  unknown-slug case

#### Scenario: The two 404 causes cannot be told apart from the response
- GIVEN one response from the unknown-slug scenario and one from the
  inactive-company scenario
- WHEN they are compared
- THEN no field, header, or body content differs in a way that reveals
  which case produced it
