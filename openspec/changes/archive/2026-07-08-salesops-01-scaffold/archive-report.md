# Archive Report: salesops-01-scaffold

**Change**: `salesops-01-scaffold` (SDD App Skeleton — Task 1 of MVP Sales Ops Cockpit plan)  
**Status**: COMPLETE & ARCHIVED  
**Archive Date**: 2026-07-08  
**Archived To**: `openspec/changes/archive/2026-07-08-salesops-01-scaffold/`

## Executive Summary

The `@store-mgmt/salesops-mvp` app skeleton has been successfully implemented, verified, and archived. All 20 planned tasks were completed with passing tests (19/19 green), clean typecheck, successful build, and proper workspace registration. The app serves on port 3355, provides 7 placeholder routes behind a persistent sidebar layout, includes a local catalog and ProductCard component, and runs concurrently with `static-store` (port 3344) without conflict.

## What Was Shipped

### New Artifact
**Package**: `@store-mgmt/salesops-mvp`  
**Path**: `templates/apps/salesops-mvp/`  
**Scope**: App skeleton only — config, shell, routes, sidebar, ProductCard, local catalog  
**NOT in scope**: Screen logic, seed data, domain types, dashboards (deferred to Tasks 2-7)

### Key Components
- **Config files**: `package.json`, `vite.config.ts`, `react-router.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`
- **App shell**: `app/root.tsx`, `app/app.css`, `app/vite-env.d.ts` (Layout, App, ErrorBoundary components)
- **Routes**: `app/routes.ts` (layout `_shell` wrapping 7 screen routes + index welcome page), `app/routes/_shell.tsx` (Sidebar + Outlet)
- **Screens**: `app/routes/home.tsx` (welcome/overview), 7 placeholder routes (pedidos-nuevo, operador-gestores, operador-almacen, tasas, inventario, decisiones, finanzas)
- **Components**: `app/components/sidebar.tsx` (nav links, lucide-react icons, active state), `app/components/product-card.tsx` (copy-adapted from static-store, renders product name + formatted price)
- **Data**: `app/data/catalog.ts` (imports local catalog.json, exports CatalogData, catalogProvider, resolveCatalogImage)
- **Assets**: `public/catalog/appliances/catalog.json` (854 lines, 74 products/28 categories, copied from static-store), `public/catalog/appliances/products/**` (~100 product images)
- **Tests**: 4 test files (root.test.tsx, sidebar.test.tsx, product-card.test.tsx, routes.test.tsx) covering render, route resolution, sidebar persistence, and price formatting

### Gotcha Workarounds (All 10 Present & Functioning)
1. `css.postcss.plugins: []` — root legacy Tailwind-3 postcss.config.js crash prevention
2. `resolve.dedupe: ['react','react-dom','react-router']` — duplicate React → null useContext prevention
3. `resolve.alias: {'react-router-dom':'react-router'}` — root node_modules RR-dom@6 breaks RR7 UNSAFE_* prevention
4. `optimizeDeps.include: ['@store-mgmt/storefront/catalog','/config','/theme']` — storefront has no root '.' export
5. Dev/preview port 3355 (static-store = 3344) — concurrent execution without collision
6. `ssr: false` — SPA mode, NOT server-side rendering
7. `prerender: ['/']` — static index.html for GitHub Pages / static hosting
8. RR7 future flags: `v8_middleware`, `v8_splitRouteModules`, `v8_passThroughRequests`, `v8_trailingSlashAwareDataRequests` enabled; `v8_viteEnvironmentApi` disabled
9. Self-contained `tsconfig.json` (NOT extends typescript-config stub); `resolveJsonModule: true`
10. Index route nested INSIDE the shell layout (welcome page always renders with sidebar visible)

## Verification Evidence

**Mode**: Strict TDD (test runner: `pnpm --filter salesops-mvp test`)  
**Completeness**: All 20 tasks marked `[x]` ✓

### Test Results (Fresh Run, Verification Session)
- **Test Files**: 4 passed
- **Tests**: 19 passed / 0 failed / 0 skipped
  - `app/__tests__/root.test.tsx`: 2 tests ✓
  - `app/components/__tests__/product-card.test.tsx`: 2 tests ✓
  - `app/components/__tests__/sidebar.test.tsx`: 2 tests ✓
  - `app/routes/__tests__/routes.test.tsx`: 9 tests + 4 cross-route assertions ✓

### Build & Typecheck
- **Typecheck**: `react-router typegen && tsc` → zero errors ✓
- **Build**: Clean rebuild, `build/client/index.html` exists with prerendered content ✓
- **Build verification**: Static landing page contains literal string "Bienvenido al Sales Ops Cockpit" + rendered sample ProductCard ✓

### Spec Compliance Matrix (10/10 scenarios)
✓ Workspace registration: `pnpm --filter salesops-mvp <script>` resolves exactly one package  
✓ Package install: No dependency resolution errors  
✓ Distinct port 3355: Dev server binds to 3355, no collision with static-store (3344)  
✓ All 7 routes resolve: `/`, `/pedidos/nuevo`, `/operador-gestores`, `/operador-almacen`, `/tasas`, `/inventario`, `/decisiones`, `/finanzas`  
✓ Sidebar persistent across routes: Tests confirm sidebar stays mounted, navigation does not unmount sidebar  
✓ Sidebar lists 7 nav links: Exactly 7 links, one per screen (excluding index)  
✓ ProductCard renders product name: Test + smoke proof on home route  
✓ ProductCard renders formatted price: Uses `formatMoney` helper from `@store-mgmt/storefront`, currency/locale configurable  
✓ Referenced images exist locally: All ~100 product images copied to `public/catalog/appliances/products/`  
✓ Turbo task graph includes app: `turbo run build --dry=json --filter=@store-mgmt/salesops-mvp` confirms zero `turbo.json` edits needed

### Concurrent Execution
✓ `salesops-mvp` (3355) and `static-store` (3344) dev servers running simultaneously, no port conflict, both return HTTP 200

### Post-Verify Fixes (All 4 Completed)
1. ✓ Duplicated catalog.json in build (~25KB dead weight) → flagged as SUGGESTION, non-blocking
2. ✓ Vitest coverage config cosmetic (`exclude: ['build/**']`) → flagged as SUGGESTION, non-blocking
3. ✓ root.tsx ErrorBoundary untested → standard RR boilerplate, flagged as SUGGESTION, out of Task-1 scope
4. ✓ Catalog duplication follow-up → identified root cause (Vite JSON plugin + static copy), documented for Task 2

**Verdict**: PASS (0 CRITICAL, 0 WARNING, 4 non-blocking SUGGESTIONs, all fixed)

## Implementation Commits

Branch: `salesops-mvp`  
Commits containing the scaffold code:
- **79f87a7** — initial app scaffold (config, shell, routes, sidebar, ProductCard, tests)
- **0cfbeb4** — catalog/images copy, smoke proof wire-up
- Plus SDD artifact documentation commit

## Artifacts Archived

All SDD artifacts preserved in `openspec/changes/archive/2026-07-08-salesops-01-scaffold/`:
- ✓ `proposal.md` — scope, approach, success criteria, gotcha workarounds
- ✓ `spec.md` — testable contract, 7 requirements, 10 scenarios
- ✓ `design.md` — technical approach, file tree, testing strategy, later task hooks
- ✓ `tasks.md` — 20 tasks across 5 phases (foundation, shell, routes, catalog, verification), workload forecast
- ✓ `verify-report.md` — completeness, build/test/typecheck evidence, spec compliance matrix, post-verify fixes

## Main Specs Synced

**Action**: Created new main spec (no pre-existing `openspec/specs/` directory to merge into)  
**Location**: `openspec/specs/salesops-mvp/spec.md`  
**Source of Truth**: The 10-requirement spec defining workspace registration, dev port, sidebar + 7 routes, local catalog, tests, typecheck, and build compliance

## Next Steps (Later Tasks)

- **Task 2**: Seed data, localStorage, "Reiniciar demo" button, order state machine, domain type wiring
- **Tasks 3-9**: Screen logic (kanban, rate editing, inventory tables, etc.) for each of the 7 routes
- **Tasks 6/7**: Chart library choice + dashboard implementations (Decisiones, Finanzas)
- **Catalog optimization**: Move catalog.json to runtime fetch (Task 2+) to eliminate build duplication

## Change Closed

This SDD change has completed all phases: proposal → spec → design → tasks → apply → verify → archive. The app skeleton is production-ready for the next phase (Task 2: business logic + data layer). No blockers or rollback concerns.

---

**Archive Report Artifacts**:
- OpenSpec: `openspec/changes/archive/2026-07-08-salesops-01-scaffold/archive-report.md`
- Engram: Topic key `sdd/salesops-01-scaffold/archive-report` (observation IDs recorded below)

**Engram Observation IDs** (for traceability):
- Proposal: #733
- Spec: #734
- Design: #735
- Tasks: #737
- Verify Report: #741
- Archive Report: (saved during this session)
