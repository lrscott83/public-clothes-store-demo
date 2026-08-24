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

Fleet migration MUST run through exactly one tool, applying the tenant schema diff to each
tenant with a per-tenant timeout, continuing past a failed tenant and reporting it rather
than aborting the batch. A separate drift-check mode MUST compute the same diff without
applying it; ANY tenant with a non-empty diff MUST be named and MUST fail the run.
Destructive statements (`DROP TABLE`/`DROP COLUMN`) MUST be refused unless an explicit
override flag is passed.

The migration tool MUST refuse to run against a Postgres server below version 12
(`server_version_num < 120000`), failing loudly before attempting any tenant. This floor
exists because `applyDiff` wraps the generated migration script in an explicit
`BEGIN`/`COMMIT`, and `ALTER TYPE ... ADD VALUE` — the statement an enum addition like
`DeliveryAssignmentStatus.cancelled` compiles to — is illegal inside an explicit
transaction block on Postgres versions before 12. Running it there would fail mid-batch,
against an unpredictable subset of tenants depending on ordering, rather than failing
cleanly up front.

(Previously: "Fleet migration MUST run through exactly one tool, applying the tenant
schema diff to each tenant with a per-tenant timeout, continuing past a failed tenant and
reporting it rather than aborting the batch. A separate drift-check mode MUST compute the
same diff without applying it; ANY tenant with a non-empty diff MUST be named and MUST fail
the run. Destructive statements (`DROP TABLE`/`DROP COLUMN`) MUST be refused unless an
explicit override flag is passed." Said nothing about a minimum server version. Superseded
by this amendment's version floor — the tool's other behaviors (per-tenant timeout,
continue-past-failure, drift-check mode, destructive-statement refusal) are unchanged.)

#### Scenario: One tenant times out, the rest still run

- GIVEN a fleet of 5 tenants where one migration hangs past its timeout
- WHEN the migration tool runs
- THEN the other 4 tenants are migrated, the timed-out tenant is reported, and the tool
  exits non-zero

#### Scenario: Drift check fails the run when a tenant is behind

- GIVEN a tenant whose live schema does not match `prisma/tenant/schema.prisma`
- WHEN the drift check runs
- THEN that tenant is named in the output and the run fails — no silent pass

#### Scenario: Destructive statements require an explicit flag

- GIVEN a schema diff containing a `DROP COLUMN`
- WHEN the migration tool runs without the destructive-override flag
- THEN it refuses to apply that statement

#### Scenario: A Postgres server below version 12 is refused up front

- GIVEN a target `DATABASE_URL` whose server reports `server_version_num < 120000`
- WHEN the migration tool is run, in either apply or `--check` mode
- THEN it refuses to run and fails loudly before touching any tenant — never partway
  through the batch

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

### Requirement: App Boot Gates on Tenant Schema Currency

`apps/api-salesops`'s boot sequence MUST call an `assertTenantSchemasCurrent` gate before
the server starts listening. This gate is NOT the migration tool's `--check` mode
subprocess — a first attempt at this design ran `scripts/tenant-migrate.ts --check`
(`npx prisma migrate diff`, once per tenant, sequentially) as the startup assertion, and two
independent adversarial reviews rejected it: `prisma` is only a devDependency, so a pruned
production image has no such binary and boot could only ever fail; boot latency scaled as
`tenants x subprocess spawn`; and a subprocess error or timeout counted as drift under the
`enforce` default, so one transient database hiccup refused boot for the ENTIRE API,
converting a `500` on one endpoint into total unavailability.

The shipped gate instead runs ONE in-process, read-only query — a single connection, a
`pg_namespace`/`pg_type`/`pg_enum` LEFT-JOIN over the whole tenant fleet in one round trip,
using only `pg` (a real dependency, not `prisma`). It asserts a narrower property than a
full DDL diff, deliberately: that every enum LABEL this build can write exists in every
tenant schema. The required label set is derived AT RUNTIME from the generated Prisma
client's `$Enums`, never hand-listed, so it cannot drift from the datamodel the app actually
queries through. Column-level drift is out of scope for this gate; `node
scripts/tenant-migrate.ts --check` in CI or at deploy time remains the full check.

The mode is controlled by the `TENANT_SCHEMA_DRIFT_CHECK` environment variable with three
values: `enforce` (throw and abort boot on a positively-established missing label), `warn`
(log and boot anyway), or `off` (skip the check entirely). An absent or unrecognized value
MUST resolve to `enforce` — the default is the strict mode, deliberately, because an
assertion that is off unless somebody remembers to turn it on asserts nothing.

A gap MUST be reported ONLY when it was positively established by a query that actually
ran. When the probe itself cannot run — database unreachable, connection timeout,
insufficient privileges, or any other failure before a result is obtained — it MUST log and
return in EVERY mode, `enforce` included, and MUST NEVER refuse boot on that account. Not
knowing whether the fleet is current is not evidence that it is not; refusing boot on a
probe failure would take the entire API down over a transient condition unrelated to schema
drift, which is precisely the failure mode this design replaces the subprocess-based one to
avoid.

This exists because, before this amendment, nothing gated app boot on the fleet migration
having been run: a deploy could ship code that depended on new DDL (the
`DeliveryAssignmentStatus.cancelled` value being the motivating case) before the fleet
migration ran, producing runtime `500`s on an unrelated endpoint (`POST
/orders/:id/cancel`) for every tenant still behind. A drift that stays invisible until an
unrelated endpoint breaks is the failure mode this gate closes: the SAME drift now fails
loudly at boot, in the `enforce` default, before any request is ever served — without ever
being able to refuse boot for a reason OTHER than that established drift.

#### Scenario: Boot fails when a tenant is behind and the mode is enforce

- GIVEN `TENANT_SCHEMA_DRIFT_CHECK` unset (or `enforce`) and at least one tenant schema
  missing an enum label this build writes
- WHEN the app boots
- THEN it throws before listening — the process does not come up serving traffic against
  a stale fleet

#### Scenario: Boot succeeds and logs when the mode is warn

- GIVEN `TENANT_SCHEMA_DRIFT_CHECK=warn` and at least one tenant schema missing a required
  enum label
- WHEN the app boots
- THEN it logs the drift and starts listening anyway

#### Scenario: Boot skips the check entirely when the mode is off

- GIVEN `TENANT_SCHEMA_DRIFT_CHECK=off`
- WHEN the app boots
- THEN no drift check runs at all, regardless of fleet state

#### Scenario: Boot succeeds silently when every tenant is current

- GIVEN every tenant schema carries every enum label this build writes
- WHEN the app boots under any mode
- THEN it starts listening normally

#### Scenario: A probe that cannot run never refuses boot, even in enforce mode

- GIVEN `TENANT_SCHEMA_DRIFT_CHECK` unset (or `enforce`) and the probe query fails before
  producing a result — an unreachable database, a connection timeout, or an authorization
  failure
- WHEN the app boots
- THEN the failure is logged and boot proceeds to listen — a probe that could not run is
  never treated as an established gap, in ANY mode, including `enforce`

### Requirement: A One-Shot Backfill Closes Assignments Stranded Behind Cancelled Orders

A fleet-wide tool MUST exist to find and, on request, close `DeliveryAssignment` rows left
`in_transit` behind an order that is already `cancelled` — rows created before
`salesops-delivery`'s cancel-time reconciliation existed, which that reconciliation alone
does not retroactively fix. The tool MUST be REPORT-ONLY by default (listing every
stranded row per tenant without writing), and MUST require an explicit destructive flag to
close them. When run destructively, it MUST close each matched row to `cancelled` — never
`delivered` — leaving `deliveredAt` untouched (NULL), for the same reason the live
cancel-time reconciliation does: a cancellation is not a delivery, and closing it as
`delivered` would make computed throughput count a delivery that never happened. A tenant
whose schema has not yet gained the `DeliveryAssignmentStatus.cancelled` enum value MUST
be reported as an error for that tenant, without aborting the run for the rest of the
fleet — mirroring the migration tool's own per-tenant continue-past-failure behavior.

These rows are not cosmetic debt: while stranded, `computeCarrierCapacity` reports their
carrier BUSY forever, "orders awaiting a carrier" cannot re-offer their order (an
assignment already exists), no API path can close them (`markDelivered` on a cancelled
order is rejected as an invalid transition), and — once `salesops-delivery`'s carrier
deactivation guard exists — they permanently block deactivating their carrier.

#### Scenario: A stranded assignment is found and reported by default

- GIVEN a tenant with a `DeliveryAssignment` in `in_transit` whose order is `cancelled`
- WHEN the tool runs without the destructive flag
- THEN the row is reported as a finding, and its status is left unchanged

#### Scenario: A stranded assignment is closed when the destructive flag is passed

- GIVEN the same stranded row
- WHEN the tool runs WITH the destructive flag
- THEN the row transitions to `cancelled` with `deliveredAt` left NULL

#### Scenario: An un-migrated tenant is reported as an error, not aborted

- GIVEN a fleet where one tenant's schema lacks the `DeliveryAssignmentStatus.cancelled`
  enum value and holds a candidate stranded row, and other tenants are current
- WHEN the tool runs
- THEN the un-migrated tenant is reported as an error for that tenant only — the other
  tenants in the fleet are still surveyed/closed

#### Scenario: A non-stranded assignment is never touched

- GIVEN a `DeliveryAssignment` that is `in_transit` behind a `verified` (not `cancelled`)
  order, or already `delivered`/`cancelled`
- WHEN the tool runs, with or without the destructive flag
- THEN that row is neither reported as a finding nor modified

### Requirement: Fleet Migration Adds Indexes for the New Warehouse and Throughput Scans

The SAME fleet migration that adds the `DeliveryAssignmentStatus.cancelled` enum value MUST
also add `@@index([warehouseId])` on `Order` and `@@index([deliveredAt])` on
`DeliveryAssignment` — both ship together with the enum value as one diff, not as separate
follow-up migrations.

`@@index([warehouseId])` on `Order` exists because `salesops-delivery`'s warehouse-scoped
reads (`GET /delivery/assignments` for a scoped `warehouse_operator`) filter through the
`delivery_assignment -> order` relation by this column, across the tenant's WHOLE order
history. Without it, the narrowest-scoped caller — a single-warehouse operator — is the one
who pays for a sequential scan that grows with the tenant forever.

`@@index([deliveredAt])` on `DeliveryAssignment` exists because `GET /delivery/capacity`'s
throughput read is now windowed: every call filters `delivered_at` by range (a default
30-day window when the caller names no bound). The pre-existing `status` index alone still
forces a scan of every `delivered` row ever, which is the unbounded read the window was
introduced to remove.

#### Scenario: The fleet migration adds both indexes alongside the enum value

- GIVEN a tenant schema at the state before this amendment's migration
- WHEN the fleet migration tool applies the diff for this change
- THEN the same run adds `DeliveryAssignmentStatus.cancelled`, `Order`'s
  `@@index([warehouseId])`, and `DeliveryAssignment`'s `@@index([deliveredAt])` — none of
  the three ships as a separate migration
