# Delta for salesops-mvp — Task 5 (Pantalla 3: Operador de almacén)

## ADDED Requirements

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
