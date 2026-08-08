# Archive Report — salesops-14-decisiones-operativo

**Status**: SUCCESS  
**Date**: 2026-07-15  
**Change**: salesops-14-decisiones-operativo  
**Artifact Store**: openspec

---

## Verification Verdict

The change was verified with **PASS** status:
- **0 CRITICAL**, **0 WARNING**, **4 SUGGESTIONS**
- **Test Suite**: 75 test files, 531/531 tests passed
- **Typecheck**: 0 errors
- **Verification**: Independently re-run and confirmed

Verification details: See engram topic key `sdd/salesops-14-decisiones-operativo/verify-report`.

---

## Merged Specs

### Main Spec: `/openspec/specs/salesops-mvp/spec.md`

Merged 1 MODIFIED, 11 ADDED, and 5 REMOVED requirements from the delta spec:

#### MODIFIED Requirements

1. **Decisiones Route Renders the Three-Layer Decision Dashboard**
   - Changed structure from KPI-header/4-visuals/2-blocks to operational cockpit
   - Capa 1 (3 cards: orders-by-state-warehouse, transportistas, commissions-pending)
   - Capa 2 (stock alerts, delayed orders)
   - Capa 3 (4 metrics under [7d/30d] filter: inflow-vs-outflow, cycle-time, daily-orders, completions-per-day)
   - Análisis section (3 blocks: warehouse revenue, payment-method mix, gestor ranking)
   - Removed KPI tiles, margin, and AOV from anywhere on route

2. **Data Derives Only From Seeded Data and Each Order's Own Frozen Rate Snapshot** (Decisiones-specific)
   - Emphasized period anchoring to `SeedState.generatedAt`
   - Removed margin/cost aggregation scenarios (moved to Finanzas per salesops-13)
   - Added period-computation and stage-age scenarios

3. **Ventas por Almacén Aggregates Revenue by Warehouse**
   - Added `[7d/30d]` period filter anchored to `generatedAt`
   - Caller pre-filters qualifying orders before calling builder
   - Added scenario for switching period without SeedState mutation

4. **Mix por Moneda Aggregates Orders by Payment Method**
   - Added `[7d/30d]` period filter anchored to `generatedAt`
   - Pre-filtered qualifying order set before aggregation
   - Added scenario for currency-mix switching without SeedState mutation

5. **Ranking de Gestores Computes Sales, AOV, and Commission Earned/Pending**
   - Decisiones now offers independent `[7d/30d/General]` period selector
   - Caller pre-filters qualifying orders by period (or passes unfiltered for General)
   - Finanzas continues with unfiltered set (out of scope)
   - Added scenarios for period-specific gestor rows and General unfiltered aggregation

6. **Empty State When No Verificado-or-Later Orders Exist**
   - Capa 1.1/1.2 and Capa 2 are exempt (render real data or infrastructure)
   - Capa 1.3, Capa 3, Análisis show empty-state when no verificado-or-later orders
   - Updated scenarios to reflect layer-specific exemptions

#### ADDED Requirements (11 new)

1. **Capa 1.1 — Pedidos Activos por Estado y Almacén**
   - Bar chart over 3 non-completed states (creado, verificado, transportando)
   - Fixed warehouse colors (Pinar verde, Consolación azul, Herradura amarillo)
   - Zero-padded per (state, warehouse) pair

2. **Capa 1.2 — Transportista Capacity and "Sin Chofer"**
   - Ocupado/disponible classification per transportista
   - Independent "Sin chofer" count (verificado orders w/o transportistaId)

3. **Capa 1.3 — Comisiones por Pagar (Total y Más Atrasadas)**
   - Total pending MN over verificado/transportando/entregado unpaid
   - "Más atrasadas" list (1 row per gestor, most-overdue unpaid entregado)
   - Días de atraso anchored to generatedAt
   - Sorted by overdue days descending

4. **Capa 2 — Pedidos Demorados / Trabados**
   - Flags orders as demorado when stage age exceeds per-stage threshold
   - Thresholds defined by sdd-design (not this spec)
   - Excludes entregado/comision_pagada
   - Age anchors to generatedAt

5. **Capa 3 — `[7d/30d]` Period Filter Anchored to generatedAt**
   - Single shared selector for all 4 Capa 3 blocks
   - Window = (generatedAt − N days, generatedAt]
   - Switching recomputes all 4 blocks without SeedState re-read/mutation

6. **Capa 3 — Entra vs. Sale (Período)**
   - Creados (createdAt in window) vs entregados (deliveredAt in window)
   - Backlog signal when creados exceeds entregados

7. **Capa 3 — Ciclo Promedio (Creado → Entregado)**
   - Average days between createdAt and deliveredAt (delivered in window only)
   - Delta vs prior-equal-length period
   - Safe "flat" when prior window has zero qualifying orders

8. **Capa 3 — Pedidos por Día With a Nº/Valor Toggle**
   - Daily data points (including zero-order days)
   - Toggle: "Nº pedidos" (count) vs "Valor de venta" (totalUSD)
   - Daily average + Δ% vs prior period (safe "up" when prior `0`, current `> 0`)

9. **Capa 3 — Pedidos Completados por Día With Tasa de Completado**
   - Daily deliveries (including zero-completion days)
   - Same Nº/Valor toggle as pedidos-por-día
   - Tasa de completado = entregados-en-período ÷ creados-en-período (safe `0` when denom `0`)

10. **Ventas por Almacén (re-specified for Análisis)**
    - Now includes period filter (inherits from Capa 3 or independent Análisis selector)
    - All warehouses appear, including zero-sales in selected period

11. **Mix por Moneda (re-specified for Análisis)**
    - Now includes period filter
    - Buckets per payment method in selected period
    - Unrecognized methods grouped into "otros"

#### REMOVED Requirements (5)

1. **KPI Header Has Exactly Four Tiles (Decisiones)**
   - Reason: operational redesign has no top-of-page KPI header

2. **KPI Formulas (Decisiones)**
   - Reason: KPI header no longer exists

3. **Every KPI Tile Shows a 10-Day vs Prior-10-Day Trend**
   - Reason: KPI header pattern superseded by Capa 3's [7d/30d] filter

4. **Sales Trend Visual Spans the Last 20 Days With a Cantidad/Valor Toggle**
   - Reason: superseded by Capa 3's "Pedidos por día" block with [7d/30d] window

5. **Pedidos por Etapa Is a Distribution Snapshot, Not a Conversion Funnel**
   - Reason: superseded by Capa 1.1 "Pedidos activos por estado y almacén" card

### Purpose Section Update

Updated the introductory `## Purpose` section (line 5) to:
- Task 14 complete: Redesign Decisiones as operational cockpit with 3 layers (pulso inmediato, qué atiendo YA, comportamiento en el tiempo with [7d/30d] filter) plus Análisis section (3 blocks: Ventas por almacén, Mix por moneda, Ranking de gestores), removing KPI header and margin/AOV blocks

---

## Implementation Summary

**Apply Phase Complete**: All 51/51 tasks executed and verified (Batch 1–8, completion rate 100%).

### Code Changes (verified GREEN)

- **routes/decisiones.tsx**: Replaced KPI-header/4-visuals/2-blocks render with Capa 1/Capa 2/Capa 3/Análisis structure; added [7d/30d] period filter for Capa 3 and Análisis Ventas/Mix
- **domain/decisiones-dashboard.ts**: Removed `buildKpiHeader`, `buildSalesTrend`, `buildStageDistribution`; added `buildActiveOrdersByStateAndWarehouse`, `buildTransportistaCapacity`, `buildComisionesPorPagar`, `buildPedidosDemorados`, `buildEntraVsSale`, `buildCicloPromedio`, `buildPedidosPorDia`, `buildCompletedOrdersPorDia`, and period-filtering helpers
- **components/decisiones/**: Reorganized from KPI/visuals/blocks into Capa1Cards/Capa2Section/Capa3Section/AnalisisBlocks; added period-filter UI (shared for Capa 3 + Análisis Ventas/Mix, independent for Ranking de gestores)
- **Tests**: 75 test files / 531 tests, all GREEN; full coverage of new Capa layers, period filtering, empty-state logic, and gestor-ranking independent selector
- **No code changes to /finanzas, /operador-gestores, /operador-almacen, /tasas, or other routes** — isolated to Decisiones

### Design.md LOCKED Decisions Honored

- **STAGE_DELAY_THRESHOLD_DAYS**: {creado: 2, verificado: 3, transportando: 2} ✓
- **Warehouse fixed colors**: Pinar #16a34a (verde), Consolación #2563eb (azul), Herradura #eab308 (amarillo) ✓
- **Empty-state gating**: Capa 1.1/1.2/Capa 2 always render; Capa 1.3/Capa 3/Análisis gated ✓
- **Tasa de completado denominator**: Total creados in window (entry-cohort, matches "entra vs sale" denominator) ✓
- **Margin and AOV exclusion**: CONFIRMED — no margin or AOV anywhere on /decisiones ✓

### No Collateral Damage

- Full diff: only openspec spec.md, decisiones components, domain helpers, and decisiones route touched
- No finanzas, inventory, operador-*, tasas, or core-model changes
- Finanzas dashboard: 27/27 tests passing, unmodified
- Dangling references check: zero consumers of removed symbols (KpiHeaderView, buildKpiHeader, SalesTrendView, buildSalesTrend, StageDistributionView, buildStageDistribution)

### Test Quality (Strict TDD)

- No tautologies detected
- Minor style gap: active-orders-chart.test.tsx wh3Bars loop lacks own length assertion (low risk, dataset is 3x3 fixed grid) — SUGGESTION only
- Route test suite (9 tests): covers composition, period-toggle behavior (shared Capa3+Análisis vs independent Gestor selector), empty-state exemptions, read-only assertion
- New Capa helper tests: show real triangulation (días de atraso 3 vs 9, sort order verification, zero-guarding for safe deltas)

### Residual Notes (SUGGESTION-level only)

1. **Ghost-loop style gap**: active-orders-chart.test.tsx wh3Bars.forEach lacks its own `.toHaveLength()` check (low-risk, fixed-size grid)
2. **Design.md prose**: "hasData gate" decision row worded ambiguously (actual code correctly implements spec.md's "no verificado-or-later" check)
3. **Filter architecture**: Capa 3 and Análisis Ventas/Mix SHARE one windowDays state (documented as Batch 7 Deviation #2), matching maquette's two-widget layout while keeping design.md's single-shared-state data flow. Ranking de gestores has independent [7d/30d/General] selector per spec. This is deliberate and well-documented; flagged here in case product intent diverges.

---

## Traceability

### Artifact Observation IDs (Engram)

This archive report consolidates the full SDD cycle:

| Artifact | Topic Key | ID |
|---|---|---|
| Proposal | `sdd/salesops-14-decisiones-operativo/proposal` | (in engram) |
| Spec | `sdd/salesops-14-decisiones-operativo/spec` | (in engram) |
| Design | `sdd/salesops-14-decisiones-operativo/design` | (in engram) |
| Tasks | `sdd/salesops-14-decisiones-operativo/tasks` | (in engram) |
| Apply-Progress (Batches 1–8) | `sdd/salesops-14-decisiones-operativo/apply-progress` | (in openspec) |
| Verify Report | `sdd/salesops-14-decisiones-operativo/verify-report` | ID#1167 |
| Archive Report | `sdd/salesops-14-decisiones-operativo/archive-report` | (this file + engram) |

---

## Merged Files & Archive State

### Files in Change Folder (to be archived)
- `proposal.md` — intent, scope, approach
- `spec.md` — delta spec with MODIFIED + ADDED + REMOVED requirements
- `design.md` — technical design with LOCKED decisions (thresholds, colors, gating, formulas)
- `tasks.md` — all 51/51 tasks, completion status, and verification evidence
- `apply-progress.md` — batches 1–8 narrative, task checks, test results per batch
- `archive-report.md` — this file

### Main Spec Updated
- `/openspec/specs/salesops-mvp/spec.md`
  - Purpose section updated for Task 14 completion
  - 1 MODIFIED: Decisiones Route Renders (new 3-layer structure)
  - 1 MODIFIED: Data Derives (decisiones-specific, removed margin/cost, added period scenarios)
  - 11 ADDED: Capa 1.1, 1.2, 1.3, Capa 2, Capa 3 blocks (5 blocks), Análisis blocks (3 blocks), Empty-state, No-Margin-AOV requirement
  - 5 REMOVED: KPI Header, KPI Formulas, 10-Day Trend, Sales Trend, Pedidos por Etapa
  - 4 MODIFIED: Ventas por Almacén, Mix por Moneda, Ranking de Gestores, Empty State (all now include period filtering or exemption details)

### Archive Destination
Original folder: `/openspec/changes/salesops-14-decisiones-operativo/`  
Archived to: `/openspec/changes/archive/2026-07-15-salesops-14-decisiones-operativo/`  
(All files listed above moved as a single unit with date prefix)

---

## Summary

**Change**: Redesign `/decisiones` from a sales/margin analytical dashboard (KPI header + 4 visuals + 2 blocks) into an operational cockpit (3 layers of actionable intelligence + Análisis section), with period filtering on Capa 3 and Análisis blocks, removing margin and AOV reads (now Finanzas-exclusive).

**Result**: Decisiones is now a true **operational** decision support tool focusing on order flow, transporter capacity, and commission payables (Capa 1), inventory and delay alerts (Capa 2), trend analysis over flexible [7d/30d] windows (Capa 3), and business-context analytics (Análisis: revenue-by-warehouse, payment-method exposure, per-gestor performance). Every metric anchors to `SeedState.generatedAt`, uses frozen order data, and respects the read-only contract. Profitability reads (margin, AOV) are now exclusively Finanzas-owned per salesops-13.

**Verification**: PASS — 531/531 tests, 0 typecheck errors, 0 CRITICAL, 0 WARNING, 4 SUGGESTIONS (all low-risk: style gaps, prose ambiguity, architecture note).

**SDD Cycle**: Complete. Change is archived and ready for the next iteration.

---

## Design Decisions Locked in This Change

- **Capa 1**: Pulso inmediato — three cards (orders-by-state-warehouse, transportista-capacity, commissions-pending)
- **Capa 2**: Qué atiendo YA — stock alerts + delayed-orders flags (thresholds per stage, anchored to generatedAt)
- **Capa 3**: Comportamiento en el tiempo — [7d/30d] filter (single shared state for all 4 blocks: entra-vs-sale, ciclo-promedio, pedidos-por-día, completados-por-día)
- **Análisis**: Business context — Ventas por almacén (period-filtered), Mix por moneda (period-filtered), Ranking de gestores (independent [7d/30d/General] selector)
- **Empty-state logic**: Capa 1.1/1.2 and Capa 2 ALWAYS render (infrastructure + non-verificado data); Capa 1.3/Capa 3/Análisis show empty-state when no verificado-or-later orders exist
- **Margin/AOV**: Banned from `/decisiones` entirely, per salesops-13 archive (2026-07-15)
