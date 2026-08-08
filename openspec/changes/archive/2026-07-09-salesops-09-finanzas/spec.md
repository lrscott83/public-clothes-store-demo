# Delta for salesops-mvp — Task 9 (Pantalla 7: Finanzas)

## ADDED Requirements

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

### Requirement: Money Formatting — USD via `formatMoney`, MN as Plain Text

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

### Requirement: Read-Only Screen With No Mutation Affordance

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
