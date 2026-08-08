# Design — Backend base scaffold (lean hexagonal skeleton)

Technical design for the first backend deliverable of the `store-mgmt` monorepo: a
lean hexagonal **walking skeleton** that boots end-to-end and proves its plumbing via
`GET /health` pinging a real Postgres. It formalizes the validated plan at
`docs/plans/backend-base-scaffold-design.md`, grounding concrete details against the
sibling `poolops-biz` (NestJS 11, Prisma 7 + `@prisma/adapter-pg`, Jest 30 + ts-jest),
adopted in **lean** form: no multi-tenant, no auth/IdP, no worker, no `api-common`.

- Proposal: `sdd/backend-base-scaffold/proposal` (engram) · `openspec/changes/backend-base-scaffold/proposal.md`
- Target architecture: `docs/system/architecture.md`
- Reference pattern (read-only sibling): `/home/coder/sources/poolops/poolops-biz`

## Quick path (what this design commits to)

1. New app `apps/api-salesops` — NestJS 11, boots on port **3001**.
2. New package `packages/infra-db` — Prisma 7 + `@prisma/adapter-pg`, injectable `PrismaService` + `InfraDbModule`.
3. `GET /health` — direct `SELECT 1`: DB up → `200 {status:'ok',db:'up'}`, DB down → `503 {status:'error',db:'down'}`.
4. `backend-boundaries` ESLint config in `packages/eslint-config` — codifies the hexagonal import rules.
5. `docker-compose.yml` — `postgres:16-alpine` for local dev.
6. Empty Prisma schema (datasource + generator, **no models**) + baseline migration.

Everything lives under `templates/`. No changes to `@store-mgmt/domain`, `salesops-mvp`, or `static-store`.

## 1. Architecture

### 1.1 Pattern

Hexagonal (ports/adapters) shared-kernel, cloned from `poolops-biz` and stripped to
its load-bearing bones. The dependency direction is enforced, not merely documented:

```
apps/api-salesops        (composition root — HTTP delivery + Nest wiring)
      │  imports
      ▼
packages/infra-db        (driven adapter — Prisma/Postgres via @prisma/adapter-pg)
      │  (may import)
      ▼
packages/domain          (pure domain — UNTOUCHED in this change)
```

Rule: **inner layers never import outer layers.** `domain` imports nothing from
`infra-*` or `apps/*`; web apps (`salesops-mvp`, `static-store`) never import backend
packages (`infra-db`, `api-salesops`). This change adds no domain code — it only lays
the spine so the next slice (Currency) lands as a clean `domain → infra-db → api`
vertical.

### 1.2 Layering & boundaries

| Layer | Package | Role in this change |
|---|---|---|
| Delivery / composition | `apps/api-salesops` | HTTP surface (`/health`), Nest bootstrap, module wiring |
| Driven infra | `packages/infra-db` | Prisma client lifecycle + DB access, exported as a Nest module |
| Domain | `packages/domain` | Not modified — no module exists yet |
| Cross-cutting config | `packages/eslint-config`, `packages/typescript-config` | Extended with backend boundary rules + backend tsconfig base |

### 1.3 Divergences from poolops (deliberate, lean)

| poolops-biz | This scaffold | Why |
|---|---|---|
| Multi-schema Prisma (master/tenant/cache), per-tenant provisioning | Single empty schema, no tenancy | Shop does 3–6 orders/day; YAGNI |
| Lazy `Proxy`-based `prisma` singleton export (`prisma-client.ts`) | Idiomatic Nest **injectable** `PrismaService` with lifecycle hooks | Single app, no `api-common`; DI is cleaner and testable |
| `api-common` shared Nest plumbing, auth guards, worker | None | One app, no shared wiring, no auth/jobs yet |
| Prisma 7 `generator client { provider = "prisma-client" }` + `output` | Same generator style (Prisma 7), single output dir | Ground on the real Prisma 7 shape, not legacy `prisma-client-js` |

## 2. Components (contracts)

### 2.1 `PrismaService` — `packages/infra-db/src/prisma-client.ts`

- **Responsibility:** wrap `PrismaClient` (constructed with `PrismaPg` adapter from
  `@prisma/adapter-pg`, `connectionString: process.env.DATABASE_URL`). Nest
  `@Injectable()` implementing `OnModuleInit` + `OnModuleDestroy`.
- **Lifecycle:** `onModuleInit()` → `this.$connect()`; `onModuleDestroy()` → `this.$disconnect()`.
- **Surface:** extends/exposes the generated `PrismaClient` (so `$queryRaw` is
  available for the health ping). No repository methods yet — none are needed until a
  domain module arrives.
- **Depends on:** `DATABASE_URL` (env), `@prisma/client`, `@prisma/adapter-pg`, `pg`.
- **Consumers:** injected wherever DB access is needed — today only `HealthController`.

### 2.2 `InfraDbModule` — `packages/infra-db/src/infra-db.module.ts`

- **Responsibility:** Nest `@Module` that **provides and exports** `PrismaService` so
  importing modules can inject it.
- **Contract:** `providers: [PrismaService]`, `exports: [PrismaService]`.
- **Public surface:** re-exported from `packages/infra-db/src/index.ts` (`PrismaService`, `InfraDbModule`, `PrismaClient` type).

### 2.3 `HealthController` — `apps/api-salesops/src/health/health.controller.ts`

- **Route:** `GET /health`.
- **Behavior:** injects `PrismaService`, runs `await prisma.$queryRaw\`SELECT 1\``.
  - success → `200 { status: 'ok', db: 'up' }`
  - query throws → catch, return `503 { status: 'error', db: 'down' }` (set status via
    `@Res({ passthrough:true })` or throw `ServiceUnavailableException` with that body).
- **No `@nestjs/terminus`:** a direct query is enough for a skeleton; terminus is an
  unused dependency today (YAGNI).

### 2.4 `HealthModule` — `apps/api-salesops/src/health/health.module.ts`

- Declares `HealthController`; imports nothing extra (`PrismaService` comes from the
  globally-available `InfraDbModule` wired in `AppModule`).

### 2.5 `AppModule` — `apps/api-salesops/src/app.module.ts`

- `imports: [ConfigModule.forRoot({ isGlobal: true }), InfraDbModule, HealthModule]`.

### 2.6 `main.ts` — `apps/api-salesops/src/main.ts`

- `NestFactory.create(AppModule)` → `app.listen(process.env.PORT ?? 3001)`.
- Port **3001** to avoid colliding with web apps on 3000.

### 2.7 `schema.prisma` — `packages/infra-db/prisma/schema.prisma`

- Prisma 7 generator (grounded on poolops):
  ```prisma
  generator client {
    provider = "prisma-client"
    output   = "../generated/client"
    runtime  = "nodejs"
    moduleFormat = "cjs"
  }
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  ```
- **No models.** An empty baseline migration establishes the database so `migrate
  deploy` has a target and future slices add models incrementally.

### 2.8 `backend-boundaries` — `packages/eslint-config/backend-boundaries.config.js`

- New flat-config fragment (ESM, matching existing `base.config.js` / `react-router.config.js`
  and the `@store-mgmt/eslint-config` exports map) using `no-restricted-imports` (or
  `eslint-plugin-import` zones) to enforce:
  - `@store-mgmt/domain` must not import `@store-mgmt/infra-*` or `apps/*`.
  - Web apps (`salesops-mvp`, `static-store`) must not import `@store-mgmt/infra-db`
    or `@store-mgmt/api-salesops`.
- Exported as `./backend-boundaries` and consumed by the eslint config of the relevant
  packages/apps.

## 3. Data flow — health check

```
GET /health
  → HealthController.check()
    → PrismaService.$queryRaw`SELECT 1`
        → @prisma/adapter-pg (pg pool)
            → Postgres 16
    ← rows        → 200 { status:'ok',    db:'up'   }
    ← throws      → 503 { status:'error',  db:'down' }
```

## 4. Error handling

| Situation | Behavior | Rationale |
|---|---|---|
| DB query fails during `/health` | Caught → `503 { status:'error', db:'down' }` | Never leak a bare 500; report liveness honestly |
| DB unreachable at boot (`onModuleInit` `$connect` fails) | Nest fails startup with a clear log; app does **not** listen | Desired — no DB means no service; fail fast and loud |
| Missing `DATABASE_URL` | Boot fails at client construction | Fail fast; `.env.example` documents required vars |

## 5. Testing & TDD strategy

Strict TDD is active. The **only** TDD-able unit is the health check — write the test
first (RED: no controller/route) then implement (GREEN). Pure config artifacts
(docker-compose, tsconfig, nest-cli, empty schema, eslint fragment) are **not**
TDD-able; they are verified by running the system (§7).

Test tooling grounded on poolops: **Jest 30 + ts-jest**, `testEnvironment: node`.

| Unit | Test | Type | Location |
|---|---|---|---|
| `/health` with DB up | responds `200 { status:'ok', db:'up' }` | e2e / integration (Nest `TestingModule` + `supertest` against real/compose Postgres) | `apps/api-salesops/test/health.e2e-spec.ts` |
| `/health` with DB down | responds `503 { status:'error', db:'down' }` | integration (override `PrismaService` with a mock whose `$queryRaw` rejects) | `apps/api-salesops/test/health.e2e-spec.ts` or `src/health/health.controller.spec.ts` |

Test commands (package scripts on `@store-mgmt/api-salesops`):

- Unit/integration: `pnpm --filter @store-mgmt/api-salesops test`  (jest)
- End-to-end: `pnpm --filter @store-mgmt/api-salesops test:e2e`  (jest with `test/jest-e2e.json`)

## 6. File structure (all new, under `templates/`)

```
templates/
  docker-compose.yml                      NEW  postgres:16-alpine service + healthcheck
  apps/
    api-salesops/                         NEW  NestJS 11 app  (@store-mgmt/api-salesops)
      package.json                             scripts: dev, build, start, test, test:e2e, lint
      tsconfig.json                            extends @store-mgmt/typescript-config base
      tsconfig.build.json
      nest-cli.json
      .env.example                             DATABASE_URL, PORT
      test/
        jest-e2e.json
        health.e2e-spec.ts
      src/
        main.ts                                bootstrap (PORT ?? 3001)
        app.module.ts                          ConfigModule + InfraDbModule + HealthModule
        health/
          health.controller.ts                 GET /health
          health.module.ts
  packages/
    infra-db/                             NEW  @store-mgmt/infra-db
      package.json                             deps: @prisma/client, @prisma/adapter-pg, pg, @nestjs/common
      tsconfig.json
      prisma/
        schema.prisma                          datasource + generator, NO models
        migrations/                            baseline (empty) migration
      src/
        index.ts                               public surface
        prisma-client.ts                       PrismaService (injectable, lifecycle hooks)
        infra-db.module.ts                     InfraDbModule (provides+exports PrismaService)
    eslint-config/                        MODIFIED  + backend-boundaries.config.js, + ./backend-boundaries export
    typescript-config/                    MODIFIED (if needed)  add backend/node tsconfig base
```

## 7. Verification (evidence it runs)

1. `docker compose up -d postgres` → Postgres 16 up, healthcheck OK.
2. `pnpm --filter @store-mgmt/infra-db prisma:generate` → client generated.
3. `pnpm --filter @store-mgmt/infra-db prisma:migrate` → baseline applied.
4. `pnpm --filter @store-mgmt/api-salesops dev` → Nest boots, logs port 3001.
5. `curl localhost:3001/health` → `{ "status":"ok", "db":"up" }`.
6. `pnpm --filter @store-mgmt/api-salesops test` and `test:e2e` → health specs green.
7. `pnpm lint` → no `backend-boundaries` violations.

## 8. Decisions (ADR-style)

| Decision | Resolution | Rationale | Rejected alternative |
|---|---|---|---|
| Deliverable scope | Empty skeleton + health check only | Isolate infra setup from business logic; Currency lands clean as the next SDD | Bundle Currency now → couples infra risk with domain logic |
| Fidelity to poolops | Lean: no tenant/auth/worker | Real load is 3–6 orders/day; YAGNI | Full poolops clone → carries unused operational weight |
| `api-common` | Not created | Single app, no shared Nest plumbing yet | Pre-build shared layer → premature abstraction |
| `@store-mgmt/domain` | Untouched | No domain module in this change | Add scaffolding models → violates scope |
| DB engine | Postgres 16 (`postgres:16-alpine`) | Mirrors poolops; Prisma default | Other engines → drift from proven sibling |
| Prisma access shape | Injectable Nest `PrismaService` + `InfraDbModule` | Idiomatic DI, testable, single-app friendly | poolops `Proxy` singleton → needs api-common wiring we don't have |
| Prisma generator | Prisma 7 `prisma-client` generator + `output` | Ground on the real Prisma 7 shape used by poolops | legacy `prisma-client-js` → outdated for Prisma 7 |
| Health check | Direct `SELECT 1`, no terminus | Sufficient for a skeleton; one fewer dependency | `@nestjs/terminus` → unused weight today |
| App port | 3001 | Avoid clashing with web apps on 3000 | 3000 → collides with dev web servers |
| Boundary enforcement | ESLint `backend-boundaries` config | A doc-only rule rots; codify and lint it | Convention only → drifts silently |

## 9. Risks & assumptions

- **Prisma 7 generator syntax**: grounded on poolops (`provider = "prisma-client"` +
  `output`), which differs from the legacy `prisma-client-js` in the source plan.
  Confirm the exact `output`/`moduleFormat` at apply time against installed
  `@prisma/client@^7`.
- **ESLint flat-config boundary rules**: `no-restricted-imports` on workspace package
  names needs correct pattern coverage; validate that `pnpm lint` actually fails on a
  seeded violating import before declaring the boundary enforced.
- **e2e Postgres dependency**: the "DB up" test needs a reachable Postgres (compose or
  CI service). The "DB down" case is covered by a mocked `PrismaService`, so unit runs
  stay hermetic.
- **`typescript-config` backend base**: current package ships only `tsconfig.base.json`;
  a Node/backend base may need adding for the Nest app — confirm during apply.

## 10. Downstream (not in this change)

- Update `docs/system/architecture.md`: replace "`infra-*`/`api-*` when needed" with
  the committed stack (NestJS 11 / Prisma 7 / Postgres 16) and mark `api-salesops` +
  `infra-db` as **existing**.
- First domain module: **Currency & Exchange Rates** — vertical slice
  `domain → infra-db → api`, as its own SDD change
  (`docs/plans/monedas-tasas-cambio-design.md`).

## Next step

Proceed to **sdd-tasks** (once the delta spec for capability `salesops-backend` is
also ready) to break this design into ordered, TDD-first implementation steps.
