# Delta for salesops-mvp — Task 13 (Mover margen/AOV de Decisiones a Finanzas)

Moves three profitability reads from `/decisiones` to `/finanzas`: top
productos por margen, pedidos de menor margen, and AOV. `domain/decisiones.ts`
(`buildProfitabilityRanking`) is deleted; Finanzas recomputes every datum via
its own private helpers (never importing from Decisiones).

## Locked constraints (do not reopen in review)

- Finanzas MUST NOT import `domain/decisiones.ts` or any
  `components/decisiones/*` symbol — every recomputed datum uses Finanzas'
  own private per-order helpers.
- MN↔USD conversion MUST use each order's own frozen
  `exchangeRateSnapshot.usdToMn`, never live `state.exchangeRates`.
- An order item whose `productId` has no matching `SeedState.products` entry
  MUST contribute `0` without throwing.
- Read-only: no `<Form>`, loader, action, or `useNavigate`.

## MODIFIED Requirements

### Requirement: Layer 1 KPI Header Has Exactly Five Tiles With Period Trend

Layer 1 MUST render five tiles, each computed for the current 10-day window
vs the prior 10-day window (anchored to `SeedState.generatedAt`, never the
wall clock) with a trend indicator:

| Tile | Formula |
|---|---|
| Ingresos facturados (USD) | `Σ totalUSD`, qualifying |
| Ingresos liquidados (MN) | `Σ totalMN`, qualifying |
| Comisión pendiente (MN) | `buildFinanceSummary.kpis.commissionPendingMN` |
| Margen neto (USD) + % | `totalUSD − costoUSD − comisiónUSD`, aggregated |
| Ticket promedio (AOV, USD) | `ingresosFacturadosUSD / pedidosCount`, `0` when `pedidosCount` is `0` |

A `0`-prior / `>0`-current window MUST trend "up" (never `Infinity`). AOV
lands last, after Margen neto.
(Previously: four tiles, no AOV tile.)

#### Scenario: Five tiles render with a safe trend

- GIVEN qualifying orders in both windows, one tile with prior `0` /
  current `> 0`
- WHEN Layer 1 computes
- THEN all 5 tiles render in order, and that tile shows "up", never
  `Infinity`

#### Scenario: AOV is guarded against zero orders

- GIVEN a window with zero qualifying orders
- WHEN the AOV tile computes for that window
- THEN its value is `0`, never `NaN` or `Infinity`

### Requirement: Layer 3 Renders Five Actionable Finance Blocks

| Block | Field(s) |
|---|---|
| Comisión y ROI por gestor | `buildGestorRanking`; derived pagada = earned − pending; take-rate = commission ÷ revenue |
| Ventas por almacén | `Σ totalUSD` by `warehouseId`, qualifying, no split |
| Flujo por estado | existing `StateBreakdownTable`, unchanged |
| Top productos por margen | `Σ (item.quantity × (item.priceUSD − product.costUSD))` per product, qualifying orders only, sorted margin descending; a product with no qualifying sales does not appear |
| Pedidos de menor margen | per-order `totalUSD − orderCostUSD − orderCommissionUSD`, sorted ascending by `marginUSD` with tie-break `a.orderId.localeCompare(b.orderId)` |

A gestor/warehouse with zero qualifying orders MUST still appear at `0`, not
be omitted.
(Previously: three blocks — gestor, warehouse, flujo por estado only.)

#### Scenario: Zero-order gestor and warehouse still appear

- GIVEN a gestor and a warehouse with no qualifying orders
- WHEN Layer 3 computes
- THEN both appear with all values at `0`

#### Scenario: Top productos por margen sorts descending and skips orphan references

- GIVEN product `p1` (`costUSD: 10`) appears in a qualifying order line with
  `quantity: 2`, `priceUSD: 25`, and another line references a `productId`
  with no matching product
- WHEN the product-margin block builds
- THEN `p1`'s aggregate margin is `2 × (25 − 10) = 30`
- AND the orphan line contributes `0` without throwing

#### Scenario: Pedidos de menor margen sorts ascending with a deterministic tie-break

- GIVEN two qualifying orders with equal `marginUSD` and `orderId` values
  `"b-order"` and `"a-order"`
- WHEN the low-margin-orders block builds
- THEN `"a-order"` appears before `"b-order"`

#### Scenario: Product margin and order margin use each order's frozen rate

- GIVEN a qualifying order with `exchangeRateSnapshot.usdToMn: 40` and
  `state.exchangeRates.usdToMn` later edited to `45`
- WHEN the product-margin or low-margin-orders block rebuilds
- THEN the order's contribution still uses `40`, not `45`

### Requirement: Decisiones Route Renders the Three-Layer Decision Dashboard

The `/decisiones` route MUST render a direct-render container (no `<Form>`,
no loader, no `useNavigate`) that loads `SeedState` via `loadSeedState` on
mount, computes every view model once via pure domain helpers, and renders,
top to bottom: Layer 1 (4 KPI tiles), Layer 2 (4 visuals), Layer 3 (3
actionable blocks: gestor ranking, inventory alerts, stage distribution is
Layer 2). It MUST render exactly one `<h1>` and no other heading MUST
contain the word "decisiones".
(Previously: Layer 3 had 4 actionable blocks including top-products-by-margin
and lowest-margin orders.)

#### Scenario: Route renders remaining layers when qualifying orders exist

- GIVEN `SeedState` contains at least one order in state `verificado` or
  later
- WHEN the app navigates to `/decisiones`
- THEN exactly one `<h1>` is rendered
- AND the 4 KPI tiles of Layer 1 are rendered
- AND the 4 visuals of Layer 2 are rendered
- AND Layer 3 renders gestor ranking and inventory alerts, with no
  top-productos-por-margen or pedidos-de-menor-margen block

#### Scenario: No other heading repeats "decisiones"

- GIVEN `/decisiones` is rendered
- WHEN all headings in the document are inspected
- THEN only the single `<h1>` matches `/decisiones/i`
- AND no nested subheading text contains the word "decisiones"

### Requirement: KPI Header Has Exactly Four Tiles

Layer 1 MUST render exactly four KPI tiles, in this order: Ventas (USD),
Margen (USD + %), Pedidos (count), Comisión pendiente (MN). Each tile's
underlying value MUST be computed only from orders with `state !== 'creado'`,
except "Comisión pendiente (MN)", which uses the pending/paid/in-transit
state groupings defined below.
(Previously: third tile was "Pedidos + ticket promedio (AOV)"; AOV moves to
Finanzas.)

#### Scenario: Four tiles render in the fixed order

- GIVEN `SeedState` contains qualifying orders
- WHEN `/decisiones` is rendered
- THEN the KPI header shows exactly 4 tiles in the order: Ventas, Margen,
  Pedidos, Comisión pendiente
- AND no AOV/"ticket promedio" figure renders in the KPI header

### Requirement: KPI Formulas

Each KPI tile's value, computed over a given order set, MUST use:

| KPI | Formula |
|-----|---------|
| Ventas (USD) | `Σ order.totalUSD` |
| Margen (USD) | `Σ (order.totalUSD − orderCostUSD − orderCommissionUSD)`, using the same per-order cost/commission formula previously exposed by `buildProfitabilityRanking` |
| Margen (%) | `marginUSD / revenueUSD × 100`, or `0` when `revenueUSD` is `0` |
| Pedidos | `count` of qualifying orders |
| Comisión pendiente (MN) | `Σ order.commissionMN` over orders where `state` is `verificado`, `transportando`, or `entregado` AND `commissionPaidAt` is not set (same "pending" definition as `buildFinanceSummary`) |

(Previously: table included a "Ticket promedio (AOV)" row; removed — AOV is
now Finanzas-only.)

#### Scenario: Margin and Pedidos are computed from revenue, cost, and commission

- GIVEN two qualifying orders: one with `totalUSD: 500`, `commissionMN:
  3000`, `exchangeRateSnapshot.usdToMn: 40`, item cost `200`; another with
  `totalUSD: 300`, `commissionMN: 1000`, `exchangeRateSnapshot.usdToMn: 40`,
  item cost `100`
- WHEN the KPI values are computed
- THEN `Ventas (USD)` is `800`
- AND `Margen (USD)` is `(500 − 200 − 75) + (300 − 100 − 25) = 225 + 175 =
  400`
- AND `Pedidos` is `2`

#### Scenario: Comisión pendiente excludes paid and creado orders

- GIVEN one `verificado` order with `commissionMN: 1000` and no
  `commissionPaidAt`, one `entregado` order with `commissionMN: 2000` and no
  `commissionPaidAt`, and one `comision_pagada` order with `commissionMN:
  3000`
- WHEN `Comisión pendiente (MN)` is computed
- THEN it is `1000 + 2000 = 3000` (the paid order is excluded)

## REMOVED Requirements

### Requirement: Top Productos por Margen Ranks by Aggregate Margin, Not Revenue

(Reason: moved to Finanzas Layer 3 as "Top productos por margen"; Decisiones
no longer computes or renders it. `buildTopMarginProducts`/`TopMarginRow`/
`TopMarginView` are removed from `domain/decisiones-dashboard.ts`.)

### Requirement: Layer 3 Lowest-Margin Orders Block Reuses buildProfitabilityRanking, Ascending, Without a "Loss" Label

(Reason: moved to Finanzas Layer 3 as "Pedidos de menor margen", recomputed
by Finanzas' own private helper instead of reusing
`buildProfitabilityRanking`. `domain/decisiones.ts` (`buildProfitabilityRanking`,
`ProfitabilityRow`, `ProfitabilityView`) and its test file are deleted; the
`lowestMargin`/`topMargin` `DashboardView` fields are removed.)

## ADDED Requirements

### Requirement: Finance-Owned Product Margin and Order Margin Builders

Finanzas MUST expose its own private builders for product margin and
low-margin orders, each independently exported for unit testing, reusing
Finanzas' existing private per-order `orderCostUSD`/`orderCommissionUSD`/
`orderMarginUSD` helpers rather than importing `buildProfitabilityRanking`.
`OrderMarginRow` MUST NOT include `marginPercent` or `isLoss` fields (both
unused at the leaf render).

#### Scenario: Product margin builder sorts descending by aggregate margin

- GIVEN qualifying order lines for two products with aggregate margins `50`
  and `120`
- WHEN `ProductMarginView` builds
- THEN the product with margin `120` appears before the one with margin `50`

#### Scenario: Order margin builder omits marginPercent and isLoss

- GIVEN a qualifying order used to build an `OrderMarginRow`
- WHEN the row is inspected
- THEN it has no `marginPercent` or `isLoss` property

### Requirement: Finanzas Help Copy Covers Product Margin, Low-Margin Orders, and AOV

`FINANZAS_HELP` MUST include an entry for each of: "Top productos por
margen", "Pedidos de menor margen", and "Ticket promedio (AOV)". Every entry
MUST use voseo, MUST use "dinero" (never "plata"), MUST NOT use
Gross/Net/Fees/refunds vocabulary, and MUST NOT frame any figure as "por
cobrar".

#### Scenario: New help entries avoid banned vocabulary

- GIVEN the three new `FINANZAS_HELP` entries
- WHEN their text is inspected
- THEN none contains "Gross", "Net", "Fees", "refund", "plata", or "por
  cobrar"

## Out of Scope

- `GestorRankingRow.aovUSD` (a different per-gestor field) — untouched.
- `buildFinanceSummary`, period-trend, currency-mix, gestor-ranking, and
  chart-primitive shapes — consumed unchanged.
- Data model or seed generator changes.
- Reopening any `salesops-mvp` Task 10/11 locked decision.
