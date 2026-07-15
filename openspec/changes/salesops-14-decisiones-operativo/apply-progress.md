# Apply Progress — `salesops-14-decisiones-operativo`

## Batch 1 — Phase 0: Foundation (PR1) — DONE, committed (`3049877`)

**Mode**: Strict TDD (RED → GREEN, verified per task)
**Delivery**: Single PR, `size:exception`, on current branch `salesops-mvp`, not pushed.

### Completed Tasks

- [x] 0.1 RED: test `splitByPeriodDays(state, days)` in `period-trend.test.ts`
- [x] 0.2 GREEN: implement `splitByPeriodDays` in `domain/period-trend.ts`; `splitByPeriod` now delegates to `splitByPeriodDays(state, 10)`
- [x] 0.3 RED: test `windowedState(state, days)` in `decisiones-dashboard.test.ts`
- [x] 0.4 GREEN: implement `windowedState`, `WindowDays`, `ACTIVE_STATES`, `STAGE_DELAY_THRESHOLD_DAYS` in `domain/decisiones-dashboard.ts`
- [x] 0.5 RED: test `WAREHOUSE_COLORS` mapping in `warehouse-colors.test.ts`
- [x] 0.6 GREEN: create `components/decisiones/warehouse-colors.ts`

### TDD Cycle Evidence

| Task | RED (test written, confirmed failing) | GREEN (implementation, confirmed passing) | REFACTOR |
|------|------|------|------|
| 0.1/0.2 `splitByPeriodDays` | Added 4 tests to `period-trend.test.ts`; ran `vitest run app/domain/__tests__/period-trend.test.ts` — 4 failed with `TypeError: splitByPeriodDays is not a function` | Implemented `splitByPeriodDays` in `period-trend.ts`; re-ran — 16/16 passed | `splitByPeriod` rewritten as a 1-line delegate to `splitByPeriodDays(state, 10)`; existing `splitByPeriod` tests (both in `period-trend.test.ts` and `decisiones-dashboard.test.ts`) plus `finanzas-dashboard.test.ts` (27 tests, unmodified) confirm zero behavior change |
| 0.3/0.4 `windowedState` | Added 5 tests to `decisiones-dashboard.test.ts` (ACTIVE_STATES, STAGE_DELAY_THRESHOLD_DAYS, windowedState x3); ran suite — 5 failed (`is not a function` / `undefined`) | Implemented `windowedState`, `WindowDays`, `ACTIVE_STATES`, `STAGE_DELAY_THRESHOLD_DAYS`; re-ran — 27/27 passed | No refactor needed — new additive exports, no existing builder touched |
| 0.5/0.6 `WAREHOUSE_COLORS` | Created `warehouse-colors.test.ts`; ran — failed with module-resolution error (file doesn't exist) | Created `warehouse-colors.ts` with the 3-entry map; re-ran — 2/2 passed | N/A |

### Files Changed (Batch 1)

| File | Action | What Was Done |
|------|--------|---------------|
| `templates/apps/salesops-mvp/app/domain/period-trend.ts` | Modified | Added `splitByPeriodDays(state, days)`; `splitByPeriod` now delegates to it with `days=10` |
| `templates/apps/salesops-mvp/app/domain/__tests__/period-trend.test.ts` | Modified | Added `describe('splitByPeriodDays', ...)` — 4 new tests, including a delegate-equivalence test vs `splitByPeriod` |
| `templates/apps/salesops-mvp/app/domain/decisiones-dashboard.ts` | Modified | Added `WindowDays`, `ACTIVE_STATES`, `DelayStage`, `STAGE_DELAY_THRESHOLD_DAYS`, `windowedState(state, days)` — purely additive, no existing export touched |
| `templates/apps/salesops-mvp/app/domain/__tests__/decisiones-dashboard.test.ts` | Modified | Added `describe('ACTIVE_STATES', ...)`, `describe('STAGE_DELAY_THRESHOLD_DAYS', ...)`, `describe('windowedState', ...)` — 5 new tests |
| `templates/apps/salesops-mvp/app/components/decisiones/warehouse-colors.ts` | Created | `WAREHOUSE_COLORS` map keyed by `warehouseId`: `wh-1` `#16a34a` (verde), `wh-2` `#2563eb` (azul), `wh-3` `#eab308` (amarillo) |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/warehouse-colors.test.ts` | Created | 2 tests asserting the fixed color mapping |
| `openspec/changes/salesops-14-decisiones-operativo/tasks.md` | Modified | Checked off tasks 0.1–0.6 |

### Batch 1 Full Suite / Typecheck Confirmation

- `vitest run` (full suite, all 69 files at the time): **471/471 passed**
- `react-router typegen && tsc`: **exit 0, no errors**

---

## Batch 2 (this batch) — Phase 1: Capa 1.1 + 1.2 (PR2)

**Mode**: Strict TDD (RED → GREEN, verified per task)
**Delivery**: Single PR, `size:exception`, on current branch `salesops-mvp`, not pushed (per orchestrator instruction, committed locally only).
**Scope**: ONLY Capa 1.1 (`buildActiveOrdersByStateAndWarehouse` + `ActiveOrdersChart`) and Capa 1.2 (`buildTransportistaCapacity` + `TransportistaCapacity`). Capa 1.3, Capa 2, Capa 3, Análisis, and route recomposition are explicitly out of scope for this batch — not implemented, not wired.

### Completed Tasks

- [x] 1.1 RED: test `buildActiveOrdersByStateAndWarehouse` — exactly 3 states in order, zero-padded `(state, warehouse)` pairs (spec: Capa 1.1)
- [x] 1.2 GREEN: implement `buildActiveOrdersByStateAndWarehouse` in `decisiones-dashboard.ts`
- [x] 1.3 RED: test `ActiveOrdersChart` component — grouped bars, fixed `WAREHOUSE_COLORS`
- [x] 1.4 GREEN: create `components/decisiones/active-orders-chart.tsx`
- [x] 1.5 RED: test `buildTransportistaCapacity` — ocupado/disponible, "Sin chofer" count (spec: Capa 1.2)
- [x] 1.6 GREEN: implement `buildTransportistaCapacity`
- [x] 1.7 RED: test `TransportistaCapacity` component
- [x] 1.8 GREEN: create `components/decisiones/transportista-capacity.tsx`

### TDD Cycle Evidence

| Task | RED (test written, confirmed failing) | GREEN (implementation, confirmed passing) | REFACTOR |
|------|------|------|------|
| 1.1/1.2 `buildActiveOrdersByStateAndWarehouse` | Added 3 tests to `decisiones-dashboard.test.ts` (exact 3-state order, zero-pad, group total sum); ran `vitest run app/domain/__tests__/decisiones-dashboard.test.ts` — 6 failed (`buildActiveOrdersByStateAndWarehouse is not a function`, plus 3 for the next task in the same run) | Implemented `buildActiveOrdersByStateAndWarehouse` (+ `ActiveOrdersCell`/`ActiveOrdersStateGroup`/`ActiveOrdersView`) in `decisiones-dashboard.ts`, reusing existing `STAGE_LABELS` and `ACTIVE_STATES`; re-ran — 33/33 passed | None needed — purely additive, new section placed between `buildInventoryAlerts` and the orchestrator |
| 1.3/1.4 `ActiveOrdersChart` | Created `active-orders-chart.test.tsx` (4 tests: 3-state labels only, 9 zero-padded bars colored by fixed `WAREHOUSE_COLORS`, zero-total rendering, no "decisiones" in heading); ran — failed with module-resolution error (component file doesn't exist) | Created `active-orders-chart.tsx` — custom grouped-bar layout (not the generic `BarChart` primitive, since `WAREHOUSE_COLORS` is raw hex and `BarChart`'s palette is Tailwind-class-based); added `DECISIONES_HELP.pedidosActivos`; re-ran — 4/4 passed | None needed |
| 1.5/1.6 `buildTransportistaCapacity` | Added 3 tests to `decisiones-dashboard.test.ts` (ocupado classification, disponible classification, sin-chofer count independent of ocupado/disponible); ran — 3 failed (`is not a function`) | Implemented `buildTransportistaCapacity` (+ `TransportistaCapacityRow`/`TransportistaCapacityView`) in `decisiones-dashboard.ts`; re-ran — 33/33 passed | None needed |
| 1.7/1.8 `TransportistaCapacity` | Created `transportista-capacity.test.tsx` (3 tests: totals, per-row Ocupado/Disponible pill, no "decisiones" in heading); ran — failed with module-resolution error | Created `transportista-capacity.tsx`; added `DECISIONES_HELP.transportistas`; first run hit a "multiple elements with text '1'" ambiguity (disponibles=1 and transportando=1 both render bare "1") — fixed the TEST (not the component) to scope by the surrounding label text (`getByText(/disponibles/)` etc.); re-ran — 3/3 passed | Test-only fix, no component change |

### Files Changed (Batch 2)

| File | Action | What Was Done |
|------|--------|---------------|
| `templates/apps/salesops-mvp/app/domain/decisiones-dashboard.ts` | Modified | Added `ActiveOrdersCell`/`ActiveOrdersStateGroup`/`ActiveOrdersView`/`buildActiveOrdersByStateAndWarehouse` and `TransportistaCapacityRow`/`TransportistaCapacityView`/`buildTransportistaCapacity` — new section between `buildInventoryAlerts` and the orchestrator. No existing export modified, orchestrator untouched (route wiring is PR7). |
| `templates/apps/salesops-mvp/app/domain/__tests__/decisiones-dashboard.test.ts` | Modified | Added `describe('buildActiveOrdersByStateAndWarehouse', ...)` (3 tests) and `describe('buildTransportistaCapacity', ...)` (3 tests) |
| `templates/apps/salesops-mvp/app/components/decisiones/active-orders-chart.tsx` | Created | Capa 1.1 leaf — grouped bar chart, one group per `ACTIVE_STATES` entry, one bar per warehouse, colored via `WAREHOUSE_COLORS` (inline style, since the color source is raw hex, not a Tailwind palette key) |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/active-orders-chart.test.tsx` | Created | 4 tests |
| `templates/apps/salesops-mvp/app/components/decisiones/transportista-capacity.tsx` | Created | Capa 1.2 leaf — disponibles/en camino/sin chofer totals + per-transportista Ocupado/Disponible list |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/transportista-capacity.test.tsx` | Created | 3 tests |
| `templates/apps/salesops-mvp/app/components/decisiones/help-content.ts` | Modified | Added `DECISIONES_HELP.pedidosActivos` and `DECISIONES_HELP.transportistas` entries (new "Capa 1 — Pulso inmediato" section, additive; old KPI/trend entries untouched — their removal is Phase 4 task 4.7) |
| `openspec/changes/salesops-14-decisiones-operativo/tasks.md` | Modified | Checked off tasks 1.1–1.8 |

### Deviations from Design

None — implementation matches design.md's Capa 1.1/1.2 interface contracts exactly (`ActiveOrdersCell`/`ActiveOrdersStateGroup`/`ActiveOrdersView`, `TransportistaCapacityRow`/`TransportistaCapacityView`, field names and semantics). One implementation detail not pre-specified by design: `ActiveOrdersChart` does NOT reuse the generic `BarChart` primitive (unlike `WarehouseSales`/`StageDistribution`) because `BarChart`'s `colorKey` mechanism resolves to a fixed Tailwind-class palette (`palette.ts`), and `WAREHOUSE_COLORS` is a raw-hex map per warehouseId — the two color systems are incompatible. `ActiveOrdersChart` is a self-contained grouped-bar layout using inline `style={{ backgroundColor }}`. This is presentation-only and does not affect the domain builder or its consumers.

### Issues Found

One test-writing mistake (not a design/implementation issue): the first draft of the `TransportistaCapacity` component test asserted `getByText('1')` for two different totals (disponibles=1, transportando=1), which is ambiguous since both render bare "1" text nodes. Fixed by scoping the assertion to the labeled span (`getByText(/disponibles/)` etc.) instead of the component. No production code was affected.

### Full Suite / Typecheck Confirmation (Batch 2)

- `vitest run` (full suite, all 71 files): **484/484 passed**
- `react-router typegen && tsc`: **exit 0, no errors**

### Remaining Tasks (next batches)

- [ ] 1.9–1.12 Capa 1.3 — Comisiones por pagar (PR3)
- [ ] Phase 2: Capa 2 — Qué Atiendo YA (tasks 2.1–2.5) — PR3
- [ ] Phase 3: Capa 3 — Comportamiento en el Tiempo (tasks 3.1–3.18) — PR4/PR5
- [ ] Phase 4: Análisis + Route Recomposition + Cleanup (tasks 4.1–4.10) — PR6/PR7/PR8

### Workload / PR Boundary

- Mode: single PR, `size:exception` (explicitly authorized by the orchestrator for this batch)
- Current work unit: Unit 2 (Capa 1.1 + 1.2, PR2 per tasks.md's Suggested Work Units table)
- Boundary: starts from the clean, committed Phase 0 tree (`3049877`) on `salesops-mvp`; ends with `buildActiveOrdersByStateAndWarehouse`/`ActiveOrdersChart` and `buildTransportistaCapacity`/`TransportistaCapacity` implemented, tested, and typechecked — no consumers wired yet (route recomposition is PR7, not touched this batch)
- Estimated review budget impact: ~330 changed lines (domain builders + 2 leaf components + 2 test files + help-content entries), matches the tasks.md forecast for PR2, under the 400-line budget
- Commit: created as the final step of this batch, on the current branch, not pushed
