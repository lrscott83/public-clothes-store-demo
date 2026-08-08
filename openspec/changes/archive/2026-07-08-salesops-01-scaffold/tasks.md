# Tasks: salesops-01-scaffold — App Skeleton (Task 1 only)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750 code (config/shell/routes/sidebar/product-card/tests) + 854 catalog.json copy + ~100 binary image files (no line count) ≈ 1600+ text lines |
| 400-line budget risk | High |
| Chained PRs recommended | No — `single-pr` strategy resolves via `size:exception`, not chaining |
| Suggested split | Single PR, 3 staged commits (see Work Units) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

`size:exception` justification: the appliances catalog copy (854-line `catalog.json`, 74 products/28 categories) plus ~100 referenced product images cannot be meaningfully split without leaving the app non-functional mid-PR (ProductCard has nothing to render, build/tests fail). Code-only work (config + shell + routes + sidebar) alone stays under budget; the asset copy is what pushes this over 400 lines. Requires maintainer approval before `sdd-apply`.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Config + app shell + routes + sidebar (Phases 1-3) | PR 1, commit 1 | Code only, ~750 lines, independently buildable once catalog stub exists |
| 2 | Local catalog + ProductCard + image/JSON copy (Phase 4) | PR 1, commit 2 | Binary-heavy; isolated so reviewers can skip line-by-line diff on assets |
| 3 | Verification gate (Phase 5) | PR 1, commit 3 | No new files; proves build/typecheck/test/dev-port pass |

## Phase 1: Foundation / Package Config (non-TDD)

- [x] 1.1 `package.json` — name `@store-mgmt/salesops-mvp`, scripts, deps/devDeps per design (no `@store-mgmt/domain`, no gh-pages)
- [x] 1.2 `vite.config.ts` — 4 gotchas (postcss plugins:[], dedupe, react-router-dom alias, optimizeDeps.include), port 3355
- [x] 1.3 `react-router.config.ts` — `ssr:false`, `prerender:['/']`, future flags per design
- [x] 1.4 `tsconfig.json` — self-contained, `~/*`→`./app/*`, rootDirs incl. `.react-router/types`
- [x] 1.5 `eslint.config.mjs` — `@store-mgmt/eslint-config/react-router`
- [x] 1.6 `vitest.config.ts` + `vitest.setup.ts` — jsdom, globals, `app/**/*.test.{ts,tsx}`
- [x] 1.7 `pnpm install`; verify `pnpm --filter salesops-mvp <script>` resolves exactly one package

## Phase 2: App Shell Root (TDD)

- [x] 2.1 RED: `app/__tests__/root.test.tsx` — asserts document shell renders `<Outlet/>` without crashing
- [x] 2.2 GREEN: `app/root.tsx` (Layout/App/ErrorBoundary), `app/app.css`, `app/vite-env.d.ts` to pass 2.1
- [x] 2.3 REFACTOR: confirm `web-common/styles.css` imports before `app.css`

## Phase 3: Sidebar + Routes (TDD)

- [x] 3.1 RED: `app/components/__tests__/sidebar.test.tsx` — expects exactly 7 nav links
- [x] 3.2 GREEN: `app/components/sidebar.tsx` — nav links, lucide-react icons, active state to pass 3.1
- [x] 3.3 RED: `app/routes/__tests__/routes.test.tsx` — memory-router asserts `/` + all 7 paths resolve, sidebar stays mounted across navigation
- [x] 3.4 GREEN: `app/routes.ts` (layout `_shell` wraps index + 7 children), `app/routes/_shell.tsx` (Sidebar+Outlet), `app/routes/home.tsx` (welcome stub), 7 placeholder routes (`pedidos-nuevo`, `operador-gestores`, `operador-almacen`, `tasas`, `inventario`, `decisiones`, `finanzas`) with typed `Route` + `meta()` to pass 3.3
- [x] 3.5 REFACTOR: dedupe stub-heading markup across placeholder routes if repetitive

## Phase 4: Local Catalog + ProductCard (separate work unit — binary weight)

- [x] 4.1 RED: `app/components/__tests__/product-card.test.tsx` — renders product name + price via `formatMoney` (fixture, no catalog dependency yet)
- [x] 4.2 GREEN: `app/components/product-card.tsx` (props `{product,locale,currency}`) to pass 4.1
- [x] 4.3 Copy `public/catalog/appliances/catalog.json` from `static-store/verticals/appliances/catalog.json` (854 lines; actual catalog is 11 categories/99 products — design doc's "74/28" figure was inaccurate, copied verbatim as-is)
- [x] 4.4 Copy referenced product images + `hero.jpg` from `static-store/public/verticals/appliances/products/**` into `public/catalog/appliances/`
- [x] 4.5 `app/data/catalog.ts` — typed `CatalogData` import, `catalogProvider` (baked), `resolveCatalogImage(path)` = `BASE_URL` + local prefix
- [x] 4.6 Wire `home.tsx` to render one `ProductCard` from `catalog.ts` as smoke proof; confirm no localStorage/order-state code added

## Phase 5: Verification (non-TDD gate)

- [x] 5.1 `pnpm --filter salesops-mvp typecheck` — zero errors
- [x] 5.2 `pnpm --filter salesops-mvp build` — succeeds, prerendered `/` emits static `index.html`
- [x] 5.3 `pnpm --filter salesops-mvp test` — all green (15/15)
- [x] 5.4 Run `salesops-mvp` (3355) and `static-store` (3344) dev servers concurrently — no port conflict (both HTTP 200)
- [x] 5.5 `turbo run build/typecheck/test` — confirm `salesops-mvp` included without `turbo.json` edits (verified via `turbo run build --dry=json`)
