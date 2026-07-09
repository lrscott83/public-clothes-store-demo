# Tasks: Pantalla 3 — Operador de almacén (salesops-05-operador-almacen, Task 5)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650-800 (types/seed delta + 2 store transitions + widened board/column/card + 2 new components + container rewrite, all with tests) |
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
| 1 | Types delta + seed backfill (Phase 1) | No store/UI; safe to land first |
| 2 | Store transitions `assignTransportista`/`markDelivered` (Phase 2) | Depends on Unit 1 |
| 3 | Board widening + new picker/selector components (Phases 3-4) | Depends on Units 1-2 |
| 4 | Container wiring + regression (Phase 5) | Depends on Units 1-3 |

All units land in one direct commit this session per delivery instructions; split shown only for internal sequencing.

## Phase 1: Types & Seed Delta

- [x] 1.1 Edit `templates/apps/salesops-mvp/app/domain/types.ts`: add optional `phone?: string` and `zona?: string` to `Transportista`.
- [x] 1.2 Edit `templates/apps/salesops-mvp/app/seed/constants.ts`: add `phone`/`zona` literals to all 3 `TRANSPORTISTAS` entries.
- [x] 1.3 Run Task 2's seed/determinism suite + `app/store/__tests__/seed-store.test.ts` — confirm all green, unaffected by the additive edit (fields not fed to PRNG).

## Phase 2: Store transitions

- [x] 2.1 RED — extend `app/store/__tests__/seed-store.test.ts` with `assignTransportista` suite: `verificado→transportando`; sets `transportistaId` to the selected carrier's id; stamps `transportingAt` = injected `now`; persists across `loadSeedState` reload; **throws** on non-`verificado`; immutability regression (verify+assign at rate 40 with `totalMN:8000`/`commissionMN:30` → mutate `state.exchangeRates.usdToMn` + `saveSeedState` → reload → assert `exchangeRateSnapshot`/`totalMN`/`commissionMN` UNCHANGED). Run `pnpm --filter salesops-mvp test`, confirm failing (export missing).
- [x] 2.2 GREEN — implement `assignTransportista(id, transportistaId, now = new Date())` in `app/store/seed-store.ts`, built over the existing private `updateOrder` helper: guard `state === 'verificado'` (throw otherwise), mutate ONLY `transportistaId`, `state = 'transportando'`, `transportingAt = now.toISOString()`. Run, confirm passing.
- [x] 2.3 RED — extend `app/store/__tests__/seed-store.test.ts` with `markDelivered` suite: `transportando→entregado`; stamps `deliveredAt` = injected `now`; frozen fields (`exchangeRateSnapshot`/`totalMN`/`commissionMN`) UNTOUCHED; persists across reload; **throws** on non-`transportando`. Run vitest, confirm failing.
- [x] 2.4 GREEN — implement `markDelivered(id, now = new Date())` over `updateOrder`: guard `state === 'transportando'`, mutate ONLY `state = 'entregado'`, `deliveredAt = now.toISOString()`. Run, confirm passing.
- [x] 2.5 RED — extend `app/store/__tests__/seed-store.test.ts`: `resetDemo` discards `assignTransportista`/`markDelivered` transitions (regenerated `SeedState.orders` reverts to deterministic seed state). Run vitest, confirm failing.
- [x] 2.6 GREEN — confirm `resetDemo`'s existing regenerate-and-overwrite path already satisfies 2.5 (no new prod code expected). Run, confirm passing.

## Phase 3: Shared board widening (backward-compatible extension)

- [x] 3.1 RED — extend `app/components/tablero/__tests__/order-card.test.tsx`: `onRevisar`/`onMarkPaid` become optional (omit them, confirm no crash, no button); NEW cases — `onAsignarTransportista` renders "Asignar transportista" ONLY when `state === 'verificado'`; `onMarcarEntregado` renders "Marcar entregado" ONLY when `state === 'transportando'`; existing no-button-on-transportando assertion (from Task 4) MUST still pass unedited. Run vitest, confirm failing (props/behavior missing).
- [x] 3.2 GREEN — edit `app/components/tablero/order-card.tsx`: widen `OrderCardProps.onRevisar`/`onMarkPaid` to optional, add optional `onAsignarTransportista?: (id: string) => void` and `onMarcarEntregado?: (id: string) => void`; guard every button with `state === X && callback`. Run, confirm passing.
- [x] 3.3 RED — extend `app/components/tablero/__tests__/order-column.test.tsx`: `onRevisar`/`onMarkPaid` optional; new optional `onAsignarTransportista`/`onMarcarEntregado` pass through to `OrderCard`. Run vitest, confirm failing.
- [x] 3.4 GREEN — edit `app/components/tablero/order-column.tsx`: widen `OrderColumnProps` to match 3.3, forward new props to `OrderCard`. Run, confirm passing.
- [x] 3.5 RED — extend `app/components/tablero/__tests__/kanban-board.test.tsx`: NEW case — `visibleStates={['verificado', 'transportando', 'entregado']}` renders exactly 3 columns in that order; existing exactly-5-columns case (no `visibleStates` passed) MUST still pass unedited; `onAsignarTransportista`/`onMarcarEntregado` pass through to columns/cards. Run vitest, confirm failing.
- [x] 3.6 GREEN — edit `app/components/tablero/kanban-board.tsx`: widen `KanbanBoardProps.onRevisar`/`onMarkPaid` to optional, add optional `onAsignarTransportista`/`onMarcarEntregado`, add optional `visibleStates?: OrderState[]` defaulting to `COLUMN_ORDER` (all 5), render `(visibleStates ?? COLUMN_ORDER).map(...)`. Run, confirm passing.
- [x] 3.7 Verify Task 4's `order-card.test.tsx` no-button-on-transportando case and `kanban-board.test.tsx` exactly-5-columns case pass WITHOUT any edits to those specific assertions.

## Phase 4: New presentational components (direct-render tested)

- [x] 4.1 RED — `app/components/tablero/__tests__/transportista-picker.test.tsx`: render `<TransportistaPicker/>` directly with `order`/`transportistas`/`selectedTransportistaId`/`onSelect`/`onConfirm`/`onBack`; radio fieldset lists each carrier's `name` + (when present) `phone`/`zona`; "Confirmar" disabled until a carrier is selected; `fireEvent.click`/`fireEvent.change` fire `onSelect`/`onConfirm`/`onBack`. Run vitest, confirm failing (module missing).
- [x] 4.2 GREEN — create `app/components/tablero/transportista-picker.tsx` (mirrors `order-review.tsx` structure + `warehouse-step.tsx` radio-fieldset pattern — `templates/apps/salesops-mvp/app/components/pedido/warehouse-step.tsx`). Run, confirm passing.
- [x] 4.3 RED — `app/components/tablero/__tests__/warehouse-selector.test.tsx`: render `<WarehouseSelector/>` directly with `warehouses`/`selectedWarehouseId`/`onSelect`; radio fieldset lists each warehouse's `name`; selected warehouse's radio is checked; `fireEvent.change` fires `onSelect` with the clicked warehouse's id. Run vitest, confirm failing.
- [x] 4.4 GREEN — create `app/components/tablero/warehouse-selector.tsx` (radio-fieldset, no `<select>`, always has a selection). Run, confirm passing.

## Phase 5: Container wiring + regression

- [x] 5.1 RED — create `app/routes/__tests__/operador-almacen.test.tsx`: `render(<OperadorAlmacen/>)` directly (no router stub); warehouse selector + 3-column board (`verificado`/`transportando`/`entregado`) render, filtered to the default (first) warehouse; switching the selector re-filters the board to the newly selected warehouse without unmounting; "Asignar transportista" on a `verificado` order swaps to the picker view; confirming a carrier calls `assignTransportista`, swaps back to board, order now appears in the `transportando` column; "Marcar entregado" on a `transportando` order calls `markDelivered` and moves it to the `entregado` column; `<h1>` heading (`/operador de almacén/i`) persists across all views. Run vitest, confirm failing.
- [x] 5.2 GREEN — rewrite `app/routes/operador-almacen.tsx` as a container mirroring `operador-gestores.tsx`: `useState` for `orders` (`() => loadSeedState().orders`), `view: 'board' | 'asignar'`, `selectedOrderId: string | null`, `selectedWarehouseId` (default `warehouses[0].id` from `loadSeedState()`), `selectedTransportistaId: string | null`; handlers `handleAsignarTransportista` (opens picker), `handleSelectTransportista`, `handleConfirmAsignar` (`assignTransportista` → `reloadOrders()` → back to board), `handleMarcarEntregado` (`markDelivered` → `reloadOrders()`), `handleSelectWarehouse`, `handleBack`; derive `visibleOrders = orders.filter(o => o.warehouseId === selectedWarehouseId)`; render `KanbanBoard` with `visibleStates={['verificado', 'transportando', 'entregado']}` and ONLY `onAsignarTransportista`/`onMarcarEntregado` (no `onRevisar`/`onMarkPaid`); persistent `<h1>Operador de almacén</h1>`. Run, confirm passing.
- [x] 5.3 Verify `app/routes/__tests__/routes.test.tsx` still passes (`/operador de almacén/i` heading on initial render, stub uses plain `Component`, no loaders/actions).
- [x] 5.4 Run the full `salesops-mvp` vitest suite (`pnpm --filter salesops-mvp test`) — confirm all green, including Task 2's seed/determinism suite and Task 4's tablero/operador-gestores suites (regression per 1.3 and 3.7).

## Verification

- [x] `pnpm --filter salesops-mvp typecheck` — confirmed no type errors (widened optional props, new `Transportista` fields). Exit code 0.
- [x] `pnpm --filter salesops-mvp test` — confirmed full suite green: 31 files / 188 tests passing (new + Task 2/Task 4 regression suites).
