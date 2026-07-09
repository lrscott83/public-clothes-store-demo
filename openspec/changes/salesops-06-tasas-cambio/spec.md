# Delta for salesops-mvp — Task 6 (Pantalla 4: Tasas de cambio)

## ADDED Requirements

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
