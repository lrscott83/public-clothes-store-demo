# Proposal — salesops-01-scaffold

Stand up a new isolated workspace app `@store-mgmt/salesops-mvp` (the "MVP Sales Ops Cockpit" demo) inside `templates/`, mirroring `static-store`'s proven config so future tasks can build the 7 role-based screens on top. This change delivers ONLY the skeleton: package + config, a sidebar layout shell with 7 placeholder routes, a local copy of the appliances catalog + a local `ProductCard`, and a TDD test proving the app renders and routes resolve. No screen logic, seed data, dashboards, or order state machine.

## Intent

| Question | Answer |
|----------|--------|
| What problem | Plan `docs/plans/mvp-sales-ops-cockpit.md` Task 1 needs a runnable app skeleton before any of the 7 screens can be built. There is no scaffold today; only `static-store` exists under `apps/`. |
| Why now | It is the first dependency in the plan's task list — every later task (seed, screens, dashboards) builds inside this app. Nothing else can start until the skeleton compiles, typechecks, and tests green. |
| Success looks like | `pnpm --filter salesops-mvp dev` serves a sidebar app; all 7 routes resolve to placeholder pages; `pnpm --filter salesops-mvp build`, `typecheck`, and `test` all pass; the app runs concurrently with `static-store` (distinct dev port). |

## Scope

### In scope (Task 1 only)
- New workspace app `templates/apps/salesops-mvp`, package name `@store-mgmt/salesops-mvp`.
- All config files mirrored from `static-store` **with the verified gotcha workarounds baked in** (see Approach).
- `app/root.tsx` document shell + an app-level sidebar layout route wrapping the 7 screen routes via `<Outlet/>`.
- 7 routes registered as placeholder pages (each renders a stub heading — real screens are later tasks). Plus an index landing / role-picker at `/`.
- Local copy of the appliances `catalog.json` and its referenced product images into the app.
- A local `ProductCard` adapted from `static-store`'s app-local component (types/helpers from `@store-mgmt/storefront`).
- Reuse `@store-mgmt/web-common` (`Spinner`/`Card`, `styles.css`) where it genuinely helps.
- At least one meaningful vitest test (TDD-first) proving render + route resolution.

### Out of scope (deferred to later tasks / flagged)
- Any of the 7 screens' real logic (cart flow, kanban boards, rate editing, inventory tables). — Tasks 3-9
- Seed-data generation, localStorage persistence, "Reiniciar demo" button, order state machine. — Task 2
- Dashboards and the chart-library choice (none installed in `templates/` today). — Tasks 6/7 design
- Domain-model design decisions (warehouse/gestor/transportista/exchange-rate/order-state types). — Task 2 design
- Extracting `ProductCard` or the appliances catalog into shared `packages/*`. — explicitly rejected; copy-local is the locked approach.
- GH Pages / multi-vertical build scripts (`build:pages*`, `deploy`, `gh-pages`) — not needed; plan is local-demo only.
- Multi-vertical machinery (`verticals/`, `resolveVertical`, `store/verticals.ts`, `active.ts`, `favicon.ts`, `home-sections.ts`).

## Approach

**Copy-local / isolated**, mirroring `static-store` conventions verbatim except for the verticals machinery. Rationale: matches the repo's established precedent (app-local components, self-contained config), keeps the MVP fast, and avoids cross-cutting changes to `static-store` or shared packages. The locked decision is NOT to extract to shared packages.

### Config gotchas that MUST be carried over (non-negotiable)
These are load-bearing workarounds for this nested-legacy-monorepo layout. Omitting any one breaks dev/build.

| Gotcha | Workaround in `vite.config.ts` / config |
|--------|------------------------------------------|
| Root legacy Tailwind-3 `postcss.config.js` is walked up to and crashes ("Cannot find module 'autoprefixer'") | Pin `css: { postcss: { plugins: [] } }` |
| Duplicate React copies from workspace packages → null `useContext` | `resolve.dedupe: ['react','react-dom','react-router']` |
| Root `node_modules` has `react-router-dom@6` that phantom-resolves and breaks RR7 (`UNSAFE_*`) | `resolve.alias: { 'react-router-dom': 'react-router' }` |
| `@store-mgmt/storefront` has no root `.` export (subpaths only) → optimizer fails dev | `optimizeDeps.include: ['@store-mgmt/storefront/catalog', '/config', '/theme']` |
| RR7 future flags mismatch | Enable `v8_middleware`, `v8_splitRouteModules`, `v8_passThroughRequests`, `v8_trailingSlashAwareDataRequests`; do NOT enable `v8_viteEnvironmentApi` (breaks workspace React instance) |
| Port collision with `static-store` (3344) | Use a distinct dev port — proposed **3355** |
| `tsconfig.json` does NOT extend `@store-mgmt/typescript-config` (that package is an unused stub) | Self-contained tsconfig mirroring static-store verbatim (`~/*` → `./app/*`, `rootDirs` incl. `.react-router/types`) |

### 7 routes (placeholders in this task)
Sidebar layout route wraps these; each renders a stub heading only.

| # | Screen (plan) | Proposed route path |
|---|---------------|---------------------|
| — | Landing / role picker | `index` (`/`) |
| 1 | Gestor — crear pedido | `pedidos/nuevo` |
| 2 | Operador de gestores — kanban | `operador-gestores` |
| 3 | Operador de almacén — kanban filtrado | `operador-almacen` |
| 4 | Tasas de cambio | `tasas` |
| 5 | Inventario | `inventario` |
| 6 | Dashboard de decisiones | `decisiones` |
| 7 | Finanzas | `finanzas` |

Route paths follow the plan's Spanish naming, consistent with `static-store` (`productos`). Design phase may refine exact slugs; the count and mapping are what matter here.

## Files to create

**Package root** `templates/apps/salesops-mvp/`
- `package.json` — name `@store-mgmt/salesops-mvp`, scripts `build`/`dev`/`dev:local`/`start`/`lint`/`typecheck`/`clean`/`test` mirroring static-store; deps `@react-router/node`, `@react-router/serve`, `@store-mgmt/web-common` (workspace:*), `@store-mgmt/storefront` (workspace:*), `isbot`, `lucide-react`, `react@^19.1.0`, `react-dom@^19.1.0`, `react-router@^7.7.1`; devDeps mirror static-store MINUS `gh-pages` and the `build:pages*`/`deploy` scripts. (`@store-mgmt/domain` only if a placeholder needs it — likely deferred to Task 2.)
- `vite.config.ts` — with ALL gotcha workarounds above; dev port 3355.
- `react-router.config.ts` — `ssr: false`, empty/`['/']` `prerender`, future flags as above.
- `tsconfig.json` — self-contained mirror of static-store.
- `eslint.config.mjs` — `import config from '@store-mgmt/eslint-config/react-router'; export default config;`
- `vitest.config.ts` — jsdom, globals, `setupFiles: ['./vitest.setup.ts']`, `include: ['app/**/*.test.{ts,tsx}']`, v8 coverage.
- `vitest.setup.ts` — `import '@testing-library/jest-dom';`

**App shell** `templates/apps/salesops-mvp/app/`
- `vite-env.d.ts`
- `root.tsx` — `Layout()` (html shell; import `@store-mgmt/web-common/styles.css` then `./app.css`), `App()` (renders `<Outlet/>`), `ErrorBoundary()`.
- `app.css` — Tailwind v4 base/utilities overrides layered after web-common styles.
- `routes.ts` — manifest: `index('routes/home.tsx')` + a `layout()` wrapping the 7 screen routes.
- `components/sidebar.tsx` — persistent nav listing the 7 screens.
- `components/product-card.tsx` — local, adapted from static-store (types/`formatMoney` from `@store-mgmt/storefront`).
- `layouts/app-layout.tsx` (or inline in a layout route) — Sidebar + `<Outlet/>`.
- `routes/home.tsx` — landing / role picker stub.
- `routes/pedidos-nuevo.tsx`, `routes/operador-gestores.tsx`, `routes/operador-almacen.tsx`, `routes/tasas.tsx`, `routes/inventario.tsx`, `routes/decisiones.tsx`, `routes/finanzas.tsx` — each a stub heading placeholder.
- `data/catalog.json` — local copy of `static-store/verticals/appliances/catalog.json`.

**Tests (TDD-first)** `templates/apps/salesops-mvp/app/`
- `components/__tests__/sidebar.test.tsx` — renders 7 nav links.
- `components/__tests__/product-card.test.tsx` — renders product name + formatted price.
- `routes/__tests__/routes.test.tsx` (or `app/__tests__/root.test.tsx`) — app renders and routes resolve to placeholders.

**Assets** `templates/apps/salesops-mvp/public/`
- Copy the appliances product images referenced by `catalog.json` (from `static-store/public/verticals/appliances/products/**`) into a local `public/` path the local `ProductCard` resolves against.

## How it fits the monorepo
- Lives under `templates/apps/` beside `static-store`; picked up automatically by `pnpm-workspace.yaml` (`apps/*`) and Turborepo (`turbo.json` tasks `build`/`lint`/`typecheck`/`test`/`dev`).
- Reuses shared `@store-mgmt/web-common` + `@store-mgmt/storefront` (types/helpers) as workspace deps — no new shared packages, no changes to `static-store`.
- `turbo run test`/`build` will include it via `^`-graph; `@store-mgmt/domain` still needs its `tsc` build before any consumer imports it (relevant only if a placeholder pulls domain — otherwise deferred).

## Risks / open questions
| Risk | Mitigation / note |
|------|-------------------|
| Bare `salesops-mvp` vs scoped `@store-mgmt/salesops-mvp` — task text uses bare name | LOCKED as scoped `@store-mgmt/salesops-mvp` for convention consistency; the `--filter salesops-mvp` still resolves by unscoped segment. |
| Image copy volume (74 products across 28 categories) could be large | Copy only what `catalog.json` references; acceptable for a local demo. Alternative (shared data package) explicitly deferred. |
| Chart library undecided (needed Tasks 6/7) | Out of scope here; flagged for `sdd-design` of the dashboard tasks. |
| Domain type strategy (order state machine, warehouse/gestor types) | Out of scope here; Task 2 decides app-local vs shared. Placeholders avoid needing them now. |
| Prerender array / basename for RR7 | `salesops-mvp` is internal, no SEO — `prerender` empty or `['/']`, no basename unless later deployed. |

## Next step
Run `sdd-spec` and `sdd-design` in parallel to formalize the scaffold contract (spec) and lock the config/route/layout shapes (design) before `sdd-tasks`.
