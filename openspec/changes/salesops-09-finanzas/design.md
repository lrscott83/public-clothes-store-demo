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

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Layer split | Pure `buildFinanceSummary(state)` → numbers-only `FinanceView`; container renders; formatting only in components | Compute/format inside the route | Mirrors `buildProfitabilityRanking`/`decisiones.tsx`; helper trivially unit-testable, components render without the store, diff matches prior single-screen baseline |
| Row source | Iterate the exhaustive `STATE_LABELS` Record in `COLUMN_ORDER` | Map over `state.orders` / group-by | Guarantees all 5 rows present in fixed order even for empty states; compile-time exhaustiveness if `OrderState` grows |
| Paid predicate | `state === 'comision_pagada' \|\| commissionPaidAt != null` | `state` only, or `commissionPaidAt` only | Equivalent by store invariant; the OR survives either fact drifting and documents the intent |
| NaN guard | `order.commissionMN ?? 0` at every read | Assume present; `Number(x)` | `creado` (and any un-verified order) has `commissionMN` undefined; coalesce keeps every sum finite |
| Commission unit | Native MN, plain `{value} MN` text | `formatMoney` on MN; MN→USD via snapshot | D3 — MN is not ISO currency; conversion overlaps `/decisiones`' margin math; `order-card.tsx:26` precedent |
| Revenue placement | USD only per-state inside the table via `formatMoney`; NO gross-revenue KPI | "Ingresos totales USD" KPI card | D2 — a grand-total card is byte-identical to `/decisiones`' `totals.revenueUSD`; per-state is a different axis |
| Heading | Single `<h1>Finanzas</h1>`; "Comisiones y flujo de caja" as a non-heading `<p>` subtitle; subheadings free of "finanzas" | h1 = "Comisiones y flujo de caja" | Frozen `routes.test.tsx` needs one `getByRole('heading', {name:/finanzas/i})` match; mirrors `decisiones.tsx` exactly |
| Container shape | `useState(() => builder(loadSeedState()))`, direct render, no Form/loader/navigate | RR7 action/loader | Identical to `decisiones.tsx`; render-testable, no AbortSignal path |
| Component count | Two files: `commission-summary.tsx` + `state-breakdown-table.tsx` | One mega-component; three files | Matches the locked "two presentational components" shape of prior screens |

## Interfaces / Contracts

```ts
// app/domain/finanzas.ts — NEW. Pure, numbers-only. No formatting/locale/I/O.
import type { OrderState, SeedState } from './types';

export interface FinanceKpis {
  commissionPaidMN: number;    // Σ commissionMN where paid
  commissionPendingMN: number; // Σ commissionMN where pending (owed, not yet paid)
  commissionTotalMN: number;   // paid + pending
  pendingPaymentCount: number; // count of pending orders
}

export interface FinanceStateRow {
  state: OrderState;           // React key + identity
  label: string;               // STATE_LABELS[state] (display)
  count: number;               // orders in this state
  revenueUSD: number;          // Σ totalUSD (always present, incl. creado)
  commissionMN: number;        // Σ (commissionMN ?? 0) — 0 for creado
}

export interface FinanceView {
  kpis: FinanceKpis;
  rows: FinanceStateRow[];     // one per OrderState, fixed order creado → … → comision_pagada
}

/**
 * Pure commission & cash-flow view model. Splits commission MN into paid vs
 * pending, counts pending-payment orders, and emits one row per OrderState
 * (revenue USD + commission MN) by iterating the exhaustive label map — never
 * the order list — so all 5 rows are present in fixed order. `commissionMN ?? 0`
 * guards NaN for un-verified orders. No formatting, no conversion — leaves only.
 */
export function buildFinanceSummary(state: SeedState): FinanceView;
```

```tsx
// app/components/finanzas/commission-summary.tsx — presentational (mirrors ProfitabilitySummary)
import type { FinanceKpis } from '../../domain/finanzas';
export interface CommissionSummaryProps { kpis: FinanceKpis; }
// <h2>Resumen de comisiones</h2> + dl: Comisión pagada / pendiente / total as `{value} MN`
// plain text; Pendientes de pago = kpis.pendingPaymentCount. NO formatMoney (MN is not USD).
export function CommissionSummary(props: CommissionSummaryProps): JSX.Element;
```

```tsx
// app/components/finanzas/state-breakdown-table.tsx — presentational (mirrors ProfitabilityTable)
import type { FinanceStateRow } from '../../domain/finanzas';
export interface StateBreakdownTableProps { rows: FinanceStateRow[]; }
// <h2>Flujo por estado</h2> + table: Estado (row.label) | Pedidos (count) |
//   Ingresos (formatMoney USD) | Comisión (`{commissionMN} MN`, but "—" when state==='creado').
// Every USD cell via formatMoney(value, MONEY); commission cell is plain MN text.
export function StateBreakdownTable(props: StateBreakdownTableProps): JSX.Element;
```

## Container — `routes/finanzas.tsx`

Replaces the current `PlaceholderScreen`. Direct render, `useState` only.

```tsx
export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Finanzas — Sales Ops Cockpit' }];
}

export default function Finanzas() {
  const [view] = useState(() => buildFinanceSummary(loadSeedState()));

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Finanzas</h1>
      <p className="mt-1 text-sm text-text-muted">Comisiones y flujo de caja</p>
      <CommissionSummary kpis={view.kpis} />
      <div className="mt-8">
        <StateBreakdownTable rows={view.rows} />
      </div>
    </main>
  );
}
```

Exactly one `<h1>` matching `/finanzas/i`. No loader/action → no AbortSignal path. Both
blocks always render (rows are never empty — 5 fixed rows).

## Data Flow

```
loadSeedState() ─► buildFinanceSummary(state)   [pure, numbers-only]
        │
        │  KPIs:  isPaid = state==='comision_pagada' || commissionPaidAt != null
        │         isPending = !isPaid && state ∈ {verificado,transportando,entregado}
        │         paid/pending/total = Σ (commissionMN ?? 0);  pendingPaymentCount = count(pending)
        │  rows:  for state of COLUMN_ORDER (creado→…→comision_pagada):
        │             count, revenueUSD = Σ totalUSD, commissionMN = Σ (commissionMN ?? 0)
        ▼
   FinanceView { kpis, rows }   (rows always length 5, fixed order)
        │
        ▼  useState(() => …) in Finanzas (container)
        │
        ├─► CommissionSummary(kpis)          plain `{value} MN` — "Resumen de comisiones"
        └─► StateBreakdownTable(rows)         formatMoney(USD) + `{value} MN` ("—" for creado)
                                              heading "Flujo por estado"
```

## Types & Seed Delta

| Change | File | Breaking? |
|--------|------|-----------|
| New view-model types + helper | `app/domain/finanzas.ts` | No — new file |
| No `Order` / `OrderItem` / `SeededProduct` / `SeedState` shape change | `app/domain/types.ts` | Untouched |
| No new store action / mutation | `app/store/seed-store.ts` | Untouched |

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

## Testing Strategy (strict TDD — RED → GREEN per unit)

Test runner: `vitest run` from `templates/apps/salesops-mvp`. Domain tests build a synthetic
`SeedState` directly (no store). Component tests build view-model literals and `render` them.
Route tests use `render` + `beforeEach(localStorage.clear)` + `loadSeedState()`
(`decisiones.test.tsx` shape).

| Layer | What | Approach |
|-------|------|----------|
| Unit | paid/pending/total split | orders across all states → `commissionPaidMN` counts only paid, `commissionPendingMN` only {verificado,transportando,entregado}, total = paid + pending |
| Unit | `pendingPaymentCount` | equals count of {verificado,transportando,entregado}; excludes creado + comision_pagada |
| Unit | per-state aggregation | `count`/`revenueUSD`/`commissionMN` sums correct for a multi-order state |
| Unit | creado no-NaN | a `creado`-only order (undefined `commissionMN`) → row `revenueUSD` present, `commissionMN === 0`, all KPIs finite (no NaN) |
| Unit | empty-state rows | a state with zero orders still yields a row `{count:0, revenueUSD:0, commissionMN:0}` |
| Unit | all-empty state | `state.orders = []` → 5 rows all zero, every KPI `0` (no throw) |
| Unit | fixed row order | `rows.map(r => r.state)` deep-equals `['creado','verificado','transportando','entregado','comision_pagada']` |
| Unit | paidAt equivalence | an order with `state:'comision_pagada'` and one with only `commissionPaidAt` set both count as paid |
| Component | `CommissionSummary` render | labels present; each MN figure is plain `{value} MN`; assert NO `$`/`formatMoney` output on MN cells |
| Component | `StateBreakdownTable` rows | 5 rows rendered; USD cell matches `^\$[\d,]+\.\d{2}$`; commission cell plain MN; `creado` commission renders "—" |
| Route | `finanzas` heading | `render(<Finanzas/>)` → single `getByRole('heading', { name: /finanzas/i })` |
| Route | `finanzas` blocks | both "Resumen de comisiones" and "Flujo por estado" subheadings render (neither contains "finanzas") |
| Route | `finanzas` no mutation | `container.querySelector('form')` null; `queryAllByRole('button')` length 0 |
| Shared | `routes.test.tsx` | stays green — one `<h1>Finanzas</h1>`, "Comisiones y flujo de caja" is a `<p>` (not a heading), subheadings free of "finanzas", plain `Component` (no loader/action) |

## Migration / Rollout

No migration. No type shape change; persisted `SeedState` still loads. `resetDemo()`
regenerates identically. The screen is read-only — reloading never mutates state.

## Open Questions / Risks

- **Duplicate/mismatched heading break (Med→mitigated)**: frozen `routes.test.tsx` needs one
  heading matching `/finanzas/i`; h1 = "Finanzas", descriptor is a non-heading `<p>`,
  subheadings avoid "finanzas". Resolves the proposal D5 inconsistency at HOW level.
- **Revenue-USD duplication (Med→mitigated)**: D2 — no gross-revenue KPI; revenue USD only
  per-state in the table.
- **Commission converted to USD (Low→mitigated)**: D3 — native MN plain text; a component
  test asserts no `formatMoney`/`$` on MN figures.
- **`creado` undefined `commissionMN` → NaN (Low→mitigated)**: `commissionMN ?? 0` everywhere;
  creado-only + all-empty unit tests assert finite sums.
- **Scope bleed into `/operador-gestores` (mark-paid) or `/decisiones` (Low→mitigated)**:
  read-only, no buttons/form, order-state axis only.
- **AbortSignal/jsdom (Low→mitigated)**: direct-render `useState`-only container, no
  `<Form>`/loader/`useNavigate` — identical to `decisiones.tsx`.
