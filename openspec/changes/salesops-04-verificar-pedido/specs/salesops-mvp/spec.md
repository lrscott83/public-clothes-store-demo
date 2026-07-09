# Delta for salesops-mvp — Task 4 (Pantalla 2: Operador de gestores verifica pedidos)

## ADDED Requirements

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
