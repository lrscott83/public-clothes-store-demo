# Delta for salesops-mvp — Task 10 (Pantalla 6: Dashboard de Decisiones)

Replaces the single profitability-ranking screen with a 3-layer visual
dashboard. `buildProfitabilityRanking` is reused unchanged (Layer 3's
lowest-margin block consumes its existing output); every other requirement
below is new aggregation/display behavior layered on top of it.

## Locked constraints (do not reopen in review)

- No sales target / meta — no gauge, no vs-objective semáforo, anywhere on the screen.
- Transport cost is out of scope (belongs to Finanzas).
- "Pedidos de menor margen", never "pedidos con pérdida" — cost is fixed at 60%, so `marginUSD` is never negative in seeded data.
- ZELLE and EUR are already-seeded payment methods; no seed/data-model change in this scope.
- Read-only screen: no `<Form>`, loader, action, or `useNavigate`.

## MODIFIED Requirements

### Requirement: Decisiones Route Renders the Three-Layer Decision Dashboard

The `/decisiones` route MUST render a direct-render container (no `<Form>`,
no loader, no `useNavigate`) that loads `SeedState` via `loadSeedState` on
mount, computes every view model once via pure domain helpers, and renders,
top to bottom: Layer 1 (5 KPI tiles), Layer 2 (4 visuals), Layer 3 (3
actionable blocks). It MUST render exactly one `<h1>` and no other heading
MUST contain the word "decisiones".

#### Scenario: Route renders all three layers when qualifying orders exist

- GIVEN `SeedState` contains at least one order in state `verificado` or later
- WHEN the app navigates to `/decisiones`
- THEN exactly one `<h1>` is rendered
- AND the 5 KPI tiles of Layer 1 are rendered
- AND the 4 visuals of Layer 2 are rendered
- AND the 3 actionable blocks of Layer 3 are rendered

#### Scenario: No other heading repeats "decisiones"

- GIVEN `/decisiones` is rendered
- WHEN all headings in the document are inspected
- THEN only the single `<h1>` matches `/decisiones/i`
- AND no nested subheading text contains the word "decisiones"

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

## ADDED Requirements

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
