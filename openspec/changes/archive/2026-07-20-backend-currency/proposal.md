# Proposal: Currency & Exchange-Rate Module (first domain vertical slice)

## Intent

The backend base scaffold boots and pings Postgres but has ZERO domain logic — `schema.prisma` is empty and `@store-mgmt/domain` is untouched. salesops sells appliances and must **settle sales**: know what a customer pays in their channel and how much MN enters the business. Today money is `number` (float) and rates are the flat `ExchangeRates { usdToMn, zelle, eur }` — both are debt. This change ships the first real vertical slice: decimal-safe money and a pure rate resolver, proving the hexagonal ports/adapters pattern end-to-end on real infrastructure.

## Scope

### In Scope
- Domain (`@store-mgmt/domain/src/currency`): `Money` value object, `Currency`, `PaymentChannel` (5 channels), `ExchangeRate` models; pure `resolverTasa` (cascade fallback, explicit error) + `convertir` (USD-pivot); `ICurrencyRepository` port.
- Persistence: first real Prisma models in `infra-db` schema.prisma — append-only exchange-rate table; `PrismaCurrencyRepository implements ICurrencyRepository`.
- Delivery: `CurrencyModule` in `api-salesops` exposing read/resolve endpoints (decimals as strings).
- Decimal-safe money throughout: DECIMAL in DB, scale-2 (USD/EUR/MN), single system-wide HALF-UP rounding.

### Out of Scope
- Buy/sell spread, Redis cache, per-channel limits, wallet/balances, `valid_to` bitemporality, real payment-rail integrations (design §9).
- Order freezing/snapshot logic — lives in the future Ventas module. Currency only RESOLVES, never knows about orders.

## Capabilities

### New Capabilities
- `salesops-currency`: money value object, currency/channel/rate model, pure rate resolver + conversion, append-only rate persistence behind a port, and read/resolve HTTP endpoints. Distinct from `salesops-backend`.

### Modified Capabilities
- None.

## Approach

Follow the authoritative module design and target architecture strictly. Domain = pure functions/types with a defined port (no framework/DB imports). Adapter (Prisma) implements the port in `infra-db`. App wires them in a thin `CurrencyModule`. Rates stored against an internal USD pivot (avoids N×N matrix); resolution is a pure cascade `(rates, inputs) → result` that grits an explicit error rather than returning 0/null. Strict TDD per design §12.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/domain/src/currency/` | New | Models, resolver, port |
| `packages/infra-db/prisma/schema.prisma` | Modified | First real models (append-only rates) |
| `packages/infra-db/src/` | New | `PrismaCurrencyRepository` |
| `apps/api-salesops/src/currency/` | New | `CurrencyModule` + endpoints |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Float drift in money math | Med | Decimal-safe repr, single HALF-UP round at defined points |
| Prisma 7 driver-adapter gotchas | Med | Reuse base-scaffold patterns (eager probe, WASM NODE_OPTIONS) |
| Resolver returns 0/null silently | Low | Explicit-error contract, tested in TDD |
| Boundary leak (domain → infra) | Low | `backend-boundaries` lint with `--max-warnings 0` |

## Rollback Plan

Self-contained: revert the feature branch. New Prisma models are additive (empty schema today) — drop the migration; base scaffold `/health` and untouched `salesops-mvp`/`@store-mgmt/domain` remain intact.

## Dependencies

- Backend base scaffold (shipped): `api-salesops`, `@store-mgmt/infra-db`, `@store-mgmt/domain`, docker Postgres.
- Owner-confirmed financial params (channels, scale-2, HALF-UP).

## Success Criteria

- [ ] Domain resolver/conversion pass TDD: current-rate-by-moment, cascade fallback, explicit error, arbitrary-pair conversion.
- [ ] Append-only rate table + repository adapter persist/read against real Postgres.
- [ ] `CurrencyModule` resolve/read endpoints return decimals as strings.
- [ ] No float in money paths; domain imports the port, never the Prisma impl; boundaries lint green.
