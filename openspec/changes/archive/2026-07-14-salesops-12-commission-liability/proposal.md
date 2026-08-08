# Proposal: salesops-12-commission-liability

Correct the finance domain model: remove the false "Cobrado vs pendiente"
customer-receivable concept and repurpose its visuals to real revenue, across
both the `/finanzas` and `/decisiones` dashboards.

App root: `templates/apps/salesops-mvp`
Artifact store: hybrid (openspec + engram)

## Intent & problem

The app currently models TWO money concepts under commission/collection. One is
correct, the other is a domain lie.

**The lie — "Cobrado vs pendiente".** The code buckets order totals by
`order.state` into `COBRADO_STATES = ['entregado','comision_pagada']` vs
`PENDIENTE_STATES = ['verificado','transportando']`, treating the `PENDIENTE`
bucket as money the client still owes ("falta cobrar", "no lo tenés en la mano").
This is a client-collection-status proxy. There is no receivable/due-amount field
anywhere in `Order`/`PaymentInfo` (`app/domain/types.ts:54-57`); it is pure state
bucketing dressed up as a receivable.

This directly contradicts the authoritative business reality: **every sale is
fully collected. Nobody owes the owner money. There are NO customer
receivables.** The only debt in the business is owner → gestor commission, which
is already modeled correctly and separately (see Out of scope).

Because all sales are collected, "cobrado" is not a distinct sub-state of
revenue — it simply *equals* revenue. Showing a "pendiente" split invents a
liability that does not exist and misleads the owner about their own cash.

**Why now.** The concept is duplicated and rendered prominently (a KPI tile, a
~20-day trend chart, and a per-warehouse table) in BOTH dashboards, and the spec
currently mandates the wrong behavior as MUST scenarios. Every day it ships, it
teaches the owner a false mental model of their finances and anchors a live pitch
demo (`docs/plans/estrategia-pitch-mvp.md`) around a fiction.

**Success looks like.** Both dashboards present money truthfully: revenue is
revenue (all collected), and the only liability shown is the owner's commission
debt to gestores (unchanged, already correct). No screen implies a customer owes
money. The spec, help copy, tests, and duplicated domain logic all agree.

## Scope

### In scope

**Domain logic (remove false concept, replace with revenue equivalents)**
- `app/domain/finanzas-dashboard.ts:25-26,70-79,102-106,113-118,127-175,287-315` —
  remove `COBRADO_STATES`/`PENDIENTE_STATES`, `cobradoUSD`/`pendienteUSD`,
  `buildCashFlowTrend`, `buildWarehouseCashFlow`; replace with revenue-over-time
  and revenue-per-warehouse aggregations.
- `app/domain/decisiones-dashboard.ts:58-66,84-129` — the exact duplicate; apply
  the identical correction so the two dashboards stay consistent (the codebase
  deliberately forbids these two files importing each other).

**Components rendering the bug**
- `app/components/finanzas/finance-kpi-header.tsx:38-45` — replace the
  "Cobrado vs pendiente" StatTile with a TRUE revenue KPI ("Ventas del periodo").
  Keep the header at 5 tiles.
- `app/components/decisiones/kpi-header.tsx:53-60` — same correction, keep 5 tiles.
- `app/components/finanzas/cash-flow-trend-section.tsx` — collapse the
  cobrado/pendiente toggle chart into a single sales/revenue-over-time trend (no
  split, no toggle).
- `app/components/finanzas/warehouse-cash-flow.tsx` — retitle/repurpose
  "Cobros pendientes por almacén" → "Ventas por almacén" (revenue per warehouse).

**Help copy (Spanish, voseo)**
- `app/components/finanzas/help-content.ts:6-16,33-36,47-50,69-72`
- `app/components/decisiones/help-content.ts:30-32` (the most explicit violation:
  "Cuánto ya entró a caja y cuánto te falta cobrar…")
- Reframe all "por cobrar / falta cobrar / no lo tenés en la mano" language to the
  corrected revenue + commission-liability framing.

**Spec delta (required)**
- `openspec/specs/salesops-mvp/spec.md:829-857,1206-1259` — currently mandates the
  "Cobrado vs pendiente" behavior as MUST scenarios. MUST be updated to describe
  revenue visuals instead. Handled by the sdd-spec phase.

**Tests (Strict TDD active)**
- ~8 test files assert the removed strings/fields
  (`'Cobrado vs pendiente'`, `cobradoUSD`, `pendienteUSD`,
  `'Cobros pendientes por almacén'`) and hard-assert "exactly 5 tiles". They will
  be updated to assert the revenue behavior. Enumerated by the sdd-tasks phase.

### Out of scope (explicit)

- **The commission-liability logic — VERIFIED CORRECT, DO NOT TOUCH.**
  `buildFinanceSummary` (`app/domain/finanzas.ts`) correctly splits commission
  into paid vs pending (owner's payable to gestor); help copy already says
  "Lo que todavía les debés a tus gestores"; "Marcar comisión pagada" fires only
  on `entregado` (payable-at-delivery). The commission-liability KPI, donut,
  gestor-commission-table, and gestor-ranking are all correct. This change must
  preserve them exactly.
- **"cabina de mando" wording** — zero occurrences in app code. The only
  occurrence was in the untracked `docs/plans/estrategia-pitch-mvp.md` and is
  already fixed by the orchestrator. Not part of this change.

## Chosen approach — remove + repurpose to revenue

The owner has RESOLVED the decision: remove the false "pendiente" concept and
repurpose the freed visuals to real revenue. Rationale: since every sale is
collected, "cobrado" is definitionally equal to revenue/ventas, so the visuals
already have the right *shape* (a KPI, a time trend, a per-warehouse breakdown) —
only the false split and the receivable framing are wrong. Repurposing (vs.
deleting) keeps the finance headers at a stable 5 tiles and preserves useful
signal (revenue over time, revenue by warehouse) instead of leaving holes.

Rejected alternatives:
- **Delete entirely (5 → 4 tiles)** — loses genuinely useful revenue signal and
  forces a `lg:grid-cols-5` layout renumber for no benefit.
- **Reinterpret as commission-owed-to-gestores** — would duplicate the
  already-correct commission-liability KPI + donut. Redundant.

The correction is applied symmetrically to `finanzas-dashboard.ts` and
`decisiones-dashboard.ts` (and their components/help copy) so the two dashboards
never contradict each other.

## User-facing impact (before → after)

| Surface | Before | After |
| --- | --- | --- |
| Finance KPI header | "Cobrado vs pendiente" tile (5 tiles) | "Ventas del periodo" true revenue tile (still 5 tiles) |
| Decisiones KPI header | "Cobrado vs pendiente" tile (5 tiles) | Revenue tile (still 5 tiles) |
| Trend chart (`/finanzas`) | Cobrado/pendiente split with toggle | Single sales/revenue-over-time trend, no toggle |
| Warehouse table | "Cobros pendientes por almacén" | "Ventas por almacén" (revenue per warehouse) |
| Help copy (both) | "cuánto te falta cobrar", "no lo tenés en la mano" | Revenue framing + correct commission-liability framing |
| Commission-liability KPI/donut | Correct | Unchanged (preserved) |

Net: no screen implies a customer owes money; the only liability shown remains
the owner's commission debt to gestores.

## Spec-delta note

`openspec/specs/salesops-mvp/spec.md:829-857` and `:1206-1259` currently codify
"Cobrado vs pendiente" as MUST behavior (originating from
`salesops-11-finanzas-dashboard/design.md` "Decision 4"). These sections MUST be
rewritten by the sdd-spec phase to mandate revenue visuals and to forbid any
customer-receivable framing. The design phase should note that Decision 4 of
salesops-11 is being deliberately reversed.

## Risks & open questions

- **Duplicated logic must be fixed in BOTH files.** `finanzas-dashboard.ts` and
  `decisiones-dashboard.ts` intentionally never import from each other; if only
  one is corrected the dashboards will contradict. Both are in scope.
- **Strict TDD, ~8 test files assert the old strings/fields.** Under Strict TDD
  the failing/updated tests drive the change; sdd-tasks must enumerate them and
  sequence red→green.
- **Both KPI headers hard-assert exactly 5 tiles.** Keeping 5 tiles (via the
  revenue replacement) avoids a `lg:grid-cols-5` layout renumber — the design
  must confirm the replacement metric so the tile count stays at 5.
- **Naming of the replacement revenue metric.** Proposal suggests
  "Ventas del periodo"; final label to be confirmed in spec/design (must be
  distinct from any existing revenue tile to avoid duplication).
- **Reversing a prior deliberate decision.** salesops-11 introduced this on
  purpose; the design should record the reversal rationale for future readers.
