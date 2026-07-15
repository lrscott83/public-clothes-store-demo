# Delta for salesops-mvp — Task 14 (Rediseño operativo de Decisiones)

Reconverts `/decisiones` from a sales/margin analytical dashboard into an
**operational cockpit**: Capa 1 (pulso inmediato — 3 cards), Capa 2 (qué
atiendo YA), Capa 3 (comportamiento en el tiempo, filtro `[7d/30d]`), plus an
Análisis section kept from the current dashboard but reduced to exactly
three blocks. Every operational read is derived from fields `SeedState`
already stores; no data-model, seed, or chart-primitive change.

## Locked constraints (do not reopen in review)

- Windows anchor to `SeedState.generatedAt`, NEVER `Date.now()` or the wall
  clock — for the new `[7d/30d]` filter, the `10-day` KPI-trend pattern being
  removed, and every other period computed by this change.
- Any MN↔USD conversion MUST use the specific order's own frozen
  `exchangeRateSnapshot.usdToMn`, never live `SeedState.exchangeRates`.
- `/decisiones` stays read-only: no `<Form>`, loader, action, or
  `useNavigate`; local view-only UI state (period filter, toggles) is
  permitted since it does not read from or write to `SeedState` beyond the
  initial load.
- The per-stage "demorado" threshold VALUES are an open design decision
  owned by `sdd-design`. This spec parameterizes every "pedido demorado"
  scenario on **"the configured per-stage threshold"** — it MUST NOT
  hardcode day numbers.
- Margin and AOV reads (top productos por margen, pedidos de menor margen,
  ticket promedio) are Finanzas-exclusive per `salesops-13` (archived
  2026-07-15) and MUST NOT reappear on `/decisiones`.
- `buildInventoryAlerts` (stock crítico) is reused unchanged — no delta
  needed for its own requirement, only for its placement inside Capa 2.

## MODIFIED Requirements

### Requirement: Decisiones Route Renders the Three-Layer Decision Dashboard

The `/decisiones` route MUST render a direct-render container (no `<Form>`,
no loader, no `useNavigate`) that loads `SeedState` via `loadSeedState` on
mount, computes every view model once via pure domain helpers, and renders,
top to bottom: **Capa 1 — Pulso inmediato** (3 cards: pedidos activos por
estado y almacén, transportistas, comisiones por pagar), **Capa 2 — Qué
atiendo YA** (stock crítico por almacén, pedidos demorados/trabados), **Capa
3 — Comportamiento en el tiempo** under a single `[7d/30d]` filter (entra vs.
sale, ciclo promedio, pedidos por día, pedidos completados por día), and an
**Análisis** section containing exactly three blocks: Ventas por almacén,
Mix por moneda, Ranking de gestores. It MUST render exactly one `<h1>` and no
other heading MUST contain the word "decisiones". No KPI header, no sales
margin figure, and no AOV/ticket-promedio figure renders anywhere on the
route.
(Previously: Layer 1 was a 4-tile KPI header, Layer 2 held 4 analytical
visuals including a fixed-20-day sales trend and a full-state distribution
chart, Layer 3 held gestor ranking + inventory alerts only.)

#### Scenario: Route renders the 3 operational layers plus Análisis

- GIVEN `SeedState` contains orders across multiple states and warehouses
- WHEN the app navigates to `/decisiones`
- THEN exactly one `<h1>` renders
- AND Capa 1 renders its 3 cards (pedidos activos por estado y almacén,
  transportistas, comisiones por pagar)
- AND Capa 2 renders stock crítico and pedidos demorados/trabados
- AND Capa 3 renders entra-vs-sale, ciclo promedio, pedidos por día, and
  pedidos completados por día, all under one `[7d/30d]` filter
- AND the Análisis section renders exactly 3 blocks: Ventas por almacén, Mix
  por moneda, Ranking de gestores

#### Scenario: No KPI header, margin, or AOV figure renders

- GIVEN `/decisiones` is fully rendered
- WHEN the rendered output is inspected
- THEN no top-of-page KPI-tile header exists
- AND no "Top productos por margen", "Pedidos de menor margen", or
  AOV/"ticket promedio" element renders anywhere on the page

#### Scenario: No other heading repeats "decisiones"

- GIVEN `/decisiones` is rendered
- WHEN all headings in the document are inspected
- THEN only the single `<h1>` matches `/decisiones/i`
- AND no nested subheading text contains the word "decisiones"

### Requirement: Data Derives Only From Seeded Data and Each Order's Own Frozen Rate Snapshot

Every figure on `/decisiones` MUST be computed from `SeedState` alone — no
invented values, no live network/API data. Any conversion between MN and USD
MUST use the specific order's own frozen `exchangeRateSnapshot.usdToMn`,
never `SeedState.exchangeRates` (the live rates). Every period-anchored
computation (the `[7d/30d]` filter, "días de atraso", "ciclo promedio", "age
in stage") MUST anchor to `SeedState.generatedAt`, never `Date.now()`. An
inventory entry or order reference whose `productId`/`transportistaId` has
no matching seed entry MUST be skipped or contribute a zero/neutral value
without throwing.
(Previously: this requirement's scenarios were scoped to margin/cost
aggregation, which no longer exists on `/decisiones` — margin and cost reads
moved to Finanzas in `salesops-13`.)

#### Scenario: A later live-rate edit does not change an already-computed figure

- GIVEN a `verificado` order with `exchangeRateSnapshot.usdToMn: 40`
- AND `SeedState.exchangeRates.usdToMn` is later edited to `45`
- WHEN any `/decisiones` computation touching that order rebuilds
- THEN it still uses `40`, not `45`

#### Scenario: Period-anchored computations use generatedAt, not the wall clock

- GIVEN `SeedState.generatedAt` is a fixed timestamp
- WHEN any `[7d/30d]`-filtered figure, "días de atraso", "ciclo promedio", or
  "pedido demorado" age is computed
- THEN the computation anchors to `SeedState.generatedAt`
- AND the result does not depend on the actual current date the test runs on

### Requirement: Ventas por Almacén Aggregates Revenue by Warehouse

Análisis's "Ventas por almacén" block MUST group qualifying orders
(`state !== 'creado'`) whose `createdAt` falls within the selected
`[7d/30d]` period (anchored to `SeedState.generatedAt`) by
`order.warehouseId`, producing one bar per `SeedState.warehouse` (in
`state.warehouses` order) with `revenueUSD` (`Σ order.totalUSD`) and
`count`. A warehouse with zero qualifying orders in the selected period MUST
still appear with `revenueUSD: 0` and `count: 0`, not be omitted. The
underlying aggregation formula is unchanged; only the qualifying order set is
now pre-filtered by the selected period before aggregation.
(Previously: no period filter — aggregated over all qualifying orders
regardless of date.)

#### Scenario: Every seeded warehouse appears, including one with zero sales in the selected period

- GIVEN `SeedState.warehouses` has 3 warehouses and, within the selected
  `7d` window, qualifying orders exist for only 2 of them
- WHEN the by-warehouse aggregation is built for `7d`
- THEN all 3 warehouses appear
- AND the warehouse with no qualifying orders in that window shows
  `revenueUSD: 0` and `count: 0`

#### Scenario: Switching the period filter changes the aggregation without touching SeedState

- GIVEN the block is showing the `7d` period
- WHEN the user switches the filter to `30d`
- THEN the rendered bars recompute over the `30d` qualifying order set
- AND `SeedState` is not read again or mutated by the switch

### Requirement: Mix por Moneda Aggregates Orders by Payment Method

Análisis's "Mix por moneda / método de pago" block MUST group qualifying
orders (`state !== 'creado'`) whose `createdAt` falls within the selected
`[7d/30d]` period (anchored to `SeedState.generatedAt`) by
`order.payment.method`, producing one bucket per distinct method present in
that period's data (at minimum USD, MN, ZELLE, EUR when present) with
`count` and `revenueUSD` (`Σ order.totalUSD`), plus each bucket's percentage
share of the total qualifying order count for that period. A
`payment.method` value that does not match any known bucket MUST be grouped
into an explicit "otros" bucket rather than thrown away or crashing the
aggregation. The underlying aggregation formula is unchanged; only the
qualifying order set is now pre-filtered by the selected period.
(Previously: no period filter — aggregated over all qualifying orders
regardless of date.)

#### Scenario: Four seeded payment methods produce four buckets with correct shares within the selected period

- GIVEN, within the selected `30d` window, 10 qualifying orders: 4 `USD`, 3
  `MN`, 2 `ZELLE`, 1 `EUR`
- WHEN the currency mix is built for `30d`
- THEN there are 4 buckets with `count` `4`, `3`, `2`, `1` respectively
- AND the `USD` bucket's share is `40%`

#### Scenario: An unrecognized payment method does not crash the aggregation

- GIVEN a qualifying order within the selected period with
  `payment.method: 'CRYPTO'` (not one of the known buckets)
- WHEN the currency mix is built
- THEN that order is counted in an "otros" bucket
- AND the aggregation does not throw

### Requirement: Ranking de Gestores Computes Sales, AOV, and Commission Earned/Pending

`buildGestorRanking` MUST produce one row per `SeedState.gestores` entry,
computed from that gestor's qualifying orders (`state !== 'creado'` AND
`order.gestorId` matches) within the order set it is given, with:
`revenueUSD` (`Σ totalUSD`), `count`, `aov` (`revenueUSD / count`, or `0`
when `count` is `0`), `commissionEarnedMN` (`Σ commissionMN` across all
qualifying orders in the set), and `commissionPendingMN` (`Σ commissionMN`
restricted to orders where `state` is `verificado`, `transportando`, or
`entregado` AND `commissionPaidAt` is not set). Rows MUST be sorted by
`revenueUSD` descending. A gestor with zero qualifying orders in the set
MUST still appear with all values at `0`, not be omitted. The aggregation
formula itself is unchanged.

Análisis's "Ranking de gestores" block on `/decisiones` MUST offer a period
selector `[7d/30d/General]` (General = unfiltered, matching prior behavior);
the caller MUST pre-filter the qualifying order set by `createdAt` falling
within the selected period (anchored to `SeedState.generatedAt`) — or pass
the full qualifying order set for General — before calling
`buildGestorRanking`. Finanzas' own invocation of `buildGestorRanking`
continues over its own unfiltered qualifying order set and is unaffected by
this change (out of scope here).
(Previously: Decisiones' gestor ranking had no period selector — always
equivalent to today's "General".)

#### Scenario: A gestor's row aggregates only their own orders within the selected period

- GIVEN, within the selected `7d` window, gestor `g1` has one `verificado`
  order with `totalUSD: 400`, `commissionMN: 800`, no `commissionPaidAt`
- AND gestor `g2` has one `comision_pagada` order with `totalUSD: 600`,
  `commissionMN: 1200` in that same window
- WHEN the gestor ranking is built for `7d`
- THEN `g1`'s row shows `revenueUSD: 400`, `count: 1`, `aov: 400`,
  `commissionEarnedMN: 800`, `commissionPendingMN: 800`
- AND `g2`'s row shows `revenueUSD: 600`, `commissionEarnedMN: 1200`,
  `commissionPendingMN: 0`

#### Scenario: General matches the unfiltered aggregation

- GIVEN a full set of qualifying orders across dates
- WHEN the gestor ranking is built with the period selector set to
  `General`
- THEN every qualifying order contributes, regardless of `createdAt`

#### Scenario: A gestor with no qualifying orders in the selected period still appears with zero values

- GIVEN a gestor in `SeedState.gestores` with no orders `createdAt` falling
  in the selected period
- WHEN the gestor ranking is built for that period
- THEN that gestor's row appears with `revenueUSD: 0`, `count: 0`, `aov: 0`,
  `commissionEarnedMN: 0`, `commissionPendingMN: 0`

### Requirement: Empty State When No Verificado-or-Later Orders Exist

When `SeedState.orders` contains no order in state `verificado` or later,
Capa 1.3 (Comisiones por pagar), Capa 3 (all 4 blocks), and the Análisis
section MUST render an empty-state message instead of fabricated zero-value
figures. Capa 1.1 (Pedidos activos por estado y almacén) is exempt from this
empty state because it counts `creado` orders too and can legitimately show
real (non-fabricated) bars. Capa 1.2 (Transportistas) and Capa 2's stock
crítico are also exempt because they derive from `SeedState.transportistas`
and `SeedState.inventory`, not from verificado-or-later orders. The route
MUST still render exactly one `<h1>` in every case.
(Previously: exemption applied only to the "Pedidos por etapa" distribution
chart, which no longer exists on `/decisiones`.)

#### Scenario: Zero verificado-or-later orders shows an empty-state message on the affected blocks

- GIVEN `SeedState.orders` contains only orders in state `creado`
- WHEN the app navigates to `/decisiones`
- THEN the single `<h1>` is still rendered
- AND Capa 1.1 (pedidos activos por estado y almacén) still renders real
  `creado`-order bars, not an empty-state message
- AND Capa 1.3, Capa 3, and the Análisis section each render an empty-state
  message instead of fabricated figures

## REMOVED Requirements

### Requirement: KPI Header Has Exactly Four Tiles (Decisiones)

(Reason: the operational redesign has no top-of-page KPI header. Ventas,
Pedidos, and Comisión pendiente figures are redistributed across Capa 1 and
Capa 3; Margen no longer appears on `/decisiones` at all — it is
Finanzas-exclusive per `salesops-13`.)

### Requirement: KPI Formulas (Decisiones)

(Reason: superseded together with the KPI header. "Comisión pendiente (MN)"
survives as the total figure inside the new Capa 1.3 "Comisiones por pagar"
card, redefined in that card's own ADDED requirement below; "Margen (USD/%)"
does not survive on `/decisiones` at all.)

### Requirement: Every KPI Tile Shows a 10-Day vs Prior-10-Day Trend

(Reason: this fixed-10-day dual-window trend pattern applied only to the
now-removed KPI header. Capa 3's `[7d/30d]` filter with its own
period-vs-prior-period deltas replaces this mechanism; Finanzas' own
identically-named 10-day trend requirement, suffixed `(Finanzas)`, is
untouched.)

### Requirement: Sales Trend Visual Spans the Last 20 Days With a Cantidad/Valor Toggle

(Reason: superseded by the new Capa 3 "Pedidos por día" block, which offers
the same cantidad/valor toggle but over the selected `[7d/30d]` window
instead of a fixed 20-day window, anchored to `generatedAt`.)

### Requirement: Pedidos por Etapa Is a Distribution Snapshot, Not a Conversion Funnel

(Reason: superseded by the new Capa 1.1 "Pedidos activos por estado y
almacén" card, which restricts to the 3 non-completed states, splits by
warehouse with fixed colors, and excludes `entregado`/`comision_pagada`
instead of showing all 5 states as an undifferentiated snapshot.)

## ADDED Requirements

### Requirement: Capa 1.1 — Pedidos Activos por Estado y Almacén

Capa 1's first card MUST render a bar chart over exactly the **3
non-completed states** — `creado`, `verificado`, `transportando`, in that
order — excluding `entregado` and `comision_pagada`. For each state it MUST
show the count of orders per warehouse, using a **fixed color per
warehouse** independent of data values or ordering: Pinar = verde,
Consolación = azul, Herradura = amarillo. A `(state, warehouse)` pair with
zero orders MUST still appear at `0`, not be omitted.

#### Scenario: Only the 3 non-completed states appear

- GIVEN `SeedState.orders` includes orders in all 5 states
- WHEN Capa 1.1 builds
- THEN exactly 3 states appear — `creado`, `verificado`, `transportando` —
  in that order
- AND no `entregado` or `comision_pagada` bar renders

#### Scenario: Warehouse colors are fixed regardless of data

- GIVEN any distribution of order counts across the 3 warehouses
- WHEN Capa 1.1 renders
- THEN Pinar's bars are always the "verde" color, Consolación's always
  "azul", Herradura's always "amarillo"

#### Scenario: A zero-count state/warehouse pair still appears

- GIVEN warehouse Herradura has zero orders in state `transportando`
- WHEN Capa 1.1 builds
- THEN the `(transportando, Herradura)` pair appears with count `0`, not
  omitted

### Requirement: Capa 1.2 — Transportista Capacity and "Sin Chofer"

Capa 1's second card MUST classify every `SeedState.transportista` as
**ocupado** (has at least one order with `transportistaId` matching AND
`state === 'transportando'`) or **disponible** (otherwise). It MUST also
compute a separate **"Sin chofer"** count: the number of orders in state
`verificado` whose `transportistaId` is unset. "Sin chofer" is a count of
orders, not transportistas, and is reported independently of the
ocupado/disponible split.

#### Scenario: A transportista with an active transportando order is ocupado

- GIVEN a transportista assigned via `transportistaId` to an order in state
  `transportando`
- WHEN Capa 1.2 builds
- THEN that transportista is classified `ocupado`

#### Scenario: A transportista with no transportando order is disponible

- GIVEN a transportista with zero orders in state `transportando`
- WHEN Capa 1.2 builds
- THEN that transportista is classified `disponible`

#### Scenario: Sin chofer counts unassigned verificado orders

- GIVEN 2 orders in state `verificado` with no `transportistaId` set, and 1
  order in state `verificado` with a `transportistaId` set
- WHEN Capa 1.2 builds
- THEN "Sin chofer" is `2`

### Requirement: Capa 1.3 — Comisiones por Pagar (Total y Más Atrasadas)

Capa 1's third card MUST compute a total pending commission figure as
`Σ order.commissionMN` over orders where `state` is `verificado`,
`transportando`, or `entregado` AND `commissionPaidAt` is not set. It MUST
also render a "más atrasadas" list with **at most one row per gestor**
(no repeats): each row's **días de atraso** is the number of days between
that gestor's most-overdue unpaid `entregado` order's `deliveredAt` and
`SeedState.generatedAt` (never `Date.now()`); the row's **valor de esa
comisión** is that specific order's `commissionMN`; the row's **total
pendiente del gestor** is `Σ commissionMN` over that gestor's own orders in
`verificado`/`transportando`/`entregado` with no `commissionPaidAt`. Only
`entregado` orders with no `commissionPaidAt` count toward "días de atraso"
(commission becomes payable on delivery). A gestor with zero overdue
unpaid-`entregado` orders MUST NOT appear in the "más atrasadas" list. Rows
MUST be sorted by días de atraso descending.

#### Scenario: Total pending sums MN across pending states, excluding paid and creado

- GIVEN one `verificado` order with `commissionMN: 1000` and no
  `commissionPaidAt`, one `entregado` order with `commissionMN: 2000` and no
  `commissionPaidAt`, and one `comision_pagada` order with `commissionMN:
  3000`
- WHEN the total pending figure is computed
- THEN it is `1000 + 2000 = 3000` (the paid order is excluded)

#### Scenario: Días de atraso is measured from deliveredAt, anchored to generatedAt

- GIVEN an `entregado` order with `deliveredAt` 9 days before
  `SeedState.generatedAt` and no `commissionPaidAt`
- WHEN the días de atraso for that gestor's row is computed
- THEN it is `9`
- AND the computation does not depend on the actual current date the test
  runs on

#### Scenario: A gestor appears at most once, representing their most overdue order

- GIVEN gestor `g1` has two unpaid `entregado` orders with `deliveredAt` 3
  and 9 days before `generatedAt` respectively
- WHEN the "más atrasadas" list builds
- THEN exactly one row for `g1` appears, using the 9-day order's data

#### Scenario: A gestor with no overdue unpaid entregado orders is excluded from the list

- GIVEN a gestor whose only pending-commission orders are in state
  `verificado` or `transportando` (not yet `entregado`)
- WHEN the "más atrasadas" list builds
- THEN that gestor does not appear in the list

### Requirement: Capa 2 — Pedidos Demorados / Trabados

Capa 2 MUST flag an order as **demorado** when it is in one of the 3
non-completed states (`creado`, `verificado`, `transportando`) and its age
in that current stage — measured from the timestamp it entered that stage
(`createdAt` for `creado`, `verificado`Time for `verificado`,
`transportingAt` for `transportando`) to `SeedState.generatedAt` — exceeds
**the configured per-stage threshold** for that stage. `entregado` and
`comision_pagada` orders MUST NOT be evaluated for this flag. The threshold
values themselves are defined by `sdd-design`, not by this requirement.

#### Scenario: An order older than its stage's configured threshold is flagged demorado

- GIVEN an order in state `verificado` whose age since `verifiedAt` exceeds
  the configured threshold for the `verificado` stage
- WHEN Capa 2's demorado check runs
- THEN that order is flagged as demorado

#### Scenario: An order within its stage's configured threshold is not flagged

- GIVEN an order in state `transportando` whose age since `transportingAt`
  is below the configured threshold for the `transportando` stage
- WHEN Capa 2's demorado check runs
- THEN that order is not flagged as demorado

#### Scenario: Completed orders are never evaluated

- GIVEN an order in state `entregado` or `comision_pagada`, however old
- WHEN Capa 2's demorado check runs
- THEN that order is never flagged as demorado

#### Scenario: Age anchors to generatedAt, not the wall clock

- GIVEN `SeedState.generatedAt` is a fixed timestamp
- WHEN any order's stage age is computed for the demorado check
- THEN the computation uses `SeedState.generatedAt`
- AND the result does not depend on the actual current date the test runs on

### Requirement: Capa 3 — `[7d/30d]` Period Filter Anchored to generatedAt

Capa 3 MUST expose a single period selector, `[7d/30d]`, shared across all 4
of its blocks (entra-vs-sale, ciclo promedio, pedidos por día, pedidos
completados por día). Each period window is `(generatedAt − N days,
generatedAt]` where `N` is `7` or `30`, using `SeedState.generatedAt` —
never `Date.now()`. Switching the selector MUST recompute all 4 Capa 3
blocks together, without re-reading or mutating `SeedState`.

#### Scenario: Switching the filter recomputes all 4 blocks together

- GIVEN Capa 3 is showing the `7d` period
- WHEN the user switches the filter to `30d`
- THEN entra-vs-sale, ciclo promedio, pedidos por día, and pedidos
  completados por día all recompute over the `30d` window
- AND `SeedState` is not read again or mutated by the switch

#### Scenario: The window anchors to generatedAt

- GIVEN `SeedState.generatedAt` is a fixed timestamp
- WHEN the `7d` window is computed
- THEN it is `(generatedAt − 7 days, generatedAt]`
- AND the result does not depend on the actual current date the test runs on

### Requirement: Capa 3 — Entra vs. Sale (Período)

Within the selected `[7d/30d]` period, this block MUST show **creados** —
count of orders whose `createdAt` falls in the window — and **entregados** —
count of orders whose `deliveredAt` falls in the window. When creados
exceeds entregados, the block MUST surface a backlog signal (más entra de lo
que sale).

#### Scenario: Creados and entregados are counted independently within the window

- GIVEN, within the selected `7d` window, 5 orders have `createdAt` in the
  window and 3 orders have `deliveredAt` in the window
- WHEN the block builds
- THEN creados is `5` and entregados is `3`

#### Scenario: A backlog signal appears when creados exceeds entregados

- GIVEN creados is `5` and entregados is `3` in the selected period
- WHEN the block renders
- THEN a backlog indicator is shown

### Requirement: Capa 3 — Ciclo Promedio (Creado → Entregado)

Within the selected `[7d/30d]` period, this block MUST compute the average
number of days between `createdAt` and `deliveredAt` across orders whose
`deliveredAt` falls in the window, and MUST show a delta against the same
average computed over the immediately preceding period of equal length
(also anchored to `generatedAt`). Orders with no `deliveredAt` MUST NOT
contribute to either window's average. When the prior window has zero
qualifying orders, the delta MUST be a safe "flat"/neutral indicator, never
`NaN` or `Infinity`.

#### Scenario: Average cycle only includes orders delivered within the window

- GIVEN, within the selected `7d` window, 2 orders delivered with cycle
  times `3` and `5` days, and 1 order in state `transportando` (no
  `deliveredAt`)
- WHEN the block builds
- THEN the average is `(3 + 5) / 2 = 4`
- AND the `transportando` order does not contribute

#### Scenario: Zero orders delivered in the prior window yields a safe delta

- GIVEN the prior period has zero orders with `deliveredAt` in that window
- WHEN the delta is computed
- THEN the indicator is a safe "flat"/neutral value, never `NaN` or
  `Infinity`

### Requirement: Capa 3 — Pedidos por Día With a Nº/Valor Toggle

Within the selected `[7d/30d]` period, this block MUST produce one data
point per calendar day (including days with zero orders, at value `0`),
grouping orders by `createdAt`. It MUST support toggling between two series
without re-fetching or mutating `SeedState`: "Nº pedidos" (count of orders
created that day) and "Valor de venta" (`Σ order.totalUSD` for orders
created that day). It MUST also show the average per day for the period and
a `Δ%` versus the same average in the immediately preceding period of equal
length, guarded against divide-by-zero (prior average `0` with current `> 0`
MUST show "up", never `Infinity`).

#### Scenario: A day with zero orders still appears as a zero point

- GIVEN the selected `7d` window contains one day with no orders created
- WHEN the series builds
- THEN that day appears in the series with value `0`, not omitted

#### Scenario: Toggling between Nº and Valor changes the series without touching SeedState

- GIVEN the block is showing "Valor de venta"
- WHEN the user toggles to "Nº pedidos"
- THEN the rendered series switches to per-day order counts
- AND `SeedState` is not read again or mutated by the toggle

#### Scenario: Zero prior-period average yields a safe "up" delta

- GIVEN the prior period's average per day is `0` and the current period's
  is `> 0`
- WHEN `Δ%` is computed
- THEN the indicator is "up", never `Infinity` or `NaN`

### Requirement: Capa 3 — Pedidos Completados por Día With Tasa de Completado

Within the selected `[7d/30d]` period, this block MUST produce one data
point per calendar day (including days with zero completions, at value
`0`), grouping orders by `deliveredAt`, with the same Nº/Valor toggle
semantics as "Pedidos por día" (Nº = count of orders delivered that day,
Valor = `Σ order.totalUSD` for orders delivered that day). It MUST also show
**tasa de completado** = entregados en el período (count of orders with
`deliveredAt` in the window) divided by total del período (count of orders
with `createdAt` in the window, same denominator as "entra vs. sale"),
guarded to `0` (never `NaN`/`Infinity`) when the denominator is `0`.

#### Scenario: A day with zero completions still appears as a zero point

- GIVEN the selected `30d` window contains one day with no orders delivered
- WHEN the series builds
- THEN that day appears in the series with value `0`, not omitted

#### Scenario: Tasa de completado divides entregados by total del período

- GIVEN, within the selected period, `8` orders were created and `6` were
  delivered
- WHEN tasa de completado is computed
- THEN it is `6 / 8 = 75%`

#### Scenario: Zero orders created in the period yields a safe tasa de completado

- GIVEN zero orders have `createdAt` in the selected period
- WHEN tasa de completado is computed
- THEN it is `0`, never `NaN` or `Infinity`

### Requirement: No Margin or AOV Block Renders on Decisiones

`/decisiones` MUST NOT render "Top productos por margen", "Pedidos de menor
margen", or any AOV/"ticket promedio" tile or block, in any layer or in the
Análisis section. These reads are Finanzas-exclusive per `salesops-13`
(archived 2026-07-15).

#### Scenario: No banned block renders anywhere on the page

- GIVEN `/decisiones` is fully rendered with any mix of order states
- WHEN the rendered output is inspected for block/tile titles
- THEN none of "Top productos por margen", "Pedidos de menor margen", or an
  AOV/"ticket promedio" figure is present

## Out of Scope

- `/finanzas` — untouched; its own `buildGestorRanking`,
  `buildWarehouseSales`-equivalent, and margin/AOV blocks are unaffected by
  this change.
- Per-stage "demorado" threshold VALUES — owned by `sdd-design`.
- Data model, seed generator, or chart-primitive shape changes — none.
- `buildInventoryAlerts` itself — reused unchanged; only its placement moves
  into Capa 2.
- `buildStageDistribution`/the removed "Pedidos por etapa" snapshot — no
  replacement requirement carries its exact 5-state shape forward; Capa 1.1
  is a different (3-state, warehouse-split) computation, not a rename.
