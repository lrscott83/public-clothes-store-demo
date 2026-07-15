# Apply Progress — `salesops-14-decisiones-operativo`

## Batch 1 (this batch) — Phase 0: Foundation (PR1)

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

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `templates/apps/salesops-mvp/app/domain/period-trend.ts` | Modified | Added `splitByPeriodDays(state, days)`; `splitByPeriod` now delegates to it with `days=10` |
| `templates/apps/salesops-mvp/app/domain/__tests__/period-trend.test.ts` | Modified | Added `describe('splitByPeriodDays', ...)` — 4 new tests, including a delegate-equivalence test vs `splitByPeriod` |
| `templates/apps/salesops-mvp/app/domain/decisiones-dashboard.ts` | Modified | Added `WindowDays`, `ACTIVE_STATES`, `DelayStage`, `STAGE_DELAY_THRESHOLD_DAYS`, `windowedState(state, days)` — purely additive, no existing export touched |
| `templates/apps/salesops-mvp/app/domain/__tests__/decisiones-dashboard.test.ts` | Modified | Added `describe('ACTIVE_STATES', ...)`, `describe('STAGE_DELAY_THRESHOLD_DAYS', ...)`, `describe('windowedState', ...)` — 5 new tests |
| `templates/apps/salesops-mvp/app/components/decisiones/warehouse-colors.ts` | Created | `WAREHOUSE_COLORS` map keyed by `warehouseId`: `wh-1` `#16a34a` (verde), `wh-2` `#2563eb` (azul), `wh-3` `#eab308` (amarillo) |
| `templates/apps/salesops-mvp/app/components/decisiones/__tests__/warehouse-colors.test.ts` | Created | 2 tests asserting the fixed color mapping |
| `openspec/changes/salesops-14-decisiones-operativo/tasks.md` | Modified | Checked off tasks 0.1–0.6 |

### Deviations from Design

None — implementation matches design.md exactly (`splitByPeriodDays`/`splitByPeriod` delegate pattern, `windowedState` shallow-clone semantics, `STAGE_DELAY_THRESHOLD_DAYS` values, `WAREHOUSE_COLORS` hex values and id mapping confirmed against `app/seed/constants.ts`: `wh-1`=Pinar del Río, `wh-2`=Consolación del Sur, `wh-3`=Herradura).

### Issues Found

None.

### Full Suite / Typecheck Confirmation

- `vitest run` (full suite, all 69 files): **471/471 passed**
- `react-router typegen && tsc`: **exit 0, no errors**
- `finanzas-dashboard.test.ts` (27 tests) unmodified and passing — confirms `splitByPeriod` refactor did not change finanzas behavior.

### Remaining Tasks (next batches)

- [ ] Phase 1: Capa 1 — Pulso Inmediato (tasks 1.1–1.12) — PR2/PR3
- [ ] Phase 2: Capa 2 — Qué Atiendo YA (tasks 2.1–2.5) — PR3
- [ ] Phase 3: Capa 3 — Comportamiento en el Tiempo (tasks 3.1–3.18) — PR4/PR5
- [ ] Phase 4: Análisis + Route Recomposition + Cleanup (tasks 4.1–4.10) — PR6/PR7/PR8

### Workload / PR Boundary

- Mode: single PR, `size:exception` (explicitly authorized by the orchestrator for this batch)
- Current work unit: Unit 1 (Foundation, PR1 per tasks.md's Suggested Work Units table)
- Boundary: starts from a clean tree on `salesops-mvp`; ends with `splitByPeriodDays`, `windowedState`, `WAREHOUSE_COLORS` implemented, tested, and typechecked — no consumers wired yet (Capa 1/2/3/Análisis components/route are untouched, next batches)
- Estimated review budget impact: ~180 changed lines (well under 400), matches the tasks.md forecast for PR1
- Commit: NOT yet created — will be created as the final step of this batch per the orchestrator's instruction, on the current branch, not pushed
