# Tasks: Ventas Module (Order aggregate — multi-currency + split payments + stock bridge)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3300-3800 (currency tweaks ~260 incl. tests; inventory reserve/release extension ~280 incl. `applyReservationTx`+repo impl+tests; domain ventas ~800 incl. 4 entities+factory+4-state guards+port+errors+tests; infra-db ~950 incl. schema+migration+`PrismaOrderRepository` 3 atomic transitions (confirm/deliver/cancel)+seed+tests; api-salesops ~1150 incl. module+service+controller+DTOs+3 action endpoints+jest+e2e; human-authored, excludes generated Prisma client/migration SQL) |
| 400-line budget risk | High |
| Chained PRs recommended | No — owner has already decided delivery for this change: single branch `salesops-ventas`, work-unit commits, push at end, **no PR is opened** |
| Suggested split | N/A (no PR flow). Work units below are **commit** boundaries only, each independently revertible via `git revert` |
| Delivery strategy | single branch + work-unit commits, no PR (owner-selected, out of band from the standard `ask-on-risk/auto-chain/single-pr/exception-ok` set) |
| Chain strategy | size-exception (closest analogue: no splitting, single continuous branch) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

This is an honest size report only — per owner instruction, do NOT open a PR and do NOT
recommend splitting into chained/stacked PRs for this change. `sdd-apply` proceeds on the
existing `salesops-ventas` branch, one work-unit commit per unit below, pushed at the end.

### Suggested Work Units (commit boundaries, not PR boundaries)

| Unit | Goal | Phase | Depends on |
|------|------|-------|-----------|
| 1 | Currency tweaks: same-currency soft-resolve branch + `convertirEntreMonedas` | Phase 1 | none |
| 2 | Inventory EXTENSION: `IStockLevelRepository.reserve/release` + `InsufficientStockError` + `applyReservationTx` | Phase 2 | none (independent of Unit 1) |
| 3 | Domain: Order aggregate (`order.ts`+`order-line.ts`+`order-payment.ts`+`sale-credit.ts`+4-state guards+port+errors+barrel) | Phase 3 | Unit 1 (conversion), Unit 2 (port types referenced by repo contract) |
| 4 | infra-db: schema+migration, `PrismaOrderRepository` (create/find + confirm/deliver/cancel atomic tx), seed | Phase 4 | Unit 2 (`applyReservationTx`), Unit 3 (port/aggregate types) |
| 5 | api-salesops: `VentasModule`+service+controller+DTOs+e2e | Phase 5 | Unit 4 (repository) |
| 6 | Cross-cutting verification (lint/boundaries/full suites) | Phase 6 | Units 1-5 |

## Phase 1: Currency Tweaks (salesops-currency, vitest, `pnpm --filter @store-mgmt/domain test`)

- [x] 1.1 [RED] `domain/src/currency/rate-resolver.test.ts`: same-currency `convertir` with NO rate on file for that channel/currency returns synthetic 1x1 identity (`rateApplied.id === undefined`) instead of throwing `RateNotFoundError`.
- [x] 1.2 [RED] same file: same-currency `convertir` WITH an existing rate still applies that resolved rate (not a blind passthrough) — no regression on the current green case.
- [x] 1.3 [GREEN] `domain/src/currency/rate-resolver.ts`: add `tryResolverTasa` (returns `ResolvedRate | undefined`, never throws) + `syntheticIdentity(channel, at)`; reorder `convertir` to check `origen.currency === monedaDestino` FIRST, soft-resolve, fall back to `syntheticIdentity` only when undefined (design decision #5 — new branch, not a param). Confirm 1.1-1.2 pass and the full existing currency suite stays green.
- [x] 1.4 [RED] same file: `convertirEntreMonedas(rates, origen, monedaDestino, at)` — same-currency with a resolvable rate uses it; same-currency with none uses 1x1; cross-currency (e.g. EUR→MN) computes via `resolveRateForCurrency` on both sides, ONE `divRoundHalfUp` pivot rounding, stamps the ORIGEN-side rate.
- [x] 1.5 [RED] same file: `convertirEntreMonedas` cross-currency with no resolvable destination rate throws `RateNotFoundError`, never defaults to 1x1; signature carries no `PaymentChannel` parameter.
- [x] 1.6 [GREEN] `domain/src/currency/rate-resolver.ts`: implement `convertirEntreMonedas` per design decision #6, reusing `resolveRateForCurrency` + the existing single-rounding pivot math (minus `CHANNEL_CURRENCY` validation), to pass 1.4-1.5.
- [x] 1.7 Export `convertirEntreMonedas` from `domain/src/currency/index.ts`. Run `pnpm --filter @store-mgmt/domain test` — full currency suite green, zero regressions.

## Phase 2: Inventory — Reserve/Release Extension (vitest domain, jest infra-db + real Postgres)

- [x] 2.1 `domain/src/inventory/stock-level-repository.port.ts`: extend `IStockLevelRepository` with `reserve(input: ReserveStockInput): Promise<StockLevel>` and `release(input: ReserveStockInput): Promise<StockLevel>`; add `interface ReserveStockInput { productId; warehouseId; quantity }`; amend the "read-only" doc comment to "reads + reservation writes"; existing `findById`/`findByProductAndWarehouse`/`list` UNCHANGED.
- [x] 2.2 `domain/src/inventory/errors.ts`: add `InsufficientStockError` (reserve would push `available = onHand - reserved` negative); existing `NegativeStockError` reused for the `sale_out` path.
- [x] 2.3 `domain/src/inventory/index.ts`: export `ReserveStockInput` + `InsufficientStockError`.
- [x] 2.4 Run `pnpm --filter @store-mgmt/domain test` — shipped inventory suite (`warehouse`/`stock-level`/`stock-movement`) stays green, additive-only, zero regressions.
- [x] 2.5 [RED] `infra-db/src/inventory/apply-reservation.spec.ts` (NEW): reserve raises `reserved` by `qty` when `available >= qty`; reserve beyond available (`on_hand - (reserved+q) < 0`) throws `InsufficientStockError`, zero rows mutated; release lowers `reserved` by `qty`; release beyond `reserved` (`reserved-q < 0`) throws the existing `InvalidStockLevelError` (over-release guard), zero rows mutated.
- [x] 2.6 [GREEN] `infra-db/src/inventory/apply-reservation.ts`: `applyReservationTx(tx, {productId, warehouseId, quantity}, dir: 'reserve'|'release')` — upsert level; guarded UPDATE per direction (design decision #7), to pass 2.5.
- [x] 2.7 [RED] `infra-db/src/inventory/prisma-stock-level.repository.spec.ts` (extend, additive cases): `reserve()`/`release()` wrap `applyReservationTx` in their OWN `$transaction` and return the mapped `StockLevel`; existing read-only specs untouched and still pass.
- [x] 2.8 [GREEN] `infra-db/src/inventory/prisma-stock-level.repository.ts`: implement `reserve`/`release` per design decision #7, to pass 2.7; confirm shipped read-method specs stay green.
- [x] 2.9 Run `pnpm --filter @store-mgmt/infra-db test` — full inventory suite green incl. new reservation specs; `prisma-stock-movement.repository.spec.ts` (onHand path) shows zero regression.

## Phase 3: Domain — Order Aggregate (vitest, `pnpm --filter @store-mgmt/domain test`)

- [ ] 3.1 [RED] `domain/src/ventas/order-line.test.ts`: `buildOrderLine` recomputes `unitFinalPrice` via `finalPrice` (100, 20%, 5 → 75); computes `lineTotalNative = unitFinalPrice × quantity`; converts to `lineTotalOrder` via `convertirEntreMonedas`, stamping `rateApplied`+`rateEffectiveFrom`.
- [ ] 3.2 [GREEN] `domain/src/ventas/order-line.ts`: `interface OrderLine` + `buildOrderLine(input, orderCurrency, rates, at)` to pass 3.1.
- [ ] 3.3 [RED] `domain/src/ventas/order-payment.test.ts`: `buildOrderPayment` converts `amount` (in `CHANNEL_CURRENCY[channel]`) to `amountInOrderCurrency` via `convertir`, stamping `rateApplied`+`rateEffectiveFrom`.
- [ ] 3.4 [GREEN] `domain/src/ventas/order-payment.ts`: `interface OrderPayment` + `buildOrderPayment` to pass 3.3.
- [ ] 3.5 [RED] `domain/src/ventas/sale-credit.test.ts`: `isSaleCreditPaid` derives `paid >= total`; no `client: string` field exists.
- [ ] 3.6 [GREEN] `domain/src/ventas/sale-credit.ts`: `interface SaleCredit` (`orderId`+`customerId` FKs) + `isSaleCreditPaid` to pass 3.5.
- [ ] 3.7 [RED] `domain/src/ventas/order.test.ts`: `createOrder` derives `currency` (any USD line → `USD`; all-MN/EUR → `MN`); requires ≥1 line; missing/invalid `deliveryMode` → `InvalidOrderError`; initial `status='creado'`.
- [ ] 3.8 [RED] same file: totals derived from lines (explicit `total` input ignored/recomputed); payment-sum invariant `Σ amountInOrderCurrency === total` else `InvalidOrderError`.
- [ ] 3.9 [RED] same file: cross-currency line/payment with no resolvable rate propagates `RateNotFoundError` (STOPS, no partial aggregate); same-currency with no rate uses 1×1 (delegates to Phase 1).
- [ ] 3.10 [RED] same file: pure guards `confirmOrder`/`deliverOrder`/`cancelOrder` — `confirmOrder` requires source `creado`; `deliverOrder` requires source `verificado`; `cancelOrder` accepts `creado` OR `verificado`; any transition attempted from `entregado` (confirm/deliver/cancel) rejected — `entregado` terminal; double-verify (`verificado`→`verificado`) rejected. All wrong-source cases throw `InvalidOrderStateError(id, expected, actual)`.
- [ ] 3.11 [GREEN] `domain/src/ventas/order.ts`: `interface Order` (incl. `deliveryMode`, `verifiedAt?`, `deliveredAt?`) + `type OrderStatus = 'creado'|'verificado'|'entregado'|'cancelado'` + `createOrder(input, rates, at)` + pure `confirmOrder`/`deliverOrder`/`cancelOrder` guards, to pass 3.7-3.10.
- [ ] 3.12 `domain/src/ventas/order-repository.port.ts`: `IOrderRepository { create; update; softDelete; findById; list(filter?); confirm(id); deliver(id); cancel(id) }` + `OrderListFilter { includeInactive?; customerId?; status? }` + `const ORDER_REPOSITORY = Symbol('IOrderRepository')`.
- [ ] 3.13 `domain/src/ventas/errors.ts`: `InvalidOrderError`, `InvalidOrderStateError(id, expected, actual)`; re-export `RateNotFoundError` from `currency/errors.ts` (no duplicate).
- [ ] 3.14 `domain/src/ventas/index.ts` barrel (re-export all ventas files); add `export * from './ventas/index.js';` to `domain/src/index.ts` after the `customer` line.
- [ ] 3.15 Run `pnpm --filter @store-mgmt/domain test && pnpm --filter @store-mgmt/domain typecheck` — ventas + currency + inventory + all existing domain suites green; new barrel exports resolve cleanly.

## Phase 4: infra-db — Prisma Adapter (jest + real Postgres, `pnpm --filter @store-mgmt/infra-db test`)

- [ ] 4.1 Append `enum OrderStatus{creado verificado entregado cancelado}` + `enum DeliveryMode{recogida domicilio}` + `model Order @@map("sales_order")` + `model OrderLine @@map("order_line")` + `model OrderPayment @@map("order_payment")` + `model SaleCredit @@map("sale_credit")` (exact shapes from `design.md`) to `templates/packages/infra-db/prisma/schema.prisma`; add `Customer.orders`/`Customer.saleCredits`, `Warehouse.orders`, `Product.orderLines` inverse relations ONLY — additive-only, after the Inventory models.
- [ ] 4.2 Generate migration `add_ventas_module` (`pnpm --filter @store-mgmt/infra-db prisma:migrate`); confirm additive-only — `product`/`category`/`exchange_rate`/`warehouse`/`stock_level`/`stock_movement`/`customer` tables untouched (no `stock_level` column change; `reserved` already exists).
- [ ] 4.3 [RED] `infra-db/src/ventas/prisma-order.repository.spec.ts`: `create()` persists the aggregate (order+lines+payments+optional saleCredit) in one round-trip, `deliveryMode` required, initial `status='creado'`; `findById()` returns the full aggregate via one `include`; FK relations resolve both sides against real Customer/Warehouse/Product rows.
- [ ] 4.4 [GREEN] `infra-db/src/ventas/prisma-order.repository.ts`: `PrismaOrderRepository.create`/`findById` — one `prisma.$transaction` (insert order, `createMany` lines/payments, insert saleCredit when present) + one `include` read, to pass 4.3.
- [ ] 4.5 [RED] same spec file: `confirm(id)` on a `creado` order — guard rejects non-`creado` source (`InvalidOrderStateError`); on success: freezes rate+totals (`verifiedAt` set) AND reserves each line (`reserved += qty` via `applyReservationTx('reserve')`) atomically, NO `onHand`/`sale_out` change.
- [ ] 4.6 [GREEN] `PrismaOrderRepository.confirm`: one `$transaction` — guard source=`creado`, stamp freeze fields+`verifiedAt`, `applyReservationTx('reserve')` per line (design decision #4/#8), to pass 4.5.
- [ ] 4.7 [RED] same spec: `confirm` with one line's reserve exceeding available throws `InsufficientStockError`, the WHOLE tx rolls back — order stays `creado`, zero reservation persisted on ANY line (real Postgres, not mocked).
- [ ] 4.8 [GREEN] Confirm 4.7 passes against the shared guarded-UPDATE from 2.6 (no additional code expected); adjust only if rollback isn't all-or-nothing.
- [ ] 4.9 [RED] same spec: `deliver(id)` on a `verificado` order — guard rejects non-`verificado` source; on success: per line RELEASE (`reserved -= qty`) THEN `sale_out` (`onHand -= qty` via `applyStockMovementTx`) — release precedes `sale_out` (assert intermediate `available >= 0`); `deliveredAt` stamped, atomic.
- [ ] 4.10 [GREEN] `PrismaOrderRepository.deliver`: one `$transaction` — guard source=`verificado`, `applyReservationTx('release')` per line THEN `applyStockMovementTx(sale_out)` per line (release-before-`sale_out` ordering is load-bearing, decision #4), stamp `deliveredAt`, to pass 4.9.
- [ ] 4.11 [RED] same spec: `deliver` with one line's `sale_out` exceeding `onHand` throws `NegativeStockError`, the WHOLE tx rolls back — order stays `verificado`, released reservation reverts too (same-tx atomicity).
- [ ] 4.12 [GREEN] Confirm 4.11 passes against the shared guarded UPDATE (`applyStockMovementTx`) from the existing inventory extraction; adjust only if not atomic.
- [ ] 4.13 [RED] same spec: `cancel(id)` from `verificado` — RELEASE per line (`reserved -= qty`), `onHand` untouched, `status → cancelado`.
- [ ] 4.14 [RED] same spec: `cancel(id)` from `creado` — no stock effect (nothing reserved), `status → cancelado` directly.
- [ ] 4.15 [RED] same spec: `confirm`/`deliver`/`cancel` attempted on an `entregado` order all rejected with `InvalidOrderStateError` — `entregado` terminal, no mutation.
- [ ] 4.16 [GREEN] `PrismaOrderRepository.cancel`: one `$transaction` — guard source IN (`creado`,`verificado`); when source=`verificado` call `applyReservationTx('release')` per line; set `status=cancelado`; when source=`creado`, stock untouched, to pass 4.13-4.15.
- [ ] 4.17 [RED] same spec: a later `appendRate` (via `ICurrencyRepository`) does NOT move a `verificado` order's stamped `rateApplied`/totals — freeze is read-only; `findById` never recomputes from live rates.
- [ ] 4.18 [GREEN] Confirm 4.17 passes given `confirm` only stamps at transition time and `findById` maps stored columns verbatim (adjust mapping if it recomputes).
- [ ] 4.19 [RED] same spec: `softDelete()` flips `Order.active=false`; row + lines + payments + saleCredit remain `findById`-able.
- [ ] 4.20 [GREEN] `PrismaOrderRepository.softDelete`/`update`/`list` to pass 4.19 and the `IOrderRepository` contract.
- [ ] 4.21 Export `PrismaOrderRepository` from `infra-db/src/index.ts`.
- [ ] 4.22 [RED] `infra-db/src/ventas/seed.spec.ts`: seed produces demo orders (single-currency, mixed USD/MN, one split-payment, one credit sale) spanning `creado`/`verificado`/`entregado` exactly once; running twice does not duplicate (idempotent on a stable natural key).
- [ ] 4.23 [GREEN] `infra-db/src/ventas/seed.ts`: idempotent demo-order seed wired into the shared seed entrypoint alongside customer/inventory/product seeds, to pass 4.22.
- [ ] 4.24 Run `pnpm --filter @store-mgmt/infra-db test` full-green (existing currency/product/inventory/customer suites + new ventas + reservation suites); `lint`/`typecheck`/`build` exit 0.

## Phase 5: api-salesops — VentasModule (jest, `pnpm --filter @store-mgmt/api-salesops test`)

- [ ] 5.1 `apps/api-salesops/src/ventas/dto/*.ts`: `create-order.dto.ts` (`deliveryMode` required, lines+payments nested, no `total`/`currency` accepted), `update-order.dto.ts`, `order-response.dto.ts` (Money as decimal strings, dates ISO, `status`/`deliveryMode`/`verifiedAt`/`deliveredAt`, nested line/payment/saleCredit DTOs), `dto/index.ts`.
- [ ] 5.2 [RED] `ventas.service.spec.ts`: with mocked `ORDER_REPOSITORY`+`CURRENCY_REPOSITORY` — `create` loads rates, runs `createOrder` before persist, maps to response DTO; `confirm`/`deliver`/`cancel` delegate to the matching repo method and propagate `InvalidOrderStateError`/`InsufficientStockError`/`NegativeStockError`/`RateNotFoundError` unmapped.
- [ ] 5.3 [GREEN] `apps/api-salesops/src/ventas/ventas.service.ts` to pass 5.2.
- [ ] 5.4 [RED] `ventas.controller.spec.ts`: `POST /orders` → 201; `GET /orders` → active-only by default; `GET /orders/:id` → 200/404; `PATCH /orders/:id` → 200 (`creado` only); `DELETE /orders/:id` → soft-delete; `POST /orders/:id/confirm` → 200 with frozen snapshot + reserved stock; `POST /orders/:id/deliver` → 200 with consumed stock + `deliveredAt`; `POST /orders/:id/cancel` → 200.
- [ ] 5.5 [RED] same file: `InvalidOrderError` → 400; `InvalidOrderStateError` → 409; `RateNotFoundError` → 409; `InsufficientStockError` → 409 (confirm path); `NegativeStockError` → 409 (deliver path); unknown id → 404.
- [ ] 5.6 [GREEN] `apps/api-salesops/src/ventas/ventas.controller.ts` to pass 5.4-5.5, mapping errors via `withDomainErrorMapping` per design.
- [ ] 5.7 `apps/api-salesops/src/ventas/ventas.module.ts`: `imports: [InfraDbModule]`; providers `VentasService`, `{provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository}`; declares `VentasController`. Mirror `warehouse.module.ts`.
- [ ] 5.8 Wire `VentasModule` into `apps/api-salesops/src/app.module.ts` imports, alongside existing modules.
- [ ] 5.9 [RED] `apps/api-salesops/test/ventas.e2e-spec.ts`: full HTTP lifecycle against real Postgres — create mixed USD/MN order derives `USD`; split-payment order sums to total; `confirm` reserves stock + freezes rate (no `onHand` change); `deliver` consumes stock (`onHand -= qty`, reservation released) + stamps `deliveredAt`; `cancel` from `verificado` releases reservation, from `creado` no stock effect; `confirm` with insufficient stock → 409, order stays `creado`; cross-currency line/payment with no rate → 409 `RateNotFoundError`, no partial commit; `confirm`/`deliver`/`cancel` on an `entregado` order → 409 `InvalidOrderStateError`.
- [ ] 5.10 [GREEN] Wire fixes surfaced by 5.9 against the real DB/app wiring (expect none beyond 5.3/5.6 if design is followed).
- [ ] 5.11 Run `pnpm --filter @store-mgmt/api-salesops test && pnpm --filter @store-mgmt/api-salesops test:e2e` full-green; `typecheck`/`build` exit 0.

## Phase 6: Cross-cutting Verification

- [ ] 6.1 `pnpm --filter @store-mgmt/domain lint && pnpm --filter @store-mgmt/infra-db lint && pnpm --filter @store-mgmt/api-salesops lint` — `backend-boundaries --max-warnings 0` stays green; `domain → infra` edge remains forbidden (the Prisma `tx` in `applyStockMovementTx`/`applyReservationTx` never appears in `IOrderRepository`/`IStockLevelRepository`).
- [ ] 6.2 `rg -n "prisma\.(stock|order)" templates/packages/domain/src/ventas/ templates/packages/domain/src/inventory/` returns 0 matches — `Order` never writes stock or its own persistence rows directly, only via ports.
- [ ] 6.3 Run all three suites together (domain vitest, infra-db jest w/ real Postgres, api-salesops jest+e2e); confirm every scenario in `openspec/changes/backend-ventas/specs/salesops-ventas/spec.md` and `specs/salesops-currency/spec.md` is covered by at least one test.
- [ ] 6.4 Confirm `typecheck`/`build` green for all three packages together (domain rebuilt first so consumers see the new `ventas/` barrel exports, `convertirEntreMonedas`, and the extended `IStockLevelRepository`).
- [ ] 6.5 Commit work-unit by work-unit per the table above (6 commits), then push `salesops-ventas` — no PR opened, per owner delivery decision.

## Out of Scope (per design.md)

Devolución/return flow after `entregado` (compensating `onHand +=` + payment refund at frozen
rates — deferred, `docs/plans/ventas-devoluciones-flujo-diferido.md`) · Delivery states
(`despachando`/`transportando`) · commission (Gestores+Comisiones module) · payment gateways ·
tax engine · promotions engine · invoice/receipt documents · reservation-expiry timer ·
`@CurrentUser`/`createdBy` (future Usuarios module).
