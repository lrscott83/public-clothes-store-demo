# Delta for salesops-mvp — Reverse "Cobrado vs Pendiente" to Real Revenue

Reverses salesops-11 Decision 4. Every sale is fully collected; there is no
customer receivable. Removes the `COBRADO_STATES`/`PENDIENTE_STATES` split
from `/decisiones` and `/finanzas`. Both KPI headers drop their "Cobrado vs
pendiente" tile with NO replacement (five tiles → four, symmetrically in
both dashboards). The finanzas trend chart and warehouse table are
repurposed to plain revenue (no split/toggle). Commission-as-owner's-
payable-to-gestor is unchanged.

## MODIFIED Requirements

### Requirement: KPI Header Has Exactly Four Tiles

Layer 1 (`/decisiones`) MUST render exactly four tiles, in order: Ventas
(USD), Margen (USD + %), Pedidos + ticket promedio (AOV), Comisión
pendiente (MN). Values computed only from orders with `state !== 'creado'`,
except "Comisión pendiente" (unchanged pending/paid grouping). The removed
"Cobrado vs pendiente" tile is dropped with NO replacement — the header
layout MUST reflect four tiles, with no reserved or placeholder slot for a
fifth.
(Previously: five tiles, the fifth being "Cobrado vs pendiente", a client-collection split.)

#### Scenario: Four tiles render, none framed as receivable

- GIVEN `SeedState` contains qualifying orders
- WHEN `/decisiones` renders
- THEN exactly 4 tiles show, none named/framed "cobrado" or "pendiente", and no fifth/placeholder tile is present

### Requirement: KPI Formulas

| KPI | Formula |
|-----|---------|
| Ventas (USD) | `Σ order.totalUSD` |
| Margen (USD) | `Σ (totalUSD − orderCostUSD − orderCommissionUSD)` |
| Margen (%) | `marginUSD / revenueUSD × 100`, or `0` if `revenueUSD` is `0` |
| Pedidos | `count` of qualifying orders |
| Ticket promedio (AOV) | `revenueUSD / count`, or `0` if `count` is `0` |
| Comisión pendiente (MN) | `Σ commissionMN` where `state ∈ {verificado, transportando, entregado}` AND unpaid |

(Previously: table had an extra `Cobrado`/`Pendiente en tránsito` state-split row pair, removed with no replacement.)

#### Scenario: Margin/AOV derive from revenue, cost, commission

- GIVEN two qualifying orders totaling `totalUSD 800`, cost `300`, commission (MN, rate 40) equivalent `100`
- WHEN KPIs compute
- THEN `Ventas` is `800`, `Margen` is `400`, `Pedidos` is `2`, `AOV` is `400`

#### Scenario: Comisión pendiente excludes paid and creado orders

- GIVEN unpaid `verificado`/`entregado` orders totaling `commissionMN 3000` and a paid `comision_pagada` order `commissionMN 3000`
- WHEN computed
- THEN `Comisión pendiente` is `3000` (paid order excluded)

### Requirement: Layer 1 KPI Header Has Exactly Four Tiles With Period Trend

Layer 1 (`/finanzas`) MUST render four tiles, each with a 10-day vs
prior-10-day trend:

| Tile | Formula |
|---|---|
| Ingresos facturados (USD) | `Σ totalUSD`, qualifying |
| Ingresos liquidados (MN) | `Σ totalMN`, qualifying |
| Comisión pendiente (MN) | `buildFinanceSummary.kpis.commissionPendingMN` |
| Margen neto (USD) + % | `totalUSD − costoUSD − comisiónUSD`, aggregated |

`0`-prior/`>0`-current MUST trend "up" (never `Infinity`). The removed
"Cobrado vs pendiente (USD)" tile is dropped with NO replacement — the
header layout MUST reflect four tiles, with no reserved or placeholder
slot for a fifth.
(Previously: five tiles, tile 3 being "Cobrado vs pendiente (USD)", a client-collection split.)

#### Scenario: Four tiles render, none implying a receivable

- GIVEN qualifying orders in both windows, one tile prior `0` / current `>0`
- WHEN Layer 1 computes
- THEN all 4 tiles render in order, that tile shows "up" not `Infinity`, no tile implies money owed by a customer, and no fifth/placeholder tile is present

### Requirement: Layer 2 Renders Four Financial Visuals

| Visual | Field(s) |
|---|---|
| Tendencia de ventas (20d, single series) | `totalUSD` by day, qualifying, no split/toggle |
| Comisión pagada vs pendiente (dona) | `commissionPaidMN` / `commissionPendingMN` |
| Ingresos por estado (barras) | `FinanceStateRow.revenueUSD` per state |
| Mix por moneda (dona) | `buildCurrencyExposure` revenue+percent per `payment.method` |

Every day in the 20-day window MUST appear, including `0`-value days.
(Previously: visual 1 was "Tendencia de cobros" with a cobrado/pendiente toggle.)

#### Scenario: A zero-activity day still appears

- GIVEN one day in the window has no qualifying orders
- WHEN the trend builds
- THEN that day appears at `0`, not omitted

#### Scenario: Trend has no toggle and implies no pending collection

- GIVEN the revenue trend renders
- WHEN inspected
- THEN it shows one series only, no cobrado/pendiente control or label

### Requirement: Layer 3 Renders Three Actionable Finance Blocks

| Block | Field(s) |
|---|---|
| Comisión y ROI por gestor | `buildGestorRanking`; pagada = earned − pending; take-rate = commission ÷ revenue |
| Ventas por almacén | `Σ totalUSD` by `warehouseId`, qualifying, no split |
| Flujo por estado | existing `StateBreakdownTable`, unchanged |

A gestor/warehouse with zero qualifying orders MUST still appear at `0`.
(Previously: block 2 was "Cobros pendientes por almacén", a cobrado/pendiente split.)

#### Scenario: Zero-order gestor and warehouse still appear

- GIVEN a gestor and a warehouse with no qualifying orders
- WHEN Layer 3 computes
- THEN both appear with all values at `0`

### Requirement: Finanzas Read-Only Screen With No Mutation Affordance

`/finanzas` MUST expose no control mutating `SeedState`: no `<form>`, no
store-mutating button, no "marcar comisión pagada" action.
(Previously: permitted "a local view-only toggle (e.g. cash-flow cobrado/pendiente)" — removed, the trend no longer toggles.)

#### Scenario: No form or mutating button renders

- GIVEN `/finanzas` renders with any mix of order states
- WHEN inspected
- THEN no `<form>` and no store-mutating button exist

## ADDED Requirements

### Requirement: No Customer-Receivable Framing Anywhere In The App

The system MUST NOT present any figure, chart, table, or copy implying a
customer owes money or that revenue is partially uncollected. Every sale
MUST be treated as fully collected. The only liability the app MAY present
is the owner's commission payable to gestores (existing requirements,
unchanged).

#### Scenario: No screen renders receivable language

- GIVEN `/finanzas` and `/decisiones` render, plus their help copy
- WHEN all visible text is inspected
- THEN no string implies "por cobrar", "falta cobrar", or a customer-owed amount

#### Scenario: Commission liability still frames the owner as debtor

- GIVEN `/finanzas` renders the commission KPI/donut and help copy
- WHEN inspected
- THEN copy frames commission as what the owner still owes gestores, never as money owed to the owner
