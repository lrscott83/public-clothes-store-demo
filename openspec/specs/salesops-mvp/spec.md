# Spec — salesops-mvp (Tasks 1–3)

## Purpose

Define the testable contract for the `@store-mgmt/salesops-mvp` app: a workspace app that registers correctly, serves on a distinct port, resolves 7 placeholder routes with a sidebar, renders a product against a local catalog, and ships with a deterministic frozen domain model + seed generator powering all seven screens. Tasks 1–3 complete: app skeleton, local ProductCard, full seed/domain/localStorage implementation, and the 3-step "crear pedido" wizard (Carrito → Cliente → Almacén). Tasks 4–9 (dashboards and screens) remain out of scope.

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

### Requirement: Enriched Product Model

The system MUST assign every catalog product an explicit `commissionMN: number > 0`
and `costUSD: number`, computed at seed-build time and frozen into the generated
product array — not resolved by a runtime matcher at render time.

#### Scenario: All products carry commission and cost

- GIVEN the 99-product catalog is enriched by the seed generator
- WHEN the resulting `SeededProduct[]` is inspected
- THEN every product has `commissionMN > 0` and `costUSD = round(price * 0.60)`

#### Scenario: Bundle SKU commission sums segments

- GIVEN a product name contains `" + "` joining two appliance segments
- WHEN the commission derivation runs
- THEN `commissionMN` equals the sum of each segment's own resolved commission

### Requirement: Order Commission Aggregation

The system MUST expose a helper computing an order's total commission as the sum
of `item.commissionMN × item.quantity` across its cart, ignoring combo/quantity tiers.

#### Scenario: Multi-item order commission sums per-item commission

- GIVEN an order with items `{qty:1, commissionMN:4000}` and `{qty:2, commissionMN:1000}`
- WHEN the commission-sum helper runs
- THEN it returns `4000 + 1000*2 = 6000`
- AND combo-by-quantity tiers do not alter the result

### Requirement: Deterministic Seed Generation

The generator MUST produce byte-identical `SeedState` output across repeated runs,
using a fixed embedded mulberry32 seed and a fixed anchor-date constant — never
`Date.now()` or `Math.random()`.

#### Scenario: Two generations are byte-identical

- GIVEN the generator is invoked twice in the same process with no shared external state
- WHEN both outputs are serialized to JSON
- THEN the two JSON strings are identical, including all timestamps

#### Scenario: Anchor date regression guard

- GIVEN the generator module source uses a hardcoded anchor-date constant
- WHEN a test inspects the generated orders' date range
- THEN every order date falls within `[anchor - 19d, anchor]`, independent of the
  actual system date at test time

### Requirement: Inventory Coverage

The system MUST seed exactly one `InventoryEntry` per `(product, warehouse)` pair
across 3 warehouses and 99 products.

#### Scenario: Inventory has 297 rows

- GIVEN the generator has run
- WHEN `SeedState.inventory` is inspected
- THEN it contains exactly 297 entries, each with a unique `(productId, warehouseId)`
  pair and `quantity >= 0`

### Requirement: Historical Order State Machine Consistency

Every generated historical order MUST occupy a valid state in
`creado → verificado → transportando → entregado → comision_pagada` and MUST have
had every cart item available in a single warehouse at generation time.

#### Scenario: Order state is one of the defined states

- GIVEN any order in `SeedState.orders`
- WHEN its `state` field is inspected
- THEN it is one of `creado, verificado, transportando, entregado, comision_pagada`
- AND its populated per-state timestamps are chronologically non-decreasing

#### Scenario: Cart fulfilled from a single warehouse

- GIVEN an order references one `warehouseId` and a list of items
- WHEN inventory is checked at generation time, before decrement
- THEN every item's quantity was available in that same warehouse
- AND the generator decremented that warehouse's stock accordingly

### Requirement: Verified+ Orders Carry Rate Snapshot and Totals

Orders in state `verificado` or later MUST carry a frozen `exchangeRateSnapshot`,
`totalMN`, and `commissionMN`; orders in `creado` MUST NOT carry any of them.

#### Scenario: Verified order has snapshot fields populated

- GIVEN an order with state `verificado` or later
- WHEN its fields are inspected
- THEN `exchangeRateSnapshot`, `totalMN`, and `commissionMN` are all defined
- AND `commissionMN` matches the order-commission-sum helper's output for its items

#### Scenario: Un-verified order has no snapshot

- GIVEN an order with state `creado`
- WHEN its fields are inspected
- THEN `exchangeRateSnapshot`, `totalMN`, and `commissionMN` are all `undefined`

### Requirement: localStorage Persistence Round-Trip

The system MUST persist the full `SeedState` under a single namespaced+versioned
localStorage key, and MUST support load and reset.

#### Scenario: Save then load returns identical state

- GIVEN a generated `SeedState` is saved to the versioned key
- WHEN the app reloads and reads the key
- THEN the loaded `SeedState` deep-equals the saved one

#### Scenario: Missing or version-mismatched key triggers regeneration

- GIVEN the localStorage key is absent, or its `version` differs from the current one
- WHEN the app initializes
- THEN the generator runs and persists a fresh `SeedState` under the current version

#### Scenario: Reset restores identical state

- GIVEN "Reiniciar demo" is invoked
- WHEN the key is cleared and the generator re-runs
- THEN the resulting `SeedState` is byte-identical to the original first-run output

### Requirement: Reviewable Commission Assignment Output

The apply phase MUST produce a product → commission review artifact listing id,
name, category, `commissionMN`, `costUSD`, and which rule fired (keyword /
category-default / catch-all / bundle-sum), with category-default and catch-all
rows visibly flagged for human review.

#### Scenario: Review table covers all products

- GIVEN the commission derivation has run over all 99 products
- WHEN the review table is generated
- THEN it has exactly 99 rows, one per product, each naming the rule that fired

#### Scenario: Fallback rows are flagged

- GIVEN a product's derivation fell through to category-default or the 1000 catch-all
- WHEN the review table is generated
- THEN that row is visibly marked as a fallback, not a direct keyword match

### Requirement: Three-Step Wizard Navigation

The `pedidos/nuevo` route MUST render a single-route wizard with steps
`carrito → cliente → almacen`, driven by local component state (no nested
routes, no RR7 `<Form>`/`action`/loader navigation). The wizard MUST display
the fixed demo gestor persona for context and MUST block advancing past a
step whose required data is incomplete or invalid.

#### Scenario: Cannot advance from Carrito with an empty cart

- GIVEN the wizard is on the Carrito step with zero cart lines
- WHEN the gestor clicks "Siguiente"
- THEN the wizard stays on Carrito and does not navigate to Cliente

#### Scenario: Back returns to the previous step without losing data

- GIVEN the gestor is on Cliente with cart lines already selected
- WHEN the gestor clicks "Atrás"
- THEN the wizard returns to Carrito
- AND the previously selected cart lines are still present

#### Scenario: Cannot advance from Cliente without a name

- GIVEN the wizard is on Cliente with `nombre` empty and `telefono` filled
- WHEN the gestor clicks "Siguiente"
- THEN the wizard stays on Cliente and does not navigate to Almacén

#### Scenario: Cannot advance from Cliente without a phone

- GIVEN the wizard is on Cliente with `nombre` filled and `telefono` empty
- WHEN the gestor clicks "Siguiente"
- THEN the wizard stays on Cliente and does not navigate to Almacén

#### Scenario: Domicilio mode requires an address to advance

- GIVEN the wizard is on Cliente with `nombre` and `telefono` filled, delivery mode `domicilio`, and `dirección` empty
- WHEN the gestor clicks "Siguiente"
- THEN the wizard stays on Cliente and does not navigate to Almacén

#### Scenario: Recogida mode advances without an address

- GIVEN the wizard is on Cliente with `nombre` and `telefono` filled, delivery mode `recogida`, and `dirección` empty
- WHEN the gestor clicks "Siguiente"
- THEN the wizard navigates to Almacén

### Requirement: Cart Composition and Live USD Total

The Carrito step MUST let the gestor add/remove catalog products and adjust
per-line quantity, and MUST display a live total in USD computed as
`sum(item.priceUSD * item.quantity)` across all lines, recalculated on every
add/remove/quantity change.

#### Scenario: Adding a product creates a cart line

- GIVEN the catalog contains a product with `priceUSD: 100`
- WHEN the gestor adds it with `quantity: 2`
- THEN the cart contains one line for that product with `quantity: 2`
- AND the displayed total is `200`

#### Scenario: Removing a line updates the total

- GIVEN the cart has two lines totaling `300` USD
- WHEN the gestor removes one line worth `100` USD
- THEN the cart has one remaining line
- AND the displayed total is `200`

### Requirement: Client and Delivery Data Capture

The Cliente step MUST capture `nombre`, `telefono`, `dirección`, a
domicilio-vs-recogida delivery mode, forma de pago, a "¿lleva cambio?" flag,
and free-text `observaciones`. `nombre` and `telefono` are REQUIRED to
advance regardless of delivery mode. `dirección` is REQUIRED to advance only
when delivery mode is `domicilio`; when delivery mode is `recogida`,
`dirección` is NOT required and MAY be hidden or skipped.

#### Scenario: Domicilio mode requires an address field to be shown

- GIVEN the gestor selects delivery mode `domicilio`
- WHEN the Cliente form is rendered
- THEN the `dirección` field is visible and editable

#### Scenario: Recogida mode does not require an address

- GIVEN the gestor selects delivery mode `recogida`
- WHEN the gestor advances to Almacén without filling `dirección`
- THEN the wizard advances successfully

#### Scenario: Name and phone are required in both delivery modes

- GIVEN the gestor selects either delivery mode `domicilio` or `recogida`
- WHEN `nombre` or `telefono` is empty
- THEN the wizard blocks advancing to Almacén regardless of delivery mode

### Requirement: Warehouse Availability Rule

The Almacén step MUST list as selectable only warehouses that fully cover the
cart: for every cart line, that warehouse's inventory quantity for the
product MUST be greater than or equal to the requested quantity. A warehouse
missing coverage for any single line MUST NOT be selectable. If zero
warehouses qualify, order creation MUST be blocked and the step MUST explain
why.

#### Scenario: Warehouse with exact matching stock is eligible

- GIVEN a cart line requests `quantity: 5` of a product
- AND a warehouse's inventory for that product has `quantity: 5`
- WHEN eligible warehouses are computed
- THEN that warehouse is included in the eligible list

#### Scenario: Warehouse short on stock for one line is excluded

- GIVEN a cart with two lines
- AND a warehouse covers line 1 fully but has `quantity: 3` for line 2 which requests `quantity: 4`
- WHEN eligible warehouses are computed
- THEN that warehouse is excluded from the eligible list

#### Scenario: Zero eligible warehouses blocks creation

- GIVEN no warehouse fully covers the cart
- WHEN the Almacén step is rendered
- THEN no warehouse is selectable
- AND the "Confirmar" action is disabled with an explanatory message

### Requirement: Order Creation Persists in State `creado`

Confirming the wizard MUST call `createOrder` to append a new `Order` to
persisted `SeedState.orders` with: the cart items, the captured client and
delivery/payment data, the fixed gestor persona's id, the selected
warehouse's id, `state: 'creado'`, and `totalUSD`. `commissionMN`, `totalMN`,
and `exchangeRateSnapshot` MUST be left undefined at creation.

#### Scenario: Confirm creates an order with correct fields

- GIVEN a valid cart, client data, and an eligible selected warehouse
- WHEN the gestor confirms
- THEN a new `Order` is appended to `SeedState.orders` with `state: 'creado'`
- AND its `items`, `client`, `gestorId`, and `warehouseId` match the wizard's selections
- AND `commissionMN`, `totalMN`, and `exchangeRateSnapshot` are all `undefined`

#### Scenario: Created order survives a reload

- GIVEN an order was created and persisted via `createOrder`
- WHEN the app state is reloaded from localStorage
- THEN the created order is present in `SeedState.orders` with the same fields

#### Scenario: Reset demo discards created orders

- GIVEN an order was created via `createOrder` after the last seed generation
- WHEN "Reiniciar demo" runs
- THEN the regenerated `SeedState.orders` does not contain that created order

## Out of Scope (explicit non-requirements)

- Screen logic (cart flow, kanban boards, rate editing, inventory tables) — Tasks 3–9.
- Dashboards / chart library choice — Tasks 6/7.
- Extracting `ProductCard` or catalog into shared `packages/*` — rejected.
- GH Pages / multi-vertical build machinery — not applicable.
