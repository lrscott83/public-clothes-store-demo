# Spec — salesops-mvp (Tasks 1–6)

## Purpose

Define the testable contract for the `@store-mgmt/salesops-mvp` app: a workspace app that registers correctly, serves on a distinct port, resolves 7 placeholder routes with a sidebar, renders a product against a local catalog, and ships with a deterministic frozen domain model + seed generator powering all seven screens. Tasks 1–3 complete: app skeleton, local ProductCard, full seed/domain/localStorage implementation, and the 3-step "crear pedido" wizard (Carrito → Cliente → Almacén). Task 4 complete: Pantalla 2 (Operador de gestores verifica pedidos) — read-only kanban board with rate-freeze verification and commission-paid marking. Task 5 complete: Pantalla 3 (Operador de almacén) — warehouse selector, carrier assignment, delivery marking, and backward-compatible board extension. Task 6 complete: Pantalla 4 (Tasas de cambio) — exchange rate editor (USD→MN, Zelle, EUR) rendering as editable numeric fields, saved via a new pure store action `updateExchangeRates` that writes only `state.exchangeRates` and never touches `state.orders`, preserving the frozen-snapshot invariant. Task 8 complete: Pantalla 6 (Decisiones) — read-only Order Profitability / Margin Ranking screen ranking verified-or-later orders by profit margin, flagging loss-makers, showing grand totals, using order's frozen exchange-rate snapshot and zero domain/store schema changes. Task 9 complete: Pantalla 7 (Finanzas) — read-only commission and cash-flow summary screen aggregating commission paid vs. pending (native MN, no conversion) and per-order-state revenue/commission funnel, with zero domain/store schema changes. Task 7 (Inventario) remains out of scope.

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

### Requirement: Decisiones Route Renders the Profitability Ranking

The `/decisiones` route MUST replace the placeholder screen with a
direct-render container (no `<Form>`, no loader, no `useNavigate`) that
loads `SeedState` via `loadSeedState` on mount, computes the ranking with a
pure builder, and renders a summary card plus a ranked table. It MUST
render exactly one `<h1>` and no other heading MUST contain the word
"decisiones".

#### Scenario: Route renders heading, summary, and ranked rows

- GIVEN `SeedState` contains at least one order in state `verificado` or later
- WHEN the app navigates to `/decisiones`
- THEN exactly one `<h1>` is rendered
- AND a grand-totals summary card is rendered
- AND a ranked table/list of orders is rendered

#### Scenario: No other heading repeats "decisiones"

- GIVEN `/decisiones` is rendered
- WHEN all headings in the document are inspected
- THEN only the single `<h1>` matches `/decisiones/i`
- AND no nested subheading text contains the word "decisiones"

### Requirement: Ranking Includes Only Verificado-or-Later Orders

The ranking builder MUST include every order with `state !== 'creado'` and
MUST exclude every order in state `creado` entirely — no placeholder row,
no separate group.

#### Scenario: A verificado order appears in the ranking

- GIVEN an order in state `verificado` with frozen `totalUSD`, `commissionMN`, and `exchangeRateSnapshot`
- WHEN the ranking is built
- THEN that order appears as a row in the ranking

#### Scenario: A creado order is excluded entirely

- GIVEN an order in state `creado` with no frozen totals
- WHEN the ranking is built
- THEN that order does not appear in the ranking rows, in any group, or in the grand totals

### Requirement: Per-Order Margin Computation

For each included order, the builder MUST compute: `revenueUSD = order.totalUSD`;
`costUSD = Σ(item.quantity × product.costUSD)` joining `item.productId` to the
product catalog by id; `commissionUSD = order.commissionMN / order.exchangeRateSnapshot.usdToMn`;
and `marginUSD = revenueUSD − costUSD − commissionUSD`.

#### Scenario: Margin is computed from revenue, cost, and commission

- GIVEN an order with `totalUSD: 500`, `commissionMN: 3000`, `exchangeRateSnapshot.usdToMn: 40`
- AND its items resolve to a total `costUSD` of `200`
- WHEN the ranking is built
- THEN that row's `commissionUSD` is `75`
- AND that row's `marginUSD` is `500 − 200 − 75 = 225`

#### Scenario: Orphan product reference is skipped without throwing

- GIVEN an order item's `productId` does not exist in the product catalog
- WHEN the ranking is built
- THEN the builder does not throw
- AND that item contributes `0` to `costUSD` while the rest of the order's items are still summed

### Requirement: Commission Uses the Order's Own Frozen Rate Snapshot

`commissionUSD` MUST be derived only from `order.exchangeRateSnapshot.usdToMn`
(the order's own frozen rate at verification time). The live
`SeedState.exchangeRates.usdToMn` MUST NOT be used for this conversion,
even when it differs from the order's snapshot.

#### Scenario: A later live-rate edit does not change an already-ranked order's commission or margin

- GIVEN a `verificado` order with `exchangeRateSnapshot.usdToMn: 40` and `commissionMN: 3000`
- AND `SeedState.exchangeRates.usdToMn` is later edited to `45`
- WHEN the ranking is rebuilt
- THEN that order's `commissionUSD` is still `3000 / 40 = 75`
- AND that order's `marginUSD` is unchanged from before the rate edit

### Requirement: Descending Sort and Loss Flagging

Ranking rows MUST be sorted by `marginUSD` descending. Any row with
`marginUSD < 0` MUST be flagged as a loss.

#### Scenario: Rows are sorted by margin descending

- GIVEN three ranked orders with `marginUSD` values `100`, `-20`, and `300`
- WHEN the ranking is built
- THEN the row order is `300`, `100`, `-20`

#### Scenario: A negative-margin order is flagged as a loss

- GIVEN an order whose computed `marginUSD` is `-20`
- WHEN that row is rendered
- THEN it is visibly flagged/tagged as a loss

#### Scenario: A zero-or-positive margin order is not flagged as a loss

- GIVEN an order whose computed `marginUSD` is `0` or greater
- WHEN that row is rendered
- THEN it is not flagged as a loss

### Requirement: Grand Totals Match the Sum of Rows

The builder MUST return grand totals — `totalRevenueUSD`, `totalCostUSD`,
`totalCommissionUSD`, `totalMarginUSD` — each equal to the sum of the
corresponding per-row value across all included orders.

#### Scenario: Grand totals equal the sum of all rows

- GIVEN a ranking with rows having `marginUSD` values `225` and `-20`
- WHEN grand totals are computed
- THEN `totalMarginUSD` equals `225 + (-20) = 205`
- AND `totalRevenueUSD`, `totalCostUSD`, `totalCommissionUSD` likewise equal the sum of their respective per-row values

### Requirement: Money Formatting — USD via `formatMoney`, MN as Plain Text

Every USD figure (`revenueUSD`, `costUSD`, `commissionUSD`, `marginUSD`, and
grand totals) MUST render through `formatMoney`, matching `^\$[\d,]+\.\d{2}$`.
Any MN-denominated figure MUST render as plain `{value} MN` text and MUST
NOT be passed through `formatMoney`.

#### Scenario: USD figures match the formatMoney pattern

- GIVEN a rendered ranking row
- WHEN its revenue, cost, commission, and margin figures are inspected
- THEN each matches the regex `^\$[\d,]+\.\d{2}$`

#### Scenario: MN figures render as plain text, not formatMoney

- GIVEN a rendered row or summary that shows an MN-denominated figure
- WHEN that figure is inspected
- THEN it renders as plain `{value} MN` text, not in `formatMoney`'s USD format

### Requirement: Empty State When No Verificado-or-Later Orders Exist

When zero orders qualify for the ranking, the route MUST still render
exactly one `<h1>` plus a clear empty-state message, and MUST NOT render a
ranking table or a grand-totals summary card with fabricated zero rows.

#### Scenario: Zero qualifying orders shows an empty-state message

- GIVEN `SeedState.orders` contains only orders in state `creado`
- WHEN the app navigates to `/decisiones`
- THEN the single `<h1>` is still rendered
- AND an empty-state message is shown instead of a ranking table

### Requirement: Read-Only Screen With No Mutation Affordance

The `/decisiones` screen MUST NOT expose any control that mutates
`SeedState`: no `<form>`, no button that writes to the store, no navigation
that triggers a state transition. It is display-only.

#### Scenario: No form or mutating button is rendered

- GIVEN `/decisiones` is rendered with any mix of order states
- WHEN the rendered output is inspected
- THEN it contains no `<form>` element
- AND it contains no button wired to a store-mutating action

### Requirement: Finanzas Route Renders the Commission & Cash-Flow Summary

The `/finanzas` route MUST replace the placeholder screen with a
direct-render container (no `<Form>`, no loader, no `useNavigate`) that
loads `SeedState` via `loadSeedState` on mount, computes the view model with
`buildFinanceSummary`, and renders a KPI summary block plus a per-state
breakdown table. It MUST render exactly one `<h1>` and no other heading MUST
contain the substring "finanzas".

#### Scenario: Route renders heading, KPI block, and breakdown table

- GIVEN `SeedState.orders` contains orders across multiple states
- WHEN the app navigates to `/finanzas`
- THEN exactly one `<h1>` is rendered
- AND a commission KPI summary block is rendered
- AND a per-state breakdown table is rendered

#### Scenario: No other heading repeats "finanzas"

- GIVEN `/finanzas` is rendered
- WHEN all headings are inspected
- THEN only the single `<h1>` matches `/finanzas/i`
- AND no subheading text contains the substring "finanzas"

### Requirement: Commission KPIs Are Computed in Native MN

`buildFinanceSummary` MUST compute `commissionPaidMN` as the sum of
`commissionMN` over orders in state `comision_pagada`; `commissionPendingMN`
as the sum of `commissionMN` over orders in state `verificado`,
`transportando`, or `entregado`; `commissionTotalMN` as their sum; and
`pendingPaymentCount` as the count of orders in those three pending states.
All four values MUST remain native MN (no USD conversion).

#### Scenario: Paid, pending, and total KPIs are computed correctly

- GIVEN one `comision_pagada` order with `commissionMN: 3000`, one
  `verificado` order with `commissionMN: 1000`, and one `entregado` order
  with `commissionMN: 2000`
- WHEN `buildFinanceSummary` runs
- THEN `commissionPaidMN` is `3000`
- AND `commissionPendingMN` is `1000 + 2000 = 3000`
- AND `commissionTotalMN` is `6000`
- AND `pendingPaymentCount` is `2`

#### Scenario: A `creado` order contributes to no commission KPI

- GIVEN a `creado` order with no frozen `commissionMN`
- WHEN `buildFinanceSummary` runs
- THEN that order contributes `0` to `commissionPaidMN`, `commissionPendingMN`, and `commissionTotalMN`
- AND is not counted in `pendingPaymentCount`

### Requirement: Per-State Breakdown Has Exactly Five Rows in Linear Order

`buildFinanceSummary` MUST return exactly one row per `OrderState`, in the
exhaustive linear order `creado → verificado → transportando → entregado →
comision_pagada`, even when a state has zero orders. Each row MUST carry
`count`, `revenueUSD` (sum of `totalUSD`), and `commissionMN` (sum of
`commissionMN`, treated as `0` for `creado`).

#### Scenario: All five states appear even with zero orders in some states

- GIVEN `SeedState.orders` contains orders only in `creado` and `entregado`
- WHEN `buildFinanceSummary` runs
- THEN `rows` has exactly 5 entries, one per state in the fixed linear order
- AND the `verificado`, `transportando`, and `comision_pagada` rows each show `count: 0`

#### Scenario: A row's count, revenue, and commission sum correctly

- GIVEN two `entregado` orders with `totalUSD` `100` and `150`, and
  `commissionMN` `10` and `20`
- WHEN `buildFinanceSummary` runs
- THEN the `entregado` row has `count: 2`, `revenueUSD: 250`, `commissionMN: 30`

#### Scenario: The `creado` row shows revenue but no commission

- GIVEN a `creado` order with `totalUSD: 80` and no frozen `commissionMN`
- WHEN `buildFinanceSummary` runs
- THEN the `creado` row's `revenueUSD` includes `80`
- AND the `creado` row's `commissionMN` is `0`, never `NaN` or `undefined`

### Requirement: Money Formatting for Finanzas — USD via `formatMoney`, MN as Plain Text

Every `revenueUSD` figure MUST render through `formatMoney`, matching
`^\$[\d,]+\.\d{2}$`. Every `commissionMN` figure (KPIs and table column)
MUST render as plain `{value} MN` text and MUST NOT be passed through
`formatMoney`. The `creado` row's commission cell MUST render as `0 MN` or
an empty/dash placeholder, never a USD-formatted value.

#### Scenario: Revenue figures match the formatMoney pattern

- GIVEN a rendered breakdown row
- WHEN its revenue figure is inspected
- THEN it matches the regex `^\$[\d,]+\.\d{2}$`

#### Scenario: Commission figures render as plain MN text

- GIVEN a rendered KPI card or table row showing commission
- WHEN that figure is inspected
- THEN it renders as plain `{value} MN` text, not in `formatMoney`'s USD format

### Requirement: Empty State Still Renders All Five States With Zero Values

When `SeedState.orders` is empty, the route MUST still render exactly one
`<h1>`, KPI cards showing zero for all four values, and the breakdown table
with all 5 states present and `count: 0` in every row.

#### Scenario: No orders at all yields all-zero KPIs and a full zero table

- GIVEN `SeedState.orders` is an empty array
- WHEN the app navigates to `/finanzas`
- THEN the single `<h1>` is rendered
- AND all four KPI values are `0`
- AND the breakdown table still shows all 5 states, each with `count: 0`

### Requirement: Finanzas Read-Only Screen With No Mutation Affordance

The `/finanzas` screen MUST NOT expose any control that mutates `SeedState`:
no `<form>`, no button that writes to the store, and specifically no
"marcar comisión pagada" action (that mutation lives only in
`/operador-gestores`).

#### Scenario: No form or mutating button is rendered

- GIVEN `/finanzas` is rendered with any mix of order states
- WHEN the rendered output is inspected
- THEN it contains no `<form>` element and no button wired to a store-mutating action
- AND no "marcar comisión pagada" control is present

### Requirement: No Gross Revenue-USD KPI Card

The KPI summary block MUST NOT render a grand-total "Ingresos totales USD"
card. Revenue USD MUST appear only disaggregated inside the per-state
breakdown table.

#### Scenario: KPI block contains no gross revenue card

- GIVEN the KPI summary block is rendered
- WHEN its cards are inspected
- THEN none of them represents a summed total revenue USD figure across all states

## Out of Scope (explicit non-requirements)

- Screen logic (inventory tables, rate editing, dashboards) — Tasks 6–9.
- Dashboards / chart library choice — Tasks 6/7.
- Extracting `ProductCard` or catalog into shared `packages/*` — rejected.
- GH Pages / multi-vertical build machinery — not applicable.
