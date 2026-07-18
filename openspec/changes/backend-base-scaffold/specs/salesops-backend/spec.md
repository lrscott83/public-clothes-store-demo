# Salesops Backend Specification (Delta)

## Purpose

Defines the walking-skeleton behavior of the new `salesops-backend` capability:
a deployable NestJS app (`api-salesops`) wired to a real Postgres database via
`infra-db`, proven alive through a `GET /health` endpoint, with architectural
boundaries enforced by lint. No domain/business logic is in scope — this
capability only proves the plumbing.

## ADDED Requirements

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
- THEN Nest fails to complete `onModuleInit` for `PrismaService`
- AND the process exits/fails with a clear error log (no silent partial boot)

### Requirement: Health Endpoint Reports DB Connectivity

The system MUST expose `GET /health`, which executes a direct database query
(`SELECT 1`) through `PrismaService` and reports connectivity status. It MUST
NOT depend on `@nestjs/terminus` or any other health-check library.

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

### Requirement: `infra-db` Package Exposes PrismaService and InfraDbModule

The `packages/infra-db` package MUST expose an injectable `PrismaService`
(Prisma 7 client via `@prisma/adapter-pg`) and an `InfraDbModule` that provides
and exports it, so any Nest module in the monorepo can inject database access
without depending on Prisma directly.

#### Scenario: PrismaService connects on module init

- GIVEN `InfraDbModule` is imported by `AppModule`
- WHEN the Nest application context initializes
- THEN `PrismaService.onModuleInit` establishes the Postgres connection via
  the pg adapter
- AND the service is available for injection in consuming modules

#### Scenario: PrismaService disconnects on module destroy

- GIVEN the application is shutting down
- WHEN `onModuleDestroy` runs
- THEN `PrismaService` releases the Postgres connection cleanly

#### Scenario: InfraDbModule exports PrismaService

- GIVEN a consuming module imports `InfraDbModule`
- WHEN that module injects `PrismaService` in a provider/controller
- THEN dependency injection resolves successfully without importing
  `@prisma/client` directly in the consumer

### Requirement: Architecture Boundaries Enforced by Lint

An ESLint rule set (`backend-boundaries`, added to `packages/eslint-config`)
MUST prevent illegal cross-layer imports at lint time, so hexagonal
boundaries are enforced automatically rather than by convention alone.

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

#### Scenario: Legal imports pass lint

- GIVEN `api-salesops` imports `InfraDbModule`/`PrismaService` from
  `@store-mgmt/infra-db`
- WHEN `pnpm lint` runs
- THEN no `backend-boundaries` violation is reported for that import

### Requirement: Local Postgres via Docker Compose

The repository MUST provide a `docker-compose.yml` under `templates/` that
starts a Postgres 16 (`postgres:16-alpine`) service usable for local
development and for running the health-check scenarios above.

#### Scenario: Postgres starts and is healthy

- GIVEN `docker compose up -d postgres` is run from `templates/`
- WHEN the container starts
- THEN Postgres 16 becomes ready and its healthcheck passes
- AND `api-salesops` can connect to it using the documented `DATABASE_URL`

## Out of Scope (explicitly not covered by this spec)

- Domain modules (e.g., Currency/exchange-rate) — separate future SDD change.
- `api-common` shared Nest plumbing.
- Multi-tenancy, IdP/auth, JWT.
- Background job worker.
- Any modification to `@store-mgmt/domain`, `salesops-mvp`, or `static-store`
  beyond the lint-boundary check above.
