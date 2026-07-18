# Design — Currency & Exchange-Rate Module

First real domain vertical slice on the hexagonal backend base scaffold. Decimal-safe
money (`Money`), a pure rate resolver with cascade fallback + explicit error, an
append-only rate store, and a thin `CurrencyModule` that wires the port to Postgres.
This formalizes `docs/plans/monedas-tasas-cambio-design.md` and DECIDES the
implementation-level questions that doc left open (§8, §11).

> Authoritative business decisions come from that design doc and engram
> `decision/currency-financial-params` (5 channels, all currencies scale-2, HALF-UP).
> This document decides the HOW at architecture level only. Tasks come next.

## Quick path (what gets built)

1. `packages/domain/src/currency/` — `Money` VO (bigint minor units), `Currency` +
   `PaymentChannel` + `ExchangeRate` models, pure `resolverTasa` / `convertir`, and the
   `ICurrencyRepository` port. Zero framework, zero I/O, zero float.
2. `packages/infra-db/` — first real Prisma models (append-only `exchange_rate` +
   two enums) and `PrismaCurrencyRepository implements ICurrencyRepository`.
3. `apps/api-salesops/src/currency/` — `CurrencyModule` (controller + service) that
   fetches rates through the port, calls the pure resolver, and returns decimals as
   strings.
4. Tests across three runners: domain=vitest, infra-db=jest, api-salesops=jest.

## The central decision — decimal representation

**Decision: integer minor units as `bigint` for `Money`, rates as scaled `bigint` at
`RATE_SCALE`, and conversion accumulated as an exact `bigint` rational with a SINGLE
HALF-UP division at the destination. No decimal library.**

### Why bigint minor units and not `number`, not `decimal.js`, not float

| Option | Verdict | Reason |
|--------|---------|--------|
| `number` (float) for money | Rejected | Binary float cannot represent `0.10`; drift accumulates. Current `types.ts` debt. |
| `number` of minor units (cents) | Rejected | The intermediate `amount_cents * rate` product overflows `Number.MAX_SAFE_INTEGER` (2^53 ≈ 9.0e15). Cents (~1e9) × rate at scale-6 (~1e8) = ~1e17 > 2^53 → silent precision loss. |
| `decimal.js` / `big.js` | Rejected | Runtime dependency, and STILL requires disciplined rounding-mode config at every op. bigint gives provable exactness with the language primitive. |
| **`bigint` minor units + rational bigint conversion** | **Chosen** | Exact by construction, zero runtime deps, deterministic, trivially testable, and it makes "round once, never intermediate" a structural property, not a convention. |

### Representation contract

| Concept | Domain representation | Scale | DB column | API JSON |
|---------|-----------------------|-------|-----------|----------|
| `Money.minorUnits` | `bigint` (integer minor units) | per-currency `MONEY_SCALE` = 2 (USD, EUR, MN) | (future Ventas) `Decimal` + `currency` | string `"350.45"` |
| `ExchangeRate.rate` | `bigint` scaled by `RATE_SCALE` | `RATE_SCALE` = 6 | `Decimal(18,6)` | string `"350.455000"` |

- `MONEY_SCALE`: a per-`Currency` map (all 3 = 2 today, kept as a map so a future
  scale-0 currency is a data change, not a code change).
- `RATE_SCALE` = 6: the design's example rate `"350.455"` has 3 decimals; 6 gives
  headroom for pivot round-trips without widening later.

### The single-rounding rule (structural, not convention)

Conversion `A → pivot(USD) → destino` is computed as ONE exact rational
`numerator / denominator` over `bigint`, and rounded exactly ONCE:

```
divRoundHalfUp(numerator: bigint, denominator: bigint): bigint
// non-negative operands (sale settlement is never negative):
//   (2n * numerator + denominator) / (2n * denominator)   // integer floor division
// 0.5 rounds up (HALF-UP, per engram #1262)
```

No `Money` is rounded to fewer digits mid-chain. All rate multiplications and the pivot
hop stay in the exact rational; `divRoundHalfUp` is applied a single time to produce the
destination `minorUnits`. This is what the "no intermediate rounding" test asserts.

## Layer mapping (screaming architecture)

Dependency direction: `api-salesops → { domain, infra-db }`, `infra-db → domain`,
`domain → nothing`. The `domain → infra` edge is FORBIDDEN and enforced by the
`backend-boundaries` ESLint rule with `--max-warnings 0` (engram #1261 gotcha #3).

### `packages/domain/src/currency/` — pure core (vitest)

| File | Contract |
|------|----------|
| `money.ts` | `type Currency = 'USD' \| 'EUR' \| 'MN'`; `MONEY_SCALE: Record<Currency, number>`; `interface Money { minorUnits: bigint; currency: Currency }`; factories `money(minorUnits, currency)`, `moneyFromDecimalString(str, currency)`, `moneyToDecimalString(money)`. Guards reject scale mismatch (`InvalidMoneyError`). |
| `payment-channel.ts` | `type PaymentChannel` = the 5 confirmed values; `CHANNEL_CURRENCY: Record<PaymentChannel, Currency>` (ZELLE→USD, USD_EFECTIVO→USD, EUR_EFECTIVO→EUR, MN_TRANSFERENCIA→MN, MN_EFECTIVO→MN). |
| `exchange-rate.ts` | `RATE_SCALE = 6`; `interface ExchangeRate { channel: PaymentChannel; rate: bigint; effectiveFrom: Date }`; `rateFromDecimalString`, `rateToDecimalString`. |
| `rate-resolver.ts` | Pure, no I/O. `resolverTasa(rates: ExchangeRate[], channel, at: Date): ResolvedRate` — cascade: (1) channel's own latest row with `effectiveFrom <= at`; (2) fall back to any channel that settles in the same currency (e.g. `USD_EFECTIVO` → USD = 1); (3) throw `RateNotFoundError`. `convertir(rates, origen: Money, channel, monedaDestino: Currency, at): { money: Money; rateApplied: ExchangeRate }`. Never returns 0/null. |
| `currency-repository.port.ts` | `interface ICurrencyRepository { appendRate(input): Promise<ExchangeRate>; ratesForChannel(channel, at?): Promise<ExchangeRate[]>; latestRate(channel, at): Promise<ExchangeRate \| null> }` + `const CURRENCY_REPOSITORY = Symbol('ICurrencyRepository')` DI token. |
| `errors.ts` | `RateNotFoundError`, `InvalidMoneyError` (named errors so the resolver "grita, no adivina"). |
| `index.ts` | Barrel; re-exported from `packages/domain/src/index.ts`. |

Note: the resolver is pure and receives `rates` as an argument. The port is DEFINED in
domain but CONSUMED by the application service — the domain never performs I/O. This keeps
`@store-mgmt/domain` async-free and 100% unit-testable in vitest.

### `packages/infra-db/` — adapter (jest + real Postgres)

| File | Contract |
|------|----------|
| `prisma/schema.prisma` | Append `enum PaymentChannel`, `enum Currency`, `model ExchangeRate` (details below). First real models on the empty baseline. |
| `src/currency/prisma-currency.repository.ts` | `@Injectable() class PrismaCurrencyRepository implements ICurrencyRepository`. Injects `PrismaService`. Maps Prisma `Decimal` (string) ↔ domain `bigint` at `RATE_SCALE`. Exposes ONLY append + read (no update/delete) — append-only enforced by the port's shape. `latestRate` = `WHERE channel = ? AND effective_from <= at ORDER BY effective_from DESC, created_at DESC LIMIT 1`. |
| `src/index.ts` | Export `PrismaCurrencyRepository`. |

`infra-db` gains a `@store-mgmt/domain` dependency (leaf). It imports the port TYPE only;
the reverse edge stays forbidden.

### `apps/api-salesops/src/currency/` — delivery (jest)

| File | Contract |
|------|----------|
| `currency.module.ts` | Imports `InfraDbModule`; providers: `CurrencyService` and `{ provide: CURRENCY_REPOSITORY, useClass: PrismaCurrencyRepository }`; declares `CurrencyController`. |
| `currency.service.ts` | Orchestration (the only place with both I/O and domain): inject `CURRENCY_REPOSITORY`, fetch rates, call pure `resolverTasa`/`convertir`, map `Money`/rates to strings. |
| `currency.controller.ts` | REST endpoints (below). Parses string decimals → `bigint`; serializes back to strings. |
| `dto/*.ts` | Request/response DTOs; every money/rate field typed `string`. |

## Prisma schema (append to baseline)

```prisma
enum PaymentChannel {
  ZELLE
  USD_EFECTIVO
  EUR_EFECTIVO
  MN_TRANSFERENCIA
  MN_EFECTIVO
}

enum Currency {
  USD
  EUR
  MN
}

model ExchangeRate {
  id            String         @id @default(uuid()) @db.Uuid
  channel       PaymentChannel
  rate          Decimal        @db.Decimal(18, 6)   // NUMERIC — never float
  effectiveFrom DateTime       @map("effective_from")
  createdAt     DateTime       @default(now()) @map("created_at")

  @@index([channel, effectiveFrom])
  @@map("exchange_rate")
}
```

- **Channels/currencies as enums, not reference tables** — they are fixed code-level
  constants; join tables would be YAGNI (matches design §2 discards).
- **Append-only**: no `updatedAt`, no soft-delete, no `valid_to`. The row is immutable;
  a rate change is a new INSERT. "Current rate" = latest `effective_from <= now`.
  Enforced structurally by the port exposing no mutation-in-place; a DB trigger to block
  UPDATE/DELETE is possible but out of scope.
- **Migration plan**: baseline is empty (`schema.prisma` has zero models today), so this
  is a single additive migration `add_currency_module` via `prisma migrate dev
  --name add_currency_module`. Rollback = drop the migration; base scaffold `/health`
  and the untouched `salesops-mvp`/`@store-mgmt/domain` runtime stay intact.

## API contract (decimals as strings)

| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| `POST` | `/currency/rates` | `{ channel, rate: "350.455", effectiveFrom: "<iso>" }` | `201` `{ id, channel, rate: "350.455000", effectiveFrom }` |
| `GET` | `/currency/rates` | `?channel=ZELLE&at=<iso?>` | `{ channel, rate: "350.455000", effectiveFrom }` (latest ≤ `at`, default now) |
| `GET` | `/currency/convert` | `?amount=100.00&from=USD&channel=ZELLE&to=MN&at=<iso?>` | `{ amount: "35045.50", currency: "MN", rateApplied: "350.455000", effectiveFrom }` |

- Every monetary/rate field is a JSON **string**; parsing to `bigint` happens at the
  controller boundary, formatting back to string on the way out.
- Missing rate → `404`/`422` carrying `RateNotFoundError` (never `0`/`null`).
- Malformed decimal / scale mismatch → `400` (`InvalidMoneyError`).

## Testing / TDD strategy (three runners)

Strict TDD is active. Each test targets the runner native to its package.

| Test | Package / runner | Command |
|------|------------------|---------|
| Resolver cascade: own rate → currency fallback → explicit error | domain / **vitest** | `pnpm --filter @store-mgmt/domain test` |
| `RateNotFoundError` never returns 0/null | domain / vitest | ″ |
| Pivot conversion across arbitrary pairs (USD/MN/EUR) | domain / vitest | ″ |
| Rounding: single HALF-UP, no intermediate drift; bigint overflow safety | domain / vitest | ″ |
| `Money` parse/format decimal-string round-trip | domain / vitest | ″ |
| Repo append-only (INSERT only, no update path) | infra-db / **jest** | `pnpm --filter @store-mgmt/infra-db test` |
| Repo latest-row selection by `effective_from` | infra-db / jest | ″ |
| Prisma `Decimal` ↔ domain `bigint` mapping fidelity | infra-db / jest | ″ |
| Endpoints return strings; `/convert` end-to-end; 404/400 paths | api-salesops / **jest** | `pnpm --filter @store-mgmt/api-salesops test` |

- infra-db and api-salesops jest runs need `NODE_OPTIONS=--experimental-vm-modules`
  (Prisma 7 WASM query compiler — baked via `cross-env`, engram #1261 gotcha #1).
- infra-db tests hit the real docker Postgres (`docker-compose.yml`), matching the
  base-scaffold `SELECT 1` pattern.

## Architecture decisions (ADR-style)

| # | Decision | Rejected alternative | Rationale |
|---|----------|----------------------|-----------|
| 1 | `bigint` minor units + exact rational conversion, single HALF-UP | `number` cents (overflow), `decimal.js` (dep+config), float (drift) | Provable exactness with a language primitive; the `amount*rate` product exceeds 2^53. |
| 2 | Channels & currencies as Prisma + domain enums | Reference/join tables | Fixed constants; join tables are YAGNI for this domain. |
| 3 | Append-only via effectiveFrom + port with no in-place mutation | `valid_to` bitemporality | 3–6 orders/day need audit, not retroactive correction (design §5). |
| 4 | Pure resolver receives `rates` as arg; orchestration in app service; port in domain | Resolver calling the repo directly | Keeps `@store-mgmt/domain` async-free, pure, and unit-testable. |
| 5 | `RATE_SCALE`=6, `MONEY_SCALE`=2 (per-currency map), HALF-UP | Global hardcoded scale | Owner-confirmed scale-2; map absorbs a future scale-0 currency as data. |
| 6 | `Decimal(18,6)` in DB, `bigint` in domain, `string` at API | `Decimal` all the way / float | Three-border rule from design §8; no float anywhere on the money path. |

## Checklist (reviewer can confirm)

- [ ] `Money` stores `bigint` minor units; no `number`/float on any money path.
- [ ] Conversion applies exactly one HALF-UP division; a drift test proves no intermediate rounding.
- [ ] Domain imports the port, never Prisma; `backend-boundaries` lint is green (`--max-warnings 0`).
- [ ] `exchange_rate` is append-only (`Decimal(18,6)`, indexed on `channel, effective_from`); repo exposes no update/delete.
- [ ] Resolver throws `RateNotFoundError` — never returns `0`/`null`.
- [ ] API returns every money/rate field as a string.
- [ ] Tests land in the correct runner: resolver/conversion/rounding = vitest domain; append-only/latest-row = jest infra-db; endpoints = jest api.

## Out of scope (unchanged from proposal)

Buy/sell spread · Redis cache · per-channel limits · wallet/balances · `valid_to`
bitemporality · payment-rail integrations · order freezing/snapshot (future Ventas
module — Currency only RESOLVES, never knows about orders).

## Next step

`sdd-tasks` once the spec is also ready — break this design into ordered, testable
work units (models → resolver → port → schema/migration → repository → module/endpoints),
respecting the three-runner TDD map above.
