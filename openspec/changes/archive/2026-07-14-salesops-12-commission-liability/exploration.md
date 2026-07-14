# Exploration: salesops-12-commission-liability

Domain-model correction — commission liability vs. non-existent customer
receivables, plus the "cabina de mando" wording rule.

App root: `templates/apps/salesops-mvp`

## The domain correction (authoritative)

- Every sale is fully collected. **Nobody owes the owner money.** No customer receivables.
- The only debt flows owner → gestor: the **owner owes each gestor their commission**,
  and that commission becomes a **payable (owner's liability)** when the sale's
  **delivery is completed** (`entregado`).
- "commission pending" = commission the owner still has to PAY gestores; "commission
  paid" = already paid out.

## Current state (evidence-based)

Two separate concepts live under commission/collection; only one is correct.

1. **Commission-as-owner's-payable-to-gestor — ALREADY CORRECT.**
   - `app/domain/finanzas.ts` `buildFinanceSummary` splits `commissionMN` into paid
     (`comision_pagada` / `commissionPaidAt` set) vs pending (unpaid AND in
     `verificado`/`transportando`/`entregado`).
   - `app/domain/finanzas-dashboard.ts:255-256` comments "outstanding liability owed".
   - `finanzas/help-content.ts` `comisionPendiente` already says "Lo que todavía les
     debés a tus gestores" (correct direction).
   - "Marcar comisión pagada" (`order-card.tsx:44`, `gestor-order-card.tsx:107`) only
     fires on `entregado` — matches "payable at delivery completion" exactly.
   - **No logic bug here.**

2. **"Cobrado vs pendiente" — a client-collection-status proxy — THE BUG.**
   - `COBRADO_STATES = ['entregado','comision_pagada']` / `PENDIENTE_STATES =
     ['verificado','transportando']`, duplicated in `finanzas-dashboard.ts:25-26` AND
     `decisiones-dashboard.ts:65-66`.
   - Drives KPI tiles, a 20-day trend, and a per-warehouse table implying money the
     client hasn't paid yet — contradicts "every sale is fully collected."
   - Deliberate prior decision: `openspec/changes/salesops-11-finanzas-dashboard/design.md`
     "Decision 4". Codified as MUST in `openspec/specs/salesops-mvp/spec.md:829-857,1206-1259`
     → spec delta required.
   - No literal "cuentas por cobrar" string; the wrong concept is functional, not textual.

3. **"cabina de mando"** — zero occurrences in the app. Only in the untracked
   `docs/plans/estrategia-pitch-mvp.md:39` (phrase) and `:40` (a backwards
   "cuánta te debe cada gestor" sentence).

## Audit table (by area)

**A. Domain/logic (client-collection proxy to remove/reinterpret)**
- `app/domain/finanzas-dashboard.ts:25-26,70-79,102-106,113-118,127-175,287-315` —
  `COBRADO_STATES`/`PENDIENTE_STATES`, `cobradoUSD`/`pendienteUSD`, `buildCashFlowTrend`,
  `buildWarehouseCashFlow`.
- `app/domain/decisiones-dashboard.ts:58-66,84-129` — exact duplicate for `/decisiones`.
- `app/domain/finanzas.ts:5` — ambiguous comment, optional polish (logic already correct).

**B. Components rendering the bug**
- `app/components/finanzas/finance-kpi-header.tsx:38-45`,
  `app/components/decisiones/kpi-header.tsx:53-60` — "Cobrado vs pendiente" StatTile.
- `app/components/finanzas/cash-flow-trend-section.tsx` — cobrado/pendiente toggle chart.
- `app/components/finanzas/warehouse-cash-flow.tsx` — "Cobros pendientes por almacén" table.
- `app/components/finanzas/help-content.ts:6-16,33-36,47-50,69-72`,
  `app/components/decisiones/help-content.ts:30-32` — help copy; the decisiones entry is
  the most explicit violation ("Cuánto ya entró a caja y cuánto te falta cobrar…").

**C. Copy already correct (optional polish)** — `comisionPendiente`, commission-liability
donut, gestor-commission-table, gestor-ranking, "Marcar comisión pagada".

**D. "cabina de mando"** — `docs/plans/estrategia-pitch-mvp.md:39,40,52` (out of app scope,
flagged; untracked internal doc).

## Surfaced domain decision (for the human)

"Cobrado vs pendiente" is purely `order.state ∈ {set}` bucketing of `totalUSD` — no
receivable/due-amount field exists in `Order`/`PaymentInfo` (`app/domain/types.ts:54-57`).
Hinges on: `finanzas-dashboard.ts:25-26,70-175,287-315`; `decisiones-dashboard.ts:58-129`;
both `help-content.ts`; `spec.md:829-857,1206-1259`; `salesops-11.../design.md:69-83`.

- **(a) Remove entirely** — no real "pending collection" exists; drop tile/trend/table
  (finance header 5 → 4 tiles). Optionally repurpose the freed visuals to a TRUE metric
  (revenue/ventas over time & per warehouse, since all sales are collected).
- **(b) Reinterpret** as commission-owed-to-gestores, day/warehouse-bucketed (reuses
  `commissionPaidMN`/`commissionPendingMN`; note the finanzas dashboard already has a
  commission-liability KPI + donut, so this risks duplication).
- **(c) Keep as gestor→owner remittance, always-complete** — no such checkpoint exists in
  `OrderState`; collapses into (a) or requires a new field.

## Scope estimate

- Domain-logic files: 2 · Components: 4 · Copy-only: 2 · Spec delta: 1 · Test files: ~8 ·
  Out-of-scope flagged: 1 (`estrategia-pitch-mvp.md`).
- ~9 core files + ~8 test files. Deletion-heavy under (a); new-aggregation-heavy under (b).

## Risks

- Wrong logic is DUPLICATED across `finanzas-dashboard.ts` and `decisiones-dashboard.ts`
  (deliberate "never import from each other" architecture) — fix both or they contradict.
- `spec.md` currently mandates the wrong behavior as MUST scenarios — spec delta required.
- 8 test files assert the exact strings/fields removed (`'Cobrado vs pendiente'`,
  `cobradoUSD`, `pendienteUSD`, `'Cobros pendientes por almacén'`). Strict TDD active.
- Both KPI headers hard-assert "exactly 5 tiles" → option (a) renumbers to 4, rippling into
  the `lg:grid-cols-5` layout.
- `estrategia-pitch-mvp.md` (untracked) scripts a live demo around the wrong framing.

## Ready for proposal

Yes — once the human resolves the (a)/(b)/(c) decision for "cobrado vs pendiente".
Everything else (commission-liability direction confirmation, "cabina de mando" wording)
is unambiguous.
