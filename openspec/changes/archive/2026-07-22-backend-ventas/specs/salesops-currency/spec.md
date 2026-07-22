# Delta for salesops-currency

## MODIFIED Requirements

### Requirement: Money Conversion via USD Pivot

`convertir(Money origen, canal, monedaDestino, momento)` MUST be a pure function converting
through USD (origin → USD → destination), using rates from `resolverTasa` at the given
moment. When `origen.currency === monedaDestino` (same-currency), the function MUST consult
a rate for that channel/currency first and apply it if one exists; only when NO rate exists
MUST it fall back to 1×1 identity. It MUST NEVER short-circuit to identity without
consulting a rate first.
(Previously: same-currency short-circuited straight to `origen` unchanged, without
consulting whether a channel/currency-specific rate existed.)

#### Scenario: Convert between two non-pivot currencies

- GIVEN a `Money` in EUR via `EUR_EFECTIVO`, target MN
- WHEN `convertir` runs at a moment where both rates exist
- THEN the result is `Money` in MN computed EUR→USD→MN

#### Scenario: Same-currency with an existing rate is applied

- GIVEN `origen.currency === monedaDestino` and a resolvable rate for that channel/currency
- WHEN `convertir` runs
- THEN the resolved rate is applied to the conversion — it is not a blind passthrough of
  `origen`

#### Scenario: Same-currency with no rate falls back to 1×1

- GIVEN `origen.currency === monedaDestino` and no rate resolvable for that channel/currency
- WHEN `convertir` runs
- THEN the result equals `origen` via 1×1 identity

#### Scenario: Cross-currency with no rate throws, never defaults to 1×1

- GIVEN `origen.currency !== monedaDestino` and no rate resolvable for the destination
  currency
- WHEN `convertir` runs
- THEN it throws `RateNotFoundError` — it MUST NEVER return a 1×1 identity result for
  differing currencies

## ADDED Requirements

### Requirement: Channel-less Currency-to-Currency Conversion

The system MUST expose a pure `convertirEntreMonedas(rates, origen, monedaDestino, at)`
helper for conversions with no `PaymentChannel` (e.g. `OrderLine` product-currency →
order-currency). It MUST resolve both sides via the existing internal
`resolveRateForCurrency`, convert origin → USD → destination as ONE exact bigint rational
rounded HALF-UP exactly once, and follow the same same-currency/cross-currency rules as
`convertir`: same-currency uses a rate if one exists else 1×1; cross-currency with no
resolvable rate raises `RateNotFoundError`.

#### Scenario: Line conversion product-currency to order-currency

- GIVEN a product priced in EUR and an order whose derived currency is USD
- WHEN the line is frozen via `convertirEntreMonedas`
- THEN the result is `Money` in USD, converted EUR→USD with one HALF-UP rounding

#### Scenario: No PaymentChannel is required

- GIVEN a call to `convertirEntreMonedas`
- WHEN inspected
- THEN its signature carries no `PaymentChannel` parameter — only currencies

#### Scenario: Missing cross-currency rate raises RateNotFoundError

- GIVEN no rate resolvable for the destination currency
- WHEN `convertirEntreMonedas` runs for two different currencies
- THEN it throws `RateNotFoundError` — it MUST NEVER default to 1×1
