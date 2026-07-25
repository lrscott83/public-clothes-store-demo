# Spec — salesops-currency

## Purpose

Define the testable contract for the `salesops-currency` capability: a backend vertical slice providing decimal-safe money (`Money` value object), a currency/channel/rate model with USD pivot, pure rate resolver and conversion functions, append-only rate persistence behind a hexagonal port, and HTTP endpoints exposing rates and conversions as JSON strings (never floats).

## Requirements

### Requirement: Money Value Object

Every monetary amount MUST be a `Money` VO `{ amount, currency }` — amount MUST NEVER exist without currency. Amounts MUST be decimal-safe (no float) in DB, domain math, and API. Scale per currency: USD=2, EUR=2, MN=2. Exactly one rounding mode system-wide: HALF-UP, applied once at a defined point, never per intermediate step.

#### Scenario: Amount always carries currency

- GIVEN any value the domain produces
- WHEN it moves between functions or is persisted
- THEN it is `{ amount, currency }`, never a bare number

#### Scenario: Rounding applied once, HALF-UP

- GIVEN a result ending in .005 at scale-2
- WHEN the final amount is rounded
- THEN it rounds HALF-UP and no other rounding happened upstream

#### Scenario: Mixed-currency arithmetic rejected

- GIVEN a `Money` in EUR and one in MN
- WHEN the system attempts to add them directly
- THEN this MUST be impossible without an explicit conversion step

### Requirement: Currency Catalog with USD Pivot

The system MUST support exactly three currencies: USD, MN, EUR. USD MUST be the internal pivot: all rates are stored against USD, regardless of the currency prices are denominated in.

#### Scenario: Rates stored vs pivot

- GIVEN a new rate is registered for any channel
- WHEN persisted
- THEN it expresses that channel's value against USD, never against MN/EUR directly

### Requirement: Payment Channels

Exactly five channels exist, each with a fixed settlement currency:

| Channel | Currency |
|---|---|
| `ZELLE` | USD |
| `USD_CASH` | USD |
| `EUR_CASH` | EUR |
| `MN_TRANSFER` | MN |
| `MN_CASH` | MN |

No other channel MUST be accepted.

#### Scenario: Channel determines settlement currency

- GIVEN channel `MN_TRANSFER`
- WHEN a rate/conversion is resolved for it
- THEN the settlement currency is MN

#### Scenario: Unknown channel rejected

- GIVEN a channel outside the five above
- WHEN used to resolve a rate
- THEN the system MUST reject it, not default to a known channel

### Requirement: Append-Only Exchange Rate History

Rates MUST be append-only: every change is a new row (`channel`, `rate`, `efectivaDesde`); existing rows MUST NEVER be updated or deleted. The current rate at moment T is the latest row with `efectivaDesde <= T`. Each rate is a single value — no buy/sell spread.

#### Scenario: New rate is an insert

- GIVEN a channel has a rate effective from an earlier date
- WHEN a new rate is registered
- THEN a new row is inserted and the prior row is untouched

#### Scenario: Current rate resolved by moment

- GIVEN rows effective Jan 1 and Mar 1
- WHEN queried for Feb 15
- THEN the Jan 1 row is returned

### Requirement: Pure Rate Resolver with Cascade Fallback

`resolveRate(channel, at)` MUST be a pure function (no I/O) resolving the current rate via cascade: (1) channel's own rate; (2) else its currency's rate (e.g. `USD_CASH` → USD=1); (3) else throw an explicit error. It MUST NEVER return 0 or null.

#### Scenario: Channel has its own rate

- GIVEN `ZELLE` has a rate effective before the query moment
- WHEN `resolveRate(ZELLE, at)` runs
- THEN it returns that channel-specific rate

#### Scenario: Falls back to currency rate

- GIVEN `USD_CASH` has no channel-specific rate
- WHEN `resolveRate` runs for it
- THEN it returns the USD pivot rate (1), not an error

#### Scenario: No rate resolvable throws explicit error

- GIVEN neither the channel nor its currency has a rate at that moment
- WHEN `resolveRate` runs
- THEN it throws an explicit typed error — never 0 or null

### Requirement: Money Conversion via USD Pivot

`convert(Money source, channel, targetCurrency, at)` MUST be a pure function converting
through USD (origin → USD → destination), using rates from `resolveRate` at the given
moment. When `source.currency === targetCurrency` (same-currency), the function MUST consult
a rate for that channel/currency first and apply it if one exists; only when NO rate exists
MUST it fall back to 1×1 identity. It MUST NEVER short-circuit to identity without
consulting a rate first.
(Previously: same-currency short-circuited straight to `source` unchanged, without
consulting whether a channel/currency-specific rate existed.)

#### Scenario: Convert between two non-pivot currencies

- GIVEN a `Money` in EUR via `EUR_CASH`, target MN
- WHEN `convert` runs at a moment where both rates exist
- THEN the result is `Money` in MN computed EUR→USD→MN

#### Scenario: Same-currency with an existing rate is applied

- GIVEN `source.currency === targetCurrency` and a resolvable rate for that channel/currency
- WHEN `convert` runs
- THEN the resolved rate is applied to the conversion — it is not a blind passthrough of
  `source`

#### Scenario: Same-currency with no rate falls back to 1×1

- GIVEN `source.currency === targetCurrency` and no rate resolvable for that channel/currency
- WHEN `convert` runs
- THEN the result equals `source` via 1×1 identity

#### Scenario: Cross-currency with no rate throws, never defaults to 1×1

- GIVEN `source.currency !== targetCurrency` and no rate resolvable for the destination
  currency
- WHEN `convert` runs
- THEN it throws `RateNotFoundError` — it MUST NEVER return a 1×1 identity result for
  differing currencies

### Requirement: Currency Repository Port

The domain MUST define an `ICurrencyRepository` port for reading/appending currencies, channels, and rates, with zero dependency on any persistence technology.

#### Scenario: Domain depends only on the port

- GIVEN domain code needing rate data
- WHEN implemented
- THEN it imports `ICurrencyRepository`, never a concrete Prisma class

### Requirement: Prisma Persistence Adapter

`PrismaCurrencyRepository` MUST implement `ICurrencyRepository`, backed by the first real models in `schema.prisma` (currency, channel, rate history), storing amounts/rates as DECIMAL.

#### Scenario: Adapter persists an append-only rate

- GIVEN a new rate submitted through the repository
- WHEN persisted
- THEN a new row is inserted (never UPDATE) with DECIMAL precision preserved

### Requirement: Currency API Module

`CurrencyModule` MUST expose endpoints to list currencies, list channels, list/read rates, and resolve/convert an amount. All amounts and rates in JSON responses MUST be strings, never JSON numbers.

#### Scenario: Rate resolution endpoint returns strings

- GIVEN a client requests conversion for a valid channel/moment
- WHEN the API responds
- THEN the amount and applied rate are JSON strings (e.g. `"350.455"`)

#### Scenario: Endpoint surfaces resolver errors

- GIVEN a request for a channel/moment with no resolvable rate
- WHEN the resolve endpoint runs
- THEN it returns an explicit error response, not a 0/null amount

### Requirement: Channel-less Currency-to-Currency Conversion

The system MUST expose a pure `convertBetweenCurrencies(rates, source, targetCurrency, at)`
helper for conversions with no `PaymentChannel` (e.g. `OrderLine` product-currency →
order-currency). It MUST resolve both sides via the existing internal
`resolveRateForCurrency`, convert origin → USD → destination as ONE exact bigint rational
rounded HALF-UP exactly once, and follow the same same-currency/cross-currency rules as
`convert`: same-currency uses a rate if one exists else 1×1; cross-currency with no
resolvable rate raises `RateNotFoundError`.

#### Scenario: Line conversion product-currency to order-currency

- GIVEN a product priced in EUR and an order whose derived currency is USD
- WHEN the line is frozen via `convertBetweenCurrencies`
- THEN the result is `Money` in USD, converted EUR→USD with one HALF-UP rounding

#### Scenario: No PaymentChannel is required

- GIVEN a call to `convertBetweenCurrencies`
- WHEN inspected
- THEN its signature carries no `PaymentChannel` parameter — only currencies

#### Scenario: Missing cross-currency rate raises RateNotFoundError

- GIVEN no rate resolvable for the destination currency
- WHEN `convertBetweenCurrencies` runs for two different currencies
- THEN it throws `RateNotFoundError` — it MUST NEVER default to 1×1
