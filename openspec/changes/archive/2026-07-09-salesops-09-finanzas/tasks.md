# Tasks: Pantalla 7 — Finanzas (salesops-09-finanzas, Task 9)

All 25 tasks complete. See verify-report.md for full test evidence.

## Phase 1: Domain builder — `app/domain/finanzas.ts`

- [x] 1.1 RED — paid/pending/total split test
- [x] 1.2 RED — pendingPaymentCount test
- [x] 1.3 RED — creado no-NaN test
- [x] 1.4 RED — paidAt equivalence test
- [x] 1.5 RED — per-state aggregation test
- [x] 1.6 RED — creado row revenue+commission test
- [x] 1.7 RED — fixed row order + zero-count states test
- [x] 1.8 RED — all-empty case test
- [x] 1.9 GREEN — implement buildFinanceSummary

## Phase 2: Presentational components

- [x] 2.1 RED — CommissionSummary render test
- [x] 2.2 RED — no formatMoney on MN test
- [x] 2.3 GREEN — implement CommissionSummary component
- [x] 2.4 RED — StateBreakdownTable 5-row test
- [x] 2.5 RED — commission cell and creado "—" test
- [x] 2.6 RED — zero-count row test
- [x] 2.7 GREEN — implement StateBreakdownTable component

## Phase 3: Container wiring + regression

- [x] 3.1 RED — Finanzas route heading + blocks render test
- [x] 3.2 RED — heading uniqueness test
- [x] 3.3 RED — no mutation affordance test
- [x] 3.4 RED — empty-state test
- [x] 3.5 GREEN — rewrite routes/finanzas.tsx container
- [x] 3.6 VERIFY — routes.test.tsx regression still passes
- [x] 3.7 VERIFY — full suite green (npm test, npm run typecheck)
