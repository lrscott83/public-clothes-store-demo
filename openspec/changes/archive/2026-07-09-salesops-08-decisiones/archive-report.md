# Archive Report — salesops-08-decisiones (Pantalla 6: Decisiones)

**Date**: 2026-07-09  
**Change**: salesops-08-decisiones (Task 8)  
**Status**: ARCHIVED (PASS — verification complete, 238/238 tests pass, typecheck exit 0)

## Summary

Pantalla 6 (Decisiones) — Order Profitability / Margin Ranking screen has been fully implemented, verified, and archived. The `/decisiones` route now renders a read-only decision-support view that ranks verified-or-later orders by profit margin, flags loss-making orders, and shows grand totals. Implementation follows the established Inventario pattern: pure domain helper + container/presentational components split, with zero domain/store schema changes.

## Change Scope

- **In**: New pure helper `buildProfitabilityRanking(state)` + two presentational components + container rewrite + comprehensive test coverage (25 tasks, all complete)
- **Out**: No mutations, no schema changes, no new store actions; `creado` orders excluded entirely; read-only screen with no form/buttons
- **Schema impact**: Zero — `app/domain/types.ts` and `app/store/seed-store.ts` untouched

## Verification Verdict

**PASS** (Strict TDD Mode)

- **Test Evidence**: 238/238 tests passing (42 test files, 100% pass rate), independently re-run
- **Typecheck**: exit code 0, clean
- **Task Completeness**: 25/25 tasks checked complete in source, spot-checked against code
- **Spec Compliance**: All 12 requirement groups have covering tests; live-rate regression is MANDATORY and verified non-vacuous
- **Issues**: CRITICAL: none. WARNING: none. SUGGESTION: none material

## Artifacts Archived

All change artifacts have been copied to this archive directory:

| Artifact | Topic Key (Engram) | Observation ID | File Path |
|----------|-------------------|----------------|-----------|
| Proposal | `sdd/salesops-08-decisiones/proposal` | obs-836 | `proposal.md` |
| Spec (Delta) | `sdd/salesops-08-decisiones/spec` | obs-838 | `spec.md` |
| Design | `sdd/salesops-08-decisiones/design` | obs-839 | `design.md` |
| Tasks | `sdd/salesops-08-decisiones/tasks` | obs-841 | `tasks.md` |
| Verify Report | `sdd/salesops-08-decisiones/verify-report` | obs-849 | `verify-report.md` |

## Main Spec Integration

The delta spec has been merged into the source of truth at `openspec/specs/salesops-mvp/spec.md`:

- **Purpose section updated**: Now covers Tasks 1–8 (was 1–6); explicitly notes Task 8 Decisiones completion
- **New requirements added**: 12 requirement groups (Route rendering, filter, margin math, orphan-skip, frozen-rate commission, sort+loss flagging, grand totals, money formatting, empty state, read-only)
- **Out-of-scope refined**: Now says "Tasks 7, 9 remain out of scope" (previously 7–9)

## Code Changes Summary

| Area | Files | Lines Changed | Notes |
|------|-------|---|---|
| Domain helper | `app/domain/decisiones.ts` + test | ~150 | Pure helper: filter, join, frozen-rate commission, sort, totals |
| Components | `profitability-summary.tsx`, `profitability-table.tsx` + tests | ~160 | Presentational: summary card + ranked table, loss flagging |
| Container | `app/routes/decisiones.tsx` + test | ~70 | useState container, direct render, no Form/loader |
| **Total** | 9 files (1 modified, 8 new) | **~380 lines** | Single PR (within 400-line budget with `size:exception` headroom) |

## Key Decisions (Locked in Proposal)

- **D1**: Rank only `verificado`+ orders; exclude `creado` entirely (no separate group)
- **D2**: Commission uses order's OWN frozen `exchangeRateSnapshot.usdToMn`, NEVER live rate (frozen-snapshot invariant preserved)
- **D3**: Pure view-model helper + container/presentational split (mirrors Inventario precedent)
- **D4**: All-USD via `formatMoney`; subheadings avoid the word "decisiones" (singular heading test guard)

## Risks Mitigated

| Risk | Mitigation | Status |
|------|-----------|--------|
| Duplicate-heading test failure | Exactly one `<h1>` + subheading word discipline (D4) | GREEN |
| Live-rate leak | D2 frozen snapshot only + mandatory regression test (verified non-vacuous) | GREEN |
| Orphan item throw | Map join + defensive skip (mirrors buildInventorySummary) | GREEN |
| Divide-by-zero | `usdToMn > 0 ? … : 0` guard + synthetic unit test | GREEN |
| AbortSignal/jsdom | Direct-render useState container, no RR7 Form/loader | GREEN |

## No Further Actions Required

This change is complete. The delta spec has been merged into the main spec at `openspec/specs/salesops-mvp/spec.md`. No follow-up tasks or migrations are needed; the screen is read-only and carries no state mutations.

Next screen: Pantalla 7 (Finanzas) — aggregate financial reporting — is explicitly out of scope (future task).

---

**Archived by**: sdd-archive (automated SDD executor)  
**Archive date**: 2026-07-09  
**Git commit**: Available in project history (verify via `git log --grep="sdd-archive" --oneline`)
