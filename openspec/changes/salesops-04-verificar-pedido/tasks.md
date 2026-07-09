# Tasks: Pantalla 2 — Operador de gestores verifica pedidos (salesops-04-verificar-pedido, Task 4)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750-950 (types delta + pure `verify.ts` + `updateOrder`/`verifyOrder`/`markCommissionPaid` + 4 presentational components + container rewrite, all with tests) |
| 400-line budget risk | High |
| Chained PRs recommended | No — session delivery is direct commit to `salesops-mvp`, no PR, no size limit |
| Suggested split | Single delivery (no PR flow this session) |
| Delivery strategy | direct-commit (no-PR) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Types delta + pure `domain/verify.ts` (Phases 1-2) | No store/UI; safe to land first |
| 2 | Store transitions `updateOrder`/`verifyOrder`/`markCommissionPaid` (Phase 3) | Depends on Unit 1 (`buildVerifiedTotals`) |
| 3 | Presentational tablero components + container wiring (Phases 4-5) | Depends on Units 1-2 |

All units land in one direct commit this session per delivery instructions; split shown only for internal sequencing.

## Phase 1: Types & Seed Delta

- [x] 1.1 Edit `app/domain/types.ts`: add optional `phone?: string` to `Gestor`.
- [x] 1.2 Edit `app/seed/constants.ts`: add `phone` literals to all 5 `GESTORES` entries.
- [x] 1.3 Run Task 2's seed/determinism suite + `app/store/__tests__/seed-store.test.ts` — confirm all green, unaffected by the additive edit.

## Phase 2: `buildVerifiedTotals` (pure)

- [x] 2.1 RED — create `app/domain/__tests__/verify.test.ts`: `exchangeRateSnapshot.usdToMn` echoes input; `totalMN === Math.round(totalUSD * usdToMn)` (incl. a fractional-round case); `commissionMN === sumOrderCommission(items)`. Run `pnpm --filter salesops-mvp test`, confirm failing (module missing).
- [x] 2.2 GREEN — create `app/domain/verify.ts` exporting `VerifiedTotals` + `buildVerifiedTotals(totalUSD, usdToMn, items)`; run, confirm passing.

## Phase 3: Store transitions

- [x] 3.1 RED — extend `app/store/__tests__/seed-store.test.ts` with `verifyOrder` suite: `creado→verificado`; freezes `exchangeRateSnapshot`/`totalMN`/`commissionMN` from CURRENT `state.exchangeRates.usdToMn` via `buildVerifiedTotals`; stamps `verifiedAt` = injected `now`; persists across `loadSeedState` reload; **throws** on non-`creado`; immutability regression (verify at rate 680 → mutate `state.exchangeRates.usdToMn` to 999 + `saveSeedState` → reload → assert the verified order's frozen fields are UNCHANGED). Run vitest, confirm failing.
- [x] 3.2 GREEN — implement private `updateOrder(id, mutator)` read-modify-write helper + `verifyOrder(id, now = new Date())` in `app/store/seed-store.ts`, built over `updateOrder` and `buildVerifiedTotals`. Run, confirm passing.
- [x] 3.3 RED — extend `app/store/__tests__/seed-store.test.ts` with `markCommissionPaid` suite: `entregado→comision_pagada`; stamps `commissionPaidAt` = injected `now`; frozen fields (`exchangeRateSnapshot`/`totalMN`/`commissionMN`) UNTOUCHED; persists across reload; **throws** on non-`entregado`. Run vitest, confirm failing.
- [x] 3.4 GREEN — implement `markCommissionPaid(id, now = new Date())` over `updateOrder`. Run, confirm passing.
- [x] 3.5 RED — extend `app/store/__tests__/seed-store.test.ts`: `resetDemo` discards `verifyOrder`/`markCommissionPaid` transitions (regenerated `SeedState.orders` reverts to deterministic seed state). Run vitest, confirm failing.
- [x] 3.6 GREEN — confirm `resetDemo`'s existing regenerate-and-overwrite path already satisfies 3.5 (no new prod code expected — persisted transitions live only in `localStorage` `SeedState.orders`, which `resetDemo` replaces). Run, confirm passing.

## Phase 4: Presentational tablero components (direct-render tested)

- [x] 4.1 RED — `app/components/tablero/__tests__/order-card.test.tsx`: render `<OrderCard/>` directly with an `order` prop + `onRevisar`/`onMarkPaid`; shows id/client/`totalUSD` (+ frozen `totalMN` when present); "Revisar" renders ONLY when `state==='creado'`; "Marcar comisión pagada" renders ONLY when `state==='entregado'`; `fireEvent.click` fires the right callback with the order id. Run vitest, confirm failing (module missing).
- [x] 4.2 GREEN — create `app/components/tablero/order-card.tsx`. Run, confirm passing.
- [x] 4.3 RED — `app/components/tablero/__tests__/order-column.test.tsx`: render `<OrderColumn/>` directly with `title`/`state`/`orders`/`onRevisar`/`onMarkPaid`; header + count render; one `OrderCard` per order; callbacks pass through. Run vitest, confirm failing.
- [x] 4.4 GREEN — create `app/components/tablero/order-column.tsx`. Run, confirm passing.
- [x] 4.5 RED — `app/components/tablero/__tests__/kanban-board.test.tsx`: render `<KanbanBoard/>` directly with `orders`/`onRevisar`/`onMarkPaid`; exactly 5 columns render; orders bucketed by `state` into the matching column; no D&D wiring exists (static structure). Run vitest, confirm failing.
- [x] 4.6 GREEN — create `app/components/tablero/kanban-board.tsx`. Run, confirm passing.
- [x] 4.7 RED — `app/components/tablero/__tests__/order-review.test.tsx`: render `<OrderReview/>` directly with `order`/`gestor`/`availableAtWarehouse`/`onAceptar`/`onBack`; items, client/delivery/payment data, gestor `name`+`phone`, informational availability line all render; "Aceptar" fires `onAceptar`; back action fires `onBack`. Run vitest, confirm failing.
- [x] 4.8 GREEN — create `app/components/tablero/order-review.tsx`. Run, confirm passing.

Component tests render directly with props/`fireEvent` — NO `createRoutesStub` with loaders/actions, avoiding the jsdom+undici RR7 `AbortSignal` gotcha.

## Phase 5: Container wiring + regression

- [x] 5.1 RED — create `app/routes/__tests__/operador-gestores.test.tsx`: `render(<OperadorGestores/>)` directly (no router stub); board shows 5 columns with seeded orders; "Revisar" on a `creado` order swaps to review view; "Aceptar" calls `verifyOrder`, swaps back to board, order now appears in the `verificado` column; "Marcar comisión pagada" on an `entregado` order swaps it to the `comision_pagada` column; `<h1>` heading (`/operador de gestores/i`) persists in both views. Run vitest, confirm failing.
- [x] 5.2 GREEN — rewrite `app/routes/operador-gestores.tsx` as container: `useState` for `orders` (`() => loadSeedState().orders`), `view: 'board' | 'review'`, `selectedOrderId: string | null`; handlers `handleRevisar`, `handleAceptar` (`verifyOrder` → `setOrders(loadSeedState().orders)` → `setView('board')`), `handleMarkPaid` (`markCommissionPaid` → reload), `handleBack`; derive `availableAtWarehouse` via `eligibleWarehouses(order.items, inventory, warehouses)` filtered to `order.warehouseId`; look up gestor from `GESTORES`. Run, confirm passing.
- [x] 5.3 Verify `app/routes/__tests__/routes.test.tsx` still passes (`/operador de gestores/i` heading on initial render, stub uses plain `Component`, no loaders/actions).
- [x] 5.4 Run the full `salesops-mvp` vitest suite (`pnpm --filter salesops-mvp test`) — confirm all green, including Task 2's seed/determinism suite (regression per 1.3).
