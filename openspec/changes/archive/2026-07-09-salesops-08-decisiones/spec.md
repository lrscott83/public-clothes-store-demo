# Delta for salesops-mvp — Task 8 (Pantalla 6: Decisiones)

## ADDED Requirements

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
