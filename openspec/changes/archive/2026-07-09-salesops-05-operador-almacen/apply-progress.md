# Apply Progress: Pantalla 3 — Operador de almacén (salesops-05-operador-almacen, Task 5)

**Mode**: Strict TDD (RED → GREEN per task, all confirmed with real `vitest run` output)
**Delivery**: size:exception, direct commit to `salesops-mvp`, no PR (this apply batch does NOT commit — orchestrator commits after sdd-verify)
**Batch**: Single batch, all 22 tasks (Phases 1-5)

## Review Workload Forecast (from tasks.md)

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650-800 |
| 400-line budget risk | High |
| Chained PRs recommended | No — session delivery is direct commit, no PR |
| Delivery strategy | direct-commit (no-PR) |
| Chain strategy | size-exception |

## Completed Tasks

### Phase 1: Types & Seed Delta
- [x] 1.1 `app/domain/types.ts`: added optional `phone?: string`/`zona?: string` to `Transportista`.
- [x] 1.2 `app/seed/constants.ts`: backfilled `phone`/`zona` literals on all 3 `TRANSPORTISTAS` entries.
- [x] 1.3 Ran `generate.determinism.test.ts` + `seed-store.test.ts` — 24/24 green, unaffected (fields not fed to PRNG).

### Phase 2: Store transitions
- [x] 2.1 RED — extended `seed-store.test.ts` with `assignTransportista` suite (transition, persistence, throw-guard, immutability regression). Confirmed failing (`assignTransportista is not a function`).
- [x] 2.2 GREEN — implemented `assignTransportista(id, transportistaId, now = new Date())` in `seed-store.ts` over `updateOrder`. Confirmed passing.
- [x] 2.3 RED — extended `seed-store.test.ts` with `markDelivered` suite. Confirmed failing.
- [x] 2.4 GREEN — implemented `markDelivered(id, now = new Date())` over `updateOrder`. Confirmed passing.
- [x] 2.5 RED — added `resetDemo` discard test for the two new transitions (same batch as 2.1/2.3 edit). Confirmed failing until 2.2/2.4 landed.
- [x] 2.6 GREEN — confirmed `resetDemo`'s existing regenerate-and-overwrite path satisfies 2.5 with no new prod code. Confirmed passing (32/32 in `seed-store.test.ts`).

### Phase 3: Shared board widening (backward-compatible extension)
- [x] 3.1 RED — extended `order-card.test.tsx`: optional `onRevisar`/`onMarkPaid`, new `onAsignarTransportista`/`onMarcarEntregado` cases. Confirmed failing.
- [x] 3.2 GREEN — widened `order-card.tsx` props to optional, added guarded `onAsignarTransportista`/`onMarcarEntregado` buttons. Confirmed passing.
- [x] 3.3 RED — extended `order-column.test.tsx` with the same optional/new-prop cases. Confirmed failing.
- [x] 3.4 GREEN — widened `order-column.tsx`, forwarded new props to `OrderCard`. Confirmed passing.
- [x] 3.5 RED — extended `kanban-board.test.tsx` with `visibleStates`-narrowed-to-3-columns case + new-callback passthrough. Confirmed failing.
- [x] 3.6 GREEN — widened `kanban-board.tsx`: optional `onRevisar`/`onMarkPaid`, new optional callbacks, `visibleStates?: OrderState[]` defaulting to `COLUMN_ORDER`. Confirmed passing.
- [x] 3.7 Verified Task 4's `order-card.test.tsx` no-button-on-transportando case and `kanban-board.test.tsx` exactly-5-columns case pass UNEDITED (only new test cases were appended, no existing assertions touched).

### Phase 4: New presentational components
- [x] 4.1 RED — created `transportista-picker.test.tsx` (radio fieldset, phone/zona display, disabled-until-selected Confirmar, onSelect/onConfirm/onBack). Confirmed failing (module missing).
- [x] 4.2 GREEN — created `app/components/tablero/transportista-picker.tsx` (mirrors `order-review.tsx` layout + `warehouse-step.tsx` radio-fieldset pattern). Confirmed passing.
- [x] 4.3 RED — created `warehouse-selector.test.tsx` (radio fieldset, checked-state, onSelect). Confirmed failing.
- [x] 4.4 GREEN — created `app/components/tablero/warehouse-selector.tsx` (radio-fieldset, no `<select>`, always has a selection). Confirmed passing.

### Phase 5: Container wiring + regression
- [x] 5.1 RED — created `app/routes/__tests__/operador-almacen.test.tsx`: warehouse-filtered 3-column board, selector re-filter, asignar-transportista flow, marcar-entregado flow, persistent heading. Confirmed failing against the placeholder screen.
- [x] 5.2 GREEN — rewrote `app/routes/operador-almacen.tsx` as a container mirroring `operador-gestores.tsx`: `useState` orders/view/selectedOrderId/selectedWarehouseId/selectedTransportistaId; handlers `handleAsignarTransportista`/`handleSelectTransportista`/`handleConfirmAsignar`/`handleMarcarEntregado`/`handleSelectWarehouse`/`handleBack`; `visibleOrders` filtered by `selectedWarehouseId`; `KanbanBoard` rendered with `visibleStates={['verificado','transportando','entregado']}` and only the two almacén callbacks. Confirmed passing.
- [x] 5.3 Verified `app/routes/__tests__/routes.test.tsx` still passes (9/9) — `/operador de almacén/i` heading resolves via the rewritten container, no loader/action changes needed.
- [x] 5.4 Ran the full `salesops-mvp` vitest suite — 31 files / 188 tests, all green (includes Task 2 seed/determinism suite and Task 4 tablero/operador-gestores regression suites).

## TDD Cycle Evidence

| Task | RED (failing test first) | GREEN (implementation passes) | REFACTOR |
|------|---------------------------|-------------------------------|----------|
| 2.1/2.2 assignTransportista | ✅ `assignTransportista is not a function` | ✅ 32/32 seed-store tests pass | None needed |
| 2.3/2.4 markDelivered | ✅ failing before impl (same run as above) | ✅ passes | None needed |
| 2.5/2.6 resetDemo discard | ✅ failing until 2.2/2.4 landed | ✅ passes (existing regenerate path) | None |
| 3.1/3.2 order-card widen | ✅ missing props/behavior | ✅ 11/11 order-card tests pass | None |
| 3.3/3.4 order-column widen | ✅ missing props/behavior | ✅ 8/8 order-column tests pass | None |
| 3.5/3.6 kanban-board widen | ✅ missing visibleStates | ✅ 5/5 kanban-board tests pass | None |
| 4.1/4.2 transportista-picker | ✅ module not found | ✅ 6/6 tests pass | None |
| 4.3/4.4 warehouse-selector | ✅ module not found | ✅ 3/3 tests pass | None |
| 5.1/5.2 operador-almacen container | ✅ 5/5 failing against placeholder | ✅ 5/5 passing after rewrite | None |

## Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `app/domain/types.ts` | Modified | Added optional `phone?`/`zona?` to `Transportista` |
| `app/seed/constants.ts` | Modified | Backfilled `phone`/`zona` on all 3 `TRANSPORTISTAS` |
| `app/store/seed-store.ts` | Modified | Added `assignTransportista`, `markDelivered` (both over `updateOrder`, both guard state and leave frozen fields untouched) |
| `app/store/__tests__/seed-store.test.ts` | Modified | Added `assignTransportista`/`markDelivered` suites incl. 2 immutability regression tests + `resetDemo` discard case |
| `app/components/tablero/order-card.tsx` | Modified | Widened `onRevisar`/`onMarkPaid` to optional; added guarded `onAsignarTransportista`/`onMarcarEntregado` |
| `app/components/tablero/__tests__/order-card.test.tsx` | Modified | Added optional-props + new-action cases (existing assertions untouched) |
| `app/components/tablero/order-column.tsx` | Modified | Widened props to match order-card, forwards new callbacks |
| `app/components/tablero/__tests__/order-column.test.tsx` | Modified | Added optional-props + new-callback passthrough cases |
| `app/components/tablero/kanban-board.tsx` | Modified | Widened props, added `visibleStates?: OrderState[]` (default `COLUMN_ORDER`) |
| `app/components/tablero/__tests__/kanban-board.test.tsx` | Modified | Added `visibleStates`-narrowed case + callback passthrough case |
| `app/components/tablero/transportista-picker.tsx` | Created | Radio-fieldset carrier picker (name/phone/zona), disabled-until-selected Confirmar |
| `app/components/tablero/__tests__/transportista-picker.test.tsx` | Created | 6 tests covering rendering, radio-not-select, disabled state, onSelect/onConfirm/onBack |
| `app/components/tablero/warehouse-selector.tsx` | Created | Radio-fieldset warehouse selector, always has a selection |
| `app/components/tablero/__tests__/warehouse-selector.test.tsx` | Created | 3 tests covering rendering, checked state, onSelect |
| `app/routes/operador-almacen.tsx` | Rewritten | Replaced `PlaceholderScreen` with board↔picker container mirroring `operador-gestores.tsx` |
| `app/routes/__tests__/operador-almacen.test.tsx` | Created | 5 tests covering default-warehouse filter, selector re-filter, asignar flow, entregar flow, persistent heading |

## Deviations from Design

None — implementation matches design exactly (D1 extend+visibleStates, D2 picker-then-confirm, D3 in-screen selector, D4 phone?/zona? additive).

## Issues Found

None.

## Verification (real output)

`pnpm`/`npx vitest run` (from `templates/apps/salesops-mvp/`):
```
Test Files  31 passed (31)
     Tests  188 passed (188)
  Duration  2.03s
```

`npm run typecheck` (`react-router typegen && tsc`): exit code 0, no errors.

## Remaining Tasks

None — all 22 tasks complete.

## Post-Verify Follow-up Fixes (sdd-verify WARNINGs, both resolved)

`sdd-verify` passed 188/188 + typecheck clean, with 2 non-blocking WARNINGs. Both fixed in this follow-up pass, strict TDD maintained.

### WARNING #1 — source `transportistas` from `loadSeedState()`, not the static constants import

- **File**: `app/routes/operador-almacen.tsx`
- **Was**: `import { TRANSPORTISTAS } from '../seed/constants'` used directly as the `TransportistaPicker`'s `transportistas` prop.
- **Fix**: Removed the `TRANSPORTISTAS` import entirely. Destructured `transportistas` alongside `warehouses` from the same `loadSeedState()` call (`const { warehouses, transportistas } = loadSeedState();`) and passed that to `<TransportistaPicker transportistas={transportistas} .../>`. Matches design.md's "same place it reads orders" requirement and keeps the container in a single source of truth for all seed-derived data.
- **Verification**: `app/routes/__tests__/operador-almacen.test.tsx` (5 tests) still renders and passes unchanged — behavior is identical since seeded `transportistas` and the static `TRANSPORTISTAS` constant are byte-identical at this point in the demo lifecycle.

### WARNING #2 — strengthen `markDelivered` immutability test to mirror `assignTransportista`'s adversarial rate-mutation step

- **File**: `app/store/__tests__/seed-store.test.ts` (`markDelivered` describe block, "IMMUTABILITY regression" test)
- **Was**: Captured `verified` totals, called `assignTransportista`, then `markDelivered`, and asserted the frozen fields on the `delivered` result only — no adversarial rate mutation between assignment and delivery, unlike the `assignTransportista` counterpart test.
- **Fix**: Rewrote to mirror `assignTransportista`'s counterpart exactly: capture `assigned` (post-`assignTransportista`, pre-`markDelivered`) and assert its `exchangeRateSnapshot` first; then MUTATE `state.exchangeRates.usdToMn` to a different value (999) via `saveSeedState`; THEN call `markDelivered`; THEN assert `exchangeRateSnapshot`/`totalMN`/`commissionMN` are still exactly equal to the pre-mutation `verified` values, both on the `markDelivered` return value AND on a fresh `loadSeedState()` reload. Renamed the test to "...even after a later rate change" to match the counterpart's naming.
- **Result**: This is a test-only strengthening. The existing `markDelivered` implementation (guards `state === 'transportando'`, mutates ONLY `state`/`deliveredAt`, never reads `state.exchangeRates`) already satisfied the stronger assertion — **no implementation bug found**, test passed on first run after the edit (no RED phase was possible/needed since this only strengthens an assertion an already-correct implementation was going to satisfy; confirmed by running the full suite with the change applied and getting 188/188 green, including this specific test).

## Status

22/22 tasks complete + 2/2 post-verify WARNING fixes applied. Full suite green (188/188), typecheck clean (exit code 0). Ready for re-verify/archive. This apply batch did NOT commit (per instructions, both in the original run and this follow-up) — commit is deferred to the orchestrator.
