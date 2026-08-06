# Salesops Backend Specification

## Purpose

Defines the walking-skeleton behavior of the `salesops-backend` capability:
a deployable NestJS app (`api-salesops`) wired to a real Postgres database via
`infra-db`, proven alive through a `GET /health` endpoint, with architectural
boundaries enforced by lint. No domain/business logic is in scope — this
capability only proves the plumbing.

Tenancy behavior (schema-per-tenant topology, tenant client acquisition, the
guard chain, provisioning) is **not** specified here. It lives in
`salesops-tenancy/spec.md`.

## Requirements

### Requirement: Deployable NestJS App Boots

The `api-salesops` app MUST start as a standalone NestJS 11 application and
listen on a configurable TCP port (default 3001 when `PORT` is unset).

#### Scenario: App starts with DB reachable

- GIVEN `DATABASE_URL` points to a running Postgres instance
- WHEN the app is started (`pnpm --filter @store-mgmt/api-salesops dev`)
- THEN the process boots successfully and logs the listening port
- AND `InfraDbModule` and `HealthModule` are loaded without error

#### Scenario: App fails to boot when DB is unreachable at startup

- GIVEN `DATABASE_URL` points to a Postgres instance that is not reachable
- WHEN the app is started
- THEN Nest fails to complete `onModuleInit` for `PrismaMasterService`
- AND the process exits/fails with a clear error log (no silent partial boot)

Note: `$connect()` alone does not fail fast under Prisma's driver-adapter +
WASM query-compiler architecture. The fail-fast behavior above depends on the
eager `SELECT 1` in `PrismaMasterService.onModuleInit`, which MUST be retained.

### Requirement: Health Endpoint Reports DB Connectivity

The system MUST expose `GET /health`, which executes a direct database query
(`SELECT 1`) against the master schema and reports connectivity status. It MUST
NOT depend on `@nestjs/terminus` or any other health-check library.

`GET /health` MUST remain the one controller in `api-salesops` with no
`@UseGuards` — it is reachable without authentication or tenant resolution, so
that liveness can be probed before any tenant context exists.

#### Scenario: DB is reachable

- GIVEN the app is running and Postgres is reachable
- WHEN a client sends `GET /health`
- THEN the response status is `200`
- AND the response body is `{ "status": "ok", "db": "up" }`

#### Scenario: DB is unreachable

- GIVEN the app is running but the database connection fails or times out
- WHEN a client sends `GET /health`
- THEN the response status is `503`
- AND the response body is `{ "status": "error", "db": "down" }`
- AND no unhandled exception/500 is returned

### Requirement: `infra-db` Package Exposes the Database Access Providers

The `packages/infra-db` package MUST expose an `InfraDbModule` that provides and
exports every database-access provider, so any Nest module in the monorepo can
inject database access without depending on Prisma directly.

`InfraDbModule` MUST export:

- `PrismaMasterService` — the master-schema client (Prisma 7 via
  `@prisma/adapter-pg`), covering identity and the `(userId, companyId)` access
  decision
- `TenantPrismaFactory`, `TenantContextService`, `TenantDatabaseService` — the
  per-tenant acquisition path, specified in `salesops-tenancy/spec.md`

No consumer may import `@prisma/client`, `generated/master`, or `generated/tenant`
directly.

#### Scenario: PrismaMasterService connects on module init

- GIVEN `InfraDbModule` is imported by `AppModule`
- WHEN the Nest application context initializes
- THEN `PrismaMasterService.onModuleInit` establishes the Postgres connection via
  the pg adapter and proves it with an eager `SELECT 1`
- AND the service is available for injection in consuming modules

#### Scenario: PrismaMasterService disconnects on module destroy

- GIVEN the application is shutting down
- WHEN `onModuleDestroy` runs
- THEN `PrismaMasterService` releases the Postgres connection cleanly

#### Scenario: InfraDbModule exports its providers

- GIVEN a consuming module imports `InfraDbModule`
- WHEN that module injects `PrismaMasterService` or any tenant provider in a
  provider/controller
- THEN dependency injection resolves successfully without importing a generated
  Prisma client directly in the consumer

### Requirement: Architecture Boundaries Enforced by Lint

The `backend-boundaries` rule set in `packages/eslint-config` MUST prevent illegal
cross-layer imports at lint time, so hexagonal boundaries are enforced
automatically rather than by convention alone.

Exporting the rules is not sufficient. Each rule MUST be wired into the
`eslint.config.mjs` of every package it governs, and `pnpm lint` MUST run with
`--max-warnings 0`:

| Rule | Wired into |
|---|---|
| `domainBoundaryRule` | `packages/domain`, `packages/infra-db` |
| `webBackendBoundaryRule` | `apps/salesops-mvp`, `apps/static-store` |
| `tenantRepoBoundaryRule` | `packages/infra-db` |

#### Scenario: Domain cannot import infra or apps

- GIVEN a file under `@store-mgmt/domain` imports from `@store-mgmt/infra-db`
  or from any `apps/*` package
- WHEN `pnpm lint` runs
- THEN the `backend-boundaries` rule reports a lint violation

#### Scenario: Web apps cannot import backend-only packages

- GIVEN a file in `salesops-mvp` or `static-store` imports from
  `@store-mgmt/infra-db` or `@store-mgmt/api-salesops`
- WHEN `pnpm lint` runs
- THEN the `backend-boundaries` rule reports a lint violation

#### Scenario: Tenant repositories cannot reach the master client

- GIVEN a tenant-scoped repository under `packages/infra-db` imports the master
  Prisma client
- WHEN `pnpm lint` runs
- THEN `tenantRepoBoundaryRule` reports a lint violation

#### Scenario: Legal imports pass lint

- GIVEN `api-salesops` imports `InfraDbModule`/`PrismaMasterService` from
  `@store-mgmt/infra-db`
- WHEN `pnpm lint` runs
- THEN no `backend-boundaries` violation is reported for that import

#### Scenario: A seeded violation actually fails the build

- GIVEN a real violating import is added to a governed package
- WHEN that package's own lint command runs
- THEN it exits non-zero

This scenario exists because the rules were once exported but wired into zero
config files, so every boundary claim passed lint while enforcing nothing.
Enforcement MUST be proven by a failing run, not by the rule's existence.

### Requirement: Local Postgres via Docker Compose

The repository MUST provide a `docker-compose.yml` under `templates/` that
starts a Postgres 16 (`postgres:16-alpine`) service usable for local
development and for running the health-check scenarios above.

#### Scenario: Postgres starts and is healthy

- GIVEN `docker compose up -d postgres` is run from `templates/`
- WHEN the container starts
- THEN Postgres 16 becomes ready and its healthcheck passes
- AND `api-salesops` can connect to it using the documented `DATABASE_URL`

## Out of Scope

- Domain modules — covered by their own capability specs.
- `api-common` shared Nest plumbing — see `salesops-identity/spec.md`.
- Multi-tenancy topology and provisioning — see `salesops-tenancy/spec.md`.
- IdP/auth/JWT — see `salesops-identity/spec.md`.
- Background job worker.
