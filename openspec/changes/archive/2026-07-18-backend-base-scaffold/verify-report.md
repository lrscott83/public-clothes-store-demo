# Verification Report — backend-base-scaffold

**Change**: backend-base-scaffold
**Mode**: hybrid (engram + openspec file)
**Branch**: salesops-monedas
**Verified**: 2026-07-18
**Verdict**: **FAIL** (one blocking CRITICAL; everything else PASS)

## Executive Summary

The walking skeleton itself is solid and independently re-verified end-to-end
(real Postgres up/down, real `curl /health`, both Jest suites, full monorepo
lint/typecheck/build). One blocking CRITICAL: the `backend-boundaries` ESLint
rule set is exported but not wired into **any** eslint config in the repo
(not `packages/domain`, not `packages/infra-db`, not `salesops-mvp`, not
`static-store`, not even `api-salesops` itself) — I proved this live by
seeding a violating `@store-mgmt/infra-db` import into `salesops-mvp` and
running `pnpm --filter salesops-mvp lint`: it passed clean (0 errors), then
reverted with zero diff. Requirement 4 explicitly demands enforcement "rather
than by convention alone," and today it is convention only.

**CRITICAL: 1 · WARNING: 1 · SUGGESTION: 2**

## Task Completeness

24/24 tasks in `openspec/changes/backend-base-scaffold/tasks.md` marked `[x]`.
Cross-checked against actual code state — all scaffolding claims verified
present on disk (see file inventory below). No task falsely marked complete.

## Test Execution Evidence (real output, re-run independently)

| Command | Result |
|---|---|
| `pnpm --filter @store-mgmt/api-salesops test` | **PASS** — 1/1 (mocked DB-down → 503) |
| `pnpm --filter @store-mgmt/api-salesops test:e2e` (real Postgres via `docker compose`, `host.docker.internal:5433`) | **PASS** — 1/1 (real DB-up → 200) |
| `pnpm lint` (root, turbo, all 5 lintable packages) | **PASS** — 0 errors, only pre-existing unrelated warnings in `salesops-mvp`/`static-store` |
| `pnpm typecheck` (root, turbo, 11 tasks) | **PASS** — 11/11 |
| `pnpm build` (root, turbo, 7 tasks) | **PASS** — 7/7 |
| `pnpm test` (root, turbo, all packages) | **PASS** — 7/7 tasks, 534 tests in salesops-mvp alone, api-salesops included |
| Live boot, DB up: `node dist/main.js` + `curl localhost:3099/health` | **PASS** — `200 {"status":"ok","db":"up"}` |
| Live boot, DB down (`docker stop store-mgmt-postgres`, fresh `node dist/main.js`) | **PASS** — exit code **1**, `DatabaseNotReachable` trace, 0 occurrences of "listening on port" in the log — never reached `app.listen()` |
| `packages/domain` / `apps/salesops-mvp` diff since last real edit | **PASS** — zero diff (`git diff --stat` empty; last touching commit is unrelated `716d367`) |

Sandbox notes reproduced from apply-progress, confirmed still accurate:
- Docker requires `sudo -n docker ...` in this session (permission denied on the raw socket otherwise).
- `127.0.0.1:5433` refused from the session shell; only `host.docker.internal:5433` reaches the compose container.
- Host port 5432 is occupied by another tenant (`poolops-postgres`); used `POSTGRES_HOST_PORT=5433` as apply-progress documented.

## Spec Compliance Matrix

| # | Requirement | Scenario | Status | Evidence |
|---|---|---|---|---|
| 1 | Deployable NestJS App Boots | App starts with DB reachable | ✅ PASS | Live: built app booted, `InfraDbModule`/`HealthModule` init logs present, `curl` 200 |
| 1 | Deployable NestJS App Boots | App fails to boot when DB unreachable | ✅ PASS | Live: DB stopped, fresh boot exits 1, `DatabaseNotReachable`, zero "listening" log lines |
| 2 | Health Endpoint Reports DB Connectivity | DB reachable → 200 | ✅ PASS | `test:e2e` green vs real Postgres + manual curl |
| 2 | Health Endpoint Reports DB Connectivity | DB unreachable → 503, no 500 | ✅ PASS | `test` green — `health.controller.spec.ts` mocks `$queryRaw` rejection, asserts 503 body, real try/catch → `ServiceUnavailableException` in `health.controller.ts` |
| 3 | infra-db exposes PrismaService/InfraDbModule | Connects on module init | ✅ PASS | Live DB-up boot + e2e test both exercise `onModuleInit`'s `$connect()` + eager `SELECT 1` probe |
| 3 | infra-db exposes PrismaService/InfraDbModule | Disconnects on module destroy | ⚠️ WARNING (untested) | `onModuleDestroy` calls `$disconnect()` in `prisma-client.ts:32-34` but `packages/infra-db` ships **zero** test files (`"test": "jest --passWithNoTests"`) — no automated or live proof this path executes. Also `main.ts` never calls `app.enableShutdownHooks()`, so in a real process this hook won't even fire on SIGTERM today. |
| 3 | infra-db exposes PrismaService/InfraDbModule | InfraDbModule exports PrismaService | ✅ PASS | Proven end-to-end: `HealthModule` imports `InfraDbModule` (not just `AppModule`) and DI resolves in both the unit test (mocked) and e2e test (real) |
| 4 | Architecture Boundaries Enforced by Lint | Domain cannot import infra/apps | ❌ **CRITICAL — FAIL** | `packages/domain` has no ESLint config at all; rule is never evaluated for domain code |
| 4 | Architecture Boundaries Enforced by Lint | Web apps cannot import backend-only packages | ❌ **CRITICAL — FAIL** | **Live-reproduced**: added `import { PrismaService } from '@store-mgmt/infra-db'` to `apps/salesops-mvp/app/root.tsx`, ran `pnpm --filter salesops-mvp lint` → 0 errors (3 pre-existing warnings only). Reverted, `git diff` empty. `salesops-mvp/eslint.config.mjs` only spreads `@store-mgmt/eslint-config/react-router`, never `backend-boundaries`. |
| 4 | Architecture Boundaries Enforced by Lint | Legal imports pass lint | ⚠️ Vacuously true | `api-salesops` lints clean, but only because its own `eslint.config.mjs` also never imports `backend-boundaries` — the rule isn't checked for its own legal import either, so this isn't proof of correct discrimination, just proof nothing is wired anywhere |
| 5 | Local Postgres via Docker Compose | Postgres starts and is healthy | ✅ PASS | `docker compose up -d postgres` → `healthy` in ~15s; `api-salesops` connected successfully in the same run |

## CRITICAL Findings

### C1 — `backend-boundaries` ESLint rule is exported but wired into zero configs (blocks Requirement 4)

- **File refs**: `templates/packages/eslint-config/backend-boundaries.config.js` (rule defined, exported via `package.json` `./backend-boundaries`), but not imported by `templates/packages/domain` (no eslint config exists), `templates/packages/infra-db` (no eslint config exists), `templates/apps/salesops-mvp/eslint.config.mjs`, `templates/apps/static-store/eslint.config.mjs`, or even `templates/apps/api-salesops/eslint.config.mjs`.
- **Why it's CRITICAL, not a residual WARNING**: the spec's Requirement 4 text is explicit — "so hexagonal boundaries are enforced automatically **rather than by convention alone**." I directly falsified enforcement: a live-seeded illegal import (`salesops-mvp` → `@store-mgmt/infra-db`) passed `pnpm lint` with 0 errors. This is not a naming/tooling nuance (like the `.env.example` deviation) — it's the literal negation of the requirement's stated purpose, proven by execution, not inferred.
- **Mitigating context** (already recorded honestly in apply-progress/tasks.md, and I don't relitigate the *reasoning* — only the compliance verdict): `packages/domain` had zero ESLint config or `lint` script before this change (pre-existing gap), and the change's explicit scope said "do not touch `packages/domain` or `apps/salesops-mvp`." That explains *why* the gap exists and *why* it wasn't safe to close inside this PR's stated scope — it does not change that the requirement, as written, is unmet in the current repo state.
- **Fix is small and well-scoped**: spread `domainBoundaryRule` into a new minimal `packages/domain/eslint.config.mjs` (+ a `lint` script), spread `webBackendBoundaryRule` into `salesops-mvp`'s and `static-store`'s existing `eslint.config.mjs`, and (for completeness/symmetry) confirm `api-salesops`'s own config also spreads it so the "legal imports pass" scenario is actually exercised rather than vacuous. This does touch `packages/domain`/`salesops-mvp`, so it needs either an explicit scope amendment or a fast, tightly-scoped follow-up SDD change/task — recommend the latter given the original "do not touch domain" constraint was likely about domain *logic*, not lint tooling, but that's a call for the user/orchestrator, not this report.

## WARNING Findings

### W1 — `PrismaService.onModuleDestroy` disconnect path has zero test coverage

- **File ref**: `templates/packages/infra-db/src/prisma-client.ts:32-34`; `templates/packages/infra-db/package.json` (`"test": "jest --passWithNoTests"` — no spec files exist in the package at all).
- Per the strict-TDD verify rule ("a spec scenario is compliant only when a covering test passed at runtime"), this scenario is technically UNTESTED — no unit test asserts `$disconnect()` is called, and no live verification (unlike the connect/boot-fail paths, which I directly reproduced) exercised graceful shutdown.
- Downgraded from CRITICAL to WARNING because: (a) the implementation is a one-line delegate to Prisma's own `$disconnect()`, near-zero custom logic/risk; (b) the design doc explicitly scoped TDD-able work to only the health check, treating other infra glue as "verified by running the system" — but no such live verification for shutdown was actually performed either, hence still flagged, just not blocking.
- Secondary gap noted for completeness: `main.ts` never calls `app.enableShutdownHooks()`, so `onModuleDestroy` will not fire on process signals in a real deployment today regardless of test coverage — worth a follow-up task if graceful shutdown matters operationally.

## SUGGESTION Findings

### S1 — `.env.example` files use non-standard filename (`env.example`, no leading dot)

Documented deviation in `templates/packages/infra-db/env.example` and `templates/apps/api-salesops/env.example` — caused by this sandbox blocking writes to any `.env*`-pattern path, not a design choice. Low risk, but a real developer following the design doc's file structure (`## 6. File structure` lists `.env.example`) will not find that exact filename. Suggest renaming to the dotted convention once outside this constrained sandbox, or adding a one-line README note.

### S2 — `docker-compose.yml` host port parameterization is undocumented outside the SDD artifacts

`ports: - "${POSTGRES_HOST_PORT:-5432}:5432"` is a sound, low-risk change (defaults unchanged for real developers), but nothing in `templates/README.md` (if any) or `env.example` mentions `POSTGRES_HOST_PORT` exists. Low-cost documentation addition.

## Design Coherence

Implementation matches `design.md` closely: Prisma 7 injectable `PrismaService` (not the poolops `Proxy` singleton), no `@nestjs/terminus`, port 3001, single empty schema/migration, lean scope respected (no tenancy/auth/worker/`api-common`). The two documented deviations (Prisma 7 `datasource.url` → `prisma.config.ts`; Jest `NODE_OPTIONS=--experimental-vm-modules`) are both real, both baked into checked-in config (`prisma.config.ts`, `package.json` scripts via `cross-env`), and both independently reproduced by me from a clean shell with no manual env-var tweaking beyond `DATABASE_URL`/`PORT` for the DB connection itself.

## Assertion Quality (Strict TDD)

Both test files (`health.controller.spec.ts`, `health.e2e-spec.ts`) assert distinct, meaningful values (200/`up` vs 503/`down`), call real production code (`controller.check()`, real HTTP request via `supertest`), and contain no tautologies, ghost loops, or smoke-test-only patterns.

**Assertion quality**: ✅ All assertions verify real behavior — 0 CRITICAL, 0 WARNING.

## Recommendation

Do not archive yet. Recommend a small, explicitly-scoped follow-up (either an amendment to this change or a fast-follow task) that:
1. Wires `domainBoundaryRule` into a new minimal `packages/domain/eslint.config.mjs` + `lint` script.
2. Wires `webBackendBoundaryRule` into `salesops-mvp` and `static-store`'s existing `eslint.config.mjs`.
3. Wires the appropriate rule into `api-salesops`'s own config so the "legal imports pass" scenario stops being vacuous.
4. Re-runs the live seed-and-revert probe (as done in this report) to confirm the violation is now caught, then reverts.

Everything else (health endpoint, boot fail-fast, Docker compose, Prisma wiring, DI, all test suites, lint/typecheck/build) is solid and independently re-verified end-to-end.
