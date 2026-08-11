# Apply Progress: public-catalog

**Batch**: 1 of N (Phase 0 only, per explicit scope instruction)
**Mode**: Strict TDD
**Delivery**: commits only, branch `public-catalog`, no PRs

## Completed Tasks (Phase 0 — Risk Spikes)

- [x] 0.1a Scaffold bare `apps/api-public` (Nest, `GET /health` only) and bare `apps/web-catalog` (RR7, host-echo loader)
- [x] 0.1b Proof: `Host: default.localhost:3000` reaches both dev servers with the header intact
- [x] 0.2 Proof: `PrismaCompanyRepository.findById` succeeds with no `tenantContext.run(...)` wrapper — `PrismaMasterService` is schema-independent (D2)
- [x] 0.3 Proof: `sharp` installs and runs in this pnpm/turbo workspace
- [x] 0.4a RED: `money.test.ts` proves native `Intl.NumberFormat({currency:'MN'})` throws, specifies `formatMoney`
- [x] 0.4b GREEN: `formatMoney` implemented with explicit `MN` branch, USD/EUR fall through to `Intl.NumberFormat`

**All 4 spikes PASS.** No design rework triggered. Phase 1+ is unblocked.

## Spike Results (PASS/FAIL with evidence)

### Spike 0.1 — Wildcard subdomain Host header: **PASS**

`apps/api-public` (NestJS/Express): no config change needed — Express does not
validate the `Host` header.
```
$ curl -sv -H "Host: default.localhost:3000" http://localhost:3003/health
< HTTP/1.1 200 OK
{"status":"ok"}
```

`apps/web-catalog` (React Router 7 SSR via Vite): required ONE config fix —
`resolve.alias: { 'react-router-dom': 'react-router' }` in `vite.config.ts`
(same fix `static-store` already carries), because this template is nested
inside a legacy repo whose root `node_modules` has `react-router-dom@6`,
which Vite's dep-scanner phantom-resolved and crashed on
(`UNSAFE_useRouteId` missing export). This is a config fix, not a redesign,
per the task's own instruction. `server.allowedHosts` was NOT needed — Vite
never rejected the custom Host header in the first place.
```
$ curl -sv -H "Host: default.localhost:3000" http://localhost:3000/
< HTTP/1.1 200
<p data-testid="host">Host: default.localhost:3000</p>
```
Documented in `apps/api-public/README.md` and `apps/web-catalog/README.md`.

### Spike 0.2 — Guard schema-independence: **PASS**

`packages/infra-db/src/company/prisma-master-independence.spec.ts` calls the
EXISTING `PrismaCompanyRepository.findById` against real Postgres
(`store_mgmt_test`) with no `TenantContextService.run(...)` wrapper anywhere
in the file. Both assertions (found + null-for-unknown-id) pass.
```
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```
Confirms design.md D2's foundational claim empirically: the public tenant
guard needs no scope of its own. Existing `prisma-company.repository.spec.ts`
suite (9 tests) re-run as a safety net — still green, zero edits.

### Spike 0.3 — `sharp` toolchain: **PASS**

`pnpm --filter @store-mgmt/infra-storage add sharp` resolved `sharp@0.35.3`
cleanly — prebuilt `linux-x64` binary, no `node-gyp` build step, no peer
conflicts, no ignored postinstall scripts. Smoke script
(`scripts/sharp-smoke.mjs`) runs the exact `rotate → resize → webp` chain
Phase 2's `normalize-image.ts` will use, against an in-memory buffer:
```
PASS: sharp decode -> rotate -> resize -> webp round trip produced 44 bytes of valid WebP.
```
Install size ~19 MB total (mostly the prebuilt `libvips` binary, one-time
per platform). Documented in `packages/infra-storage/README.md`.

### Spike 0.4 — `MN` formatter: **PASS**

RED (`money.test.ts`) failed first because `./money` didn't exist
(`Failed to resolve import "./money"`). GREEN (`money.ts`) implements
`formatMoney(amount: string, {locale, currency})`:
- `MN` → `Intl.NumberFormat` WITHOUT `style:'currency'` (that's what throws)
  plus a `" MN"` suffix.
- Any other currency (`USD`, `EUR`, ...) → standard
  `Intl.NumberFormat(locale, {style:'currency', currency})`, memoized per
  `locale|currency` pair (mirrors the frozen, read-only-reference
  `packages/storefront/src/config/money.ts` pattern — never imported, D9).
```
Test Files  1 passed (1)
     Tests  5 passed (5)
```

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 0.1a (api-public health) | `apps/api-public/src/health/health.controller.spec.ts` | Unit (Nest TestingModule) | N/A (new) | ✅ Written — failed on missing `health.controller.js` | ✅ Passed | ➖ Skipped: purely structural, single literal return, no branching | ➖ None needed |
| 0.1b (Host header proof) | manual `curl` proof, not an automated test (spec: infra/dev-server behavior, not application logic) | Manual/E2E-style proof | N/A | N/A — spike proof, not driving new production behavior | ✅ Both curls pass | N/A | N/A |
| 0.2 (master independence) | `packages/infra-db/src/company/prisma-master-independence.spec.ts` | Integration (real Postgres) | ✅ 9/9 (`prisma-company.repository.spec.ts` re-run, zero edits) | N/A — proof against EXISTING production code, not new behavior | ✅ 2/2 Passed | ✅ 2 cases (found + null-for-unknown) | ➖ None needed |
| 0.3 (sharp toolchain) | `packages/infra-storage/scripts/sharp-smoke.mjs` | Smoke/integration (native binary) | N/A (new) | N/A — dependency-install proof, not driving new production behavior | ✅ Passed | ➖ Skipped: single install/decode/encode path, no branching | ➖ None needed |
| 0.4a/0.4b (formatMoney) | `apps/web-catalog/app/shared/lib/money.test.ts` | Unit | N/A (new) | ✅ Written — failed on missing `./money` module | ✅ Passed (5/5) | ✅ 5 cases: native-throws, MN-no-throw, MN-exact-output, USD-exact, EUR-exact | ➖ None needed — implementation already minimal and clean |

### Test Summary
- **Total tests written**: 10 (1 health, 2 master-independence, 5 money, plus 2 manual curl proofs not counted as automated tests)
- **Total tests passing**: 10/10 automated + 2/2 manual curl proofs
- **Layers used**: Unit (6), Integration (2), Smoke (1), Manual/E2E-style proof (1)
- **Approval tests** (refactoring): None — no refactoring tasks in Phase 0
- **Pure functions created**: 1 (`formatMoney`)

## Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `templates/apps/api-public/**` (package.json, nest-cli.json, tsconfig*.json, eslint.config.mjs, env.example, README.md, src/main.ts, src/app.module.ts, src/health/*) | Created | Bare NestJS scaffold, `GET /health` only |
| `templates/apps/web-catalog/**` (package.json, vite.config.ts, react-router.config.ts, tsconfig.json, eslint.config.mjs, vitest.config.ts, vitest.setup.ts, README.md, app/root.tsx, app/routes.ts, app/routes/home.tsx, app/vite-env.d.ts) | Created | Bare RR7 SSR scaffold, one loader echoing `Host` |
| `templates/packages/infra-db/src/company/prisma-master-independence.spec.ts` | Created | Spike 0.2 proof, additive only |
| `templates/packages/infra-storage/package.json`, `README.md`, `scripts/sharp-smoke.mjs` | Created | Spike 0.3 scaffold + proof |
| `templates/apps/web-catalog/app/shared/lib/money.test.ts` | Created | Spike 0.4a RED |
| `templates/apps/web-catalog/app/shared/lib/money.ts` | Created | Spike 0.4b GREEN |
| `templates/pnpm-lock.yaml` | Modified | New workspace packages + `sharp` |
| `openspec/changes/public-catalog/tasks.md` | Modified | Phase 0 checkboxes ticked |

## Deviations from Design

None — implementation matches design.md D1-D10. Both Vite fixes (dep-scan
alias) and the `MN` suffix-format choice are implementation details left
open by design.md (design explicitly says "web-catalog MUST own its
formatter" without prescribing the exact MN rendering) and spec.md
(explicitly defers "exact cache/serving mechanics" and formatting specifics
to design/implementation phase).

## Issues Found

None. All 4 spikes passed; no design rework triggered.

## Commits (6, in order)

1. `65a1604` feat(public-catalog): scaffold bare api-public and web-catalog, prove wildcard-subdomain Host header (0.1a+0.1b)
2. `99abe8e` test(public-catalog): prove PrismaMasterService is schema-independent (0.2)
3. `b597ba5` feat(public-catalog): prove sharp installs and runs in this workspace (0.3)
4. `af95bfe` chore(public-catalog): tick tasks.md for spikes 0.1a, 0.1b, 0.2, 0.3 (reconciliation)
5. `ed7c1c3` test(public-catalog): RED — money.test.ts (0.4a)
6. `2db649b` feat(public-catalog): GREEN — formatMoney with an explicit MN branch (0.4b)

(Task-numbered plan called for 5 commits; landed as 6 because the tasks.md
checkbox reconciliation for 0.1a-0.3 was split out as its own commit rather
than silently folded into 0.3's commit — see commit 4's message for why.)

## Remaining Tasks

Phase 1 through Phase 7 — NOT started, per explicit scope instruction
("Phase 0 ONLY... stop"). Next tasks in file order:
- [ ] 1.1 RED: `prisma-company.repository.spec.ts` — `findBySlug`
- [ ] 1.2a/1.2b GREEN: `findBySlug` port + implementation
- [ ] 1.3-1.8: product-image-store port, product search, eslint boundary rules
- [ ] Phase 2: `packages/infra-storage` real implementation (FsProductImageStore, normalize-image, spike 0.5 unblocked)
- [ ] Phase 3: `apps/api-salesops` image upload endpoint
- [ ] Phase 4: `apps/api-public` full build-out (7 commits)
- [ ] Phase 5: `apps/web-catalog` public storefront
- [ ] Phase 6: `apps/web-catalog` `/admin`
- [ ] Phase 7: final verification

## Status

6/6 Phase 0 work units complete (all 4 spikes PASS). Ready for the next
`sdd-apply` batch (Phase 1) — owner review recommended first per Phase 0's
purpose (a failed spike would have changed the plan; all passed, so Phase 1
can proceed on the existing design as written).
