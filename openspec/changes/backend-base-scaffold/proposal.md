# Proposal — Backend base scaffold (lean hexagonal skeleton)

Stand up the **first backend deliverable** of the `store-mgmt` monorepo: a walking
skeleton of the target hexagonal architecture that boots end-to-end and proves its
own plumbing with a `GET /health` endpoint that pings a real Postgres. It ships the
structural bones — a NestJS app, a Prisma infra package, enforced architecture
boundaries, and local Docker infra — **without any domain module yet**. It de-risks
every future backend slice (Currency is next) by making "the way things should be"
runnable and verifiable today.

## Intent

| Question | Answer |
|---|---|
| **Problem** | The monorepo has an authoritative target architecture but no runnable backend. Every future module (Currency, Sales…) would otherwise pay the setup tax and risk drifting from the intended shape. |
| **Why now** | Currency is the next SDD change and needs a proven `domain → infra-db → api` spine to land into. Scaffolding first keeps that slice purely about business logic. |
| **Success** | `docker compose up` + `pnpm dev` boots `api-salesops`; `curl :3001/health` returns `200 {status:'ok', db:'up'}` against real Postgres; e2e test green; `pnpm lint` enforces `backend-boundaries`. |

## Scope

### In scope
- **App** `apps/api-salesops` — deployable NestJS 11 app that boots on port **3001**.
- **Package** `packages/infra-db` — Prisma 7 + `@prisma/adapter-pg` wrapping Postgres 16, exposing an injectable `PrismaService` and `InfraDbModule`.
- **Endpoint** `GET /health` — direct `SELECT 1` ping: DB up → `200 {db:'up'}`, DB down → `503 {db:'down'}`.
- **Boundaries** — `backend-boundaries` ESLint rule in `packages/eslint-config`: domain must not import `infra-*`/apps; web apps must not import backend packages.
- **Local infra** — `docker-compose.yml` with `postgres:16-alpine`.
- **Empty Prisma schema** — datasource + generator, **no models**, baseline migration.
- All new files live under `templates/`.

### Out of scope (YAGNI — added when the business asks)
- Any **domain module** — Currency and successors are separate SDD changes.
- `api-common` shared Nest plumbing — only one app, no shared wiring yet.
- Multi-tenancy, IdP/auth, JWT, background/job worker.
- `@nestjs/terminus` — a direct query suffices for the skeleton.
- **No changes** to `@store-mgmt/domain`, `salesops-mvp`, or `static-store`. `salesops-mvp` stays **frozen** as the MVP mirror.

### Capability note
The delta spec (next phase) targets a **new** capability named `salesops-backend` — distinct from the existing `salesops-mvp` capability, which is untouched by this change.

## Approach

Adopt the proven `poolops-biz` hexagonal shared-kernel pattern in **lean form**: keep
the ports/adapters spine and enforced boundaries, drop the operational weight
(tenant/auth/worker) that a shop doing 3–6 orders/day does not need.

| Decision | Resolution | Rationale |
|---|---|---|
| Deliverable scope | Empty skeleton + health check | Isolate infra setup from business logic; Currency lands clean next |
| Fidelity to poolops | Lean (no tenant/auth/worker) | Match real load; YAGNI |
| `api-common` | Not created | No shared Nest plumbing with a single app |
| DB engine | Postgres 16 | Mirrors poolops; Prisma default |
| Health check | Direct `SELECT 1`, no terminus | Sufficient for a skeleton; one fewer dependency |
| App port | 3001 | Avoid clashing with web apps on 3000 |
| Boundary enforcement | ESLint `backend-boundaries` | A rule that lives only in a doc rots; codify it |

**Testability boundary:** the only TDD-able unit is the health check (test-first:
RED without controller → GREEN). Pure config artifacts (docker-compose, tsconfig,
nest-cli, empty schema) are verified by running the system, not by tests.

## Downstream (not in this change)
- Update `docs/system/architecture.md`: replace "`infra-*`/`api-*` when needed" with the committed stack and mark `api-salesops` + `infra-db` as existing.
- First domain module: **Currency & Exchange Rates** — vertical slice `domain → infra-db → api`, as its own SDD change.

## Next step
Proceed to **sdd-spec** (delta spec for capability `salesops-backend`) and
**sdd-design** — they can run in parallel off this proposal.
