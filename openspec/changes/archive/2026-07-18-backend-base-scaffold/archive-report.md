# Archive Report — backend-base-scaffold

**Date Archived**: 2026-08-06
**Change Status**: CLOSED
**Original Verdict** (2026-07-18): FAIL — 1 CRITICAL, 1 WARNING, 2 SUGGESTION
**Closing Verdict** (2026-08-06): PASS — CRITICAL closed, WARNING partially closed (one residual, see below)

## Executive Summary

`backend-base-scaffold` delivered the walking skeleton: a deployable NestJS 11
`api-salesops` wired to real Postgres through `infra-db`, a dependency-free
`GET /health`, a Docker Compose Postgres 16, and a `backend-boundaries` ESLint
rule set. 27/27 tasks complete.

Its `sdd-verify` (Engram `#1258`, file twin `verify-report.md`) returned **FAIL**
on one blocking CRITICAL. The change sat unarchived for that reason. The CRITICAL
was closed by subsequent work, not by this change, and was re-confirmed against
the working tree on 2026-08-06 before archiving.

## CRITICAL — CLOSED

**Finding (2026-07-18)**: `backend-boundaries` (`domainBoundaryRule`,
`webBackendBoundaryRule`) was exported from `packages/eslint-config` but wired
into **zero** actual `eslint.config.mjs` files. Verify proved it live by seeding
`import { PrismaService } from '@store-mgmt/infra-db'` into
`apps/salesops-mvp/app/root.tsx` and observing `pnpm --filter salesops-mvp lint`
return 0 errors. Spec Requirement 4 demands boundaries be "enforced automatically
rather than by convention alone"; at the time it was convention alone.

**Closed on 2026-08-06.** Re-inspected the working tree:

| Config | Rules wired |
|---|---|
| `templates/packages/domain/eslint.config.mjs` | `domainBoundaryRule` |
| `templates/packages/infra-db/eslint.config.mjs` | `domainBoundaryRule`, `tenantRepoBoundaryRule` |
| `templates/apps/salesops-mvp/eslint.config.mjs` | `webBackendBoundaryRule` |
| `templates/apps/static-store/eslint.config.mjs` | `webBackendBoundaryRule` |

`tenantRepoBoundaryRule` is additional coverage introduced by
`multi-tenant-by-schema` task 14.1 (commit `fe94ecf`), guarding tenant
repositories against the master Prisma client.

The main spec (`openspec/specs/salesops-backend/spec.md`) was amended when merged
so this cannot silently regress: Requirement 4 now names the wiring table
explicitly and adds a scenario requiring that a seeded violation actually exit
non-zero. Exporting a rule no longer satisfies the requirement.

## WARNING — partially closed, one residual

**Finding (2026-07-18)**: `packages/infra-db` had ZERO test files
(`"test": "jest --passWithNoTests"`), leaving spec Req 3's
`onModuleDestroy`/`$disconnect()` scenario with no coverage. Verify also noted
that `main.ts` never calls `app.enableShutdownHooks()`, so the hook would not
fire on SIGTERM in a real deployment regardless.

**First half CLOSED**: `packages/infra-db` now has **36** `.spec.ts` files
(master/tenant repositories, provisioning, tenant-schema helpers), added across
`backend-*` and `multi-tenant-by-schema`.

**Second half OPEN**: `templates/apps/api-salesops/src/main.ts` still does not
call `app.enableShutdownHooks()` — confirmed by grep on 2026-08-06. Nest
therefore never fires `onModuleDestroy` on SIGTERM, so
`PrismaMasterService.onModuleDestroy` does not run in a real deployment. The
spec scenario "PrismaMasterService disconnects on module destroy" is satisfied
at the unit level but not on a real shutdown path.

This is carried forward as a known, owner-visible gap rather than silently
fixed during archiving. It is a one-line change in `main.ts`.

## SUGGESTIONS — carried forward, not blocking

1. `env.example` (no leading dot, a sandbox constraint) is undocumented for real developers.
2. `POSTGRES_HOST_PORT` compose parameterization is undocumented outside SDD artifacts.

## Artifacts Archived

Moved from `openspec/changes/backend-base-scaffold/` to
`openspec/changes/archive/2026-07-18-backend-base-scaffold/`:

- `proposal.md`
- `design.md`
- `tasks.md` — 27/27 complete
- `verify-report.md` — the original FAIL verdict, preserved as-is
- `specs/salesops-backend/spec.md` — the delta spec, preserved as written in July

## Specs Merged

`specs/salesops-backend/spec.md` → `openspec/specs/salesops-backend/spec.md` (NEW capability).

The merge was **not** a verbatim copy. The July delta spec described a
pre-multi-tenant world and would have enshrined statements that are no longer
true. Updated on merge:

| Delta spec said | Main spec now says | Why |
|---|---|---|
| `infra-db` exposes `PrismaService` | `InfraDbModule` exports `PrismaMasterService` plus `TenantPrismaFactory`, `TenantContextService`, `TenantDatabaseService` | `PrismaService` was **deleted** in `multi-tenant-by-schema` task 14.2 along with the pre-split monolith client |
| `onModuleInit` establishes the connection | fail-fast depends on the eager `SELECT 1`, which MUST be retained | `$connect()` alone does not fail fast under the driver-adapter + WASM query-compiler architecture |
| boundaries rule set MUST exist | per-package wiring table + a scenario requiring a seeded violation to exit non-zero | the original CRITICAL was exactly "rule exists, wired nowhere" |
| — | `tenantRepoBoundaryRule` scenario | added by task 14.1, governs the same capability |
| — | `GET /health` MUST stay the one unguarded controller | tenancy work put `@UseGuards` on 10 of 11 controllers; health must stay probe-able |
| Out of scope: multi-tenancy, IdP/auth | now cross-references `salesops-tenancy/spec.md` and `salesops-identity/spec.md` | those capabilities now exist |

Health-endpoint mechanics, the boot/port contract, and the Docker Compose
requirement were carried over unchanged — all re-confirmed against the working
tree on 2026-08-06.

## Related

- `archive/2026-08-06-multi-tenant-by-schema/` — closed this change's CRITICAL and reshaped its `infra-db` surface
- `openspec/specs/salesops-tenancy/spec.md` — tenancy requirements, deliberately not duplicated here
