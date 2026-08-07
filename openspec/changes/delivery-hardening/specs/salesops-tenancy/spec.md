# Delta for salesops-tenancy (AMENDMENT, not append)

**Merge target**: `openspec/specs/salesops-tenancy/spec.md` (promoted). This document
AMENDS that spec's "Single Migration Tool With Loud Drift Detection" requirement in place
and ADDS three requirements. All four items exist BECAUSE of the `salesops-delivery`
amendment shipped alongside this one in the same `delivery-hardening` change — see
`proposal.md`'s "Why `salesops-tenancy` is included here, not split out" for why this is
one change, not two. It does not touch any other requirement in the promoted spec.

## MODIFIED Requirements

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

## ADDED Requirements

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
