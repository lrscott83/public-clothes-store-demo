# Tasks: Rediseño operativo del dashboard de Decisiones (`salesops-14-decisiones-operativo`)

Runner: `vitest run` from `templates/apps/salesops-mvp/`. Typecheck: `react-router typegen && tsc` (same cwd). Strict TDD: every domain/component/route task is RED (failing test) → GREEN (implementation).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,200–2,400 (8 new domain builders + `splitByPeriodDays` + `windowedState`, 9 new/modified components, route rewrite, 3 component+test deletions, help-content + spec deltas) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 8 work units, PR1 → PR8 (see below) |
| Delivery strategy | not specified by orchestrator — defaulting to `ask-on-risk` guard behavior |
| Chain strategy | pending — user must choose `stacked-to-main` or `feature-branch-chain` before apply |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Est. lines | PR | Notes |
|------|------|-----------|-----|-------|
| 1 | Foundation: `splitByPeriodDays`, `windowedState`, shared types/constants, `warehouse-colors.ts` | ~180 | PR1 | Base for every later unit; independent of layers |
| 2 | Capa 1.1 + 1.2: activos por estado/almacén + transportistas | ~330 | PR2 | Depends on PR1 |
| 3 | Capa 1.3 + Capa 2: comisiones por pagar + pedidos demorados | ~380 | PR3 | Depends on PR1; independent of PR2 |
| 4 | Capa 3a: entra-vs-sale + ciclo promedio + `period-filter.tsx` | ~350 | PR4 | Depends on PR1 |
| 5 | Capa 3b: pedidos/día + completados/día | ~400 | PR5 | Depends on PR4 (shares `PerDayPoint`/toggle pattern) |
| 6 | Análisis windowing: `windowedState` wiring + gestor-ranking `[7d/30d/General]` selector | ~120 | PR6 | Depends on PR1 |
| 7 | Route recomposition: `decisiones.tsx` + `decisiones.test.tsx` | ~250 | PR7 | Depends on PR2–PR6 (needs all leaves to compose) |
| 8 | Cleanup: delete KPI header/sales-trend/stage-distribution + tests, `help-content.ts`, final full-suite/typecheck gate | ~350 | PR8 | Depends on PR7 |

## Phase 0: Foundation (PR1)

- [x] 0.1 RED: test `splitByPeriodDays(state, days)` in `period-trend.test.ts` — current `[anchor-Nd, anchor)`, prior `[anchor-2Nd, anchor-Nd)`, anchored to `generatedAt`.
- [x] 0.2 GREEN: implement `splitByPeriodDays` in `domain/period-trend.ts`; refactor `splitByPeriod` to delegate with `days=10` (finanzas unaffected).
- [x] 0.3 RED: test `windowedState(state, days)` in `decisiones-dashboard.test.ts` — shallow clone, orders filtered to `[anchor-Nd, anchor)`, no mutation of original state.
- [x] 0.4 GREEN: implement `windowedState`, `WindowDays`, `ACTIVE_STATES`, `STAGE_DELAY_THRESHOLD_DAYS` in `domain/decisiones-dashboard.ts`.
- [x] 0.5 RED: test `WAREHOUSE_COLORS` mapping in `warehouse-colors.test.ts` — fixed color per `warehouseId`, independent of data.
- [x] 0.6 GREEN: create `components/decisiones/warehouse-colors.ts` (wh-1 verde, wh-2 azul, wh-3 amarillo).

## Phase 1: Capa 1 — Pulso Inmediato (PR2 + PR3)

- [x] 1.1 RED: test `buildActiveOrdersByStateAndWarehouse` — exactly 3 states in order, zero-padded `(state, warehouse)` pairs (spec: Capa 1.1).
- [x] 1.2 GREEN: implement `buildActiveOrdersByStateAndWarehouse` in `decisiones-dashboard.ts`.
- [x] 1.3 RED: test `ActiveOrdersChart` component — grouped bars, fixed `WAREHOUSE_COLORS`.
- [x] 1.4 GREEN: create `components/decisiones/active-orders-chart.tsx`.
- [x] 1.5 RED: test `buildTransportistaCapacity` — ocupado/disponible, "Sin chofer" count (spec: Capa 1.2).
- [x] 1.6 GREEN: implement `buildTransportistaCapacity`.
- [x] 1.7 RED: test `TransportistaCapacity` component.
- [x] 1.8 GREEN: create `components/decisiones/transportista-capacity.tsx`.
- [x] 1.9 RED: test `buildComisionesPorPagar` — total pending sum, one row per gestor (most overdue), sort desc `diasAtraso` (spec: Capa 1.3).
- [x] 1.10 GREEN: implement `buildComisionesPorPagar`.
- [x] 1.11 RED: test `ComisionesPorPagar` component.
- [x] 1.12 GREEN: create `components/decisiones/comisiones-por-pagar.tsx`.

## Phase 2: Capa 2 — Qué Atiendo YA (PR3, shares with 1.9-1.12)

- [x] 2.1 RED: test `buildPedidosDemorados` — `STAGE_DELAY_THRESHOLD_DAYS` per stage, `stageEnteredAt` mapping (`createdAt`/`verificado`Time/`transportingAt`), excludes `entregado`/`comision_pagada`, anchors to `generatedAt` (spec: Capa 2).
- [x] 2.2 GREEN: implement `buildPedidosDemorados`.
- [x] 2.3 RED: test `PedidosDemorados` component — rows + antigüedad label.
- [x] 2.4 GREEN: create `components/decisiones/pedidos-demorados.tsx`.
- [x] 2.5 Confirm `buildInventoryAlerts`/`InventoryAlerts` slot into Capa 2 unchanged — no domain/component change, wiring only in Phase 4.

## Phase 3: Capa 3 — Comportamiento en el Tiempo (PR4 + PR5)

- [x] 3.1 RED: test `PeriodFilter` component — `[7d/30d]` toggle, calls `onChange`.
- [x] 3.2 GREEN: create `components/decisiones/period-filter.tsx`.
- [x] 3.3 RED: test `buildEntraVsSale` — creados/entregados counts in window, backlog signal (spec: Entra vs. Sale).
- [x] 3.4 GREEN: implement `buildEntraVsSale`.
- [x] 3.5 RED: test `EntraVsSale` component.
- [x] 3.6 GREEN: create `components/decisiones/entra-vs-sale.tsx`.
- [x] 3.7 RED: test `buildCicloPromedio` — avg cycle days, Δ vs prior window, ÷0-safe (spec: Ciclo Promedio).
- [x] 3.8 GREEN: implement `buildCicloPromedio`.
- [x] 3.9 RED: test `CicloPromedio` component.
- [x] 3.10 GREEN: create `components/decisiones/ciclo-promedio.tsx`.
- [x] 3.11 RED: test `buildPedidosPorDia` — zero-padded days, avg + `Δ%`, 0-prior → "up" guard (spec: Pedidos por Día).
- [x] 3.12 GREEN: implement `buildPedidosPorDia`.
- [x] 3.13 RED: test `PedidosPorDia` component — Nº/valor toggle (local state).
- [x] 3.14 GREEN: create `components/decisiones/pedidos-por-dia.tsx`.
- [x] 3.15 RED: test `buildCompletadosPorDia` — zero-padded days, `tasaCompletado = entregadosEnVentana / creadosEnVentana` (÷0→0) (spec: Completados por Día).
- [x] 3.16 GREEN: implement `buildCompletadosPorDia`.
- [x] 3.17 RED: test `CompletadosPorDia` component.
- [x] 3.18 GREEN: create `components/decisiones/completados-por-dia.tsx`.

## Phase 4: Análisis + Route Recomposition + Cleanup (PR6 + PR7 + PR8)

- [x] 4.1 RED: update `gestor-ranking.test.tsx` — `[7d/30d/General]` selector prop, caller pre-filters via `windowedState` (spec: Ranking de Gestores).
- [x] 4.2 GREEN: modify `components/decisiones/gestor-ranking.tsx` to add the period selector.
- [ ] 4.3 RED: rewrite `routes/__tests__/decisiones.test.tsx` — assert 3 Capa-1 cards, Capa 2, Capa 3 (4 blocks + filter), Análisis (exactly 3 blocks), 1 `<h1>`, no KPI/margin/AOV blocks; toggle 7d↔30d recomputes Capa 3 only.
- [ ] 4.4 GREEN: recompose `routes/decisiones.tsx` — `useState(seed)` + `useState<WindowDays>(7)` + `useMemo(buildDecisionesWindow)`; render Capa 1/2/3 + Análisis; read-only.
- [ ] 4.5 Delete `components/decisiones/kpi-header.tsx`, `sales-trend-section.tsx`, `stage-distribution.tsx` + their `__tests__` files.
- [ ] 4.6 Remove `buildKpiHeader`/`KpiHeaderView`, `buildSalesTrend`/`SalesTrendView`, `buildStageDistribution`/`StageDistributionView`, unused margin helpers from `decisiones-dashboard.ts`; trim `decisiones-dashboard.test.ts` accordingly.
- [ ] 4.7 Update `components/decisiones/help-content.ts` — remove KPI/trend/stage-distribution entries, add entries for the 8 new operational blocks.
- [ ] 4.8 Full test run (`vitest run` from `templates/apps/salesops-mvp/`) — all GREEN.
- [ ] 4.9 Typecheck (`react-router typegen && tsc` from `templates/apps/salesops-mvp/`) — exit 0.
- [ ] 4.10 Grep repo for dangling references to removed exports (`KpiHeaderView`, `buildSalesTrend`, `StageDistributionView`, `stage-distribution`) — confirm zero consumers.
