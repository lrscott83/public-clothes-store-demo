# Archive Report — salesops-10-decisiones-dashboard (Pantalla 6: Dashboard de Decisiones)

**Date**: 2026-07-12
**Change**: salesops-10-decisiones-dashboard (Task 10)
**Status**: ARCHIVED (PASS — verification complete, 403/403 tests pass, typecheck exit 0)

## Summary

Pantalla 6 (Decisiones) — 3-Layer Visual Decision Dashboard has been fully implemented, verified, and archived. The `/decisiones` route now renders a comprehensive business intelligence screen with 5 KPI tiles (10-day trend comparison), 4 visualization layers (sales trend, order stage distribution, warehouse sales, payment method mix), and 3 actionable decision blocks (gestor ranking, top products by margin, inventory alerts + lowest-margin orders). Implementation follows strict TDD with pure domain helpers and presentational components; uses custom inline SVG chart primitives (zero new dependencies); preserves direct-render container pattern; all data sourced 100% from seeded state with frozen per-order exchange-rate snapshots.

## Change Scope

- **In**: `buildDecisionesDashboard` orchestrator helper + 9 sub-helpers (period split, KPI calc, sales trend, stage distribution, warehouse sales, currency mix, gestor ranking, top products, inventory alerts) + 4 generic SVG chart primitives (StatTile, BarChart, AreaTrend, DonutChart) + 9 section components + container rewrite + comprehensive test coverage (58 test files total, 403 tests)
- **Out**: No mutations, no schema changes, no new store actions, no new dependencies; `creado` orders excluded from revenue/margin aggregations (present only in stage distribution counts); read-only screen with no form/buttons; frozen rate snapshots used exclusively (never live rates)
- **Schema impact**: Zero — `app/domain/types.ts` and `app/store/seed-store.ts` untouched

## Verification Verdict

**PASS** (Strict TDD Mode)

- **Test Evidence**: 403/403 tests passing (58 test files, 100% pass rate), independently re-run
- **Typecheck**: exit code 0, clean
- **Task Completeness**: All 4 phases complete with all RED→GREEN cases verified (Phase 1: 15 RED cases, Phase 2: 8 RED cases, Phase 3: 18 RED cases, Phase 4: 7 RED cases)
- **Spec Compliance**: All 22 requirement groups (1 MODIFIED route + 1 MODIFIED empty-state + 20 ADDED requirements) have covering tests; frozen-rate immutability mandatory regression verified non-vacuous; trend-arrow zero-prior-window case verified; orphan-product skip verified; all KPI formulas verified
- **Issues**: CRITICAL: none. WARNING: none. SUGGESTION: none

## Commits on salesops-mvp Branch

- `2263d65` sdd-apply: Phase 1 — domain helpers + unit tests (buildDecisionesDashboard + 9 sub-helpers)
- `2794f91` sdd-apply: Phase 2 — chart primitives + render tests (StatTile, BarChart, AreaTrend, DonutChart + palette)
- `e819029` sdd-apply: Phase 3-4 — section components + container rewrite (KpiHeader, SalesTrendSection, StageDistribution, WarehouseSales, CurrencyMix, GestorRanking, TopMarginProducts, InventoryAlerts, LowestMarginOrders + decisiones.tsx)
- `6b0f484` sdd-verify: Post-verification commit — (no code changes, clean working tree)
- `aff2a6e` sdd-verify: CRITICAL #1 RESOLVED — KPI trend arrow now renders correctly when prior window is 0 (StatTile gained explicit `trend` prop)
- `037675c` sdd-verify: Additional fix — TopMarginProducts now caps at top 8 products with truncated names (22 chars max)

## Artifacts Archived

All change artifacts have been copied to this archive directory:

| Artifact | Topic Key (Engram) | Observation ID | File Path |
|----------|-------------------|----------------|-----------|
| Proposal | `sdd/salesops-10-decisiones-dashboard/proposal` | 916 | `proposal.md` |
| Spec (Delta) | `sdd/salesops-10-decisiones-dashboard/spec` | 919 | `spec.md` |
| Design | `sdd/salesops-10-decisiones-dashboard/design` | 920 | `design.md` |
| Tasks | `sdd/salesops-10-decisiones-dashboard/tasks` | 923 | `tasks.md` |
| Verify Report | `sdd/salesops-10-decisiones-dashboard/verify-report` | 937 | (stored in engram, not written to archive dir) |
| Archive Report | `sdd/salesops-10-decisiones-dashboard/archive-report` | (new) | `archive-report.md` |

## Main Spec Integration

The delta spec has been merged into the source of truth at `openspec/specs/salesops-mvp/spec.md`:

- **Title updated**: Now reads "Spec — salesops-mvp (Tasks 1–10)" (was Tasks 1–6)
- **Purpose section updated**: Now covers Tasks 1–10; explicitly notes Task 10 Decisiones completion with 3-layer dashboard summary
- **Old decisiones requirements deleted**: Removed the old "Decisiones Route Renders the Profitability Ranking" and related profitability-only requirements (13 requirements covering margin computation, loss flagging, grand totals)
- **New requirements added**: 22 new/modified requirement groups (1 MODIFIED route rendering, 1 MODIFIED empty state, 20 ADDED: data derivation, KPI header, KPI formulas, trend calculation, sales trend visual, stage distribution, warehouse sales, currency mix, gestor ranking, top products, inventory alerts, lowest-margin orders, no sales target, read-only, money formatting)
- **Out-of-scope refined**: Now says "Task 7 (Inventario) remains out of scope" (Tasks 8–10 now complete; was Tasks 8–9 and 7–9 previously)

## Code Changes Summary

| Area | Files | Lines Changed | Notes |
|------|-------|---|---|
| Domain helpers | `app/domain/decisiones-dashboard.ts` + `__tests__/decisiones-dashboard.test.ts` | ~550 | Pure helpers: period split, KPIs w/ delta, trend, stage, warehouse, currency, gestor ranking, top margin, alerts; 15 unit-test scenarios |
| Chart primitives | `app/components/charts/{stat-tile,bar-chart,area-trend,donut-chart}.tsx` + `palette.ts` + `__tests__/*.test.tsx` | ~400 | Generic SVG components: Tailwind-colored, responsive viewBox, no domain imports; 8 render-test scenarios |
| Section components | `app/components/decisiones/{kpi-header,sales-trend-section,stage-distribution,warehouse-sales,currency-mix,gestor-ranking,top-margin-products,inventory-alerts,lowest-margin-orders}.tsx` + `__tests__/*.test.tsx` | ~550 | Presentational: format numbers, compose charts, local UI state (cantidad/valor toggle); 18 render-test scenarios |
| Container | `app/routes/decisiones.tsx` + `__tests__/decisiones.test.tsx` | ~120 | useState container, direct render, empty-state branch; retired `ProfitabilitySummary`/`ProfitabilityTable` (no longer used); 7 test scenarios |
| **Total** | ~25 files (9 new domain+chart, 9 new sections + 1 rewrite + tests) | **~1620 lines** | 3 chained stacked PRs (domain, charts, sections+container) |

## Key Decisions (Locked in Proposal)

- **D1**: Custom inline SVG primitives, not Recharts (jsdom-testable under strict TDD, zero new deps, full Tailwind control)
- **D2**: One orchestrator helper + 9 sub-helpers, each independently unit-testable (mirrors `buildProfitabilityRanking`/`buildFinanceSummary` granularity)
- **D3**: Frozen per-order `exchangeRateSnapshot.usdToMn` ONLY, never live rate (matches Task 8's invariant, regression-tested non-vacuous)
- **D4**: Direct-render container (no Form/loader/`useNavigate`) — sidesteps jsdom+undici AbortSignal gotcha documented in route
- **D5**: Pure domain helpers (numbers only, no formatting); presentational components format at render leaf (consistent with existing screens)
- **D6**: Reuse `buildProfitabilityRanking` ascending tail for lowest-margin block — no new logic, no duplication
- **D7**: Period split = last 10d vs prior 10d, anchored to `SeedState.generatedAt` (deterministic, matches seed window + Shopify/Lightspeed pattern)
- **D8**: Section headings avoid "decisiones" — preserves existing `routes.test.tsx` heading-uniqueness assertion

## Risks Mitigated

| Risk | Mitigation | Status |
|------|-----------|--------|
| Duplicate-heading test failure | Single `<h1>Decisiones</h1>` + section heading discipline | GREEN |
| Live-rate leak | Frozen snapshot only + mandatory regression test (live-rate edit post-KPI-compute does not affect KPI) | GREEN |
| Orphan item throw | Defensive skip on product/inventory join + 0-contribution | GREEN |
| Divide-by-zero in KPI delta | Prior=0 case: delta=null (leaf shows "—"), both=0 case: trend=flat | GREEN |
| Zero-prior-window crash | When prior=0 and current>0, trend forced to "up" (no Infinity/NaN) | GREEN |
| AbortSignal/jsdom in loader | Direct-render useState container, no RR7 Form/loader/action | GREEN |
| React key collision | BarChart/DonutChart keying changed from `label` alone to `${label}-${index}` | GREEN |
| Chart library bundle bloat | Zero new dependencies (custom SVG only) | GREEN |
| Empty-state fabrication | hasData=false → container renders message, no zero-padded KPI/visual rows | GREEN |

## No Further Actions Required

This change is complete. The delta spec has been merged into the main spec at `openspec/specs/salesops-mvp/spec.md`. The 3-layer dashboard replaces the old profitability-ranking screen (Task 8). No follow-up tasks or migrations are needed; the screen is read-only and carries no state mutations.

Inventory (Task 7) remains out of scope. Next screen planning opportunity: any new salesops features on the foundation of this dashboard.

---

**Archived by**: sdd-archive (automated SDD executor)
**Archive date**: 2026-07-12
**Archive directory**: `openspec/changes/archive/2026-07-12-salesops-10-decisiones-dashboard/`
