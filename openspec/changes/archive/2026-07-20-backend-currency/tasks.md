# Tasks: Currency & Exchange-Rate Module

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1100-1300 (domain ~470, infra-db ~270, api-salesops ~450; human-authored, excludes generated Prisma client/migration SQL boilerplate and lockfile) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (structurally splittable into 4 units below) |
| Suggested split | Unit 1 (domain models+resolver) → Unit 2 (infra-db schema+repo) → Unit 3 (api CurrencyModule) → Unit 4 (boundary+cross-runner verification) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

Delivery is `single-pr`: orchestrator must record `size:exception` before `sdd-apply` runs, since the estimate exceeds the 400-line budget. Work units below still apply as **commit** boundaries inside the single PR (work-unit-commits skill), each independently revertible.

### Suggested Work Units

| Unit | Goal | Scope (single PR, commit-level) | Depends on |
|------|------|-----------|-----------|
| 1 | Domain: Money/Currency/PaymentChannel/ExchangeRate + pure resolverTasa/convertir + port | Phases 0-2 | none |
| 2 | infra-db: schema, migration, PrismaCurrencyRepository | Phase 3 | Unit 1 (port types) |
| 3 | api-salesops: CurrencyModule (dto/service/controller) | Phase 4 | Unit 2 (repository) |
| 4 | Boundary + full three-runner verification | Phase 5 | Units 1-3 |

## Phase 0: Boundary & Tooling Foundation

- [x] 0.1 Add `@store-mgmt/domain: workspace:*` to `templates/packages/infra-db/package.json` deps. Confirm `backend-boundaries.config.js`'s `domainBoundaryRule` only restricts `domain → infra-*/api-*`, not `infra-db → domain` — no lint-config change needed for `infra-db`.
- [x] 0.2 Add `cross-env NODE_OPTIONS=--experimental-vm-modules` to `infra-db`'s `test` script (Prisma 7 WASM, engram #1261 gotcha #1); create `templates/packages/infra-db/jest.config.js` (ts-jest, rootDir `src`, testRegex `.*\.spec\.ts$`).

## Phase 1: Domain — Money, Channel, Rate types (vitest, `pnpm --filter @store-mgmt/domain test`)

- [x] 1.1 [RED] `domain/src/currency/money.test.ts`: scale guard rejects mismatched decimals, mixed-currency add is impossible without conversion, `moneyFromDecimalString`/`moneyToDecimalString` round-trip.
- [x] 1.2 [GREEN] `domain/src/currency/money.ts`: `Currency` type, `MONEY_SCALE` map (USD/EUR/MN=2), `Money{minorUnits:bigint,currency}`, factories + `InvalidMoneyError` guard.
- [x] 1.3 [RED] `domain/src/currency/payment-channel.test.ts`: `CHANNEL_CURRENCY` covers exactly the 5 channels; unrecognized channel is a type error, not a runtime default.
- [x] 1.4 [GREEN] `domain/src/currency/payment-channel.ts`: 5-member `PaymentChannel` union + `CHANNEL_CURRENCY` map.
- [x] 1.5 [RED] `domain/src/currency/exchange-rate.test.ts`: `rateFromDecimalString`/`rateToDecimalString` round-trip at `RATE_SCALE=6` (e.g. `"350.455"` ↔ bigint).
- [x] 1.6 [GREEN] `domain/src/currency/exchange-rate.ts`: `RATE_SCALE=6`, `ExchangeRate{channel,rate:bigint,effectiveFrom}`, parse/format helpers.

## Phase 2: Domain — Pure resolver + conversion (vitest)

- [x] 2.1 [RED] `domain/src/currency/rate-resolver.test.ts` case "own rate": `ZELLE` with a channel-specific row returns that rate.
- [x] 2.2 [RED] same file, case "currency fallback": `USD_EFECTIVO` with no own row falls back to USD pivot rate (=1), not error.
- [x] 2.3 [RED] same file, case "explicit error": neither channel nor currency resolvable → throws `RateNotFoundError`, never 0/null.
- [x] 2.4 [GREEN] `domain/src/currency/errors.ts` (`RateNotFoundError`, `InvalidMoneyError`) + `resolverTasa()` cascade in `rate-resolver.ts` to pass 2.1-2.3.
- [x] 2.5 [RED] same file, `convertir()` pivot test EUR(`EUR_EFECTIVO`)→MN: fixture MUST pin rate direction explicitly (asserts rates are currency-per-USD, i.e. `rate = X` means `1 USD = X currency`) so USD-per-currency inversion bugs fail loudly.
- [x] 2.6 [RED] same file, rounding-drift test: `.005` boundary at scale-2 rounds HALF-UP, and asserts only ONE division occurs across the A→USD→B chain (no intermediate rounding).
- [x] 2.7 [RED] same file, bigint-overflow test: fixture where `minorUnits * rate` (scale-6) exceeds `Number.MAX_SAFE_INTEGER` as a `number` but is exact as `bigint`.
- [x] 2.8 [GREEN] `convertir()` + `divRoundHalfUp()` in `rate-resolver.ts` to pass 2.5-2.7.
- [x] 2.9 `domain/src/currency/currency-repository.port.ts`: `ICurrencyRepository{appendRate,ratesForChannel,latestRate}` + `CURRENCY_REPOSITORY` Symbol token (type-only, no I/O; verified via infra-db's `implements` clause in Phase 3).
- [x] 2.10 `domain/src/currency/index.ts` barrel; re-export from `domain/src/index.ts`. Run `pnpm --filter @store-mgmt/domain test` full-green.

## Phase 3: infra-db — Prisma adapter (jest + docker Postgres, `pnpm --filter @store-mgmt/infra-db test`)

- [x] 3.1 Append `enum PaymentChannel`, `enum Currency`, `model ExchangeRate` (Decimal(18,6), `@@index([channel, effectiveFrom])`) to `templates/packages/infra-db/prisma/schema.prisma`. Evidence: additive-only append; migration below contains only `CREATE TYPE`/`CREATE TABLE`/`CREATE INDEX`.
- [x] 3.2 Generate migration `add_currency_module` (`pnpm --filter @store-mgmt/infra-db prisma:migrate`); confirm additive-only, `/health` untouched. Evidence: `prisma/migrations/20260720154712_add_currency_module/migration.sql` — pure CREATEs, no ALTER/DROP on `_prisma_migrations`/existing tables; `PrismaService.$queryRaw\`SELECT 1\`` untouched.
- [x] 3.3 [RED] `infra-db/src/currency/prisma-currency.repository.spec.ts` (named `.spec.ts` to match the package's existing jest `testRegex`, not `.test.ts` as originally worded): `appendRate()` called twice for same channel produces 2 rows (never UPDATE). Confirmed RED first (missing production module error) before implementing.
- [x] 3.4 [RED] same file: `latestRate(channel, at)` with Jan1/Mar1 rows queried at Feb15 returns Jan1; Decimal↔bigint round-trip fidelity at `RATE_SCALE=6` (plus a `ratesForChannel` ordering test as a 4th case).
- [x] 3.5 [GREEN] `infra-db/src/currency/prisma-currency.repository.ts`: `PrismaCurrencyRepository implements ICurrencyRepository` to pass 3.3-3.4. All 4 tests green against the real `store_mgmt` Postgres DB (172.17.0.1:5432).
- [x] 3.6 Export `PrismaCurrencyRepository` from `infra-db/src/index.ts`; run `pnpm --filter @store-mgmt/infra-db test` full-green (4/4 passing). Also verified `lint` (`--max-warnings 0`) and `typecheck`/`build` green.

## Phase 4: api-salesops — CurrencyModule (jest, `pnpm --filter @store-mgmt/api-salesops test`)

- [x] 4.1 `apps/api-salesops/src/currency/dto/*.ts`: request/response DTOs, every money/rate field `string`. Evidence: `dto/create-rate.dto.ts`, `dto/rate-response.dto.ts`, `dto/convert-query.dto.ts`, `dto/convert-response.dto.ts`, `dto/index.ts` — all money/rate/amount fields typed `string`. Also added `@store-mgmt/domain: workspace:*` to `apps/api-salesops/package.json` (was missing).
- [x] 4.2 [RED] `currency.service.spec.ts`: with mocked `CURRENCY_REPOSITORY`, service maps resolved `bigint` Money/rate to decimal strings. Evidence: confirmed RED first (`Could not locate module ./currency.service.js` — missing production file), then GREEN after 4.4 (6/6 tests).
- [x] 4.3 [RED] same file: service surfaces `RateNotFoundError` as a typed exception, not a swallowed 0/null. Evidence: `getLatestRate`/`convert` tests assert `rejects.toBeInstanceOf(RateNotFoundError)`; a third test also asserts `InvalidMoneyError` propagates for malformed decimals without touching the repository.
- [x] 4.4 [GREEN] `currency.service.ts`: inject `CURRENCY_REPOSITORY`, call `resolverTasa`/`convertir`, map to DTOs, to pass 4.2-4.3. Evidence: 6/6 green (`pnpm --filter @store-mgmt/api-salesops test -- currency.service.spec`). Deviation note: since the port only exposes `ratesForChannel(channel, at?)` (no "all rates" method) but `resolverTasa`/`convertir`'s currency-fallback cascade needs cross-channel rows, the service fetches all 5 fixed channels in parallel (`fetchAllRates`) and lets the pure domain function do the cascade — no port/domain change needed.
- [x] 4.5 [RED] `currency.controller.spec.ts`: `POST /currency/rates` → 201 string fields; `GET /currency/rates?channel&at` → latest string rate; `GET /currency/convert` → string amount + `rateApplied`. Evidence: confirmed RED first (`Could not locate module ./currency.controller.js`), then GREEN after 4.7.
- [x] 4.6 [RED] same file: `/currency/convert` with no resolvable rate → 404/422 (never 0/null); malformed decimal → 400. Evidence: also added coverage for `POST /currency/rates` and `GET /currency/convert` rejecting unknown channel/currency with 400 before reaching the service. 8/8 green.
- [x] 4.7 [GREEN] `currency.controller.ts` to pass 4.5-4.6. Evidence: validates channel/currency enums at the boundary (`assertChannel`/`assertCurrency` → 400), maps `RateNotFoundError`→404 and `InvalidMoneyError`→400 via a private `withDomainErrorMapping` wrapper. 8/8 green.
- [x] 4.8 `currency.module.ts` (imports `InfraDbModule`; binds `CURRENCY_REPOSITORY→PrismaCurrencyRepository`; declares controller+service); wire into `app.module.ts`. Evidence: `CurrencyModule` added to `AppModule` imports; `typecheck`/`build` both exit 0, proving the DI wiring (`PrismaCurrencyRepository` resolving `PrismaService` from `InfraDbModule`) compiles and links correctly.
- [x] 4.9 Run `pnpm --filter @store-mgmt/api-salesops test` full-green. Evidence: `Test Suites: 3 passed, 3 total / Tests: 15 passed, 15 total`.

## Phase 5: Cross-cutting Verification

- [x] 5.1 `pnpm --filter @store-mgmt/domain lint && pnpm --filter @store-mgmt/infra-db lint && pnpm --filter @store-mgmt/api-salesops lint` — `backend-boundaries --max-warnings 0` stays green; domain still imports nothing from infra/api. Evidence: all three exit 0, no output.
- [x] 5.2 Run all three suites together (domain vitest, infra-db jest w/ docker Postgres, api-salesops jest); confirm every checklist item in `design.md` is satisfied. Evidence: domain 96/96, infra-db 6/6 (real Postgres), api-salesops 17/17 — all green; `typecheck`+`build` also exit 0 for infra-db and api-salesops (domain rebuilt first so consumers see the new `id?` type).
- [x] 5.3 Check off `design.md`'s reviewer checklist boxes as evidence is gathered. Evidence: all 7 boxes + 1 new id-fix box marked `[x]` in `design.md`.

### Cross-cutting correction (post-Phase-4): expose persisted row `id`

Applied after Phase 5 was first drafted, to align with `design.md`'s own API contract table (`{ id, channel, rate, effectiveFrom }`) and the sibling `poolops-biz/apps/api-manager` convention.

- [x] 5.4 [RED→GREEN] `domain/src/currency/exchange-rate.ts`: add `id?: string` to `ExchangeRate` (optional — resolver-fabricated synthetic pivot rows carry no id). `rate-resolver.ts`: USD-identity synthetic row now explicit (`id: undefined`) with a comment. `rate-resolver.test.ts`: 2 new tests (persisted-row id passthrough; synthetic row id absent). Note: since `ExchangeRate` is a TS interface and test files are excluded from this package's `tsconfig.json`, these two tests do not produce a true compile-time RED — the passthrough already worked structurally at runtime before the type change (documented honestly, not silently).
- [x] 5.5 [RED→GREEN] `infra-db/src/currency/prisma-currency.repository.ts`: map `id: row.id` in `toDomain()` (every Prisma row has a real DB `id`). `prisma-currency.repository.spec.ts`: 2 new tests confirmed RED first against the real Postgres DB (`appended.id` was `undefined`), then GREEN.
- [x] 5.6 [RED→GREEN] `api-salesops/src/currency/dto/rate-response.dto.ts`: add `id: string | null` (first field). `currency.service.ts`: `createRate`/`toRateResponse` map `rate.id ?? null`; `getLatestRate` maps `resolved.source.id ?? null` (null only for the synthetic-pivot read path). `currency.service.spec.ts`: 3 new/updated tests confirmed RED first, then GREEN (persisted id passthrough on create + get; `id: null` for the USD identity synthetic read). `currency.controller.spec.ts`: 2 tests updated/added for the same contract at the HTTP layer (these were already green pre-fix since the controller mock bypasses the DTO mapping — documented as a passthrough test, not a driver of the fix).
- [x] 5.7 Re-ran full verification after the fix: domain (96/96 vitest + typecheck + build + lint), infra-db (6/6 jest + typecheck + build + lint), api-salesops (17/17 jest + typecheck + build + lint) — all green. `convert` response (`ConvertResponseDto`) intentionally unchanged — `id` is not part of its contract in `design.md`.

## Out of Scope (unchanged)

Buy/sell spread · Redis cache · per-channel limits · wallet/balances · `valid_to` bitemporality · payment-rail integrations · order-freezing/snapshot (future Ventas module).
