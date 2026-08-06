# Verification Report — multi-tenant-by-schema

**Mode**: Strict TDD (tasks.md carries [RED]/[GREEN] markers per task, used as the
evidence trail — apply-progress spans 14 phases across multiple prior batches).
**Verdict**: **PASS WITH WARNINGS**

## Completeness

223/223 lines of `tasks.md` checked `[x]`. No open task items. Every mid-flight
stop-and-report item (6.5, 8.3, 10.2, 12.2) has an owner decision recorded inline,
not left silently open.

## Build & Tests (fresh re-run at HEAD, this verification pass)

| Suite | Result |
|---|---|
| `pnpm build` | 9/9 |
| `pnpm typecheck` | 14/14 |
| `pnpm lint` | 9/9 (pre-existing under-budget warnings only, static-store/salesops-mvp) |
| `domain` (vitest) | 294/294 |
| `api-common` | 43/43 |
| `infra-db` (`pnpm test`, real Postgres) | 299/299, 36 suites |
| `api-idp` unit | 68/68 |
| `api-salesops` unit | 318/318 |
| `api-salesops` e2e (after rebuilding `domain`+`infra-db` dist) | 85/85, 9 suites |
| `api-idp` e2e | 13/13 |
| Leftover `store_mgmt_tenant_%` schemas after full run | 0 |
| Working tree | clean before and after (git status empty) |

All numbers match apply-progress's self-reported baseline exactly — no regression,
no fabrication detected.

## Six pointed claims — verified by direct source read + execution, not by trusting the report

1. **Cross-schema isolation proof** (`apps/api-salesops/test/tenant-isolation.e2e-spec.ts`,
   commit `7e120ce`) — genuinely adversarial: exact `search_path` string equality
   (not `.toContain`) guards the `,public` regression; a row's PHYSICAL absence is
   proven via tenant B's own raw Prisma client, not just an HTTP 404; a `@unique`
   slug succeeding independently in both tenants proves two physical tables, not a
   filter; the ambiguous-membership no-header case asserts `400`. This test would
   fail if isolation broke. **COMPLIANT**.
2. **Tenant client fails loud, no fallback** — `TenantContextService.getClient()`
   throws `TenantContextNotActiveError`, no catch/fallback path exists
   (`packages/infra-db/src/tenant/tenant-context.service.ts`). `TenantPrismaFactory`'s
   pool `options: '-c search_path="<schema>"'` carries the tenant schema alone, no
   `,public` (`tenant-prisma-factory.ts:134`). Cross-checked live: `SHOW search_path`
   in the isolation e2e returns exactly `"<schema>"`. **COMPLIANT**.
3. **Real guard, not stubbed** — `overrideGuard(TenantContextGuard...)` does not
   appear anywhere under either app's `test/*.e2e-spec.ts`. The only
   `overrideGuard(TenantContextGuard)` usages are in
   `apps/api-salesops/src/test-support/auth-test-helpers.ts` and
   `*.controller.spec.ts` — unit tests, Phase 8.2's documented mock, never the e2e
   layer. **COMPLIANT**.
4. **Single migration tool, loud drift, tool's-own destructive guard** —
   `tenant-migrate.ts`'s `DESTRUCTIVE_PATTERN` regex scans `migrate diff`'s own
   emitted SQL and refuses `DROP TABLE`/`DROP COLUMN` unless `--allow-destructive`;
   `migrate diff` itself has no such gate of its own (confirmed by 11.1's spike,
   cited in the same file's comments). **COMPLIANT**.
5. **Master Membership gates access, ambiguity → 400** —
   `TenantContextGuard.resolveSoleActiveMembership` calls `listActiveByUserId`,
   throws `BadRequestException` (400) when `active.length > 1`, never silently
   picks one; `prisma-membership.repository.spec.ts` has a dedicated case
   "returns EVERY ACTIVE Membership, never just the first". Exercised live in this
   pass's api-salesops e2e run (`AMBIGUOUS_MEMBERSHIP` log line) and the isolation
   spec's dual-membership case. **COMPLIANT**.
6. **D7 saga** (`apps/api-idp/src/company/create-company.saga.ts`) — 6 steps as
   designed, reverse-order compensation (`compensate()`), each step's failure caught
   by `attemptCompensation`, which writes `IProvisioningIncidentRepository.create(...)`
   on failure (not console-only), and never rethrows so remaining compensations
   still run. **COMPLIANT**.

## Known open item — consequence assessment (not re-reported as a discovery)

Task 14.2's live `prisma migrate reset && pnpm seed` did not run (Prisma AI-agent
consent guardrail, correctly respected by apply). Verified this pass, read-only:
`public` still holds 27 tables (18 legacy + 8 master + `_prisma_migrations`),
`_prisma_migrations` still carries all 17 legacy rows plus the 2 new
master-baseline rows. However `npx prisma migrate status` / `migrate deploy`
(read-only, actually run this pass) both report "up to date" / "no pending
migrations" cleanly — the stale rows do NOT break Prisma's own tooling for
`status`/`deploy` (only `migrate dev`'s full-DB drift check would complain, per
engram #1840). Master table row counts (`company`=1, `app_user`=9, `membership`=0,
`template_category`=0, `template_product`=0) show the pre-existing `company`/
`app_user` rows predate this change, and that `prisma/seed.js`'s new orchestration
has never run against this live DB even once — `seedTemplateCatalog` has zero
recorded executions here.

Genuinely unverified as a result: the literal `node prisma/seed.js` entrypoint's
own wiring (require-path resolution, argument order into
`provisionCompany`/`grantCockpitRoles`/`seedCustomers`/`seedOrders`) has never been
runtime-exercised as an integrated whole — every function it calls is
independently proven against real Postgres, but the script's own sequencing is
not. This verification pass did not attempt to run it (it mutates shared dev
state — the same consent boundary the apply agent already respected).

## Issues Found

**CRITICAL**: None.

**WARNING**:
- The literal `prisma/seed.js` orchestration script has zero recorded successful
  executions against the live dev DB — genuinely open until the owner runs the
  deferred reset.
- The live dev DB currently mixes 18 legacy tenant-side tables with 8 new master
  tables in `public`, plus 17 stale `_prisma_migrations` rows — harmless to
  `migrate status`/`deploy` and to test isolation (confirmed), but a real, visible
  inconsistency for any operator inspecting `public` today.

**SUGGESTION**: None beyond design.md §7's own open items (pool `max`=5
unmeasured, TemplateCategory/TemplateProduct column list settled in tasks not
design) — both already flagged by the design doc itself, not new findings.

## Verdict

**PASS WITH WARNINGS** — every spec requirement across all 6 delta specs has
direct source/execution evidence, all test suites green at HEAD (matches reported
baseline exactly), and the change's core proof obligations (isolation, fail-loud
client, real guard, tool-owned destructive gate, Membership ambiguity, saga
compensation) are independently confirmed, not just trusted. Both WARNINGs are
downstream of the same known, correctly-deferred human-consent gate — safe to
archive with the live reset+seed step tracked as an explicit owner follow-up, not
a blocker to closing the SDD change itself.
