# Archive Report — salesops-12-commission-liability

**Status**: SUCCESS  
**Date**: 2026-07-14  
**Change**: salesops-12-commission-liability  
**Artifact Store**: hybrid (openspec + engram)

---

## Verification Verdict

The change was verified with **PASS** status:
- **0 CRITICAL**, **0 WARNING**, **1 SUGGESTION**
- **Test Suite**: 68/68 test files, 456/456 tests passed
- **Typecheck**: 0 errors
- **Verification**: Independently re-run and confirmed

Verification details: See `verify-report.md` in this folder.

---

## Merged Specs

### Main Spec: `/openspec/specs/salesops-mvp/spec.md`

Merged 6 MODIFIED requirements and 1 ADDED requirement from the delta spec:

#### MODIFIED Requirements

1. **KPI Header Has Exactly Four Tiles** (Decisiones)
   - Changed from 5 tiles to 4 tiles
   - Removed "Cobrado vs pendiente" tile
   - Requirement renamed to emphasize "Four" not "Five"
   - Removed state-grouping references for the dropped tile

2. **KPI Formulas** (Decisiones)
   - Removed table rows: "Cobrado (count/USD)" and "Pendiente/en tránsito (count/USD)"
   - Kept remaining formulas: Ventas, Margen (USD + %), Pedidos, Ticket promedio, Comisión pendiente

3. **Layer 1 KPI Header Has Exactly Four Tiles With Period Trend** (Finanzas)
   - Changed from 5 tiles to 4 tiles
   - Removed "Cobrado vs pendiente (USD)" row from the tile table
   - Kept tiles: Ingresos facturados, Ingresos liquidados, Comisión pendiente, Margen neto
   - Updated scenario from "5 tiles" to "4 tiles"

4. **Layer 2 Renders Four Financial Visuals** (Finanzas)
   - First visual changed from "Tendencia de cobros (20d, toggle cobrado/pendiente)" to "Tendencia de ventas (20d, single series)"
   - Removed toggle scenario: "Toggling the trend does not touch SeedState"
   - Added new scenario: "Trend has no toggle and implies no pending collection"
   - No change to the other three visuals (commission donut, revenue by state, currency mix)

5. **Layer 3 Renders Three Actionable Finance Blocks** (Finanzas)
   - Second block changed from "Cobros pendientes por almacén" to "Ventas por almacén"
   - Changed formula from "`totalUSD` by `warehouseId`, cobrado/pendiente" to "`Σ totalUSD` by `warehouseId`, qualifying, no split"

6. **Finanzas Read-Only Screen With No Mutation Affordance** (Finanzas)
   - Removed the sentence allowing "A local view-only toggle (e.g. cash-flow cobrado/pendiente)"
   - Requirement now forbids mutation affordance without any toggle exception

#### ADDED Requirement

7. **No Customer-Receivable Framing Anywhere In The App**
   - New requirement prohibiting any customer-receivable framing
   - Covers all copy, charts, tables across `/finanzas` and `/decisiones`
   - Two scenarios verify the ban on "por cobrar" language and confirm commission liability still frames owner as debtor

### Purpose Section Update

Updated the introductory `## Purpose` section (line 5) to:
- Decisiones: "4 tiles with 10-day trends" (was "5 tiles")
- Finanzas: "4 KPI tiles" (was "5 KPI tiles")
- Finanzas Layer 2: "revenue-over-time trend" instead of "cash-collection trend with cobrado/pendiente toggle"
- Finanzas Layer 3: "revenue per warehouse" instead of "pending cash per warehouse"

---

## Implementation Summary

**Apply Phase Complete**: All 33/33 tasks executed as a single cohesive work unit (size:exception, owner-approved).

### Code Changes (verified GREEN)
- **finanzas-dashboard.ts**: Removed `COBRADO_STATES`/`PENDIENTE_STATES`, `cobradoUSD`/`pendienteUSD` fields; replaced `buildCashFlowTrend` with `buildRevenueTrend`, `buildWarehouseCashFlow` with `buildWarehouseRevenue`
- **decisiones-dashboard.ts**: Removed `COBRADO_STATES`/`PENDIENTE_STATES`, `cobradoUSD`/`pendienteUSD` fields
- **Components**: Renamed `cash-flow-trend-section.tsx` → `revenue-trend-section.tsx`, `warehouse-cash-flow.tsx` → `warehouse-revenue.tsx`; removed "Cobrado vs pendiente" tiles from both KPI headers; dropped cobrado/pendiente toggle; dropped toggle scenario tests
- **Help copy**: Removed `cobradoPendiente` entries; renamed `tendenciaCobros` → `tendenciaVentas`, `cobrosPendientesAlmacen` → `ventasPorAlmacen`
- **Routes**: Updated imports and wiring for renamed components
- **Tests**: 7 test files updated; 2 intentional test removals (cobrado/pendiente KPI split, toggle series test)

### Test Results
- **Baseline**: 68 test files / 458 tests passing
- **Final**: 68 test files / 456 tests passing (delta: -2, both intentional)
- **Typecheck**: 0 errors
- **Dead Code**: Zero matches for `COBRADO_STATES|PENDIENTE_STATES|cobradoUSD|pendienteUSD|buildCashFlowTrend|buildWarehouseCashFlow`

### Residual Comments (SUGGESTION-level, not blocking)
Four JSDoc comments remain referencing "cobrado" by name, all internal and non-rendered. These explain the ABSENCE of the concept, not its presence. Paths:
- `finanzas-dashboard.ts:130`
- `commission-liability-donut.tsx:14`
- `help-content.ts:8`
- `revenue-trend-section.tsx:15`

Future cosmetic pass could rephrase to avoid the term entirely (e.g., "unsettled/collected" → "realized revenue").

---

## Traceability

### Artifact Observation IDs (Engram)

This archive report consolidates the full SDD cycle. All prior artifacts are persisted in Engram:

| Artifact | Topic Key | Type |
|---|---|---|
| Proposal | `sdd/salesops-12-commission-liability/proposal` | architecture |
| Spec | `sdd/salesops-12-commission-liability/spec` | architecture |
| Design | `sdd/salesops-12-commission-liability/design` | architecture |
| Tasks | `sdd/salesops-12-commission-liability/tasks` | architecture |
| Verify Report | `sdd/salesops-12-commission-liability/verify-report` | architecture |
| Archive Report | `sdd/salesops-12-commission-liability/archive-report` | architecture |

---

## Merged Files & Archive State

### Files in Change Folder (to be archived)
- `exploration.md` — initial codebase exploration
- `proposal.md` — intent, scope, approach
- `spec.md` — delta spec with MODIFIED + ADDED requirements
- `design.md` — technical design with decisions
- `tasks.md` — all 33/33 tasks, completion status, and verification evidence
- `verify-report.md` — independent verification with 0 CRITICAL, 0 WARNING
- `archive-report.md` — this file

### Main Spec Updated
- `/openspec/specs/salesops-mvp/spec.md` — purpose section + 6 MODIFIED + 1 ADDED requirements merged

### Archive Destination
Original folder: `/openspec/changes/salesops-12-commission-liability/`  
Archived to: `/openspec/changes/archive/2026-07-14-salesops-12-commission-liability/`  
(All files listed above moved as a single unit with date prefix)

---

## Summary

**Change**: Reverse the false "Cobrado vs Pendiente" customer-receivable concept; every sale is fully collected.

**Result**: Both `/finanzas` and `/decisiones` now present revenue truthfully (4 tiles each, no receivable framing), repurposing the freed visuals to real revenue trends and per-warehouse sales. The only liability shown remains the owner's commission debt to gestores (unchanged, verified correct).

**Verification**: PASS — 456/456 tests, 0 typecheck errors, 0 CRITICAL, 0 WARNING.

**SDD Cycle**: Complete. Change is archived and ready for the next iteration.
