# Archive Report — salesops-06-tasas-cambio (Task 6, Pantalla 4)

**Status**: ARCHIVED
**Change**: salesops-06-tasas-cambio (Task 6 — Tasas de cambio)
**Archived to**: `openspec/changes/archive/2026-07-09-salesops-06-tasas-cambio/`
**Date**: 2026-07-09

## Summary

Archived the completed and verified change delivering Pantalla 4 — the
exchange-rates editor screen. Three live rates (USD→MN, Zelle, EUR) now
render as editable numeric fields on `/tasas`, saved through a NEW pure
store action `updateExchangeRates(rates)` that replaces `state.exchangeRates`
in one write and NEVER touches `state.orders`. This write action is the
structural guarantee for the frozen-snapshot invariant already regression-tested
at the store layer: editing rates changes only FUTURE verifications;
already-verified orders keep their frozen `exchangeRateSnapshot`, `totalMN`,
and `commissionMN` untouched. Non-positive, empty, or non-numeric input is
rejected at the form level via a single-source-of-truth validation helper
(`parseRatesDraft`); the container follows the established draft/`onChange`
idiom from `ClientStep` and `operador-gestores`.

## Verification Status

**Final verdict**: PASS (all 202 tests green, no CRITICAL).

- Test suite: 202/202 green (`npx vitest run` from `templates/apps/salesops-mvp`)
- Typecheck: clean · Build: clean
- Spec compliance: 7/7 scenarios COMPLIANT (read from test source)
- Assertion quality: no tautologies, no ghost loops, all assertions call production code

## Spec Merge Summary

**Main spec updated**: `openspec/specs/salesops-mvp/spec.md`

- Header: "Tasks 1–5" → "Tasks 1–6"
- Purpose: added Pantalla 4 (exchange rate editor, pure `updateExchangeRates` action,
  frozen-snapshot invariant enforcement)
- 4 ADDED requirements merged:
  1. Tasas Route Renders the Rates Editor (route structure, initial values)
  2. Saving Valid Rates Persists via `updateExchangeRates` (action signature,
     never-touches-orders guarantee, persist & reload semantics)
  3. Non-Positive or Invalid Rates Block Save (validation gate, empty/NaN/≤0 rejection,
     form remains editable until valid)
  4. Editing Rates Does Not Recalculate Verified Orders (reinforcement of frozen-snapshot
     invariant: verified orders unchanged, new verifications use new rate)
- Requirement count: 33 (Tasks 1–5) → **37** (Tasks 1–6); all Tasks 1–5
  requirements preserved unchanged.

## Locked Architectural Decisions

### D1 — New dedicated store action, NOT a reuse of `updateOrder`

`updateExchangeRates(rates)` is a standalone top-level singleton replace
(load → swap → save → return), deliberately NOT built on the id-keyed
`updateOrder(id, mutator)` helper. Rationale: `updateOrder` is collection-keyed
over orders; `exchangeRates` is an id-less top-level singleton. A separate
named export keeps every `SeedState` mutation independently tested (Tasks 3–5
convention) and structurally guarantees `state.orders` is never touched.

### D2 — Reject non-positive rates (validation the plan left unspecified)

Block save when any rate ≤ 0. Show an inline error and keep the form editable;
write nothing until all three rates are positive numbers. Rationale: zero or
negative `usdToMn` silently corrupts every future verification math. Guarding
at the form is the cheapest correct place. Kept demo-simple: positive-number
check only, no min/max ranges or currency formatting rules.

### D3 — Presentational `RatesForm` via the `ClientStep` draft/`onChange` idiom

`RatesForm` owns a draft `ExchangeRates`-shaped object (with string fields
to represent empty/half-typed input), emits per-field changes via `onChange`,
exposes a save handler, and derives a `canSave` boolean from the D2 rule; the
container owns persistence. Mirrors `client-step.tsx` exactly (the established
form precedent) and preserves the container-presentational split used across
Tasks 3–5.

## Findings

- **CRITICAL**: None
- **WARNING**: 1 — dropped duplicate `<h2>` in `RatesForm` (avoids
  `getByRole('heading')` collision). Non-breaking; spec mandates a single
  route heading + 3 fields, both satisfied by the container `<h1>`.
- **SUGGESTION**: 2 — no coverage tool configured (informational); per-field
  triangulation in `rates-form.test.tsx` uses `zelle` as representative
  (acceptable given shared pure-function validation).

## Archive Folder Contents

`openspec/changes/archive/2026-07-09-salesops-06-tasas-cambio/`

- `proposal.md`
- `design.md`
- `tasks.md` (task completion verified)
- `spec.md` (delta, now merged into main)
- `verify-report.md` (final verdict PASS)
- `archive-report.md`

## Engram Traceability

Proposal, Spec, Design, Tasks, Verify-Report, and Archive-Report under
`sdd/salesops-06-tasas-cambio/*`.

## Files Changed (per apply-progress)

| File | Action | Description |
|------|--------|-------------|
| `app/routes/tasas.tsx` | Modified | Container: direct render, `useState` draft, load on mount, save via `updateExchangeRates` |
| `app/store/seed-store.ts` | Modified | Add `updateExchangeRates(rates): SeedState` singleton replace (never touches orders) |
| `app/components/tasas/rates-form.tsx` | Created | Presentational form + `parseRatesDraft` / `ratesToDraft` helpers |
| `app/store/__tests__/seed-store.test.ts` | Modified | Add `updateExchangeRates` unit + immutability regression tests |
| `app/components/tasas/__tests__/rates-form.test.tsx` | Created | Component test (render, edit, validation gate, save) |
| `app/routes/__tests__/tasas.test.tsx` | Created | Route/container test (load → edit → persist; invalid blocks) |
| `openspec/specs/salesops-mvp/spec.md` | Modified | Merged 4 new requirements; updated header and Purpose |

## SDD Cycle Status

**Task 6 CLOSED.** All Pantalla 1–4 screens now fully implemented and
locked for the salesops-mvp batch. Ready for final release or integration.
