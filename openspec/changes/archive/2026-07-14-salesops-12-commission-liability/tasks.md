# Tasks: Reverse "Cobrado vs Pendiente" to Real Revenue

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~550-650 (2 domain files, 4 components incl. 2 renames, 2 help-content files, 2 route wire-ups, 7 test files incl. 2 renames) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (finanzas domain + components + help + wiring) → PR 2 (decisiones KPI-only + shared verification) |
| Delivery strategy | ask-on-risk (owner-approved size:exception — applied in a single cohesive work unit) |
| Chain strategy | pending |

Decision needed before apply: Yes — RESOLVED: owner approved `size:exception`, implemented as ONE cohesive apply batch (not split) so finanzas/decisiones never contradict each other.
Chained PRs recommended: Yes (not applied — see above)
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Finanzas: domain builders (`buildRevenueTrend`/`buildWarehouseRevenue`) + component renames + KPI 4-tile + help copy + route wiring + its tests | PR 1 | Largest slice; self-contained, finanzas-only; base = tracker/main per chosen chain strategy |
| 2 | Decisiones: KPI-tile-only removal (no new builders) + help copy + its tests | PR 2 | Small, independent of PR 1 logic (shares no runtime code); depends on PR 1 only if `feature-branch-chain` chosen for base |
| 3 | Cross-cutting no-receivable-framing verification pass (spec scenario "No Customer-Receivable Framing Anywhere") | PR 2 (folded in) or standalone | Grep-based copy audit across both routes; cheap, no new logic |

---

## Phase 1: Domain — `finanzas-dashboard.ts` (RED → GREEN)

- [x] 1.1 RED: In `app/domain/__tests__/finanzas-dashboard.test.ts`, replace `buildCashFlowTrend`/`buildWarehouseCashFlow` imports with `buildRevenueTrend`/`buildWarehouseRevenue`; rewrite the trend block (was L170-213) to assert `RevenueTrendPoint.revenueUSD` per day (old `cobradoUSD+pendienteUSD` sum) and the warehouse block (was L304-338) to assert `WarehouseRevenueRow.revenueUSD`/`count`; drop the two KPI `cobradoUSD/pendienteUSD` asserts (was L91-92). Run `pnpm test` — confirm RED (missing exports).
- [x] 1.2 GREEN: In `app/domain/finanzas-dashboard.ts`, delete `COBRADO_STATES`/`PENDIENTE_STATES` (L25-26), `FinanceKpiHeaderView.cobradoUSD/.pendienteUSD` (L73-74), their locals (L102-106) and `buildKpiTrend` returns (L117-118).
- [x] 1.3 GREEN: Replace `CashFlowTrendPoint`/`CashFlowTrendView`/`buildCashFlowTrend` (L127-175) with `RevenueTrendPoint`/`RevenueTrendView`/`buildRevenueTrend` per design §1a (same 20-day window, single unsplit `revenueUSD` per day, `state !== 'creado'` filter).
- [x] 1.4 GREEN: Replace `WarehouseCashFlowRow`/`WarehouseCashFlowView`/`buildWarehouseCashFlow` (L287-315) with `WarehouseRevenueRow`/`WarehouseRevenueView`/`buildWarehouseRevenue` per design §1a (revenue+count per warehouse, desc sort, zero-order warehouses included).
- [x] 1.5 GREEN: In `FinanceDashboardView`/`buildFinanceDashboard`, rename field `cashFlowTrend` → `revenueTrend`, `warehouseCashFlow` → `warehouseRevenue`; wire `buildRevenueTrend(state)`/`buildWarehouseRevenue(state)`; update module doc comment (L6-20) to drop cobrado/pendiente framing. **Deviation**: the module doc comment (L6-20) never actually mentioned cobrado/pendiente — it only described the "self-contained, never imports decisiones" rule. No-op on that sub-clause; field renames + wiring done as specified.
- [x] 1.6 VERIFY: `pnpm test app/domain/__tests__/finanzas-dashboard.test.ts` green. — 17/17 passed.

## Phase 2: Domain — `decisiones-dashboard.ts` (RED → GREEN)

- [x] 2.1 RED: In `app/components/decisiones/__tests__/kpi-header.test.tsx`, drop fixture `cobradoUSD/pendienteUSD` (L18-19); change labels array to `['Ventas','Margen','Pedidos','Comisión pendiente']`; change "exactly 5 StatTiles" assertion (L23,26) to 4. Run `pnpm test` — confirm RED.
- [x] 2.2 GREEN: In `app/domain/decisiones-dashboard.ts`, delete `COBRADO_STATES`/`PENDIENTE_STATES` (L65-66), `KpiHeaderView.cobradoUSD/.pendienteUSD` (L59-60), locals (L113-114,116-117), and the two returns (L126-127); update `buildKpiHeader` doc comment (L84-90) to drop cobrado/pendiente sentence. Do NOT touch `buildSalesTrend`/`buildWarehouseSales` — they are already correct revenue builders (design §1b).
- [x] 2.3 VERIFY: `pnpm test app/components/decisiones/__tests__/kpi-header.test.tsx` green. — 3/3 passed.

## Phase 3: Components — finanzas KPI + trend + warehouse (RED → GREEN)

- [x] 3.1 RED: In `app/components/finanzas/__tests__/finance-kpi-header.test.tsx`, drop fixture `cobradoUSD/pendienteUSD` (L10-11); remove asserts "Cobrado vs pendiente"/"$150.00"/"Pendiente $275.00" (L29-31); change "renders all 5 tiles" (L20) to 4; change InfoPopover count `.toBe(5)` (L44) to 4. Run `pnpm test` — confirm RED.
- [x] 3.2 GREEN: In `app/components/finanzas/finance-kpi-header.tsx`, remove the "Cobrado vs pendiente" `StatTile` (L38-45) and its `FINANZAS_HELP.cobradoPendiente` reference; `lg:grid-cols-5` → `lg:grid-cols-4` (L23); update doc comment (L13-20) to describe 4 tiles.
- [x] 3.3 VERIFY: `pnpm test app/components/finanzas/__tests__/finance-kpi-header.test.tsx` green. — 2/2 passed.
- [x] 3.4 RED: Rename test file `app/components/finanzas/__tests__/cash-flow-trend-section.test.tsx` → `revenue-trend-section.test.tsx`; change fixture `buildTrend` to `{ dayOffset, revenueUSD }` (was L10 `cobradoUSD/pendienteUSD`); replace default-polyline + toggle-to-pendiente asserts (L16-33) with a single `svg[role=img]` + single `polyline` assert; DELETE the toggle test entirely; change heading assert (L38) to `/ventas por día/i`; assert `ariaLabel` `/ventas/i`. Run `pnpm test` — confirm RED.
- [x] 3.5 GREEN: Rename `app/components/finanzas/cash-flow-trend-section.tsx` → `revenue-trend-section.tsx`, component `CashFlowTrendSection` → `RevenueTrendSection`; prop type → `RevenueTrendView`; map `points` to `{ label: 'd-'+dayOffset, value: revenueUSD }`; delete `useState`, `Series` type, both toggle `<button>`s; render single `AreaTrend` with `ariaLabel="Ventas por día"`; heading "Ventas por día (últimos 20 días)"; help key → `FINANZAS_HELP.tendenciaVentas`.
- [x] 3.6 VERIFY: `pnpm test app/components/finanzas/__tests__/revenue-trend-section.test.tsx` green. — 2/2 passed.
- [x] 3.7 RED: Rename test file `app/components/finanzas/__tests__/warehouse-cash-flow.test.tsx` → `warehouse-revenue.test.tsx`; change row fixtures to `{ revenueUSD, count }` (was L9-10 `cobradoUSD/pendienteUSD`); change title assert (L33) from "Cobros pendientes por almacén" to "Ventas por almacén"; assert "Ventas"/"Pedidos" column cells. Run `pnpm test` — confirm RED.
- [x] 3.8 GREEN: Rename `app/components/finanzas/warehouse-cash-flow.tsx` → `warehouse-revenue.tsx`, component `WarehouseCashFlow` → `WarehouseRevenue`; prop type → `WarehouseRevenueView`; heading "Ventas por almacén"; help key → `FINANZAS_HELP.ventasPorAlmacen`; columns "Almacén" | "Ventas" (`formatMoney(row.revenueUSD)`) | "Pedidos" (`row.count`).
- [x] 3.9 VERIFY: `pnpm test app/components/finanzas/__tests__/warehouse-revenue.test.tsx` green. — 2/2 passed.

## Phase 4: Components — decisiones KPI (RED → GREEN, no new builders)

- [x] 4.1 GREEN (test already updated in 2.1): In `app/components/decisiones/kpi-header.tsx`, remove the "Cobrado vs pendiente" `StatTile` (L53-60) and its `DECISIONES_HELP.cobradoPendiente` reference; `lg:grid-cols-5` → `lg:grid-cols-4` (L21); update doc comment (L13-18).
- [x] 4.2 VERIFY: `pnpm test app/components/decisiones/__tests__/kpi-header.test.tsx` green (rerun from 2.1's RED). — 3/3 passed.

## Phase 5: Help copy (RED → GREEN)

- [x] 5.1 GREEN: In `app/components/finanzas/help-content.ts`, delete `cobradoPendiente` (L33-36); rename `tendenciaCobros` (L47-50) → `tendenciaVentas` (title "Ventas por día", revenue-over-20-days text, no cobrado/pendiente/estimado wording); rename `cobrosPendientesAlmacen` (L69-72) → `ventasPorAlmacen` (title "Ventas por almacén", revenue-per-warehouse text, drop "trabada / no terminó de entrar"); fix `ingresosPorEstado` (L55-58) to drop "todavía no terminó de convertirse en cobro"; update file header caveat block (L6-16) to remove the "Cobrado vs pendiente is a STATE proxy" bullet and salesops-11 Decision 4 reference. Voseo Spanish, no receivable framing.
- [x] 5.2 GREEN: In `app/components/decisiones/help-content.ts`, delete `cobradoPendiente` (L30-32) entirely (tile is gone).
- [x] 5.3 VERIFY: `pnpm test` for both help-content-consuming component suites (finance-kpi-header, decisiones kpi-header, revenue-trend-section, warehouse-revenue) still green after copy edits. — all 4 suites green.

## Phase 6: Route wiring (RED → GREEN)

- [x] 6.1 RED: In `app/routes/__tests__/finanzas.test.tsx`, remove assert "Cobrado vs pendiente" (L25); change heading assert (L30) to `/ventas por día/i`; change "Cobros pendientes por almacén" asserts (L37, empty-state L80) to "Ventas por almacén"; update comment "5 KPI tiles" (L20) to "4 KPI tiles". Run `pnpm test` — confirm RED.
- [x] 6.2 GREEN: In `app/routes/finanzas.tsx`, update import for `RevenueTrendSection`/`WarehouseRevenue` (was L6, L11); wire `trend={view.revenueTrend}` (L52) and `warehouseRevenue={view.warehouseRevenue}` (L62); update route doc comment (L18-29) that mentions the cobrado/pendiente toggle.
- [x] 6.3 VERIFY: `pnpm test app/routes/__tests__/finanzas.test.tsx` green. — 4/4 passed.
- [x] 6.4 RED: In `app/routes/__tests__/decisiones.test.tsx`, remove the "Cobrado vs pendiente" assertion (L27). Run `pnpm test` — confirm RED (or already-passing no-op if route needs no change; check L27 removal alone doesn't require route edits, since Phase 4 already removed the tile). **Result: confirmed no-op** — removing the assertion left the suite green immediately (`decisiones.tsx` route needed zero edits); Phase 4's component change already made the old assertion obsolete.
- [x] 6.5 VERIFY: `pnpm test app/routes/__tests__/decisiones.test.tsx` green. — 5/5 passed.

## Phase 7: No-receivable-framing verification (cross-cutting)

- [x] 7.1 Grep `app/components/finanzas`, `app/components/decisiones`, `app/routes` for "por cobrar", "falta cobrar", "no tenés en la mano", "cobrado", "pendiente en tránsito" (excluding legit commission-liability "Comisión pendiente" usages) — confirm zero remaining matches per spec scenario "No screen renders receivable language". **Result**: 3 matches remain, all in internal JSDoc comments (not rendered UI copy): `revenue-trend-section.tsx:15` ("no cobrado/pendiente subset to toggle between" — explains the concept's absence), `help-content.ts:8` (meta-comment stating no copy frames revenue as "por cobrar"), `commission-liability-donut.tsx:14` (contrasts gestor "pagada" vs a client "cobrado" event — clarifies the ONE legitimate liability). Zero matches in visible strings/JSX text.
- [x] 7.2 Confirm commission KPI/donut copy still frames commission as owner-owes-gestor (unchanged, out of scope per design §6) — spot-check `commission-liability-donut.tsx` and its help copy untouched. **Confirmed**: `commission-liability-donut.tsx` and `FINANZAS_HELP.comisionPagadaPendiente`/`comisionPendiente` untouched; copy still reads "Lo que todavía les debés a tus gestores" (owner owes gestores), never money owed to the owner.
- [x] 7.3 Confirm `app/components/charts/__tests__/stat-tile.test.tsx` needs no change (generic "pendiente" match, unrelated per design §4 note). **Confirmed**: only match is `"Comisión pendiente"` (legit commission usage) — file untouched.

## Phase 8: Full suite + build verification

- [x] 8.1 VERIFY: Run full `pnpm test` (or `pnpm --filter @store-mgmt/salesops-mvp test`) — all suites green, including the untouched `domain/__tests__/decisiones-dashboard.test.ts` (confirmed no cobrado/pendiente references, stays green with no edits). **Result: 68/68 test files, 456/456 tests passed** (down from 458 baseline — 2 net tests removed by design: the cobrado/pendiente KPI split assertion and the toggle-series test, both intentionally deleted, no replacement).
- [x] 8.2 VERIFY: Type-check / build (`pnpm build` or project's typecheck script) to catch any stale `CashFlowTrend*`/`WarehouseCashFlow*` type references left in imports. **Result**: `pnpm typecheck` (`react-router typegen && tsc`) exits 0, zero errors.

---

## Apply Summary (all 33/33 tasks complete)

Implemented as ONE cohesive work unit (size:exception, owner-approved) rather than
the chained-PR split originally forecast, per explicit orchestrator instruction —
finanzas and decisiones changed together so the two dashboards never contradict
each other mid-rollout.

**Baseline safety net**: 68 test files / 458 tests passing before any edit.
**Final state**: 68 test files / 456 tests passing (delta: -2, both intentional
deletions — no regressions). Typecheck: exit 0.
