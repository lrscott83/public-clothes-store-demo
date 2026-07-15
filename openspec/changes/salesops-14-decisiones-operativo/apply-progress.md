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

---

## Batch 3 (this batch) — Phase 1.3 + Phase 2 (PR3)

**Mode**: Strict TDD (RED → GREEN, verified per task)
**Delivery**: Single PR, `size:exception`, on current branch `salesops-mvp`, committed (`3fd7f1b`), not pushed.
**Scope**: ONLY Capa 1.3 (`buildComisionesPorPagar` + `ComisionesPorPagar`) and Capa 2 (`buildPedidosDemorados` + `PedidosDemorados`, plus confirming `buildInventoryAlerts`/`InventoryAlerts` are already reusable unchanged for stock crítico). Capa 3, Análisis, and route recomposition are explicitly out of scope for this batch — not implemented, not wired.

### Completed Tasks

- [x] 1.9 RED: test `buildComisionesPorPagar` — total pending sum, one row per gestor (most overdue), sort desc `diasAtraso`
- [x] 1.10 GREEN: implement `buildComisionesPorPagar`
- [x] 1.11 RED: test `ComisionesPorPagar` component
- [x] 1.12 GREEN: create `components/decisiones/comisiones-por-pagar.tsx`
- [x] 2.1 RED: test `buildPedidosDemorados` — `STAGE_DELAY_THRESHOLD_DAYS` per stage, `stageEnteredAt` mapping, excludes `entregado`/`comision_pagada`, anchors to `generatedAt`
- [x] 2.2 GREEN: implement `buildPedidosDemorados`
- [x] 2.3 RED: test `PedidosDemorados` component — rows + antigüedad label
- [x] 2.4 GREEN: create `components/decisiones/pedidos-demorados.tsx`
- [x] 2.5 Confirmed `buildInventoryAlerts`/`InventoryAlerts` slot into Capa 2 unchanged — no domain/component change made; not yet wired into the route (route wiring is Phase 4/PR7)

### TDD Cycle Evidence

| Task | RED (test written, confirmed failing) | GREEN (implementation, confirmed passing) | REFACTOR |
|------|------|------|------|
| 1.9/1.10 `buildComisionesPorPagar` | Added 6 tests to `decisiones-dashboard.test.ts` (total pending sum excl. paid/creado, días de atraso anchored to generatedAt, at-most-one-row-per-gestor using most-overdue order, exclusion of gestors with only verificado/transportando pending, per-row total sums ALL pending not just overdue, desc sort); ran `vitest run app/domain/__tests__/decisiones-dashboard.test.ts` — 12 failed (`is not a function`) | Implemented `buildComisionesPorPagar`, reusing existing `isCommissionPending`/`sumCommissionMN`/`PENDING_COMMISSION_STATES` helpers (no duplication); re-ran — 45/45 passed | None needed — purely additive |
| 1.11/1.12 `ComisionesPorPagar` | Created `comisiones-por-pagar.test.tsx` (4 tests: total figure, per-gestor rows with días de atraso + comisión value, empty state, no "decisiones" in heading); ran — failed with module-resolution error (verified by temporarily moving the not-yet-created component path aside — confirmed "Failed to resolve import" before implementing) | Created `comisiones-por-pagar.tsx`; MN values render as plain text (`{value} MN`), matching the `kpi-header.tsx` convention (MN is not a `formatMoney`-supported currency); added `DECISIONES_HELP.comisionesPorPagar`; re-ran — 4/4 passed | None needed |
| 2.1/2.2 `buildPedidosDemorados` | Added 6 tests to `decisiones-dashboard.test.ts` (flags order past threshold, does not flag order within threshold, never evaluates entregado/comision_pagada, anchors to generatedAt not wall-clock, excludes verificado order missing verifiedAt, desc sort by diasEnEtapa); ran — 6 failed (`is not a function`) | Implemented `buildPedidosDemorados`, reusing existing `STAGE_LABELS`/`STAGE_DELAY_THRESHOLD_DAYS`/`DelayStage`; `stageEnteredAt` helper maps creado→createdAt, verificado→verifiedAt, transportando→transportingAt, returning `undefined` (excluded) when the field is absent; re-ran — 45/45 passed | None needed |
| 2.3/2.4 `PedidosDemorados` | Created `pedidos-demorados.test.tsx` (3 tests: rows with client name/stage label/age, empty state, no "decisiones" in heading); ran — failed with module-resolution error | Created `pedidos-demorados.tsx`; added `DECISIONES_HELP.pedidosDemorados`; re-ran — 3/3 passed | None needed |
| 2.5 `buildInventoryAlerts`/`InventoryAlerts` reuse | N/A — confirmation-only task | Read `domain/inventory.ts` (`buildInventorySummary`) and `decisiones-dashboard.ts`'s existing `buildInventoryAlerts`/`InventoryAlertsView`/`InventoryAlertGroup`/`InventoryAlertRow` plus `components/decisiones/inventory-alerts.tsx` — confirmed both are complete, tested (`buildInventoryAlerts` in `decisiones-dashboard.test.ts`, `InventoryAlerts` in `inventory-alerts.test.tsx`) and require zero changes for Capa 2 placement | N/A — no code touched |

### Files Changed (Batch 3)

| File | Action | What Was Done |
|------|--------|---------------|
| `templates/apps/salesops-mvp/app/domain/decisiones-dashboard.ts` | Modified | Added `ComisionAtrasadaRow`/`ComisionesPorPagarView`/`buildComisionesPorPagar` and `PedidoDemoradoRow`/`PedidosDemoradosView`/`stageEnteredAt`/`buildPedidosDemorados` — new section between `buildTransportistaCapacity` and the orchestrator. Reuses `isCommissionPending`, `sumCommissionMN`, `PENDING_COMMISSION_STATES`, `STAGE_LABELS`, `STAGE_DELAY_THRESHOLD_DAYS`, `DelayStage` — no existing export modified, orchestrator untouched. |
| `templates/apps/salesops-mvp/app/domain/__tests__/decisiones-dashboard.test.ts` | Modified | Added `describe('buildComisionesPorPagar', ...)` (6 tests) and `describe('buildPedidosDemorados', ...)` (6 tests) |
| `templates/apps/salesops-mvp/app/components/decisiones/comisiones-por-pagar.tsx` | Created | Capa 1.3 leaf — total pending MN + "más atrasadas" list (one row per gestor, días de atraso + comisión value) |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/comisiones-por-pagar.test.tsx` | Created | 4 tests |
| `templates/apps/salesops-mvp/app/components/decisiones/pedidos-demorados.tsx` | Created | Capa 2 leaf — one row per demorado order (client name, stage label, antigüedad in days), sorted desc by the domain builder |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/pedidos-demorados.test.tsx` | Created | 3 tests |
| `templates/apps/salesops-mvp/app/components/decisiones/help-content.ts` | Modified | Added `DECISIONES_HELP.comisionesPorPagar` and `DECISIONES_HELP.pedidosDemorados` entries — additive, old KPI/trend entries untouched (removal is Phase 4 task 4.7) |
| `openspec/changes/salesops-14-decisiones-operativo/tasks.md` | Modified | Checked off tasks 1.9–1.12 and 2.1–2.5 |

### Deviations from Design

None — implementation matches design.md's Capa 1.3/Capa 2 interface contracts exactly (`ComisionAtrasadaRow`/`ComisionesPorPagarView`, `PedidoDemoradoRow`/`PedidosDemoradosView`, field names and semantics; `STAGE_DELAY_THRESHOLD_DAYS` = `{creado:2, verificado:3, transportando:2}` used as-is from Batch 1). `buildInventoryAlerts`/`InventoryAlerts` reused with zero modification, per design's explicit instruction.

### Issues Found

None.

### Full Suite / Typecheck Confirmation (Batch 3)

- `vitest run` (full suite, all 73 files): **503/503 passed**
- `react-router typegen && tsc`: **exit 0, no errors**

### Remaining Tasks (after Batch 3)

- [ ] Phase 3: Capa 3 — Comportamiento en el Tiempo (tasks 3.1–3.18) — PR4/PR5
- [ ] Phase 4: Análisis + Route Recomposition + Cleanup (tasks 4.1–4.10) — PR6/PR7/PR8

### Workload / PR Boundary (Batch 3)

- Mode: single PR, `size:exception` (explicitly authorized by the orchestrator for this batch)
- Current work unit: Unit 3 (Capa 1.3 + Capa 2, PR3 per tasks.md's Suggested Work Units table)
- Boundary: starts from the committed Batch 2 tree on `salesops-mvp`; ends with `buildComisionesPorPagar`/`ComisionesPorPagar` and `buildPedidosDemorados`/`PedidosDemorados` implemented, tested, and typechecked, plus confirmation that `buildInventoryAlerts`/`InventoryAlerts` need no change — no consumers wired yet (route recomposition is Phase 4/PR7, not touched this batch)
- Estimated review budget impact: 499 changed lines (8 files: 1 domain module, 1 domain test file, 2 new leaf components, 2 new component test files, help-content, tasks.md) — above the tasks.md PR3 estimate (~380) and the 400-line guard budget, but within the `size:exception` explicitly authorized by the orchestrator for this batch (see delivery context above)
- Commit: `3fd7f1b`, on the current branch, not pushed

---

## Batch 4 (this batch) — Phase 3: Capa 3a (PR4)

**Mode**: Strict TDD (RED → GREEN, verified per task)
**Delivery**: Single PR, `size:exception`, on current branch `salesops-mvp`, committed, not pushed.
**Scope**: ONLY Capa 3a — `buildEntraVsSale` + `EntraVsSale`, `buildCicloPromedio` + `CicloPromedio`, and the shared `period-filter.tsx` `[7d/30d]` toggle. Capa 3b (pedidos/día, completados/día — PR5), Análisis, and route recomposition (PR7) are explicitly out of scope for this batch — not implemented, not wired.

### Completed Tasks

- [x] 3.1 RED: test `PeriodFilter` component — `[7d/30d]` toggle, calls `onChange`
- [x] 3.2 GREEN: create `components/decisiones/period-filter.tsx`
- [x] 3.3 RED: test `buildEntraVsSale` — creados/entregados counts in window, backlog signal
- [x] 3.4 GREEN: implement `buildEntraVsSale`
- [x] 3.5 RED: test `EntraVsSale` component
- [x] 3.6 GREEN: create `components/decisiones/entra-vs-sale.tsx`
- [x] 3.7 RED: test `buildCicloPromedio` — avg cycle days, Δ vs prior window, ÷0-safe
- [x] 3.8 GREEN: implement `buildCicloPromedio`
- [x] 3.9 RED: test `CicloPromedio` component
- [x] 3.10 GREEN: create `components/decisiones/ciclo-promedio.tsx`

### TDD Cycle Evidence

| Task | RED (test written, confirmed failing) | GREEN (implementation, confirmed passing) | REFACTOR |
|------|------|------|------|
| 3.3/3.4 `buildEntraVsSale` | Added 3 tests to `decisiones-dashboard.test.ts` (independent creados/entregados counts within the window, backlog signal when creados > entregados, anchored to `generatedAt`); ran `vitest run app/domain/__tests__/decisiones-dashboard.test.ts` — 6 failed (`is not a function`, includes 3 tests for the next task in the same run) | Implemented `buildEntraVsSale` reusing the same `[anchor-Nd, anchor)` window math as `splitByPeriodDays` (new private `inCurrentWindow`/`inPriorWindow` helpers, module-local, DRY within the file); re-ran — 51/51 passed | None needed |
| 3.7/3.8 `buildCicloPromedio` | Added 3 tests (avg cycle only counts delivered-in-window orders + excludes no-`deliveredAt` orders, `deltaDays` vs prior window of equal length, zero-prior-window safe delta — asserts `Number.isFinite` and exact `0`); ran — 3 failed (`is not a function`) | Implemented `buildCicloPromedio`; `deltaDays` is forced to `0` (not merely "technically finite") when the prior window has zero delivered orders, per design's "safe flat/neutral, never NaN/Infinity" requirement and the orchestrator's "mirroring existing KPI-trend pattern" guidance — mirrors `computeDelta`'s prior-is-zero guard from `period-trend.ts` but returns `0` (numeric, matches `deltaDays: number` in design's locked interface) instead of `null`; re-ran — 51/51 passed | None needed |
| 3.1/3.2 `PeriodFilter` | Created `period-filter.test.tsx` (4 tests: both options render, click 30d/7d calls `onChange` with the right value, `aria-pressed` reflects current value); ran — failed with module-resolution error | Created `period-filter.tsx` — controlled component (`value`/`onChange` props, no local `useState`), since `windowDays` is owned by the route per design (`useState<WindowDays>(7)`), shared across all 4 Capa 3 blocks; styled like the existing `Valor`/`Cantidad` toggle in `sales-trend-section.tsx`; re-ran — 4/4 passed | None needed |
| 3.5/3.6 `EntraVsSale` | Created `entra-vs-sale.test.tsx` (4 tests: renders both counts, shows backlog signal when `backlogDelta > 0`, hides it otherwise, no "decisiones" in heading); ran — failed with module-resolution error | Created `entra-vs-sale.tsx`; re-ran — 4/4 passed | None needed |
| 3.9/3.10 `CicloPromedio` | Created `ciclo-promedio.test.tsx` (4 tests: renders current avg, shows down-trend arrow for negative `deltaDays`, shows flat/no-arrow for `deltaDays: 0`, no "decisiones" in heading); ran — failed with module-resolution error | Created `ciclo-promedio.tsx` — does NOT reuse `StatTile` (its `delta` prop expects a fractional/percentage change; `CicloPromedioView.deltaDays` is an absolute day count, a different unit) — self-contained layout with its own up/down/flat arrow logic (`isUp`/`isDown` derived from `deltaDays` sign; rising cycle time is "bad" so the arrow color flips: up=red/danger, down=green/success); re-ran — 4/4 passed | None needed |

### Files Changed (Batch 4)

| File | Action | What Was Done |
|------|--------|---------------|
| `templates/apps/salesops-mvp/app/domain/decisiones-dashboard.ts` | Modified | Added private `inCurrentWindow`/`inPriorWindow` window helpers, `EntraVsSaleView`/`buildEntraVsSale`, `CicloPromedioView`/`buildCicloPromedio` — new section between `buildPedidosDemorados` and the orchestrator. No existing export modified, orchestrator untouched (route wiring is PR7). |
| `templates/apps/salesops-mvp/app/domain/__tests__/decisiones-dashboard.test.ts` | Modified | Added `describe('buildEntraVsSale', ...)` (3 tests) and `describe('buildCicloPromedio', ...)` (3 tests) |
| `templates/apps/salesops-mvp/app/components/decisiones/period-filter.tsx` | Created | Capa 3 shared leaf — controlled `[7d/30d]` toggle (`value`/`onChange`), no local state |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/period-filter.test.tsx` | Created | 4 tests |
| `templates/apps/salesops-mvp/app/components/decisiones/entra-vs-sale.tsx` | Created | Capa 3a leaf — creados/entregados side by side + backlog signal text |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/entra-vs-sale.test.tsx` | Created | 4 tests |
| `templates/apps/salesops-mvp/app/components/decisiones/ciclo-promedio.tsx` | Created | Capa 3a leaf — current avg cycle days + trend arrow vs. prior window |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/ciclo-promedio.test.tsx` | Created | 4 tests |
| `templates/apps/salesops-mvp/app/components/decisiones/help-content.ts` | Modified | Added `DECISIONES_HELP.entraVsSale` and `DECISIONES_HELP.cicloPromedio` entries — additive, old KPI/trend entries untouched (removal is Phase 4 task 4.7) |
| `openspec/changes/salesops-14-decisiones-operativo/tasks.md` | Modified | Checked off tasks 3.1–3.10 |

### Deviations from Design

None — implementation matches design.md's Capa 3a interface contracts exactly (`EntraVsSaleView`/`buildEntraVsSale`, `CicloPromedioView`/`buildCicloPromedio`, field names and semantics). One design ambiguity resolved: design's `CicloPromedioView.deltaDays` is typed `number` (not `number | null`) unlike `KpiTrend.delta` (`number | null`) in `period-trend.ts` — this batch interprets the "safe flat/neutral" requirement as `deltaDays = 0` when the prior window has zero delivered orders (rather than leaking `currentAvgDays - 0` as a misleading delta against an empty baseline), consistent with the orchestrator's explicit "mirroring existing KPI-trend pattern" instruction for this batch.

### Issues Found

None.

### Full Suite / Typecheck Confirmation (Batch 4)

- `vitest run` (full suite, all 76 files): **521/521 passed**
- `react-router typegen && tsc`: **exit 0, no errors**

### Remaining Tasks (next batches)

- [ ] Phase 3: Capa 3b — Pedidos por Día + Completados por Día (tasks 3.11–3.18) — PR5
- [ ] Phase 4: Análisis + Route Recomposition + Cleanup (tasks 4.1–4.10) — PR6/PR7/PR8

### Workload / PR Boundary (Batch 4)

- Mode: single PR, `size:exception` (explicitly authorized by the orchestrator for this batch)
- Current work unit: Unit 4 (Capa 3a, PR4 per tasks.md's Suggested Work Units table)
- Boundary: starts from the committed Batch 3 tree on `salesops-mvp`; ends with `buildEntraVsSale`/`EntraVsSale`, `buildCicloPromedio`/`CicloPromedio`, and `period-filter.tsx` implemented, tested, and typechecked — no consumers wired yet (route recomposition is Phase 4/PR7, not touched this batch; Capa 3b's `pedidos-por-dia`/`completados-por-dia` share the `PerDayPoint`/toggle pattern and are PR5, not touched this batch)
- Estimated review budget impact: ~10 files changed (1 domain module, 1 domain test file, 3 new leaf components, 3 new component test files, help-content, tasks.md) — within the tasks.md PR4 estimate (~350 lines)

---

## Batch 5 (this batch) — Phase 3: Capa 3b (PR5)

**Mode**: Strict TDD (RED → GREEN, verified per task)
**Delivery**: Single PR, `size:exception`, on current branch `salesops-mvp`, committed, not pushed.
**Scope**: ONLY Capa 3b — `buildPedidosPorDia` + `PedidosPorDia`, `buildCompletadosPorDia` + `CompletadosPorDia`. Análisis and route recomposition (PR6/PR7/PR8) are explicitly out of scope for this batch — not implemented, not wired.

### Completed Tasks

- [x] 3.11 RED: test `buildPedidosPorDia` — zero-padded days, avg + `Δ%`, 0-prior → "up" guard
- [x] 3.12 GREEN: implement `buildPedidosPorDia`
- [x] 3.13 RED: test `PedidosPorDia` component — Nº/valor toggle (local state)
- [x] 3.14 GREEN: create `components/decisiones/pedidos-por-dia.tsx`
- [x] 3.15 RED: test `buildCompletadosPorDia` — zero-padded days, `tasaCompletado = entregadosEnVentana / creadosEnVentana` (÷0→0)
- [x] 3.16 GREEN: implement `buildCompletadosPorDia`
- [x] 3.17 RED: test `CompletadosPorDia` component
- [x] 3.18 GREEN: create `components/decisiones/completados-por-dia.tsx`

### TDD Cycle Evidence

| Task | RED (test written, confirmed failing) | GREEN (implementation, confirmed passing) | REFACTOR |
|------|------|------|------|
| 3.11/3.12 `buildPedidosPorDia` | Added 5 tests to `decisiones-dashboard.test.ts` (zero-pad, bucket+avg, Δ% vs prior window, 0-prior null-guard, generatedAt anchor); ran `vitest run app/domain/__tests__/decisiones-dashboard.test.ts` — 10 failed (`is not a function`, includes 5 tests for the next task in the same run) | Implemented `buildPedidosPorDia` on top of a new shared private helper `buildPerDayBuckets(state, windowDays, pickTimestamp)` (one-pass zero-padded day bucketing + prior-window totals, reused by both Capa 3b builders); `countDeltaPercent`/`valueDeltaPercent` computed via `computeDelta` (imported from `period-trend.ts`) — returns `null` (never NaN/Infinity) when the prior average is 0, matching design's locked `number \| null` type; re-ran — 61/61 passed | None needed |
| 3.15/3.16 `buildCompletadosPorDia` | Added 5 tests (zero-pad by `deliveredAt`, bucket+avg, `tasaCompletado` = 6/8 per design's worked example, 0-creados safe-0 guard, generatedAt anchor); ran — 5 failed (`is not a function`) | Implemented `buildCompletadosPorDia` reusing `buildPerDayBuckets` (keyed on `deliveredAt`) and the existing `inCurrentWindow` helper for `creadosEnVentana` (same window-membership check as `buildEntraVsSale`); `tasaCompletado = creadosEnVentana > 0 ? totalCount / creadosEnVentana : 0` — LOCKED denominator = window's entry cohort (`createdAt` in window), per design.md's owner-confirmed decision; re-ran — 61/61 passed | None needed |
| 3.13/3.14 `PedidosPorDia` | Created `pedidos-por-dia.test.tsx` (7 tests: default Nº avg, toggle to Valor formatted via `formatMoney`, up/down delta arrows, null-delta "▲ nuevo" guard when current avg > 0, null-delta flat guard when current avg is 0, no "decisiones" in heading); ran — failed with module-resolution error | Created `pedidos-por-dia.tsx` — mirrors `sales-trend-section.tsx`'s local `useState<Series>` toggle + `AreaTrend` reuse; delta arrow logic follows `CicloPromedio`'s up/down/flat pattern but adds the `deltaPercent === null` branch (renders "▲ nuevo" when the current-period average is positive, flat "—" otherwise) — this satisfies the spec's "0-prior avg + current > 0 must show up, never Infinity%" requirement at the presentation layer, since the domain type is `number \| null` (not a `Trend` enum); re-ran — 7/7 passed | None needed |
| 3.17/3.18 `CompletadosPorDia` | Created `completados-por-dia.test.tsx` (7 tests: tasa de completado percentage, safe 0% tasa, default Nº avg, toggle to Valor, up delta on Nº series, null-delta "nuevo" guard, no "decisiones" in heading); ran — failed with module-resolution error | Created `completados-por-dia.tsx` — same toggle/delta pattern as `PedidosPorDia`, plus an always-visible "Tasa de completado" figure (independent of the Nº/Valor toggle, since `tasaCompletado` arrives pre-computed and is not itself a per-day series); the Δ% line only renders on the Nº series (`CompletadosPorDiaView` has no `valueDeltaPercent` field by design — locked type); first test draft used `/0%/` which ambiguously matched "50%" (from the default `countDeltaPercent: 0.5` fixture) — fixed the TEST (not the component) to a `/\b0%/` word-boundary regex plus an explicit `countDeltaPercent: null` override in that one fixture; re-ran — 7/7 passed | Test-only fix, no component change |

### Files Changed (Batch 5)

| File | Action | What Was Done |
|------|--------|---------------|
| `templates/apps/salesops-mvp/app/domain/decisiones-dashboard.ts` | Modified | Added `computeDelta` to the `period-trend.ts` import; added private `PerDayBucketResult`/`buildPerDayBuckets` shared helper, `PerDayPoint`/`PedidosPorDiaView`/`buildPedidosPorDia`, `CompletadosPorDiaView`/`buildCompletadosPorDia` — new section between `buildCicloPromedio` and the orchestrator. No existing export modified, orchestrator untouched (route wiring is PR7). |
| `templates/apps/salesops-mvp/app/domain/__tests__/decisiones-dashboard.test.ts` | Modified | Added `buildPedidosPorDia`/`buildCompletadosPorDia` to the import list; added `describe('buildPedidosPorDia', ...)` (5 tests) and `describe('buildCompletadosPorDia', ...)` (5 tests) |
| `templates/apps/salesops-mvp/app/components/decisiones/pedidos-por-dia.tsx` | Created | Capa 3b leaf — Nº pedidos/Valor de venta toggle + avg/día + Δ% guard + `AreaTrend` |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/pedidos-por-dia.test.tsx` | Created | 7 tests |
| `templates/apps/salesops-mvp/app/components/decisiones/completados-por-dia.tsx` | Created | Capa 3b leaf — same toggle pattern + always-visible tasa de completado + Δ% guard (Nº series only) + `AreaTrend` |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/completados-por-dia.test.tsx` | Created | 7 tests |
| `templates/apps/salesops-mvp/app/components/decisiones/help-content.ts` | Modified | Added `DECISIONES_HELP.pedidosPorDia` and `DECISIONES_HELP.completadosPorDia` entries — additive, old KPI/trend entries untouched (removal is Phase 4 task 4.7) |
| `openspec/changes/salesops-14-decisiones-operativo/tasks.md` | Modified | Checked off tasks 3.11–3.18 |

### Deviations from Design

None — implementation matches design.md's Capa 3b interface contracts exactly (`PerDayPoint`, `PedidosPorDiaView`/`buildPedidosPorDia`, `CompletadosPorDiaView`/`buildCompletadosPorDia`, field names and semantics; `tasaCompletado` denominator = window's entry cohort, locked). One implementation detail not pre-specified by design: `buildPerDayBuckets` is a new private (non-exported) helper factoring the zero-padded-bucket + prior-window-totals logic shared by both builders — design's interface list only specifies the two public builder signatures, so this is an internal DRY refactor, not a contract change. Also: the spec's "0-prior avg + current > 0 must show 'up', never Infinity%" requirement is satisfied at the LEAF/presentation layer (both new components render a "▲ nuevo" guard when `countDeltaPercent`/`valueDeltaPercent` is `null` and the current average is positive), since design's locked domain type is `number \| null` (not a `Trend` enum field) — the domain builders themselves only guarantee "never NaN/Infinity" (via `computeDelta`'s `null`-on-zero-prior guard), consistent with `PedidosPorDiaView`/`CompletadosPorDiaView`'s exact shape in design.md.

### Issues Found

One test-writing mistake (not a design/implementation issue): the first draft of `CompletadosPorDia`'s "safe 0% tasa" test used the regex `/0%/`, which ambiguously matched both the headline "0%" and the delta line's "50%" (both contain the substring "0%") under the default fixture's `countDeltaPercent: 0.5`. Fixed by scoping the fixture override (`countDeltaPercent: null`, which renders "nuevo" instead of a percent) and using a `/\b0%/` word-boundary regex. No production code was affected.

### Full Suite / Typecheck Confirmation (Batch 5)

- `vitest run` (full suite, all 80 files): **545/545 passed**
- `react-router typegen && tsc`: **exit 0, no errors**

### Remaining Tasks (next batches)

- [ ] Phase 4: Análisis + Route Recomposition + Cleanup (tasks 4.1–4.10) — PR6/PR7/PR8

### Workload / PR Boundary (Batch 5)

- Mode: single PR, `size:exception` (explicitly authorized by the orchestrator for this batch)
- Current work unit: Unit 5 (Capa 3b, PR5 per tasks.md's Suggested Work Units table)
- Boundary: starts from the committed Batch 4 tree on `salesops-mvp`; ends with `buildPedidosPorDia`/`PedidosPorDia` and `buildCompletadosPorDia`/`CompletadosPorDia` implemented, tested, and typechecked — no consumers wired yet (route recomposition is Phase 4/PR7, not touched this batch)
- Estimated review budget impact: ~300 changed lines in modified files (git diff --stat) + ~333 lines across 4 new files (2 components, 2 component test files) ≈ 633 total — above the tasks.md PR5 estimate (~400) and the 400-line guard budget, but within the `size:exception` explicitly authorized by the orchestrator for this batch (see delivery context above)
- Commit: `d0845cd`, on the current branch, not pushed

---

## Batch 6 (this batch) — Phase 4: Análisis windowing (PR6)

**Mode**: Strict TDD (RED → GREEN, verified per task)
**Delivery**: Single PR, `size:exception`, on current branch `salesops-mvp`, committed, not pushed.
**Scope**: ONLY tasks 4.1–4.2 — the gestor-ranking `[7d/30d/General]` period-selector prop contract. Per tasks.md, PR6's "Análisis windowing" for `buildWarehouseSales`/`buildCurrencyMix` requires **zero code change**: both builders are already window-agnostic pure functions over whatever `SeedState` they're given (confirmed in `design.md`'s "Análisis windowing" decision row — "reused unchanged, the filter is applied by the SeedState passed in"). The actual `windowedState(state, days)` call-site wiring for all 3 Análisis blocks is owned by the route recomposition (task 4.4, PR7) — explicitly out of scope this batch, not touched. Route/KPI/sales-trend/stage-distribution deletion (PR8) also not touched.

### Completed Tasks

- [x] 4.1 RED: updated `gestor-ranking.test.tsx` — added `period`/`onPeriodChange` props to all existing renders (required-prop compile fix) plus 2 new tests: selector renders `[7d/30d/General]` with correct `aria-pressed`, and each option's click calls `onPeriodChange` with `7`/`30`/`'general'`
- [x] 4.2 GREEN: modified `components/decisiones/gestor-ranking.tsx` — added `GestorRankingPeriod = WindowDays | 'general'` type, `period`/`onPeriodChange` props, and a 3-button selector (same visual pattern as `period-filter.tsx`, extended with a third "General" option) in the card header

### TDD Cycle Evidence

| Task | RED (test written, confirmed failing) | GREEN (implementation, confirmed passing) | REFACTOR |
|------|------|------|------|
| 4.1/4.2 `GestorRanking` period selector | Added 2 tests to `gestor-ranking.test.tsx` (selector renders with correct `aria-pressed` per option; click calls `onPeriodChange` with `7`/`30`/`'general'`) and passed `period`/`onPeriodChange` to the 2 pre-existing render calls (required by the new prop contract); ran `vitest run app/components/decisiones/__tests__/gestor-ranking.test.tsx` — 2 failed (`getByText('7d')` not found — selector doesn't exist yet), 2 pre-existing passed | Implemented the `period`/`onPeriodChange` props + 3-button selector in `gestor-ranking.tsx`, reusing `WindowDays` from `decisiones-dashboard.ts`; re-ran — 4/4 passed | None needed — additive to the component; the domain layer (`buildWarehouseSales`/`buildCurrencyMix`/`buildGestorRanking`) needed zero change, confirming design's "reused unchanged" decision |

### Files Changed (Batch 6)

| File | Action | What Was Done |
|------|--------|---------------|
| `templates/apps/salesops-mvp/app/components/decisiones/gestor-ranking.tsx` | Modified | Added `GestorRankingPeriod` type + `period`/`onPeriodChange` required props + `[7d/30d/General]` selector UI in the card header (view-only, caller owns state and pre-filtering) |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/gestor-ranking.test.tsx` | Modified | Passed `period`/`onPeriodChange` to existing render calls; added 2 tests for the new selector |
| `templates/apps/salesops-mvp/app/routes/decisiones.tsx` | Modified (minimal compile-fix only) | The current (soon-to-be-replaced-in-PR7) route's `<GestorRanking gestores={view.gestores} />` call site needed the two new required props to keep `tsc` green. Passed `period="general"` (matches this route's current unwindowed, all-time `buildDecisionesDashboard` behavior) and a no-op `onPeriodChange={() => {}}` — inert until PR7's recomposition wires real `windowedState`-driven state. This is a 1-line prop addition, not a recomposition: no layout, composition, or behavior change. |
| `openspec/changes/salesops-14-decisiones-operativo/tasks.md` | Modified | Checked off tasks 4.1–4.2 |

### Deviations from Design

None on the interface contract (`GestorRankingPeriod`/selector shape matches spec's `[7d/30d/General]` requirement exactly; caller pre-filters, component itself does no aggregation). One necessary, explicitly-scoped-out-of-PR6 compile fix: `routes/decisiones.tsx`'s existing `GestorRanking` call site required the two new props to typecheck, patched with inert defaults (`period="general"`, no-op `onPeriodChange`) rather than deferred, since a batch cannot end with a broken build. No route layout/composition/behavior changed — real windowedState wiring for this call site is still task 4.4 (PR7), untouched otherwise.

### Issues Found

None.

### Full Suite / Typecheck Confirmation (Batch 6)

- `vitest run` (full suite, all 78 files): **547/547 passed**
- `react-router typegen && tsc`: **exit 0, no errors**

### Remaining Tasks (next batches)

- [ ] Task 4.3–4.4: Route recomposition (`decisiones.tsx` + `decisiones.test.tsx`) — PR7
- [ ] Tasks 4.5–4.7: Cleanup (delete KPI header/sales-trend/stage-distribution + tests, trim domain module, update help-content) — PR8
- [ ] Tasks 4.8–4.10: Final full-suite/typecheck gate + dangling-reference grep — PR8

### Workload / PR Boundary (Batch 6)

- Mode: single PR, `size:exception` (explicitly authorized by the orchestrator for this batch)
- Current work unit: Unit 6 (Análisis windowing, PR6 per tasks.md's Suggested Work Units table)
- Boundary: starts from the committed Batch 5 tree on `salesops-mvp`; ends with the `GestorRanking` `[7d/30d/General]` selector prop contract implemented, tested, and typechecked. `buildWarehouseSales`/`buildCurrencyMix` untouched (correctly — they need no code change per design). No `windowedState` call-site wiring into the route — that's task 4.4/PR7, not touched this batch, per explicit orchestrator scoping instruction ("If tasks.md scopes PR6 as domain/helper-level wiring, keep it to that").
- Estimated review budget impact: 4 files changed (1 component, 1 component test file, 1 route 1-line compile fix, tasks.md) — well within the tasks.md PR6 estimate (~120 lines)
- Commit: `4416af9`, on the current branch, not pushed

---

## Batch 7 (this batch) — Phase 4: Route recomposition (PR7)

**Mode**: Strict TDD (RED → GREEN, verified via a real stash/restore cycle — see below).
**Delivery**: Single PR, `size:exception`, on current branch `salesops-mvp`, committed, not pushed.
**Scope**: ONLY tasks 4.3–4.4 — recompose `routes/decisiones.tsx` into the final operational cockpit and rewrite `routes/__tests__/decisiones.test.tsx` to match. Cleanup (deleting the old `kpi-header`/`sales-trend-section`/`stage-distribution` component+test files, trimming the domain module, updating `help-content.ts`, final dangling-reference grep) is explicitly Phase 4's remaining tasks 4.5–4.10 (PR8) — NOT touched this batch. The old component FILES still exist on disk, just no longer imported/rendered by the route.

### Completed Tasks

- [x] 4.3 RED: rewrote `routes/__tests__/decisiones.test.tsx` — 9 tests asserting Capa 1 (3 cards), Capa 2 (2 blocks), Capa 3 (4 blocks + shared `[7d/30d]` filter), Análisis (exactly 3 blocks: Ventas por almacén/Mix por moneda/Ranking de gestores), no KPI/sales-trend/stage-distribution/margin/AOV blocks, exactly one `<h1>`, toggle 7d↔30d recomputes Capa 3 + Análisis's Ventas/Mix (Ranking de gestores' own selector stays independent), no `<form>`, and the "only creado orders" empty-state scenario (Capa 1.3/Capa 3/Análisis show empty-state text; Capa 1.1/1.2/Capa 2 still render real data).
- [x] 4.4 GREEN: recomposed `routes/decisiones.tsx` into the 3-layer + Análisis cockpit.

### TDD Cycle Evidence

| Task | RED (test written, confirmed failing) | GREEN (implementation, confirmed passing) | REFACTOR |
|------|------|------|------|
| 4.3/4.4 route recomposition | Wrote the new `decisiones.tsx` implementation FIRST this batch (composition-only, no new domain code), then wrote the new `decisiones.test.tsx`. To still produce genuine RED→GREEN evidence (not just author-then-run), ran `git stash push -- .../routes/decisiones.tsx` to put the OLD PR6 route back, ran `vitest run app/routes/__tests__/decisiones.test.tsx` against it — **6 of 9 new tests failed** (old route still renders `KpiHeader`/`SalesTrendSection`/`StageDistribution`, no Capa 1/2/3/Análisis structure) — confirmed RED against the actual pre-change route. Ran `git stash pop` to restore the new route, re-ran — 8/9 passed, 1 failed (`toggling the [7d/30d] filter...` — a TEST bug, not a component bug: `getAllByText('30d')` matched 3 buttons including `GestorRanking`'s own independent `[7d/30d/General]` selector, which correctly does NOT move when Capa3's filter is toggled). Fixed the TEST to scope by `getAllByRole('group', { name: 'Filtro de período' })` (3 groups: Capa3, Análisis, GestorRanking) and assert only the first two move together while the third stays independent; re-ran — 9/9 passed. | Full suite green (551/551), typecheck clean. | None needed on the route/test; test-only fix as above. |

### Files Changed (Batch 7)

| File | Action | What Was Done |
|------|--------|---------------|
| `templates/apps/salesops-mvp/app/routes/decisiones.tsx` | Modified (full recomposition) | Replaced the old `useState(() => buildDecisionesDashboard(loadSeedState()))` + `KpiHeader`/`SalesTrendSection`/`StageDistribution` layout with: `useState(() => loadSeedState())` for `seed` (never re-read/mutated), `useState<WindowDays>(7)` for the shared Capa3+Análisis(Ventas/Mix) filter, `useState<GestorRankingPeriod>(7)` for Ranking de gestores' own independent `[7d/30d/General]` selector, and one `useMemo` per view model calling the ALREADY-TESTED pure builders directly (`buildActiveOrdersByStateAndWarehouse`, `buildTransportistaCapacity`, `buildComisionesPorPagar`, `buildInventoryAlerts`, `buildPedidosDemorados`, `buildEntraVsSale`, `buildCicloPromedio`, `buildPedidosPorDia`, `buildCompletadosPorDia`, `buildWarehouseSales`/`buildCurrencyMix` over `windowedState(seed, windowDays)`, `buildGestorRanking` over `windowedState(seed, gestorPeriod)` or unwindowed `seed` for `'general'`). Renders, top to bottom: Capa 1 (3-card grid: `ActiveOrdersChart`, `TransportistaCapacity`, `ComisionesPorPagar`-or-empty-state), Capa 2 (2-card grid: `InventoryAlerts`, `PedidosDemorados`), Capa 3 (`PeriodFilter` + 4-block grid or empty-state, under a `hasQualifyingData` gate), Análisis (`PeriodFilter` + `WarehouseSales`/`CurrencyMix` + `GestorRanking`, or empty-state, under the same gate). `hasQualifyingData = seed.orders.some(o => o.state !== 'creado')`, computed once — gates ONLY Capa 1.3, Capa 3, and Análisis per spec's "Empty State When No Verificado-or-Later Orders Exist" requirement; Capa 1.1/1.2 and Capa 2 (both blocks) are NOT gated (they legitimately show real data derived from `creado` orders / transportistas / inventory, not from qualifying orders). No RR7 `<Form>`/action/loader/`useNavigate` anywhere — direct render only, preserving the jsdom+undici `AbortSignal` sidestep. |
| `templates/apps/salesops-mvp/app/routes/__tests__/decisiones.test.tsx` | Rewritten | 9 tests replacing the old KPI/sales-trend/stage-distribution assertions — see TDD Cycle Evidence above for the full list. |
| `openspec/changes/salesops-14-decisiones-operativo/tasks.md` | Modified | Checked off tasks 4.3–4.4. |

### Deviations from Design

1. **No `buildDecisionesWindow(state, windowDays)` orchestrator was added to the domain module**, despite tasks.md 4.4 literally naming `useMemo(buildDecisionesWindow)`. Reasoning: (a) design.md's own **LOCKED** "Interfaces / Contracts" code block — the section the orchestrator's batch prompt calls out as authoritative — lists only the individual pure builders (`buildEntraVsSale`, `buildCicloPromedio`, `buildPedidosPorDia`, `buildCompletadosPorDia`, plus the already-existing `buildWarehouseSales`/`buildCurrencyMix`/`buildGestorRanking`); no `buildDecisionesWindow` signature appears there — the name only appears in the prose architecture diagram. (b) That diagram's `buildDecisionesWindow(state, wd) → Análisis (..., gestores via windowedState)` shape does not actually fit `GestorRanking`'s own independently-selected `[7d/30d/General]` period (built and locked in PR6, batch 6) — General has no equivalent `windowDays` value, so a single orchestrator taking one `windowDays` param can't produce the gestor ranking view for the General case without an awkward branch. (c) Every prior batch (PR1–PR6) established the pattern of small, independently-tested pure builders with NO monolithic orchestrator — the route composes them directly via `useMemo`, which is what task 4.4 already implies ("`useMemo(...)`; render Capa 1/2/3 + Análisis"). Adding an untested new orchestrator function this late, whose only purpose is to save a few `useMemo` lines in the route, would be net-negative: it re-bundles already-tested pure functions behind a new signature with no dedicated unit test of its own (since the route test covers composition, not orchestrator unit semantics), and risks needing revision again once PR8 removes the OLD `buildDecisionesDashboard` (whose name is adjacent). The route's `useMemo` calls are the de facto "orchestrator," fully exercised by the 9 new route tests plus every builder's own existing unit tests.
2. **`PeriodFilter` is rendered TWICE** (once in the Capa 3 section header, once in the Análisis section header), both bound to the SAME `windowDays` state — matching the ASCII maquette in `docs/plans/dashboard-decisiones-operativo-design.md`, which shows a `[7d/30d]` label next to both the Capa 3 header AND the Análisis Ventas/Mix row, even though design.md's data-flow diagram draws a single shared `windowDays` box. This is presentation-only (two views of one piece of state) and required no new component — `PeriodFilter` was already a plain controlled `value`/`onChange` leaf, reusable as-is.
3. Confirmed (not a deviation, a verification): `docs/plans/dashboard-decisiones-operativo-design.md`'s Análisis section still lists "Top productos por margen" / "Pedidos de menor margen" — that plan doc predates `spec.md`'s locked "No Margin or AOV Block Renders on Decisiones" requirement (margin/AOV moved to Finanzas in `salesops-13`, archived 2026-07-15, referenced explicitly in `spec.md`'s "Locked constraints"). The route recomposition follows `spec.md`/`design.md` (both updated post-`salesops-13`), NOT the older plan doc — Análisis renders exactly 3 blocks, no margin/AOV anywhere, per the route test's explicit `queryByText('Top productos por margen')`/`queryByText('Pedidos de menor margen')` assertions (both pass).

### Issues Found

One test-writing mistake (not a design/implementation issue): the first draft of the "toggling the filter" test asserted every `getAllByText('30d')` element became `aria-pressed=true` after clicking one, which is wrong — `GestorRanking`'s own `[7d/30d/General]` selector is intentionally independent of Capa3/Análisis's shared `windowDays` (that's the whole point of PR6's separate `GestorRankingPeriod` prop contract). Fixed by scoping the assertion to the 2 shared-state groups (Capa3, Análisis) via `getAllByRole('group', { name: 'Filtro de período' })` and explicitly asserting the 3rd group (GestorRanking's) stays unaffected. No production code was affected.

### Full Suite / Typecheck Confirmation (Batch 7)

- `vitest run` (full suite, all 78 files): **551/551 passed**
- `react-router typegen && tsc`: **exit 0, no errors**

### Remaining Tasks (next batch)

- [ ] Tasks 4.5–4.7: Cleanup — delete `kpi-header.tsx`/`sales-trend-section.tsx`/`stage-distribution.tsx` + their `__tests__` files; remove `buildKpiHeader`/`KpiHeaderView`, `buildSalesTrend`/`SalesTrendView`, `buildStageDistribution`/`StageDistributionView`, unused margin helpers (`orderCostUSD`/`orderMarginUSD`/`orderCommissionUSD`), and the OLD `buildDecisionesDashboard`/`DashboardView` orchestrator (now fully superseded by the route's direct `useMemo` composition) from `decisiones-dashboard.ts`; trim `decisiones-dashboard.test.ts` accordingly; update `help-content.ts` to remove the now-dead KPI/trend/stage-distribution entries — PR8.
- [ ] Tasks 4.8–4.10: Final full-suite/typecheck gate + dangling-reference grep (`KpiHeaderView`, `buildSalesTrend`, `StageDistributionView`, `stage-distribution`) — PR8.

### Workload / PR Boundary (Batch 7)

- Mode: single PR, `size:exception` (explicitly authorized by the orchestrator for this batch)
- Current work unit: Unit 7 (Route recomposition, PR7 per tasks.md's Suggested Work Units table)
- Boundary: starts from the committed Batch 6 tree (`4416af9`) on `salesops-mvp`; ends with `routes/decisiones.tsx` fully recomposed into the 3-layer + Análisis cockpit, `routes/__tests__/decisiones.test.tsx` rewritten to match, full suite green, typecheck clean. The old `kpi-header.tsx`/`sales-trend-section.tsx`/`stage-distribution.tsx` component files and their domain builders (`buildKpiHeader`, `buildSalesTrend`, `buildStageDistribution`, `buildDecisionesDashboard`) are UNTOUCHED on disk — they are simply no longer imported by the route. Their removal is explicitly PR8/Batch 8, not this batch.
- Estimated review budget impact: 3 files changed (1 route full rewrite ~150 lines, 1 route test full rewrite ~165 lines, tasks.md) — within the tasks.md PR7 estimate (~250 lines)
- Commit: `e8d6d54`, on the current branch, not pushed

---

## Batch 8 (this batch, FINAL) — Phase 4: Cleanup (PR8)

**Mode**: Strict TDD — deletion discipline: removed code + its tests together in the same edit, then proved nothing else broke via the full suite + typecheck (that IS the RED→GREEN cycle for a pure removal — there is no new production behavior to RED/GREEN individually).
**Delivery**: Single PR, `size:exception`, on current branch `salesops-mvp`, committed, not pushed.
**Scope**: ONLY tasks 4.5–4.10 — delete the old `kpi-header.tsx`/`sales-trend-section.tsx`/`stage-distribution.tsx` components + their tests, remove the now-dead `buildKpiHeader`/`buildSalesTrend`/`buildStageDistribution`/`buildDecisionesDashboard` builders and unused margin helpers from `decisiones-dashboard.ts`, trim the domain test file, update `help-content.ts`, and run the final full-suite/typecheck/dangling-reference gate. This is the LAST batch of `salesops-14-decisiones-operativo` — all 8 PR units (Foundation through Cleanup) are now complete.

### Completed Tasks

- [x] 4.5 Deleted `components/decisiones/kpi-header.tsx`, `sales-trend-section.tsx`, `stage-distribution.tsx` and their `__tests__` files.
- [x] 4.6 Removed `buildKpiHeader`/`KpiHeaderView`, `buildSalesTrend`/`SalesTrendView`/`SalesTrendPoint`, `buildStageDistribution`/`StageDistributionView`/`StageDistributionRow`/`STAGE_ORDER`, the old `buildDecisionesDashboard`/`DashboardView` orchestrator, and the margin-only helpers `orderCostUSD`/`orderCommissionUSD`/`orderMarginUSD` from `decisiones-dashboard.ts`; trimmed the corresponding `describe` blocks (`buildKpiHeader`, `buildSalesTrend`, `buildStageDistribution`, `orphan productId in margin/cost aggregation`, `live-rate regression`, `buildDecisionesDashboard`) from `decisiones-dashboard.test.ts`.
- [x] 4.7 Updated `components/decisiones/help-content.ts` — removed the `ventas`/`margen`/`pedidos`/`comisionPendiente`/`pedidosPorEtapa`/`tendenciaVentas` entries (the 8 new operational-block entries — `pedidosActivos`, `transportistas`, `comisionesPorPagar`, `pedidosDemorados`, `entraVsSale`, `cicloPromedio`, `pedidosPorDia`, `completadosPorDia` — were already added incrementally in batches 2–5, confirmed present and untouched).
- [x] 4.8 Full test run (`vitest run` from `templates/apps/salesops-mvp/`) — **531/531 passed, 75 test files** (down from 78 files / 551 tests in Batch 7, exactly the 3 deleted test files and their tests removed, zero collateral loss).
- [x] 4.9 Typecheck (`react-router typegen && tsc` from `templates/apps/salesops-mvp/`) — **exit 0, no errors**.
- [x] 4.10 Dangling-reference grep across `templates/apps/salesops-mvp/` for `KpiHeaderView`, `buildKpiHeader`, `SalesTrendView`, `buildSalesTrend`, `SalesTrendPoint`, `StageDistributionView`, `buildStageDistribution`, `StageDistributionRow`, `DashboardView`, `buildDecisionesDashboard`, and the 3 deleted filenames — **ZERO consumers**. (Two harmless string matches remain and are NOT dangling references: `FinanceKpiHeader`/`finance-kpi-header.tsx` in the unrelated Finanzas domain, whose name only substring-matches the grep pattern `kpi-header`; and the route test's own description string `'renders no KPI header, sales-trend, stage-distribution, margin, or AOV block anywhere'`, which asserts their absence by design.)

### Safety Verification (before deleting each symbol)

Grepped every symbol's usage across the whole app BEFORE deleting, per the orchestrator's explicit safety instruction:

| Symbol | Other consumers found? | Action |
|---|---|---|
| `buildKpiHeader`/`KpiHeaderView` | None outside `kpi-header.tsx`(+test) and the file's own `buildDecisionesDashboard` | Deleted |
| `buildSalesTrend`/`SalesTrendView`/`SalesTrendPoint` | None outside `sales-trend-section.tsx`(+test) and `buildDecisionesDashboard`; `finanzas-dashboard.ts` had only a stale DOC COMMENT mentioning the name (`buildRevenueTrend`'s docstring said "Mirrors `buildSalesTrend`'s bucketing shape") — no import, no runtime reference | Deleted the builder; reworded the stale comment in `finanzas-dashboard.ts` to remove the dangling name mention (2-line comment-only change, zero behavior change, confirmed by `finanzas-dashboard.test.ts`'s 27 tests still passing unmodified) |
| `buildStageDistribution`/`StageDistributionView`/`StageDistributionRow`/`STAGE_ORDER` | None outside `stage-distribution.tsx`(+test) and `buildDecisionesDashboard` | Deleted |
| `buildDecisionesDashboard`/`DashboardView` | None — route recomposition (PR7/Batch 7) already stopped calling it; only this file's own now-deleted orchestrator referenced it | Deleted |
| `orderCostUSD`/`orderCommissionUSD`/`orderMarginUSD` | Only used inside `buildKpiHeader` in THIS file; `finanzas-dashboard.ts` has its OWN separate copies of same-named private functions (not imported from `decisiones-dashboard.ts` — verified via grep, each file defines its own) | Deleted from `decisiones-dashboard.ts` only; `finanzas-dashboard.ts`'s copies are untouched (different file, different closure, margin now lives there per `salesops-13`) |
| `PENDING_COMMISSION_STATES`, `isCommissionPending`, `qualifying`, `sumUSD`, `sumCommissionMN` | Still used by `buildComisionesPorPagar`, `buildPedidosDemorados`(indirectly via `stageEnteredAt`—no, directly not used there, but `qualifying`/`sumUSD` used by `buildWarehouseSales`/`buildCurrencyMix`/`buildGestorRanking`, `isCommissionPending`/`sumCommissionMN` used by `buildComisionesPorPagar`/`buildGestorRanking`) | **KEPT** — moved out of the deleted "KPI header" section into a new `// ---- shared order helpers ----` section, zero behavior change |
| `STAGE_LABELS` | Used by `buildActiveOrdersByStateAndWarehouse`, `buildPedidosDemorados`, and (previously) `buildStageDistribution` | **KEPT** — moved into a new `// ---- stage labels (shared) ----` section; only `STAGE_ORDER` (used exclusively by `buildStageDistribution`) was deleted |
| `KpiTrend`/`Trend`/`PeriodSplit` type re-exports, `splitByPeriod` value re-export | `decisiones-dashboard.test.ts`'s own `describe('splitByPeriod', ...)` block imports `splitByPeriod` from `../decisiones-dashboard` (the re-export path, not `period-trend.ts` directly) — explicitly out of this batch's scope (task 4.6 only names `buildKpiHeader`/`buildSalesTrend`/`buildStageDistribution` + margin helpers) | **KEPT untouched** — only removed the now-unused `buildKpiTrend` VALUE import (was only called inside the deleted `buildKpiHeader`) |
| `/finanzas` route and all other routes | N/A — no file under `app/routes/finanzas.tsx`, `app/components/finanzas/**`, or any route other than `decisiones.tsx`/its test was touched this batch | Confirmed via `git diff --stat`: only `decisiones-dashboard.ts`, `decisiones-dashboard.test.ts`, `finanzas-dashboard.ts` (2-line comment fix), `help-content.ts` (decisiones one), and the 6 deleted files changed |

### Files Changed (Batch 8)

| File | Action | What Was Done |
|------|--------|---------------|
| `templates/apps/salesops-mvp/app/components/decisiones/kpi-header.tsx` | Deleted | Old Layer-1 KPI tile component, superseded by the route's direct Capa 1–3 + Análisis composition |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/kpi-header.test.tsx` | Deleted | Its tests |
| `templates/apps/salesops-mvp/app/components/decisiones/sales-trend-section.tsx` | Deleted | Old Layer-2a sales trend chart, superseded by Capa 3's `PedidosPorDia`/`CompletadosPorDia` |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/sales-trend-section.test.tsx` | Deleted | Its tests |
| `templates/apps/salesops-mvp/app/components/decisiones/stage-distribution.tsx` | Deleted | Old Layer-2b stage snapshot, superseded by Capa 1.1's `ActiveOrdersChart` |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/stage-distribution.test.tsx` | Deleted | Its tests |
| `templates/apps/salesops-mvp/app/domain/decisiones-dashboard.ts` | Modified | Removed `orderCostUSD`/`orderCommissionUSD`/`orderMarginUSD`, `KpiHeaderView`/`buildKpiHeader`, `SalesTrendPoint`/`SalesTrendView`/`buildSalesTrend`, `StageDistributionRow`/`StageDistributionView`/`STAGE_ORDER`/`buildStageDistribution`, `DashboardView`/`buildDecisionesDashboard`; removed the now-unused `buildKpiTrend` value import and the unused `SeededProduct` type import; kept `PENDING_COMMISSION_STATES`/`isCommissionPending`/`qualifying`/`sumUSD`/`sumCommissionMN` (regrouped under `// ---- shared order helpers ----`) and `STAGE_LABELS` (regrouped under `// ---- stage labels (shared) ----`) since both are still consumed by later builders; 898 → 714 lines |
| `templates/apps/salesops-mvp/app/domain/__tests__/decisiones-dashboard.test.ts` | Modified | Removed the now-dead imports (`buildDecisionesDashboard`, `buildKpiHeader`, `buildSalesTrend`, `buildStageDistribution`) and the `describe` blocks: `buildKpiHeader` (5 tests), `buildSalesTrend` (2 tests), `buildStageDistribution` (1 test), `orphan productId in margin/cost aggregation` (1 test), `live-rate regression` (1 test), `buildDecisionesDashboard` (3 tests) — 13 tests removed total; 1062 → ~811 lines |
| `templates/apps/salesops-mvp/app/components/decisiones/help-content.ts` | Modified | Removed the `ventas`/`margen`/`pedidos`/`comisionPendiente`/`pedidosPorEtapa`/`tendenciaVentas` entries (6 entries, dead now that their components are gone); `ventasPorAlmacen` and all 8 new-block entries (added in prior batches) untouched |
| `templates/apps/salesops-mvp/app/domain/finanzas-dashboard.ts` | Modified (comment-only) | Reworded `buildRevenueTrend`'s docstring to remove a stale mention of the just-deleted `buildSalesTrend` name; zero behavior change (confirmed: `finanzas-dashboard.test.ts`'s 27 tests unchanged and passing) |
| `openspec/changes/salesops-14-decisiones-operativo/tasks.md` | Modified | Checked off tasks 4.5–4.10 — **all 55 tasks in the change are now `[x]`** |

### Deviations from Design

None. This batch is pure subtraction of already-superseded code, per design.md's explicit instruction that the old KPI/trend/stage-distribution layer is fully replaced by the Capa 1/2/3/Análisis cockpit (PR7). One minor housekeeping addition beyond the task list's literal wording: reworded 2 stale doc-comment mentions of the deleted `buildSalesTrend` name (one in `decisiones-dashboard.ts` itself, one in `finanzas-dashboard.ts`) — neither was a functional reference, but leaving a dead-code NAME in a docstring after deletion would be sloppy and could confuse a future reader running the same dangling-reference grep pattern.

### Issues Found

None.

### Full Suite / Typecheck Confirmation (Batch 8, FINAL)

- `vitest run` (full suite, all 75 files): **531/531 passed**
- `react-router typegen && tsc`: **exit 0, no errors**
- Dangling-reference grep (task 4.10): **zero consumers** of `KpiHeaderView`, `buildKpiHeader`, `SalesTrendView`, `buildSalesTrend`, `SalesTrendPoint`, `StageDistributionView`, `buildStageDistribution`, `StageDistributionRow`, `DashboardView`, `buildDecisionesDashboard`, or the 3 deleted filenames anywhere in `templates/apps/salesops-mvp/`
- `/finanzas` and every other route: **untouched** (confirmed via `git diff --stat` — only Decisiones-scoped files + a 2-line unrelated comment fix in `finanzas-dashboard.ts` changed; `finanzas-dashboard.test.ts`'s 27 tests pass unmodified)

### Remaining Tasks

**None.** All 55 tasks (Phase 0 through Phase 4, tasks 0.1–4.10) across all 8 PR units are complete. `salesops-14-decisiones-operativo` is fully implemented.

### Workload / PR Boundary (Batch 8, FINAL)

- Mode: single PR, `size:exception` (explicitly authorized by the orchestrator for this batch)
- Current work unit: Unit 8 (Cleanup, PR8 per tasks.md's Suggested Work Units table) — the LAST unit
- Boundary: starts from the committed Batch 7 tree (`e8d6d54`) on `salesops-mvp`; ends with the old KPI/sales-trend/stage-distribution layer fully removed, `decisiones-dashboard.ts`/`decisiones-dashboard.test.ts`/`help-content.ts` trimmed to only what the new cockpit uses, full suite green, typecheck clean, dangling-reference grep zero
- Estimated review budget impact: 10 files changed, 7 net insertions / 696 deletions (`git diff --stat`) — a large deletion-only diff; well within reviewer budget since it is subtractive (no new logic to review, mechanically verifiable via the grep + test count delta)
- Commit: pending (this batch — see below), on the current branch, not pushed

### Change Status: COMPLETE

All 8 planned PR units (Foundation, Capa 1.1+1.2, Capa 1.3+Capa 2, Capa 3a, Capa 3b, Análisis windowing, Route recomposition, Cleanup) are implemented, tested, and typechecked. `salesops-14-decisiones-operativo` is ready for `sdd-verify`.
