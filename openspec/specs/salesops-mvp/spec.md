# Spec — salesops-mvp (Tasks 1–11)

## Purpose

Define the testable contract for the `@store-mgmt/salesops-mvp` app: a workspace app that registers correctly, serves on a distinct port, resolves 7 placeholder routes with a sidebar, renders a product against a local catalog, and ships with a deterministic frozen domain model + seed generator powering all seven screens. Tasks 1–3 complete: app skeleton, local ProductCard, full seed/domain/localStorage implementation, and the 3-step "crear pedido" wizard (Carrito → Cliente → Almacén). Task 4 complete: Pantalla 2 (Operador de gestores verifica pedidos) — read-only kanban board with rate-freeze verification and commission-paid marking. Task 5 complete: Pantalla 3 (Operador de almacén) — warehouse selector, carrier assignment, delivery marking, and backward-compatible board extension. Task 6 complete: Pantalla 4 (Tasas de cambio) — exchange rate editor (USD→MN, Zelle, EUR) rendering as editable numeric fields, saved via a new pure store action `updateExchangeRates` that writes only `state.exchangeRates` and never touches `state.orders`, preserving the frozen-snapshot invariant. Task 10 complete: Pantalla 6 (Decisiones) — 3-layer visual decision dashboard with KPI header (5 tiles with 10-day trends), 4 visuals (sales trend, orders-by-stage distribution, sales-by-warehouse, currency/payment mix), and 3 actionable blocks (gestor ranking, top products by margin, inventory alerts + lowest-margin orders), all fed 100% by seeded data with no invented values, using custom inline SVG chart primitives and pure domain helpers with strict TDD test coverage. Task 11 complete: Pantalla 7 (Finanzas) — rebuilt into a 3-layer financial control panel answering "¿dónde está mi plata y hacia dónde se va?" with 5 KPI tiles (10-day period trends), 4 financial visuals (cash-collection trend with cobrado/pendiente toggle, commission liability donut, revenue by stage, currency/settlement mix), and 3 actionable blocks (commission cost & ROI per gestor, pending cash per warehouse, revenue aging by state). Maintains full architectural decoupling from decisiones (zero cross-dashboard domain imports); all metrics 100% seeded with frozen exchange-rate snapshots; read-only with no mutations; strict TDD throughout. Task 7 (Inventario) remains out of scope.

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

### Requirement: Five-Column Kanban Board (Read-Only)

The `operador-gestores` route MUST render a read-only kanban board with
exactly 5 columns (`creado`, `verificado`, `transportando`, `entregado`,
`comision_pagada`) showing ALL orders from `SeedState.orders` grouped by
`state`. The board MUST NOT support drag & drop; moving an order between
columns is only possible through the Aceptar / Marcar comisión pagada
actions. Each card MUST show a summary sufficient to identify the order
(at minimum: id, client name, total).

#### Scenario: Board renders all 5 columns with all orders grouped by state

- GIVEN a `SeedState` with orders in each of the 5 states
- WHEN `operador-gestores` renders
- THEN 5 columns are shown, one per `OrderState`
- AND every order in `SeedState.orders` appears in the column matching its `state`
- AND the heading matches `/operador de gestores/i`

#### Scenario: No drag & drop between columns

- GIVEN the board is rendered with a `creado` order
- WHEN no Aceptar/Marcar comisión pagada action is invoked
- THEN the order's `state` and column never change from any pointer/drag interaction

### Requirement: Revisar a `creado` Order

Selecting a `creado` order MUST open a review view showing its items,
client/delivery/payment data, the assigned gestor's name and phone
(`Gestor.phone`), and an INFORMATIONAL indicator of whether the assigned
warehouse currently has stock for the order (a boolean availability
re-display, no inventory is mutated). Only orders in state `creado` MAY be
reviewed and accepted; orders in any other state MUST NOT expose the
Aceptar action.

#### Scenario: Revisar shows full order data plus gestor contact

- GIVEN a `creado` order assigned to a gestor with a `phone`
- WHEN the operator selects "Revisar" on that order
- THEN the review view shows the order's items, client, delivery/payment data
- AND the gestor's name and phone are shown
- AND an informational availability indicator for the assigned warehouse is shown

#### Scenario: Aceptar is unavailable on non-`creado` orders

- GIVEN an order in state `verificado`, `transportando`, `entregado`, or `comision_pagada`
- WHEN the board or its review view is rendered for that order
- THEN no "Aceptar" action is offered for that order

### Requirement: Aceptar Freezes Rate and Computes MN Totals

`verifyOrder(id)` MUST transition a `creado` order to `verificado`. On
transition it MUST: snapshot the current `SeedState.exchangeRates.usdToMn`
into `order.exchangeRateSnapshot`; set `order.commissionMN` via
`sumOrderCommission(order.items)`; set `order.totalMN` to
`Math.round(order.totalUSD * order.exchangeRateSnapshot.usdToMn)`; and
stamp `order.verifiedAt` with the current time. `verifyOrder` MUST NOT
mutate `SeedState.inventory` in any way — availability shown during
Revisar is informational only.

#### Scenario: Aceptar computes and freezes totals

- GIVEN a `creado` order with `totalUSD: 200` and items yielding `commissionMN: 30` via `sumOrderCommission`
- AND `SeedState.exchangeRates.usdToMn` is `40`
- WHEN the operator clicks "Aceptar"
- THEN the order's `state` becomes `verificado`
- AND `exchangeRateSnapshot.usdToMn` is `40`
- AND `totalMN` is `Math.round(200 * 40)` = `8000`
- AND `commissionMN` is `30`
- AND `verifiedAt` is set to the current time

#### Scenario: Aceptar does not mutate inventory

- GIVEN a `creado` order whose items are in stock at the assigned warehouse
- AND the pre-Aceptar `SeedState.inventory` quantities for those items
- WHEN the operator clicks "Aceptar"
- THEN `SeedState.inventory` quantities for those items are unchanged after the transition

#### Scenario: Aceptar guards non-`creado` orders

- GIVEN an order not in state `creado`
- WHEN `verifyOrder(id)` is called for that order's id
- THEN the order is not transitioned and its fields are unchanged

### Requirement: Frozen Verify Totals Are Immutable

Once `exchangeRateSnapshot`, `totalMN`, and `commissionMN` are set by
`verifyOrder`, NO subsequent action — including a later change to
`SeedState.exchangeRates.usdToMn` or a call to `markCommissionPaid` —
MUST recompute or mutate them.

#### Scenario: A later rate change does not alter a verified order's frozen totals

- GIVEN a `verificado` order with `exchangeRateSnapshot.usdToMn: 40` and `totalMN: 8000`
- WHEN `SeedState.exchangeRates.usdToMn` is later changed to `45`
- AND the state is reloaded via `loadSeedState`
- THEN that order's `exchangeRateSnapshot.usdToMn` is still `40`
- AND that order's `totalMN` is still `8000`

### Requirement: Marcar Comisión Pagada

`markCommissionPaid(id)` MUST transition an `entregado` order to
`comision_pagada` and stamp `commissionPaidAt` with the current time. It
MUST NOT modify `exchangeRateSnapshot`, `totalMN`, or `commissionMN`. The
action MUST only be offered on orders in state `entregado`.

#### Scenario: Marcar comisión pagada stamps the date without touching frozen totals

- GIVEN an `entregado` order with `exchangeRateSnapshot.usdToMn: 40`, `totalMN: 8000`, `commissionMN: 30`
- WHEN the operator clicks "Marcar comisión pagada"
- THEN the order's `state` becomes `comision_pagada`
- AND `commissionPaidAt` is set to the current time
- AND `exchangeRateSnapshot`, `totalMN`, and `commissionMN` are unchanged

#### Scenario: Marcar comisión pagada is unavailable outside `entregado`

- GIVEN an order in state `creado`, `verificado`, `transportando`, or `comision_pagada`
- WHEN the board is rendered for that order
- THEN no "Marcar comisión pagada" action is offered for that order

### Requirement: Verify/Paid State Persists and Resets

State transitions from `verifyOrder` and `markCommissionPaid` MUST persist
to the same localStorage-backed `SeedState` used by `loadSeedState`, and
MUST be discarded by `resetDemo`.

#### Scenario: A verified order survives a reload

- GIVEN an order was transitioned to `verificado` via `verifyOrder`
- WHEN the app state is reloaded via `loadSeedState`
- THEN that order's `state`, `exchangeRateSnapshot`, `totalMN`, `commissionMN`, and `verifiedAt` are unchanged

#### Scenario: Reset demo discards verify/paid transitions

- GIVEN an order was transitioned via `verifyOrder` or `markCommissionPaid` after the last seed generation
- WHEN "Reiniciar demo" (`resetDemo`) runs
- THEN the regenerated `SeedState.orders` no longer reflects that transition (the order reverts to its deterministic seed state)

### Requirement: Warehouse Selector Filters the Board

The `operador-almacen` route MUST render a warehouse selector (radio-fieldset,
not `<select>`) listing `SeedState.warehouses`, defaulting to the first
warehouse. The kanban board on this screen MUST show ONLY orders whose
`warehouseId` matches the selected warehouse. Switching the selector MUST
re-filter the board without a page reload.

#### Scenario: Board defaults to the first warehouse and filters accordingly

- GIVEN `SeedState.warehouses` has 2+ warehouses and orders spread across them
- WHEN `operador-almacen` renders with no prior selection
- THEN the selector shows the first warehouse selected
- AND only orders with that `warehouseId` appear on the board

#### Scenario: Switching warehouse re-filters the board

- GIVEN the board is showing orders for warehouse A
- WHEN the operator selects warehouse B in the selector
- THEN the board shows only orders with `warehouseId` equal to warehouse B's id
- AND orders belonging to warehouse A are no longer shown

### Requirement: Asignar Transportista (`verificado` → `transportando`)

Selecting a `verificado` order MUST open a picker view listing
`SeedState.transportistas` as a radio-fieldset, showing each carrier's `name`
and, when present, `phone` and `zona`. Confirming a selection MUST call
`assignTransportista(orderId, transportistaId)`, which MUST: set
`order.transportistaId`; transition `order.state` to `transportando`; and
stamp `order.transportingAt` with the current time. The action MUST only be
offered on orders in state `verificado`, and `assignTransportista` MUST NOT
transition an order that is not in state `verificado`.

#### Scenario: Confirming a carrier transitions the order and stamps fields

- GIVEN a `verificado` order and a seeded transportista with `phone` and `zona`
- WHEN the operator opens the picker, selects that transportista, and confirms
- THEN the order's `state` becomes `transportando`
- AND `transportistaId` equals the selected transportista's id
- AND `transportingAt` is set to the current time

#### Scenario: Asignar transportista is unavailable outside `verificado`

- GIVEN an order in state `creado`, `transportando`, `entregado`, or `comision_pagada`
- WHEN the board is rendered for that order
- THEN no "Asignar transportista" action is offered for that order

#### Scenario: assignTransportista guards non-`verificado` orders

- GIVEN an order not in state `verificado`
- WHEN `assignTransportista(id, transportistaId)` is called for that order's id
- THEN the order is not transitioned and its fields are unchanged

### Requirement: Marcar Entregado (`transportando` → `entregado`)

`markDelivered(id)` MUST transition a `transportando` order to `entregado`
and stamp `order.deliveredAt` with the current time. The action MUST only be
offered on orders in state `transportando`, and `markDelivered` MUST NOT
transition an order that is not in state `transportando`.

#### Scenario: Marcar entregado stamps the date and transitions state

- GIVEN a `transportando` order
- WHEN the operator clicks "Marcar entregado"
- THEN the order's `state` becomes `entregado`
- AND `deliveredAt` is set to the current time

#### Scenario: Marcar entregado is unavailable outside `transportando`

- GIVEN an order in state `creado`, `verificado`, `entregado`, or `comision_pagada`
- WHEN the board is rendered for that order
- THEN no "Marcar entregado" action is offered for that order

#### Scenario: markDelivered guards non-`transportando` orders

- GIVEN an order not in state `transportando`
- WHEN `markDelivered(id)` is called for that order's id
- THEN the order is not transitioned and its fields are unchanged

### Requirement: Frozen Verify Totals Stay Immutable Through Transport/Delivery

Neither `assignTransportista` nor `markDelivered` MUST modify
`exchangeRateSnapshot`, `totalMN`, or `commissionMN` on the order they
transition.

#### Scenario: Assigning a transportista does not alter frozen totals

- GIVEN a `verificado` order with `exchangeRateSnapshot.usdToMn: 40`, `totalMN: 8000`, `commissionMN: 30`
- WHEN `assignTransportista(id, transportistaId)` runs
- THEN `exchangeRateSnapshot`, `totalMN`, and `commissionMN` are unchanged

#### Scenario: Marking delivered does not alter frozen totals

- GIVEN a `transportando` order with `exchangeRateSnapshot.usdToMn: 40`, `totalMN: 8000`, `commissionMN: 30`
- WHEN `markDelivered(id)` runs
- THEN `exchangeRateSnapshot`, `totalMN`, and `commissionMN` are unchanged

### Requirement: Shared Board Stays Backward-Compatible for Pantalla 2

The kanban board and its column/card components MUST remain usable by
`operador-gestores` (Pantalla 2) exactly as before: when no new per-state
action props (`onAsignarTransportista`, `onMarcarEntregado`) are supplied,
the board MUST render all 5 columns and MUST NOT render the new actions on
any card. New per-state actions MUST render ONLY when their corresponding
callback prop is supplied AND the card's `state` matches the action's owning
state.

#### Scenario: operador-gestores keeps rendering 5 columns with only its own actions

- GIVEN `operador-gestores` renders the board without passing `onAsignarTransportista`/`onMarcarEntregado`
- THEN 5 columns are still shown
- AND no "Asignar transportista" or "Marcar entregado" action appears on any card

#### Scenario: New actions appear only on their owning state when callbacks are supplied

- GIVEN `operador-almacen` renders the board passing `onAsignarTransportista` and `onMarcarEntregado`
- WHEN a `verificado` order and a `transportando` order are both shown
- THEN the `verificado` card offers "Asignar transportista" and not "Marcar entregado"
- AND the `transportando` card offers "Marcar entregado" and not "Asignar transportista"

### Requirement: Operador de Almacén Route Renders the Warehouse Board

The `/operador-almacen` route MUST replace the placeholder screen with a
direct-render container (no `<Form>`, no loader, no `useNavigate`) mirroring
`operador-gestores.tsx`, holding the selected warehouse in local `useState`.
Its heading MUST match `/operador de almacén/i`.

#### Scenario: Route renders heading and warehouse-filtered board

- GIVEN the app navigates to `/operador-almacen`
- THEN a heading matching `/operador de almacén/i` is rendered
- AND the warehouse selector and the filtered kanban board are both rendered

### Requirement: Transportista Model Supports Optional Contact Fields

`Transportista` MUST gain optional `phone?: string` and `zona?: string`
fields. Existing seed data and consumers that do not set these fields MUST
continue to work unchanged.

#### Scenario: Seeded transportistas may include phone and zona

- GIVEN a seeded `Transportista` with `phone` and `zona` set
- WHEN the carrier picker renders that transportista
- THEN its `phone` and `zona` are shown alongside its `name`

#### Scenario: Transportistas without phone/zona remain valid

- GIVEN a seeded `Transportista` with only `id` and `name` set
- WHEN `loadSeedState` loads the seed
- THEN the transportista loads without error and the picker renders its `name` with no `phone`/`zona` shown

### Requirement: Transport/Delivery State Persists and Resets

State transitions from `assignTransportista` and `markDelivered` MUST
persist to the same localStorage-backed `SeedState` used by
`loadSeedState`, and MUST be discarded by `resetDemo`.

#### Scenario: A transporting/delivered order survives a reload

- GIVEN an order was transitioned to `transportando` via `assignTransportista` (or to `entregado` via `markDelivered`)
- WHEN the app state is reloaded via `loadSeedState`
- THEN that order's `state`, `transportistaId`, `transportingAt`/`deliveredAt` are unchanged

#### Scenario: Reset demo discards transport/delivery transitions

- GIVEN an order was transitioned via `assignTransportista` or `markDelivered` after the last seed generation
- WHEN "Reiniciar demo" (`resetDemo`) runs
- THEN the regenerated `SeedState.orders` no longer reflects that transition (the order reverts to its deterministic seed state)

### Requirement: Tasas Route Renders the Rates Editor

The `/tasas` route MUST replace the placeholder screen with a direct-render
container (no `<Form>`, no loader, no `useNavigate`) that loads
`SeedState.exchangeRates` on mount and renders a `RatesForm` pre-filled with
the three current rates: `usdToMn`, `zelle`, `eur`.

#### Scenario: Route renders the three current rates as editable fields

- GIVEN `SeedState.exchangeRates` is `{ usdToMn: 680, zelle: 1, eur: 1 }`
- WHEN the app navigates to `/tasas`
- THEN three editable numeric fields are rendered
- AND their initial values are `680`, `1`, and `1` respectively

### Requirement: Saving Valid Rates Persists via `updateExchangeRates`

`updateExchangeRates(rates: ExchangeRates): SeedState` MUST replace
`state.exchangeRates` with `rates` in one write and persist via
`saveSeedState`. It MUST NOT read, iterate, or write `state.orders` in any
way. Saving from the `/tasas` container MUST call this action and reflect
the new values after a reload.

#### Scenario: Saving valid rates persists and survives a reload

- GIVEN the operator edits `usdToMn` from `680` to `700` on `/tasas`
- WHEN the operator saves
- THEN `updateExchangeRates` is called with the new rates
- AND reloading via `loadSeedState` shows `exchangeRates.usdToMn` as `700`

#### Scenario: `updateExchangeRates` never touches `state.orders`

- GIVEN a `SeedState` with existing orders in any state
- WHEN `updateExchangeRates(rates)` is called
- THEN `state.orders` is reference-unchanged (same array, same order objects)
- AND only `state.exchangeRates` differs from the prior state

### Requirement: Non-Positive or Invalid Rates Block Save

The rates editor MUST reject a save when any of `usdToMn`, `zelle`, or `eur`
is empty, non-numeric (`NaN`), or `<= 0`. On rejection it MUST show an
inline error, keep the form editable, and MUST NOT call
`updateExchangeRates` or persist any value. All three rates MUST be valid
positive numbers before a save is allowed.

#### Scenario: Non-positive rate blocks save

- GIVEN the operator sets `zelle` to `0` on `/tasas`
- WHEN the operator attempts to save
- THEN an inline error is shown
- AND the form remains editable
- AND `updateExchangeRates` is not called

#### Scenario: Empty or non-numeric rate blocks save

- GIVEN the operator clears the `eur` field (or types a non-numeric value)
- WHEN the operator attempts to save
- THEN an inline error is shown
- AND `updateExchangeRates` is not called
- AND no partial rates are persisted

### Requirement: Editing Rates Does Not Recalculate Verified Orders

(Reinforces the existing "Frozen Verify Totals Are Immutable" requirement
from the `verifyOrder` side by exercising it through the new write path.)
After `updateExchangeRates` runs, orders already in state `verificado` or
later MUST keep their frozen `exchangeRateSnapshot`, `totalMN`, and
`commissionMN` untouched. A `creado` order verified AFTER the rate edit
MUST use the NEW `usdToMn` when `verifyOrder` computes its snapshot and
totals.

#### Scenario: A verified order keeps its frozen snapshot after a rate edit

- GIVEN a `verificado` order with `exchangeRateSnapshot.usdToMn: 40` and `totalMN: 8000`
- WHEN the operator edits `SeedState.exchangeRates.usdToMn` to `45` via `updateExchangeRates` and saves
- THEN that order's `exchangeRateSnapshot.usdToMn` is still `40`
- AND that order's `totalMN` is still `8000`

#### Scenario: A newly verified order uses the new rate after the edit

- GIVEN `SeedState.exchangeRates.usdToMn` is edited from `40` to `45` via `updateExchangeRates`
- AND a `creado` order with `totalUSD: 200`
- WHEN the operator later runs `verifyOrder` on that order
- THEN `exchangeRateSnapshot.usdToMn` is `45`
- AND `totalMN` is `Math.round(200 * 45)` = `9000`

### Requirement: Decisiones Route Renders the Three-Layer Decision Dashboard

The `/decisiones` route MUST render a direct-render container (no `<Form>`,
no loader, no `useNavigate`) that loads `SeedState` via `loadSeedState` on
mount, computes every view model once via pure domain helpers, and renders,
top to bottom: Layer 1 (5 KPI tiles), Layer 2 (4 visuals), Layer 3 (4
actionable blocks). It MUST render exactly one `<h1>` and no other heading
MUST contain the word "decisiones".

#### Scenario: Route renders all three layers when qualifying orders exist

- GIVEN `SeedState` contains at least one order in state `verificado` or later
- WHEN the app navigates to `/decisiones`
- THEN exactly one `<h1>` is rendered
- AND the 5 KPI tiles of Layer 1 are rendered
- AND the 4 visuals of Layer 2 are rendered
- AND the 4 actionable blocks of Layer 3 are rendered

#### Scenario: No other heading repeats "decisiones"

- GIVEN `/decisiones` is rendered
- WHEN all headings in the document are inspected
- THEN only the single `<h1>` matches `/decisiones/i`
- AND no nested subheading text contains the word "decisiones"

### Requirement: Data Derives Only From Seeded Data and Each Order's Own Frozen Rate Snapshot

Every figure on `/decisiones` MUST be computed from `SeedState` alone — no
invented values, no live network/API data. Any conversion between MN and USD
MUST use the specific order's own frozen `exchangeRateSnapshot.usdToMn` (or,
for the currency mix, the order's own frozen payment/rate context), never
`SeedState.exchangeRates` (the live rates). An order item whose `productId`
has no matching entry in `SeedState.products` MUST contribute `0` to any
cost/margin aggregation without throwing, while the rest of that order's
items and other orders are still processed.

#### Scenario: A later live-rate edit does not change an already-computed KPI

- GIVEN a `verificado` order with `exchangeRateSnapshot.usdToMn: 40` and `commissionMN: 3000`
- AND `SeedState.exchangeRates.usdToMn` is later edited to `45`
- WHEN any `/decisiones` aggregation touching that order is rebuilt
- THEN the order's contribution to `commissionUSD`/`marginUSD` still uses `40`, not `45`

#### Scenario: Orphan product reference contributes zero without throwing

- GIVEN an order item's `productId` does not exist in `SeedState.products`
- WHEN any margin, cost, or top-products aggregation runs
- THEN it does not throw
- AND that item contributes `0` to cost/margin while the rest of the order's items and other orders are still aggregated

### Requirement: KPI Header Has Exactly Five Tiles

Layer 1 MUST render exactly five KPI tiles, in this order: Ventas (USD),
Margen (USD + %), Pedidos + ticket promedio (AOV), Comisión pendiente (MN),
Cobrado vs pendiente. Each tile's underlying value MUST be computed only
from orders with `state !== 'creado'`, except "Comisión pendiente (MN)" and
"Cobrado vs pendiente", which use the pending/paid/in-transit state
groupings defined below.

#### Scenario: Five tiles render in the fixed order

- GIVEN `SeedState` contains qualifying orders
- WHEN `/decisiones` is rendered
- THEN the KPI header shows exactly 5 tiles in the order: Ventas, Margen, Pedidos+AOV, Comisión pendiente, Cobrado vs pendiente

### Requirement: KPI Formulas

Each KPI tile's value, computed over a given order set, MUST use:

| KPI | Formula |
|-----|---------|
| Ventas (USD) | `Σ order.totalUSD` |
| Margen (USD) | `Σ (order.totalUSD − orderCostUSD − orderCommissionUSD)`, using the same per-order cost/commission formula as `buildProfitabilityRanking` |
| Margen (%) | `marginUSD / revenueUSD × 100`, or `0` when `revenueUSD` is `0` |
| Pedidos | `count` of qualifying orders |
| Ticket promedio (AOV) | `revenueUSD / count`, or `0` when `count` is `0` |
| Comisión pendiente (MN) | `Σ order.commissionMN` over orders where `state` is `verificado`, `transportando`, or `entregado` AND `commissionPaidAt` is not set (same "pending" definition as `buildFinanceSummary`) |
| Cobrado (count/USD) | orders in state `entregado` or `comision_pagada` |
| Pendiente/en tránsito (count/USD) | orders in state `verificado` or `transportando` |

#### Scenario: Margin and AOV are computed from revenue, cost, and commission

- GIVEN two qualifying orders: one with `totalUSD: 500`, `commissionMN: 3000`, `exchangeRateSnapshot.usdToMn: 40`, item cost `200`; another with `totalUSD: 300`, `commissionMN: 1000`, `exchangeRateSnapshot.usdToMn: 40`, item cost `100`
- WHEN the KPI values are computed
- THEN `Ventas (USD)` is `800`
- AND `Margen (USD)` is `(500 − 200 − 75) + (300 − 100 − 25) = 225 + 175 = 400`
- AND `Pedidos` is `2` and `Ticket promedio` is `400`

#### Scenario: Comisión pendiente excludes paid and creado orders

- GIVEN one `verificado` order with `commissionMN: 1000` and no `commissionPaidAt`, one `entregado` order with `commissionMN: 2000` and no `commissionPaidAt`, and one `comision_pagada` order with `commissionMN: 3000`
- WHEN `Comisión pendiente (MN)` is computed
- THEN it is `1000 + 2000 = 3000` (the paid order is excluded)

### Requirement: Every KPI Tile Shows a 10-Day vs Prior-10-Day Trend

Every KPI tile MUST be computed twice: once over orders whose `createdAt`
falls within the current window `(generatedAt − 10 days, generatedAt]`, and
once over orders whose `createdAt` falls within the prior window
`(generatedAt − 20 days, generatedAt − 10 days]`, where `generatedAt` is
`SeedState.generatedAt` — never the wall-clock date. Each tile MUST display
the current-window value and a trend indicator (up / down / flat) derived
from comparing the current-window value to the prior-window value. When the
prior-window value is `0` and the current-window value is greater than `0`,
the trend MUST be "up" (never a divide-by-zero/`Infinity` percentage). When
both windows are `0`, the trend MUST be "flat".

#### Scenario: Trend windows use generatedAt, not the wall clock

- GIVEN `SeedState.generatedAt` is `2026-07-10T12:00:00.000Z`
- AND an order with `createdAt` 5 days before `generatedAt`
- AND an order with `createdAt` 15 days before `generatedAt`
- WHEN the KPI trend windows are computed
- THEN the first order falls in the current 10-day window
- AND the second order falls in the prior 10-day window
- AND this result does not depend on the actual current date the test runs on

#### Scenario: Zero orders in the prior window yields an "up" trend, not a crash

- GIVEN a KPI's prior-window value is `0`
- AND its current-window value is `500`
- WHEN the trend is computed
- THEN the trend indicator is "up"
- AND no `Infinity` or `NaN` value is rendered

### Requirement: Sales Trend Visual Spans the Last 20 Days With a Cantidad/Valor Toggle

Layer 2's sales-trend visual MUST aggregate qualifying orders
(`state !== 'creado'`) by calendar day over the 20-day seed window ending at
`generatedAt`, producing one data point per day (including days with zero
qualifying orders, at value `0`). The visual MUST support toggling between
two series without re-fetching or mutating `SeedState`: "cantidad" (count of
qualifying orders per day) and "valor" (`Σ order.totalUSD` per day).

#### Scenario: A day with zero qualifying orders still appears as a zero point

- GIVEN the 20-day window contains one day with no `verificado`-or-later orders
- WHEN the trend series is built
- THEN that day appears in the series with value `0`, not omitted

#### Scenario: Toggling between cantidad and valor changes the series without touching SeedState

- GIVEN the trend visual is showing the "valor" series
- WHEN the user toggles to "cantidad"
- THEN the rendered series switches to per-day order counts
- AND `SeedState` is not read again or mutated by the toggle

### Requirement: Pedidos por Etapa Is a Distribution Snapshot, Not a Conversion Funnel

Layer 2's "Pedidos por etapa" visual MUST count **every** order in
`SeedState.orders` (including `state: 'creado'`) grouped into exactly one
row per `OrderState`, in the fixed linear order
`creado → verificado → transportando → entregado → comision_pagada`, even
when a state has zero orders. The visual and any accompanying copy MUST NOT
use conversion/funnel language (e.g. "% de conversión", "tasa de abandono");
it MUST be labeled as a snapshot distribution of where orders currently sit.

#### Scenario: All five states appear even with zero orders in some states

- GIVEN `SeedState.orders` contains orders only in `creado` and `entregado`
- WHEN the stage distribution is built
- THEN it has exactly 5 entries, one per state in the fixed linear order
- AND the `verificado`, `transportando`, and `comision_pagada` entries each show `count: 0`

### Requirement: Ventas por Almacén Aggregates Revenue by Warehouse

Layer 2's "Ventas por almacén" visual MUST group qualifying orders
(`state !== 'creado'`) by `order.warehouseId`, producing one bar per
`SeedState.warehouse` (in `state.warehouses` order) with `revenueUSD`
(`Σ order.totalUSD`) and `count`. A warehouse with zero qualifying orders
MUST still appear with `revenueUSD: 0` and `count: 0`, not be omitted.

#### Scenario: Every seeded warehouse appears, including one with zero sales

- GIVEN `SeedState.warehouses` has 3 warehouses and qualifying orders exist for only 2 of them
- WHEN the by-warehouse aggregation is built
- THEN all 3 warehouses appear
- AND the warehouse with no qualifying orders shows `revenueUSD: 0` and `count: 0`

### Requirement: Mix por Moneda Aggregates Orders by Payment Method

Layer 2's "Mix por moneda / método de pago" visual MUST group qualifying
orders (`state !== 'creado'`) by `order.payment.method`, producing one
bucket per distinct method present in the data (at minimum USD, MN, ZELLE,
EUR when present) with `count` and `revenueUSD` (`Σ order.totalUSD`), plus
each bucket's percentage share of the total qualifying order count. A
`payment.method` value that does not match any known bucket MUST be grouped
into an explicit "otros" bucket rather than thrown away or crashing the
aggregation.

#### Scenario: Four seeded payment methods produce four buckets with correct shares

- GIVEN 10 qualifying orders: 4 `USD`, 3 `MN`, 2 `ZELLE`, 1 `EUR`
- WHEN the currency mix is built
- THEN there are 4 buckets with `count` `4`, `3`, `2`, `1` respectively
- AND the `USD` bucket's share is `40%`

#### Scenario: An unrecognized payment method does not crash the aggregation

- GIVEN a qualifying order with `payment.method: 'CRYPTO'` (not one of the known buckets)
- WHEN the currency mix is built
- THEN that order is counted in an "otros" bucket
- AND the aggregation does not throw

### Requirement: Ranking de Gestores Computes Sales, AOV, and Commission Earned/Pending

Layer 3's gestor ranking MUST produce one row per `SeedState.gestores`
entry, computed from that gestor's qualifying orders (`state !== 'creado'`
AND `order.gestorId` matches), with: `revenueUSD` (`Σ totalUSD`), `count`,
`aov` (`revenueUSD / count`, or `0` when `count` is `0`), `commissionEarnedMN`
(`Σ commissionMN` across all qualifying orders for that gestor — commission
is frozen/earned at verification regardless of payment status), and
`commissionPendingMN` (`Σ commissionMN` restricted to orders where `state`
is `verificado`, `transportando`, or `entregado` AND `commissionPaidAt` is
not set — same pending definition as `buildFinanceSummary`). Rows MUST be
sorted by `revenueUSD` descending. A gestor with zero qualifying orders MUST
still appear with all values at `0`, not be omitted.

#### Scenario: A gestor's row aggregates only their own orders

- GIVEN gestor `g1` has one `verificado` order with `totalUSD: 400`, `commissionMN: 800`, no `commissionPaidAt`
- AND gestor `g2` has one `comision_pagada` order with `totalUSD: 600`, `commissionMN: 1200`
- WHEN the gestor ranking is built
- THEN `g1`'s row shows `revenueUSD: 400`, `count: 1`, `aov: 400`, `commissionEarnedMN: 800`, `commissionPendingMN: 800`
- AND `g2`'s row shows `revenueUSD: 600`, `commissionEarnedMN: 1200`, `commissionPendingMN: 0`

#### Scenario: A gestor with no qualifying orders still appears with zero values

- GIVEN a gestor in `SeedState.gestores` with no orders assigned
- WHEN the gestor ranking is built
- THEN that gestor's row appears with `revenueUSD: 0`, `count: 0`, `aov: 0`, `commissionEarnedMN: 0`, `commissionPendingMN: 0`

### Requirement: Top Productos por Margen Ranks by Aggregate Margin, Not Revenue

Layer 3's top-products block MUST rank products by aggregate margin, not
revenue. For each product, aggregate margin MUST be computed only from
items belonging to qualifying orders (`state !== 'creado'`) as
`Σ (item.quantity × (item.priceUSD − product.costUSD))` across all such
items referencing that product. This aggregation intentionally excludes any
per-line commission allocation (commission is an order/gestor-level figure,
not attributable to a line item without an arbitrary split). Rows MUST be
sorted by aggregate margin descending, and a product with no qualifying
sales MUST NOT appear (unlike the warehouse/gestor rankings, this block only
surfaces products that actually sold).

#### Scenario: A product's aggregate margin sums across all its qualifying order lines

- GIVEN product `p1` (`costUSD: 10`) appears in one qualifying order line with `quantity: 2`, `priceUSD: 25`, and in another qualifying order line with `quantity: 1`, `priceUSD: 30`
- WHEN the top-products-by-margin aggregation runs
- THEN `p1`'s aggregate margin is `2 × (25 − 10) + 1 × (30 − 10) = 30 + 20 = 50`

#### Scenario: A product with no qualifying sales does not appear

- GIVEN a product in `SeedState.products` that appears in no order with `state !== 'creado'`
- WHEN the top-products-by-margin aggregation runs
- THEN that product does not appear in the ranking

### Requirement: Alertas de Inventario Flags Low and Out-of-Stock Products per Warehouse

Layer 3's inventory alerts block MUST classify every `SeedState.inventory`
entry (joined to its product) into exactly one of three stock levels:
`agotado` (`quantity === 0`), `bajo` (`0 < quantity <= 3`), or `normal`
(`quantity > 3`). Only entries classified `agotado` or `bajo` MUST be
surfaced in the alerts list, grouped by `warehouseId`. An inventory entry
whose `productId` has no matching product MUST be skipped without throwing.

#### Scenario: A zero-quantity entry is flagged as agotado

- GIVEN an inventory entry with `quantity: 0`
- WHEN the alerts block is built
- THEN that entry appears in the alerts list as `agotado`

#### Scenario: A low but nonzero quantity entry is flagged as bajo

- GIVEN an inventory entry with `quantity: 2`
- WHEN the alerts block is built
- THEN that entry appears in the alerts list as `bajo`

#### Scenario: A normal-quantity entry does not appear in the alerts list

- GIVEN an inventory entry with `quantity: 10`
- WHEN the alerts block is built
- THEN that entry does not appear in the alerts list

### Requirement: Layer 3 Lowest-Margin Orders Block Reuses buildProfitabilityRanking, Ascending, Without a "Loss" Label

Layer 3's "pedidos de menor margen" block MUST reuse
`buildProfitabilityRanking`'s existing output unchanged — no new margin
computation — and display its rows in ascending `marginUSD` order (the
lowest-margin tail first). It MUST NOT use "pérdida"/"loss" language or
styling in this block, even for a row where `isLoss` happens to be `true`;
the block's framing is strictly "menor margen" (lower-margin ranking), not a
loss report.

#### Scenario: Rows render lowest margin first

- GIVEN `buildProfitabilityRanking` returns rows with `marginUSD` values `300`, `100`, `50` (already sorted descending by the existing helper)
- WHEN the Layer 3 lowest-margin block renders
- THEN the visible row order is `50`, `100`, `300`

#### Scenario: No "loss" language appears even for a technically negative-margin row

- GIVEN a row with `marginUSD < 0` (hypothetically, outside the fixed-cost seed assumption)
- WHEN the Layer 3 block renders that row
- THEN it is not labeled or styled as a "loss"/"pérdida"
- AND it is only distinguishable by its position in the ascending ranking

### Requirement: No Sales Target / Meta Is Rendered

The `/decisiones` screen MUST NOT render any sales-target or meta-de-ventas
element: no compliance gauge, no vs-objective semáforo/traffic-light
indicator, and no KPI tile or visual whose framing implies a goal to hit.

#### Scenario: No goal/target element exists anywhere on the screen

- GIVEN `/decisiones` is fully rendered
- WHEN the rendered output is inspected
- THEN no element represents a sales target, goal completion percentage, or objective-compliance indicator

### Requirement: Read-Only Screen With No Mutation Affordance

The `/decisiones` screen MUST NOT expose any control that mutates
`SeedState`: no `<form>`, no button that writes to the store, no navigation
that triggers a state transition. Local view-only UI state (e.g. the
cantidad/valor trend toggle) is permitted since it does not read from or
write to `SeedState` beyond the initial load.

#### Scenario: No form or mutating button is rendered

- GIVEN `/decisiones` is rendered with any mix of order states
- WHEN the rendered output is inspected
- THEN it contains no `<form>` element
- AND it contains no button wired to a store-mutating action

### Requirement: Money Formatting — USD via `formatMoney`, MN as Plain Text

Every USD figure anywhere on `/decisiones` (KPI tiles, visuals, ranking
rows, totals) MUST render through `formatMoney`, matching
`^\$[\d,]+\.\d{2}$`. Every MN-denominated figure MUST render as plain
`{value} MN` text and MUST NOT be passed through `formatMoney`.

#### Scenario: USD figures match the formatMoney pattern

- GIVEN any rendered USD figure on `/decisiones`
- WHEN it is inspected
- THEN it matches the regex `^\$[\d,]+\.\d{2}$`

#### Scenario: MN figures render as plain text, not formatMoney

- GIVEN any rendered MN-denominated figure on `/decisiones`
- WHEN it is inspected
- THEN it renders as plain `{value} MN` text, not in `formatMoney`'s USD format

### Requirement: Empty State When No Verificado-or-Later Orders Exist

When zero orders qualify (only `creado` orders exist in `SeedState.orders`),
the route MUST still render exactly one `<h1>` plus a clear empty-state
message, and MUST NOT render fabricated zero-value KPI tiles, visuals, or
actionable blocks in place of real data. The "Pedidos por etapa" distribution
is exempt from this empty state — it MAY still render because it counts
`creado` orders too (see the stage-distribution requirement below) and can
legitimately show a single non-empty bar.

#### Scenario: Zero qualifying orders shows an empty-state message

- GIVEN `SeedState.orders` contains only orders in state `creado`
- WHEN the app navigates to `/decisiones`
- THEN the single `<h1>` is still rendered
- AND an empty-state message is shown instead of the KPI header and the sales/margin/ranking blocks

### Requirement: Finanzas Route Renders the Three-Layer Finance Dashboard

The `/finanzas` route MUST render a direct-render container (no `<Form>`,
loader, or `useNavigate`) loading `SeedState` via `loadSeedState`, computing
view models via pure helpers (composing `buildFinanceSummary` unchanged),
and rendering top to bottom: Layer 1 (5 KPI tiles), Layer 2 (4 visuals),
Layer 3 (3 blocks). Exactly one `<h1>` MUST render; no other heading MUST
contain "finanzas".

#### Scenario: All three layers render for qualifying orders

- GIVEN `SeedState` has an order in state `verificado` or later
- WHEN `/finanzas` renders
- THEN exactly one `<h1>` renders, and all 5 Layer-1 tiles, 4 Layer-2
  visuals, and 3 Layer-3 blocks render

### Requirement: Empty State When No Qualifying Orders Exist

With zero qualifying orders (`state !== 'creado'`), the route MUST still
render one `<h1>` plus an empty-state message, MUST NOT fabricate
non-zero-looking data for Layer 1/2 or the gestor/warehouse blocks. Layer
3's "Flujo por estado" is exempt (counts every state including `creado`,
and MAY show real zero rows).

#### Scenario: Zero qualifying orders shows a message, not fabricated data

- GIVEN `SeedState.orders` contains only `creado` orders
- WHEN `/finanzas` renders
- THEN the `<h1>` still renders, an empty-state message replaces Layer 1/2
  and the gestor/warehouse blocks, and nothing throws

### Requirement: Money Formatting for Finanzas

Every USD figure across all layers MUST render via a formatter matching
`^\$[\d,]+\.\d{2}$`. Every MN figure MUST render as plain `` `${value} MN` ``
text (no thousands separators), never through the USD formatter, and MUST show
`0 MN` (never `NaN`) when source orders are absent.

#### Scenario: MN never renders NaN

- GIVEN only `creado` orders (undefined `totalMN`/`commissionMN`)
- WHEN an MN tile renders
- THEN it shows `0 MN`, never `NaN`

### Requirement: Finanzas Read-Only Screen With No Mutation Affordance

Across all three layers, `/finanzas` MUST expose no control mutating
`SeedState`: no `<form>`, no store-mutating button, no "marcar comisión
pagada" action. A local view-only toggle (e.g. cash-flow cobrado/pendiente)
is permitted.

#### Scenario: No form or mutating button renders

- GIVEN `/finanzas` renders with any mix of order states
- WHEN inspected
- THEN no `<form>` and no store-mutating button exist

### Requirement: Layer 1 KPI Header Has Exactly Five Tiles With Period Trend

Layer 1 MUST render five tiles, each computed for the current 10-day
window vs the prior 10-day window (anchored to `SeedState.generatedAt`,
never the wall clock) with a trend indicator:

| Tile | Formula |
|---|---|
| Ingresos facturados (USD) | `Σ totalUSD`, qualifying |
| Ingresos liquidados (MN) | `Σ totalMN`, qualifying |
| Cobrado vs pendiente (USD) | `Σ totalUSD`, `entregado`/`comision_pagada` vs `verificado`/`transportando` |
| Comisión pendiente (MN) | `buildFinanceSummary.kpis.commissionPendingMN` |
| Margen neto (USD) + % | `totalUSD − costoUSD − comisiónUSD`, aggregated |

A `0`-prior / `>0`-current window MUST trend "up" (never `Infinity`).

#### Scenario: Five tiles render with a safe trend

- GIVEN qualifying orders in both windows, one tile with prior `0` /
  current `> 0`
- WHEN Layer 1 computes
- THEN all 5 tiles render in order, and that tile shows "up", never
  `Infinity`

### Requirement: Layer 2 Renders Four Financial Visuals

| Visual | Field(s) |
|---|---|
| Tendencia de cobros (20d, toggle cobrado/pendiente) | `totalUSD` by day, split cobrado/pendiente |
| Comisión pagada vs pendiente (dona) | `commissionPaidMN` / `commissionPendingMN` |
| Ingresos por estado (barras) | `FinanceStateRow.revenueUSD` per state |
| Mix por moneda (dona) | `buildCurrencyExposure` revenue+percent per `payment.method` (hard-currency vs local-currency FX exposure) |

Every day in the 20-day window MUST appear, including days at `0`.

#### Scenario: A zero-activity day still appears

- GIVEN one day in the 20-day window has no qualifying orders
- WHEN the trend builds
- THEN that day appears at `0`, not omitted

#### Scenario: Toggling the trend does not touch SeedState

- GIVEN the trend shows "cobrado"
- WHEN toggled to "pendiente"
- THEN the series switches without re-reading or mutating `SeedState`

### Requirement: Layer 3 Renders Three Actionable Finance Blocks

| Block | Field(s) |
|---|---|
| Comisión y ROI por gestor | `buildGestorRanking`; derived pagada = earned − pending; take-rate = commission ÷ revenue |
| Cobros pendientes por almacén | `totalUSD` by `warehouseId`, cobrado/pendiente |
| Flujo por estado | existing `StateBreakdownTable`, unchanged |

A gestor/warehouse with zero qualifying orders MUST still appear at `0`,
not be omitted.

#### Scenario: Zero-order gestor and warehouse still appear

- GIVEN a gestor and a warehouse with no qualifying orders
- WHEN Layer 3 computes
- THEN both appear with all values at `0`

### Requirement: Finance Data Derives Only From Seeded Data and Each Order's Frozen Rate

Every `/finanzas` figure MUST derive from `SeedState` alone. MN↔USD
conversion MUST use each order's own frozen `exchangeRateSnapshot.usdToMn`,
never live `state.exchangeRates`. Every MN aggregate MUST filter
`state !== 'creado'` and coalesce `?? 0`.

#### Scenario: A later live-rate edit does not change an already-computed figure

- GIVEN a `verificado` order with `exchangeRateSnapshot.usdToMn: 40`
- AND `state.exchangeRates.usdToMn` is later edited to `45`
- WHEN the aggregation touching that order rebuilds
- THEN it still uses `40`, not `45`

#### Scenario: A creado order never produces NaN

- GIVEN a `creado` order with undefined `totalMN`/`commissionMN`
- WHEN any MN aggregate builds
- THEN that order contributes `0`, never `NaN`

## Out of Scope (explicit non-requirements)

- Screen logic (inventory tables) — Task 7 (Inventario).
- Extracting `ProductCard` or catalog into shared `packages/*` — rejected.
- GH Pages / multi-vertical build machinery — not applicable.
