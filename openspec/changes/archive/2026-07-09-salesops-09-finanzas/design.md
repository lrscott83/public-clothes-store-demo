# Design: Pantalla 7 — Finanzas (salesops-09-finanzas)

## Technical Approach

The `/finanzas` route stops being a `PlaceholderScreen` and becomes a thin, read-only
**container** that computes a **Commission & Cash-Flow** view model once on mount and
renders two dumb presentational components. It mirrors the shipped **Decisiones** screen
1:1 (`decisiones.tsx` + `domain/decisiones.ts` + `components/decisiones/*`):

- A pure domain helper `buildFinanceSummary(state: SeedState): FinanceView` produces a
  **numbers-only** view model (no formatting, no locale, no I/O).
- The container `routes/finanzas.tsx` loads it once via
  `useState(() => buildFinanceSummary(loadSeedState()))`, direct render, a single
  `<h1>Finanzas</h1>`, no RR7 `<Form>`/action/loader, no `useNavigate` (sidesteps the
  jsdom+undici `AbortSignal` gotcha) — byte-for-byte the `decisiones.tsx` shape.
- Two presentational components under `app/components/finanzas/` — a commission-KPI
  summary block and a per-state breakdown table — do ALL rendering; USD via `formatMoney`,
  commission as plain `{value} MN` text (the `order-card.tsx:26` precedent).

**Zero domain/store schema changes.** Every field the metrics need already lives on
`Order` (`state`, `totalUSD`, `commissionMN`, `commissionPaidAt`). `types.ts` and
`seed-store.ts` are untouched; there is NO new store action because the screen writes
nothing.

## Heading discipline — HOW-level refinement of proposal D5

The proposal's D5 states two things that conflict at implementation time: (a) the single
`<h1>` reads "Comisiones y flujo de caja", and (b) the frozen shared
`routes/__tests__/routes.test.tsx` asserts `getByRole('heading', { name: /finanzas/i })`
for `/finanzas`. Text "Comisiones y flujo de caja" does NOT match `/finanzas/i`, so a
literal reading of (a) would break the frozen test.

**Resolution (locked at HOW level):** mirror `decisiones.tsx` exactly — the `<h1>` is the
single word **"Finanzas"** (as `decisiones.tsx`'s h1 is "Decisiones" and its test matches
`/decisiones/i`). The "Comisiones y flujo de caja" descriptor renders as a **non-heading**
`<p>` subtitle directly under the `<h1>`, so it never becomes a second `role="heading"`
match. `meta()` title is "Finanzas — Sales Ops Cockpit". Both subheadings — "Resumen de
comisiones" and "Flujo por estado" — deliberately avoid the literal substring "finanzas",
so `getByRole('heading', { name: /finanzas/i })` resolves to exactly one element. This
honors D5's intent (single unambiguous heading) while keeping the frozen test green.

## Commission ledger math (locked D1/D3 — native MN, no conversion)

Paid-vs-pending is decided by a single predicate. By the store invariant `commissionPaidAt`
is stamped ONLY on the `entregado → comision_pagada` transition, so
`commissionPaidAt != null ⟺ state === 'comision_pagada'`; the predicate is written
belt-and-suspenders to survive either fact drifting:

```
isPaid(order)    = order.state === 'comision_pagada' || order.commissionPaidAt != null
isPending(order) = !isPaid(order) && order.state ∈ {verificado, transportando, entregado}
commOf(order)    = order.commissionMN ?? 0        // coalesce → never NaN (creado is undefined)

commissionPaidMN    = Σ commOf(order) where isPaid(order)
commissionPendingMN = Σ commOf(order) where isPending(order)
commissionTotalMN   = commissionPaidMN + commissionPendingMN
pendingPaymentCount  = count of orders where isPending(order)
```

`creado` orders satisfy neither predicate (no frozen commission), so they contribute `0`
to every KPI. **No divide, no MN→USD conversion anywhere** — commission is native MN end to
end (D3). The only arithmetic is addition; `?? 0` is the sole NaN guard.

## Per-state rows — iterate the label map, not the data (locked)

Rows are built from the exhaustive `Record<OrderState, string>` label map (mirrors
`kanban-board.tsx`'s `COLUMN_TITLES`) in the fixed linear `COLUMN_ORDER`
`creado → verificado → transportando → entregado → comision_pagada`. Iterating the label
map (NOT `state.orders`) guarantees all 5 rows are present, in fixed order, even when a
state has zero orders:

```
for state of COLUMN_ORDER:
    bucket    = orders.filter(o => o.state === state)
    count     = bucket.length
    revenueUSD = Σ bucket.totalUSD                 // always present, incl. creado
    commissionMN = Σ commOf(bucket)                // 0 for creado (undefined → 0)
    push { state, label: STATE_LABELS[state], count, revenueUSD, commissionMN }
```

`revenueUSD` is emitted for `creado` too (backlog visibility). `commissionMN` is a real `0`
in the domain; rendering it as "—" for `creado` is a presentation concern in the table.

## File Changes

| File | Action | ~Lines | Description |
|------|--------|-------|-------------|
| `app/domain/finanzas.ts` | Create | ~55 | `buildFinanceSummary` + view-model types + `STATE_LABELS`/`COLUMN_ORDER` |
| `app/domain/__tests__/finanzas.test.ts` | Create | ~90 | paid/pending/total split, pending count, per-state sums, empty-state rows, creado no-NaN, all-empty state, fixed row order |
| `app/components/finanzas/commission-summary.tsx` | Create | ~40 | KPI block, MN plain text, pending count |
| `app/components/finanzas/state-breakdown-table.tsx` | Create | ~45 | Per-state table, USD `formatMoney`, MN plain text, "—" for creado |
| `app/components/finanzas/__tests__/commission-summary.test.tsx` | Create | ~30 | labels, `{value} MN` plain text, no `$`/formatMoney on MN |
| `app/components/finanzas/__tests__/state-breakdown-table.test.tsx` | Create | ~35 | 5 rows, USD money regex, MN plain text, creado "—" |
| `app/routes/finanzas.tsx` | Modify | ~30 | Replace placeholder with `useState` read-only container |
| `app/routes/__tests__/finanzas.test.tsx` | Create | ~45 | single `/finanzas/i` heading, both blocks render, no mutation affordance |
| `app/domain/types.ts`, `app/store/seed-store.ts` | Unchanged | 0 | Schema and mutations frozen |

Implementation (non-test) ≈ **~170 lines**; with tests ≈ **~370 changed lines** — in line
with prior single-screen tasks. Single PR.
