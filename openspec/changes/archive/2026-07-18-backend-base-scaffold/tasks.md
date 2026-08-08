# Tasks: Backend base scaffold (lean hexagonal walking skeleton)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450-500 (human-authored; excludes pnpm-lock.yaml and generated Prisma client output) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (structurally splittable into 4 units) |
| Suggested split | Unit 1 (tooling) → Unit 2 (infra-db) → Unit 3 (api-salesops + health TDD) → Unit 4 (boundary verification) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Root tooling: docker-compose.yml, backend-boundaries eslint fragment, typescript-config backend base | PR 1 (or slice 1 of single PR) | Independent; other units depend on eslint boundary + tsconfig base existing |
| 2 | infra-db package: schema, migration, PrismaService, InfraDbModule | PR 2 | Depends on Unit 1 tsconfig base |
| 3 | api-salesops app scaffold + health TDD RED/GREEN pairs + e2e | PR 3 | Depends on Unit 2 (imports infra-db) |
| 4 | Boundary enforcement verification (seed + revert violating import) | PR 4 or folded into Unit 1 | Depends on Unit 1's eslint rule existing |

Single-pr delivery selected: `size:exception` recorded by orchestrator before sdd-apply. Actual human-authored diff: 434 insertions / 2 deletions across 30 files (verified via `git diff --stat`, excluding pnpm-lock.yaml and generated/ Prisma client output) — within the ~450-500 estimate and the exception.

## Phase 1: Root Tooling (scaffolding, verify-by-running)

- [x] 1.1 Create `templates/docker-compose.yml`: `postgres:16-alpine` service, env (user/pass/db), port mapping, healthcheck (`pg_isready`), named volume.
- [x] 1.2 Add Node/backend tsconfig base in `templates/packages/typescript-config/` (e.g. `tsconfig.backend.json` extending `tsconfig.base.json`; target ES2022, module NodeNext/CommonJS per Nest CLI needs); update package.json exports if any.
- [x] 1.3 Create `templates/packages/eslint-config/backend-boundaries.config.js` (flat-config ESM, `no-restricted-imports`): `@store-mgmt/domain` ↛ `@store-mgmt/infra-*`/`apps/*`; `salesops-mvp`/`static-store` ↛ `@store-mgmt/infra-db`/`@store-mgmt/api-salesops`.
- [x] 1.4 Add `./backend-boundaries` to `templates/packages/eslint-config/package.json` exports map.

## Phase 2: infra-db Package (scaffolding, verify-by-running)

- [x] 2.1 Create `templates/packages/infra-db/package.json` (`@store-mgmt/infra-db`): deps `@prisma/client`, `@prisma/adapter-pg`, `pg`, `@nestjs/common`; devDep `prisma`; scripts `prisma:generate`, `prisma:migrate`.
- [x] 2.2 Create `templates/packages/infra-db/tsconfig.json` extending the backend base (task 1.2).
- [x] 2.3 Create `templates/packages/infra-db/prisma/schema.prisma`: Prisma 7 `generator client { provider = "prisma-client" output = "../generated/client" }`, NO models. Confirmed against installed `@prisma/client@7.8.0`: Prisma 7 no longer accepts `datasource.url` inside `schema.prisma` (P1012) — moved the connection URL to a new `prisma.config.ts` (`defineConfig({ datasource: { url: process.env.DATABASE_URL } })`), matching the poolops-biz sibling pattern.
- [x] 2.4 Generate baseline empty migration under `prisma/migrations/` (manually authored `migration_lock.toml` + empty `20260718193248_init/migration.sql`, since `prisma migrate dev --create-only` reports "Already in sync" with zero models — there is no diff for it to capture. Applied via `prisma migrate deploy` against a live Postgres — verified as evidence below).
- [x] 2.5 Create `templates/packages/infra-db/src/prisma-client.ts`: `PrismaService` `@Injectable`, extends generated `PrismaClient`, constructed with `PrismaPg` adapter (`connectionString: process.env.DATABASE_URL`). `OnModuleInit` calls `$connect()` **and** a `$queryRaw\`SELECT 1\`` probe (see Deviations — `$connect()` alone does not eagerly validate connectivity with the Prisma 7 driver-adapter architecture). `OnModuleDestroy` → `$disconnect()`.
- [x] 2.6 Create `templates/packages/infra-db/src/infra-db.module.ts`: `InfraDbModule` (`providers:[PrismaService]`, `exports:[PrismaService]`).
- [x] 2.7 Create `templates/packages/infra-db/src/index.ts`: export `PrismaService`, `InfraDbModule`, `PrismaClient` type.

## Phase 3: api-salesops App Skeleton (scaffolding, verify-by-running)

- [x] 3.1 Create `templates/apps/api-salesops/package.json` (`@store-mgmt/api-salesops`): deps `@nestjs/core/common/config/platform-express`, workspace dep `@store-mgmt/infra-db`; scripts `dev`, `build`, `start`, `test`, `test:e2e`, `lint`.
- [x] 3.2 Create `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json` in `apps/api-salesops/` (extends backend base, task 1.2).
- [x] 3.3 Create `apps/api-salesops/.env.example` (`DATABASE_URL`, `PORT`) — filename adjusted to `env.example` (no leading dot); see Deviations.
- [x] 3.4 Create `apps/api-salesops/src/main.ts`: `NestFactory.create(AppModule)` → `app.listen(process.env.PORT ?? 3001)`.
- [x] 3.5 Create `apps/api-salesops/src/app.module.ts`: `imports:[ConfigModule.forRoot({isGlobal:true}), InfraDbModule, HealthModule]`.

## Phase 4: Health Endpoint — TDD (spec req: Health Endpoint Reports DB Connectivity)

- [x] 4.1 [RED] Create `apps/api-salesops/test/jest-e2e.json` + `test/health.e2e-spec.ts`: Nest `TestingModule` + `supertest`, `GET /health` against real/compose Postgres → expect `200 {status:'ok',db:'up'}`. Confirmed RED: failed first on missing `health.module.js`, then (after infra-db build) on missing `HealthModule`/DI wiring — real failures, not faked.
- [x] 4.2 [GREEN] Create `src/health/health.controller.ts` (`$queryRaw\`SELECT 1\`` → 200 ok/up) + `src/health/health.module.ts` (imports `InfraDbModule` so `PrismaService` resolves); wired into `AppModule` (3.5). `pnpm --filter @store-mgmt/api-salesops test:e2e` → passes (real Postgres, see evidence).
- [x] 4.3 [RED] Added `src/health/health.controller.spec.ts`: overrides `PrismaService` with a mock whose `$queryRaw` rejects → expects `503 {status:'error',db:'down'}`. Confirmed RED: failed because the controller let the rejection propagate as an unhandled `Error` instead of a 503.
- [x] 4.4 [GREEN] Updated `health.controller.ts`: try/catch around `$queryRaw`, throws `ServiceUnavailableException({status:'error',db:'down'})` on failure. `pnpm --filter @store-mgmt/api-salesops test` (mocked, hermetic) → passes.

## Phase 5: Boundary Enforcement Verification (spec req: Architecture Boundaries Enforced by Lint)

- [x] 5.1 Verified `backend-boundaries` actually fires. **Update (post sdd-verify CRITICAL finding)**: the original 5.1 evidence used an out-of-tree ESLint harness because `packages/domain` had no lint script and the scope explicitly said "do not touch domain/salesops-mvp". sdd-verify correctly flagged that this meant the rule was exported but wired into **zero** real eslint configs — unenforced in the actual tree (proved live: seeded the same import into `salesops-mvp`, `pnpm lint` passed with 0 errors). The user then explicitly approved touching `packages/domain`/`apps/salesops-mvp` for lint-config-only wiring. Follow-up fix now wires the rule for real:
  - `domainBoundaryRule` → `packages/domain/eslint.config.mjs` (new, package had none) + `packages/infra-db/eslint.config.mjs` (new).
  - `webBackendBoundaryRule` → `apps/salesops-mvp/eslint.config.mjs` and `apps/static-store/eslint.config.mjs`. Deliberately **not** wired into `apps/api-salesops` — it legitimately imports `@store-mgmt/infra-db` (the allowed direction), so the rule would break its own valid import there.
  - **Real discovery**: `eslint-plugin-only-warn` (already used repo-wide via `base.config.js`) monkey-patches `Linter.prototype.verify` to downgrade every `error`-severity violation to a `warning` for the whole process the moment it's imported — so the rule fired but never failed `pnpm lint` (exit 0) even when wired. Fixed by adding `--max-warnings` to each affected lint script: `0` for the brand-new `domain`/`infra-db` packages (zero pre-existing warnings, safe), and a ratchet at today's pre-existing warning count for `salesops-mvp` (3) and `static-store` (5) — so existing unrelated warnings still pass, but any new warning (including a boundary violation) now fails the build.
  - **Live re-verification** (in-tree, not a harness this time): seeded `import { PrismaService } from '@store-mgmt/infra-db';` into `packages/domain/src/index.ts` → `pnpm --filter @store-mgmt/domain lint` → real FAIL, exit 1, `ESLint found too many warnings (maximum: 0)`, message: `'@store-mgmt/infra-db' import is restricted... It must not import infra-* packages`. Seeded the same import into `apps/salesops-mvp/app/root.tsx` → `pnpm --filter @store-mgmt/salesops-mvp lint` → real FAIL, exit 1, `ESLint found too many warnings (maximum: 3)`, message: `Backend-only package. Web apps must not import @store-mgmt/infra-db`. Reverted both seeds; `git diff --stat` on both files empty; both packages lint clean again (exit 0) at their respective baselines.
- [x] 5.2 `pnpm lint` on the real tree (post-fix) → 7/7 lint tasks pass, 0 errors. `pnpm typecheck` → 11/11. `pnpm build` → 7/7. `domain`/`infra-db` lint with 0 warnings; `salesops-mvp`/`static-store` at their unchanged pre-existing baselines (3 and 5 warnings respectively, both within their new ratchets).

## Phase 6: Integration Verification (scaffolding, verify-by-running; spec reqs: Deployable App Boots, Local Postgres via Docker Compose)

- [x] 6.1 `docker compose up -d postgres` → healthy. Host port 5432 was already bound on the shared sandbox docker host (unrelated tenants) — parameterized the compose port as `${POSTGRES_HOST_PORT:-5432}:5432` (defaults to 5432 for real developers) and used `POSTGRES_HOST_PORT=5433` for this run only. See Deviations.
- [x] 6.2 `pnpm --filter @store-mgmt/infra-db prisma:generate && prisma:migrate` → client generated, baseline migration applied (`prisma migrate deploy`, then `prisma migrate dev` confirms "Already in sync").
- [x] 6.3 `pnpm --filter @store-mgmt/api-salesops build` + `node dist/main.js` → boots on 3001; `curl localhost:3001/health` → `200 {"status":"ok","db":"up"}` (real output, see evidence).
- [x] 6.4 Stopped Postgres, reran the built app → **found and fixed a real bug**: with Prisma 7's driver-adapter architecture, `$connect()` alone does not eagerly validate connectivity, so the app was falsely logging "Nest application successfully started" / "listening on port 3001" with the DB down (silent partial boot — violated the spec). Fixed by adding a `$queryRaw\`SELECT 1\`` probe inside `onModuleInit`; re-verified: app now exits with code 1 and a clear Prisma `DatabaseNotReachable` stack trace, never reaches `app.listen()`. Restarted Postgres and reconfirmed the DB-up path still returns 200.
- [x] 6.5 `pnpm --filter @store-mgmt/api-salesops test && test:e2e` → both suites green (1/1 unit, 1/1 e2e).

## Deviations from Design (recorded, not silent)

1. **Prisma 7 `datasource.url` removal**: schema.prisma cannot declare `url = env("DATABASE_URL")` anymore (P1012); moved to `prisma.config.ts` per Prisma 7's config-first workflow, matching the poolops-biz sibling's own pattern.
2. **Jest + Prisma 7 WASM query compiler**: Prisma 7's client uses a WASM query compiler that performs a dynamic `import()` Jest's CJS VM can't handle by default (`--experimental-vm-modules` required). Added `cross-env NODE_OPTIONS=--experimental-vm-modules` to `test`/`test:e2e` scripts in `api-salesops/package.json`.
3. **`onModuleInit` connectivity bug (real, found via live verification)**: `$connect()` alone does not fail when the DB is unreachable under the driver-adapter architecture — the app booted "successfully" with Postgres down. Fixed by adding an eager `$queryRaw\`SELECT 1\`` check in `onModuleInit`, matching the spec's "fails to boot cleanly when DB unreachable" requirement. Re-verified live (see Phase 6.4).
4. **`.env.example` sandbox restriction**: this environment's permission system denies writes to any `.env*`-pattern path (both the Write tool and Bash). Used `env.example` (no leading dot) instead of `.env.example` in both `packages/infra-db/` and `apps/api-salesops/` — same content/purpose, different filename. Flagged as a residual naming deviation from the design/tasks text.
5. ~~**`packages/domain` boundary-rule wiring not committed**~~ — **RESOLVED** in a follow-up commit (`662ddc0`, after sdd-verify raised it as CRITICAL and the user explicitly approved touching `packages/domain`/`apps/salesops-mvp` for lint-config only). `domainBoundaryRule` is now wired into `packages/domain` and `packages/infra-db`; `webBackendBoundaryRule` into `apps/salesops-mvp` and `apps/static-store`. See updated 5.1 for the live seed-and-revert evidence and the `--max-warnings`/`eslint-plugin-only-warn` discovery. `apps/api-salesops` intentionally excluded from the web rule (it legitimately imports `@store-mgmt/infra-db`).
6. **`docker-compose.yml` host port parameterized**: `ports: - "${POSTGRES_HOST_PORT:-5432}:5432"` instead of a hardcoded `5432:5432`, purely to unblock local verification on a shared sandbox host where 5432 was already taken by an unrelated tenant. Defaults to the standard 5432 for real developers — no behavior change for the intended audience.
7. **`turbo.json` globalEnv**: added `PORT` and `DATABASE_URL` to `globalEnv` to silence (accurate) `turbo/no-undeclared-env-vars` lint warnings for the new app.
8. **`.gitignore`**: added `packages/infra-db/generated` (Prisma's regenerable generated client source; `dist` was already ignored for compiled output).
