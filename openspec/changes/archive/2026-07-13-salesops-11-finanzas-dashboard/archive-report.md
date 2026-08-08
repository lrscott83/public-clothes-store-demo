# Archive Report — salesops-11-finanzas-dashboard (Pantalla: Dashboard de Finanzas)

**Date**: 2026-07-13
**Change**: salesops-11-finanzas-dashboard (Task 11)
**Status**: ARCHIVED (PASS-WITH-SUGGESTIONS — verification complete, 454/454 tests pass, typecheck exit 0)

## Summary

Dashboard de Finanzas (Task 11) — 3-Layer Financial Control Panel has been fully implemented, verified, and archived. The `/finanzas` route now renders a comprehensive treasury/finance view with 5 KPI tiles (10-day trend comparison), 4 visualization layers (cash-collection trend with toggle, commission liability, revenue by stage, currency/settlement mix), and 3 actionable decision blocks (commission cost & ROI per gestor, pending cash per warehouse, revenue aging by state). Implementation follows strict TDD with pure domain helpers and presentational components; reuses generic chart primitives (zero new dependencies); preserves direct-render container pattern; all data sourced 100% from seeded state with frozen per-order exchange-rate snapshots; maintains full architectural decoupling from the `/decisiones` dashboard (no cross-dashboard domain imports).

## Change Scope

- **In**: `buildFinanceDashboard` orchestrator helper + 5 finance-owned sub-helpers (`buildFinanceKpiHeader`, `buildCashFlowTrend`, `buildCurrencyExposure`, `buildGestorCommissionCost`, `buildWarehouseCashFlow`) + neutral extraction (`period-trend.ts`, relocated `info-popover.tsx`) + 8 section components + container rewrite + comprehensive test coverage (67 test files total, 454 tests)
- **Out**: No mutations, no schema changes, no new store actions, no new dependencies beyond existing; qualifying-only orders (state !== 'creado') for MN/commission metrics; read-only screen with no form/buttons (local toggle permitted); frozen rate snapshots used exclusively (never live rates); zero domain coupling to decisiones-dashboard
- **Schema impact**: Zero — `app/domain/types.ts` and `app/store/seed-store.ts` untouched

## Verification Verdict

**PASS-WITH-SUGGESTIONS** (Strict TDD Mode, 0 CRITICAL, 0 WARNING, 2 SUGGESTION — wording-only, implementation correct)

- **Test Evidence**: 454/454 tests passing (67 test files, 100% pass rate), independently re-run
- **Typecheck**: exit code 0, clean
- **Task Completeness**: All 4 phases complete with all RED→GREEN cases verified (Phase 1: extraction tests, Phase 2: 5 domain helpers + tests, Phase 3: 8 components + tests, Phase 4: container rewrite)
- **Spec Compliance**: All requirements have covering tests; frozen-rate immutability mandatory regression verified non-vacuous; trend-arrow zero-prior-window case verified; qualifying-filter + NaN-guard verified; all KPI formulas verified; empty-state path verified; no form/mutation copy verified
- **Issues**: CRITICAL: none. WARNING: none. SUGGESTION: 2 spec-wording issues (now fixed in archive):
  - SUGGESTION 1: spec.md Layer-2 table named `buildCurrencyMix` but design.md Decision 2 (user-locked) specifies finance-owned `buildCurrencyExposure` (zero cross-dashboard import). Implementation correctly follows design/tasks (`buildCurrencyExposure`). **Fixed in archive spec.**
  - SUGGESTION 2: spec.md said MN "MUST render as locale-formatted plain text" but design.md and implementation use plain `` `${value} MN` `` (no toLocaleString), matching state-breakdown-table. **Wording fixed in archive spec.**

## Commits on salesops-mvp Branch

- `(phase-1)` sdd-apply: Phase 1 — neutral extraction (period-trend.ts + info-popover relocation, decisiones re-exports/imports updated)
- `(phase-2)` sdd-apply: Phase 2 — finanzas domain helpers (buildFinanceDashboard + 5 sub-helpers + unit tests)
- `(phase-3-4)` sdd-apply: Phases 3-4 — finanzas components + container rewrite + regression (8 components + help-content + finanzas.tsx rewrite)
- `(sdd-verify)` sdd-verify: Post-verification commit — (no code changes, clean working tree, all 454 tests passing)
- `(post-verify-refinements)` sdd-verify: Minor UI refinements applied post-verification (not spec changes): gestor table dropped redundant "Comisión devengada" column (= pagada + pendiente sum) and Layer-2 grid reordered so the two donuts pair visually on the same row — both from real-browser visual check, design decision from user feedback during verification review

## Artifacts Archived

All change artifacts have been copied to this archive directory:

| Artifact | Topic Key (Engram) | Observation ID | File Path |
|----------|-------------------|----------------|-----------|
| Proposal | `sdd/salesops-11-finanzas-dashboard/proposal` | 999 | `proposal.md` |
| Spec (Delta) | `sdd/salesops-11-finanzas-dashboard/spec` | 1000 | `spec.md` (wording fixes applied) |
| Design | `sdd/salesops-11-finanzas-dashboard/design` | 1001 | `design.md` |
| Tasks | `sdd/salesops-11-finanzas-dashboard/tasks` | 1002 | `tasks.md` |
| Apply Progress | `sdd/salesops-11-finanzas-dashboard/apply-progress` | 1013 | (stored in engram) |
| Verify Report | `sdd/salesops-11-finanzas-dashboard/verify-report` | 1017 | (stored in engram) |
| Archive Report | `sdd/salesops-11-finanzas-dashboard/archive-report` | (new) | `archive-report.md` |

## Main Spec Integration

The delta spec has been merged into the source of truth at `openspec/specs/salesops-mvp/spec.md`:

- **Title updated**: Now reads "Spec — salesops-mvp (Tasks 1–11)" (was Tasks 1–10)
- **Purpose section updated**: Now covers Tasks 1–11; explicitly notes Task 11 Finanzas completion with 3-layer financial dashboard summary (replaces old Task 9 summary)
- **Old Task 9 Finanzas requirements deleted**: Removed the old "Finanzas Route" and related commission/cash-flow summary requirements that described the 4-KPI card + single table
- **New requirements added**: 9 new/modified requirement groups (1 MODIFIED route rendering, 1 MODIFIED empty state, 7 ADDED: KPI header with 5 tiles/period trend, Layer 2 visuals, Layer 3 blocks, money formatting, honest-data constraints)
- **Out-of-scope refined**: Now says "Task 7 (Inventario) remains out of scope" (Tasks 8–11 now complete; Task 9 subsumed by Task 11 redesign)

## Code Changes Summary

| Area | Files | Lines Changed | Notes |
|------|-------|---|---|
| Neutral extraction | `app/domain/period-trend.ts` + `__tests__/period-trend.test.ts` + refactored `decisiones-dashboard.ts` (re-exports) + `app/components/shared/info-popover.tsx` (relocated) | ~200 | Generic time/ratio math (zero business meaning) extracted to neutral module; `InfoPopover` relocated to shared; decisiones re-exports preserve API and keep tests green |
| Finance domain | `app/domain/finanzas-dashboard.ts` + `__tests__/finanzas-dashboard.test.ts` | ~400 | Pure helpers: KPI windowing, cash-flow trend, currency exposure, gestor commission cost, warehouse cash flow; orchestrator composition; 18 unit-test scenarios; zero imports from decisiones-dashboard |
| Finance components | `app/components/finanzas/{help-content,finance-kpi-header,cash-flow-trend-section,commission-liability-donut,revenue-by-state-bars,currency-exposure-donut,gestor-commission-table,warehouse-cash-flow}.tsx` + `__tests__/*.test.tsx` | ~500 | Presentational: format numbers, compose charts, local UI state (toggle); 16+ render-test scenarios; reused state-breakdown-table unchanged |
| Container | `app/routes/finanzas.tsx` + `__tests__/finanzas.test.tsx` | ~80 | useState container, direct render, empty-state branch; near-total test rewrite (button assertion inverted due to toggle + InfoPopover buttons) |
| **Total** | ~30 files (1 neutral domain + 1 chart relocation + 8 finanzas domain/components + 1 rewrite + tests) | **~1200 lines** | Delivered in single batch (auto-chain stacked PRs) |

## Key Decisions (Locked in Proposal, Resolved in Design)

- **D1**: Neutral extraction of `period-trend.ts` + relocation of `info-popover.tsx` — keeps dashboards decoupled, eliminates cross-dashboard coupling, preserves decisiones regression
- **D2**: Finance-owned helpers only — `buildCurrencyExposure` (not `buildCurrencyMix`), `buildGestorCommissionCost` (not `buildGestorRanking`), `buildCashFlowTrend`, `buildWarehouseCashFlow` — zero imports from decisiones-dashboard (user-locked)
- **D3**: Windowed net margin (10-day period trend, not all-time) — consistent with other KPI tiles' trend contract
- **D4**: Copy discipline — "cobrado" framed as state-proxy estimate, never cash-ledger precision; "comisión pagada" distinct from "cobrado" (user event vs order state); no goal/target/semáforo/Gross/Net vocabulary
- **D5**: Single `AreaTrend` + local cobrado/pendiente toggle (not dual trends) — mirrors decisiones' cantidad/valor pattern
- **D6**: StateBreakdownTable kept unchanged and demoted to Layer 3 — already tested, correct, requires no restyle for functional gain

## Risks Mitigated

| Risk | Mitigation | Status |
|------|-----------|--------|
| Cross-dashboard domain coupling | Neutral extraction + finance-owned helpers + zero sibling imports | GREEN |
| Live-rate leak | Frozen snapshot only + mandatory regression test (live-rate edit post-KPI-compute does not affect KPI) | GREEN |
| Divide-by-zero in gesture ROI | Defensive guards on `revenueUSD ÷ commissionUSD` | GREEN |
| Zero-prior-window KPI trend | When prior=0 and current>0, trend forced to "up" (no Infinity/NaN) | GREEN |
| MN NaN from creado orders | qualifying filter + `?? 0` coalesce on every MN metric | GREEN |
| Empty-state fabrication | hasData=false → container renders message, no zero-padded KPI/visual rows | GREEN |
| AbortSignal/jsdom in loader | Direct-render useState container, no RR7 Form/loader/action | GREEN |
| Button count assertion inversion | finanzas.test.tsx rewritten to expect toggle + InfoPopover buttons (was locked to 0) | GREEN |
| Spec-wording stale after design lock | Two suggestions applied: buildCurrencyExposure name correction, MN formatting convention alignment | GREEN |

## No Further Actions Required

This change is complete. The delta spec has been merged into the main spec at `openspec/specs/salesops-mvp/spec.md` with the 2 wording suggestions applied. The 3-layer dashboard replaces the old 4-KPI commission + table design (Task 9). No follow-up tasks or migrations are needed; the screen is read-only, carries no state mutations, and maintains full architectural integrity with the rest of the app.

Inventory (Task 7) remains out of scope. Next screen planning opportunity: any new salesops features on the foundation of this dashboard (both decisiones and finanzas now exist as reference implementations of the 3-layer + direct-render + pure-domain pattern).

---

**Archived by**: sdd-archive (automated SDD executor)
**Archive date**: 2026-07-13
**Archive directory**: `openspec/changes/archive/2026-07-13-salesops-11-finanzas-dashboard/`
