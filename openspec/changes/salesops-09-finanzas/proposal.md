# Proposal — salesops-09-finanzas (Pantalla 7: Finanzas)

Replace the `/finanzas` placeholder with a real, read-only **"Comisiones y flujo
de caja"** (commission & cash-flow) screen — the LAST placeholder in the
salesops-mvp cockpit. It reports two things the other screens deliberately do not
aggregate: (1) how much gestor commission we have **paid vs. still owe**, in
native **MN**, and (2) **where our money sits in the pipeline** — a per-order-state
funnel of order count, revenue USD, and commission MN. Built as a pure view-model
helper (`buildFinanceSummary`) plus a container + two presentational components,
mirroring the shipped Inventario/Decisiones screens almost 1:1. **Zero
domain/store/schema changes** — every field it reads (`state`, `totalUSD`,
`commissionMN`, `commissionPaidAt`) already exists and is already frozen correctly
by the store.

## Why now

- Pantallas 3–6 (operador-almacen, tasas, inventario, decisiones) are archived.
  `/finanzas` is the **single remaining `PlaceholderScreen`**; shipping it closes
  the cockpit. The route (`app/routes.ts:12`), the sidebar entry (`Landmark`,
  label "Finanzas", path `/finanzas`), and every frozen `Order` field this screen
  consumes already exist — there are **no blocking unknowns**.
- `verifyOrder` freezes `commissionMN` (and `exchangeRateSnapshot`) at
  verification; `markCommissionPaid` stamps `commissionPaidAt` only on the
  `entregado → comision_pagada` transition. The paid-vs-pending split and the
  per-state funnel are both derivable from these existing frozen facts — nothing
  needs to be recomputed, migrated, or added to the schema.
- These are the only aggregatable financial facts **not already surfaced**:
  commission owed-vs-paid in MN, and the per-state revenue/commission funnel
  (including the `creado` backlog `/decisiones` deliberately excludes).

## What success looks like

- A user opens `/finanzas` and sees, in native MN: comisión pagada, comisión
  pendiente, comisión total, and a count of pedidos pendientes de pago (KPI
  cards) — then a per-state breakdown table (one row per `OrderState` in the
  linear order `creado → verificado → transportando → entregado →
  comision_pagada`) with order count, revenue USD (`formatMoney`), and commission
  MN (plain text).
- USD figures render via `formatMoney` (matches `^\$[\d,]+\.\d{2}$`); MN figures
  render as plain `{value} MN` text, never through `formatMoney` (matches the
  `order-card.tsx` precedent).
- The screen is **read-only**: no `<form>`, zero buttons, no "mark commission
  paid" affordance (that lives in `/operador-gestores`).
- The shared `routes.test.tsx` `getByRole('heading', { name: /finanzas/i })`
  assertion still passes: exactly one `<h1>` matches, and no subheading contains
  the literal substring "finanzas". Every prior-task frozen test stays green.

## Scope

### In scope

- New pure domain helper `app/domain/finanzas.ts` exporting
  `buildFinanceSummary(state: SeedState): FinanceView`:
  - **KPIs** (native MN, numbers only):
    - `commissionPaidMN` = Σ `order.commissionMN` where `state === 'comision_pagada'`
    - `commissionPendingMN` = Σ `order.commissionMN` where
      `state ∈ {verificado, transportando, entregado}`
    - `commissionTotalMN` = `commissionPaidMN + commissionPendingMN`
    - `pendingPaymentCount` = count of orders where
      `state ∈ {verificado, transportando, entregado}` (owed but not yet paid)
  - **rows**: one entry per `OrderState`, emitted in the exhaustive linear order
    `creado → verificado → transportando → entregado → comision_pagada`
    (mirror the `Record<OrderState, string>` label map from
    `kanban-board.tsx`'s `COLUMN_TITLES` for compile-time safety), each carrying:
    - `state: OrderState`, `label: string`
    - `count`: number of orders in that state
    - `revenueUSD`: Σ `order.totalUSD` (always present, incl. `creado`)
    - `commissionMN`: Σ `order.commissionMN` (0 for `creado` — not frozen yet)
  - Numbers-only view model — NO formatting/locale/`formatMoney` in the domain
    layer. `creado`'s `commissionMN` is `0` (empty/"—" is a presentation concern).
- Two presentational components under `app/components/finanzas/` (mirror
  `app/components/decisiones/*`): a **summary/KPI card block** (comisión
  pagada/pendiente/total MN + pendingPaymentCount) and a **state-breakdown table**
  (Estado | Pedidos | Ingresos USD `formatMoney` | Comisión MN plain text).
- Rewrite `app/routes/finanzas.tsx` as a read-only container:
  `useState(() => buildFinanceSummary(loadSeedState()))`, direct render, no
  `<Form>`/loader/`useNavigate` (mirror `decisiones.tsx`/`inventario.tsx`). Single
  `<h1>` "Comisiones y flujo de caja".
- Tests: `app/domain/__tests__/finanzas.test.ts`,
  `app/components/finanzas/__tests__/*.test.tsx`, and a dedicated
  `app/routes/__tests__/finanzas.test.tsx` (mirror `inventario`/`decisiones` test
  structure: heading, money-format regex, MN plain text, no mutation affordance).

### Out of scope

- **No "total revenue USD" KPI card.** A gross revenue card would numerically
  duplicate `/decisiones`' `totals.revenueUSD` (same scalar for non-`creado`
  orders). Revenue USD appears ONLY inside the per-state table, disaggregated —
  `/decisiones` remains the single source for the profitability revenue total.
- **No MN→USD conversion of commission.** Commission stays native MN throughout.
  Converting via snapshot rate is exactly what `/decisiones` already does for its
  own margin math — re-deriving it here reintroduces overlap and an unnecessary
  figure.
- **No mutation.** No "mark comisión pagada" button, no new store action, no
  `updateX`. That mutation already lives in `/operador-gestores`; Finanzas is
  read-only like `/decisiones` and `/inventario`.
- **No domain/store/schema change.** `Order`, `OrderItem`, `OrderState`,
  `SeededProduct`, `SeedState`, `types.ts`, and `seed-store.ts` shapes stay
  untouched.
- **No overlap with `/decisiones`** (per-order margin ranking) or **`/tasas`**
  (rate CRUD). Finanzas aggregates on the ORDER-STATE axis and reports commission
  in MN — a materially different framing from decisiones' per-order USD margin.
- Payment-method / currency mix, restock boards, product-cost joins, auth, real
  persistence, and any routing/sidebar change (already wired).

## Locked decisions (ADR-style)

### D1 — Combine commission ledger + per-state funnel into one screen

| | |
|---|---|
| **Decision** | Ship two blocks: MN commission KPI cards (paid/pending/total + pending-payment count) and a per-`OrderState` breakdown table (count, revenue USD, commission MN), including the `creado` row. |
| **Rationale** | Either block alone is too thin for a full screen/PR. Together they answer both "who do we owe" and "where is our money sitting", with zero overlap with existing screens, reusing the established summary+table container/presentational shape. Sizes to ~300–350 lines, matching prior single-screen tasks. |
| **Rejected — ledger only / funnel only** | Each is a single thin block; combined gives the full finance picture at the same review cost tier. |
| **Rejected — payment-method mix** | New data dimension but thin value; better as a future add-on, not the MVP scope-closer. |

### D2 — No gross "revenue USD" KPI card; revenue USD only inside the per-state table

| | |
|---|---|
| **Decision** | Do NOT add an "Ingresos totales USD" KPI card. Revenue USD is shown only disaggregated per state inside the breakdown table. |
| **Rationale** | A grand-total revenue card would be byte-identical to `/decisiones`' `totals.revenueUSD` for the non-`creado` subset — a direct numeric duplication trap. Per-state framing (funnel visibility) is a different axis, not a repeated aggregate, and `/decisiones` stays the single source for the profitability revenue total. |
| **Rejected — gross revenue KPI card** | Duplicates decisiones' revenue scalar; violates single-source. |

### D3 — Commission stays native MN; never converted to USD

| | |
|---|---|
| **Decision** | All commission figures (KPIs and table column) render in native MN as plain `{value} MN` text. No snapshot-rate conversion. |
| **Rationale** | Commission is paid in MN (`markCommissionPaid`). `/decisiones` already owns the MN→USD margin math; converting here re-introduces overlap and an extra derived figure. Plain-MN text matches the `order-card.tsx:26` precedent; MN is not a real ISO currency so `formatMoney` must not touch it. |
| **Rejected — convert commission to USD via snapshot rate** | Overlaps decisiones; misrepresents MN as USD. |

### D4 — Pure view-model helper + container/presentational split (mirror Inventario/Decisiones)

| | |
|---|---|
| **Decision** | `app/domain/finanzas.ts` returns a numbers-only `FinanceView`; the route loads it once via `useState(() => buildFinanceSummary(loadSeedState()))`; two dumb components render it. Money formatting lives only in the components. |
| **Rationale** | Mirrors `buildProfitabilityRanking`/`buildInventorySummary` and their containers exactly — the established read-only-screen precedent — so the helper is trivially unit-testable and components render without touching the store. Keeps the review diff aligned with prior single-screen tasks and avoids the jsdom+undici `AbortSignal` gotcha (no `<Form>`/loader/`useNavigate`). |
| **Rejected — compute/format inside the route** | Collapses the split, makes aggregation untestable in isolation, diverges from the baseline. |

### D5 — Single `<h1>`; no subheading contains the literal "finanzas"

| | |
|---|---|
| **Decision** | Exactly one `<h1>` ("Comisiones y flujo de caja"); every h2+ subheading avoids the literal substring "finanzas" (use e.g. "Resumen de comisiones", "Flujo por estado"). |
| **Rationale** | The shared `routes.test.tsx` queries `getByRole('heading', { name: /finanzas/i })` (single match). A second heading containing "finanzas" throws "multiple elements found" — a gotcha already hit and documented in prior tasks (decisiones sidestepped it identically). |
| **Rejected — subheading repeating "Finanzas"** | Re-triggers the known duplicate-heading test failure. |

## FinanceView shape

```ts
interface FinanceKpis {
  commissionPaidMN: number;    // Σ commissionMN where state === 'comision_pagada'
  commissionPendingMN: number; // Σ commissionMN where state ∈ {verificado, transportando, entregado}
  commissionTotalMN: number;   // paid + pending
  pendingPaymentCount: number; // count where state ∈ {verificado, transportando, entregado}
}

interface FinanceStateRow {
  state: OrderState;           // 'creado' | 'verificado' | 'transportando' | 'entregado' | 'comision_pagada'
  label: string;               // from Record<OrderState,string> (mirrors COLUMN_TITLES)
  count: number;               // orders in this state
  revenueUSD: number;          // Σ totalUSD (always present, incl. creado)
  commissionMN: number;        // Σ commissionMN (0 for creado)
}

interface FinanceView {
  kpis: FinanceKpis;
  rows: FinanceStateRow[];     // one per OrderState, linear order creado → … → comision_pagada
}
```

## Affected areas

| File | Change |
|---|---|
| `app/routes/finanzas.tsx` | Replace `PlaceholderScreen` with a read-only `useState` container: `buildFinanceSummary(loadSeedState())`, single `<h1>`, render KPI summary + state-breakdown table. |
| `app/domain/finanzas.ts` | New pure helper `buildFinanceSummary(state)` → `FinanceView` (MN commission KPIs + per-state rows; numbers only, no formatting). |
| `app/components/finanzas/*.tsx` | New presentational KPI summary block + state-breakdown table (USD via `formatMoney`, MN as plain `{value} MN`). |
| `app/domain/__tests__/finanzas.test.ts` | New unit tests (paid/pending/total split, pending count, per-state sums, `creado` commission = 0, exhaustive row order). |
| `app/components/finanzas/__tests__/*.test.tsx` | New component tests (KPI MN plain text, table rows, USD money-format regex, MN plain text). |
| `app/routes/__tests__/finanzas.test.tsx` | New route/container test (single heading, rendered blocks, no mutation affordance). |
| `app/domain/types.ts`, `app/store/seed-store.ts` | **No change** — schema and mutations stay untouched. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Duplicate-heading breaks shared `routes.test.tsx` `/finanzas/i` query | Med | D5: exactly one `<h1>`; all subheadings clear of the literal "finanzas". |
| A revenue-USD KPI card silently duplicates decisiones' `totals.revenueUSD` | Med | D2: no gross revenue card; revenue USD only per-state in the table. |
| Commission accidentally converted to USD, overlapping decisiones | Low | D3: commission stays native MN everywhere; add a test asserting no `formatMoney` on MN figures. |
| `creado` orders have undefined `commissionMN`, corrupting sums/NaN | Low | Treat missing `commissionMN` as `0`; unit test the `creado`-only case (revenue shown, commission 0). |
| Scope bleed into `/operador-gestores` (mark-paid) or `/decisiones` | Low | Out-of-scope draws the line: read-only, no buttons, order-state axis only. |
| jsdom/AbortSignal container gotcha | Low | Avoided by construction: direct-render `useState`-only container, no `<Form>`/loader/`useNavigate` (same as `decisiones.tsx`). |

## Testability note (strict TDD is active)

- Domain helper: paid/pending/total split is correct per state; `pendingPaymentCount`
  counts only `{verificado, transportando, entregado}`; per-state `revenueUSD` and
  `commissionMN` sums are correct; `creado` row shows revenue but commission `0`;
  `rows` are emitted in the exhaustive linear `OrderState` order.
- Components: KPI cards render MN as plain `{value} MN`; table renders one row per
  state; USD matches `^\$[\d,]+\.\d{2}$`; commission column is plain MN text.
- Container: single `<h1>` present, both blocks rendered, and no mutation
  affordance (no `<form>`, zero buttons).

## Next step

Proceed to `sdd-spec` (requirements/scenarios) and `sdd-design` (helper +
component shapes) — they can run in parallel from this locked proposal.
