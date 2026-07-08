# Spec — salesops-01-scaffold

## Purpose

Define the testable contract for the `@store-mgmt/salesops-mvp` app skeleton: a new workspace app that registers correctly, serves on a distinct port, resolves all 7 placeholder routes behind a sidebar layout, renders a product via a local `ProductCard` against a local catalog, and passes its own test/typecheck/build pipeline. No screen logic, seed data, or dashboards are in scope.

## Requirements

### Requirement: Workspace Registration

The new app MUST be discoverable and runnable by the existing pnpm/Turborepo tooling without any workspace config changes beyond adding the app directory.

#### Scenario: App resolves via workspace filter

- GIVEN `templates/apps/salesops-mvp/package.json` declares `name: "@store-mgmt/salesops-mvp"`
- WHEN a developer runs `pnpm --filter salesops-mvp <script>` from the repo root
- THEN pnpm resolves exactly one matching workspace package
- AND `turbo run build/typecheck/test` includes the app in its task graph without additional `turbo.json` edits

#### Scenario: Package installs cleanly

- GIVEN the app's `package.json` lists only dependencies already available as workspace packages or public npm packages
- WHEN `pnpm install` runs at the repo root
- THEN it completes without unresolved dependency errors for `salesops-mvp`

### Requirement: Distinct Dev Server Port

The dev server MUST run on a port that does not collide with `static-store`, so both apps can run concurrently.

#### Scenario: Dev server starts on its own port

- GIVEN `static-store` is configured for port 3344
- WHEN `pnpm --filter salesops-mvp dev` starts
- THEN the server binds to port 3355 (or another port distinct from 3344)
- AND starting both apps' dev servers simultaneously produces no port conflict

### Requirement: Sidebar Layout With 7 Placeholder Routes

The app MUST expose a persistent sidebar layout wrapping 7 screen routes plus a landing route, each rendering a stub placeholder.

#### Scenario: All 7 routes resolve

- GIVEN the app is built/served
- WHEN a request is made to each of: `/`, `/pedidos/nuevo`, `/operador-gestores`, `/operador-almacen`, `/tasas`, `/inventario`, `/decisiones`, `/finanzas`
- THEN each route resolves (no 404, no route-matching error)
- AND each non-index route renders inside the persistent sidebar layout with a distinguishable stub heading

#### Scenario: Sidebar lists all navigation targets

- GIVEN the sidebar component is rendered
- WHEN its links are inspected
- THEN there are exactly 7 links, one per screen route (landing excluded or included per design — count MUST match the 7 screens)

### Requirement: Local Catalog and ProductCard Rendering

The app MUST include a local copy of the appliances catalog and a local `ProductCard` capable of rendering a product from it.

#### Scenario: ProductCard renders a catalog product

- GIVEN `app/data/catalog.json` contains at least one product entry
- WHEN `ProductCard` is rendered with that product
- THEN the product's name is visible in the rendered output
- AND the product's price is visible, formatted via the shared `formatMoney` helper from `@store-mgmt/storefront`

#### Scenario: Referenced product images exist locally

- GIVEN a product entry references an image path
- WHEN the app's `public/` assets are inspected
- THEN the referenced image file exists locally (no dependency on `static-store`'s public assets)

### Requirement: Test Suite Passes

The app MUST ship with at least one meaningful automated test proving render and route resolution, and the suite MUST pass.

#### Scenario: Filtered test run is green

- GIVEN the app's vitest config and at least one test file under `app/**/*.test.{ts,tsx}`
- WHEN `pnpm --filter salesops-mvp test` runs
- THEN all tests pass with zero failures

### Requirement: Typecheck and Build Succeed

The scaffold MUST typecheck and build cleanly using the mirrored `static-store` config plus the documented gotcha workarounds.

#### Scenario: Typecheck passes

- WHEN `pnpm --filter salesops-mvp typecheck` runs
- THEN it exits with zero errors

#### Scenario: Production build succeeds

- WHEN `pnpm --filter salesops-mvp build` runs
- THEN it completes without error and emits a servable build output
- AND the build does not fail due to the known gotchas (root Tailwind-3 postcss crash, duplicate React copies, phantom `react-router-dom@6` resolution, `@store-mgmt/storefront` missing root export)

## Out of Scope (explicit non-requirements)

- Screen logic (cart flow, kanban boards, rate editing, inventory tables) — later tasks.
- Seed data, localStorage persistence, "Reiniciar demo", order state machine — Task 2.
- Dashboards / chart library choice — Tasks 6/7.
- Extracting `ProductCard` or catalog into shared `packages/*` — rejected.
- GH Pages / multi-vertical build machinery — not applicable.
