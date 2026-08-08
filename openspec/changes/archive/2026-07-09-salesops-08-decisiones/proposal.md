# Proposal — salesops-08-decisiones (Pantalla 6: Decisiones)

Replace the `/decisiones` placeholder with a real **Order Profitability / Margin
Ranking** screen: a read-only decision-support view that ranks already-verified
orders by profit margin, flags loss-making orders, and shows grand totals. It is
built as a pure view-model helper (`buildProfitabilityRanking`) plus a
container + two presentational components, mirroring the shipped Inventario
screen almost 1:1. **Zero domain/store schema changes** — every field the metric
needs already lives on `Order`/`SeededProduct` today.

## Why now

- Pantalla 3 (operador-almacen), Pantalla 4 (tasas), and Pantalla 5 (inventario)
  are archived. The `/decisiones` route (`app/routes.ts:11`), the sidebar entry
  (`BarChart3`, label "Decisiones"), and the frozen order totals this screen
  consumes (`totalUSD`, `totalMN`, `commissionMN`, `exchangeRateSnapshot`) all
  already exist — there are **no blocking unknowns**.
- `verifyOrder` already freezes `usdToMn` onto `Order.exchangeRateSnapshot` and
  pre-sums per-line commission into `Order.commissionMN`. All raw inputs for a
  per-order margin metric are present; nothing needs to be recomputed or migrated.
- `/decisiones` is one of the last two remaining `PlaceholderScreen`s. Shipping
  it closes the decision-support surface and leaves only Finanzas (Pantalla 7,
  aggregate financial reporting — explicitly a separate scope).

## What success looks like

- A user opens `/decisiones`, sees every verified-or-later order ranked by
  `marginUSD` descending, with revenue/cost/commission/margin per row, negative
  margins flagged as a loss, and a grand-totals summary card.
- USD figures render via `formatMoney` (matches `^\$[\d,]+\.\d{2}$`); any MN
  figure renders as plain `{value} MN` text, never through `formatMoney`.
- `creado` orders (no frozen totals yet) are excluded from the ranking entirely.
- The screen is read-only: no `<form>`, zero buttons, no mutation affordance.
- Every prior-task frozen test stays green; the shared `routes.test.tsx`
  `/decisiones/i` heading assertion still passes (single `<h1>` only).

## Scope

### In scope

- New pure domain helper `app/domain/decisiones.ts` exporting
  `buildProfitabilityRanking(state: SeedState)`:
  - Filter to orders with `state !== 'creado'` (i.e. carrying frozen
    `totalMN`/`commissionMN`/`exchangeRateSnapshot`).
  - Per order: `revenueUSD = totalUSD`;
    `costUSD = Σ(item.quantity × product.costUSD)` via a product-by-id `Map` join
    with defensive orphan-skip (mirrors `buildInventorySummary`);
    `commissionUSD = order.commissionMN / order.exchangeRateSnapshot.usdToMn`
    using the order's OWN frozen snapshot rate (never the live rate);
    `marginUSD = revenueUSD − costUSD − commissionUSD`; `marginPercent`.
  - Sort rows by `marginUSD` descending; return grand totals
    (`totalRevenueUSD`, `totalCostUSD`, `totalCommissionUSD`, `totalMarginUSD`).
  - Numbers-only view model — NO formatting/locale in the domain layer.
- Two presentational components under `app/components/decisiones/`: a summary
  card (mirrors `InventorySummary`) and a ranked table/list (rows tagged "loss"
  when `marginUSD < 0`).
- Rewrite `routes/decisiones.tsx` as a read-only container:
  `useState(() => buildProfitabilityRanking(loadSeedState()))`, direct render,
  no `<Form>`/loader/`useNavigate` (mirrors `inventario.tsx`).
- Tests: `app/domain/__tests__/decisiones.test.ts`,
  `app/components/decisiones/__tests__/*.test.tsx`, and
  `app/routes/__tests__/decisiones.test.tsx` (replaces the current placeholder
  coverage) — mirror the Inventario test structure (heading, money-format regex,
  "no mutation affordance").

### Out of scope

- Any mutation — this screen writes nothing. No new store action, no `updateX`.
- Any domain/store schema change: `Order`, `OrderItem`, `SeededProduct`,
  `SeedState`, `types.ts`, and `seed-store.ts` shapes stay untouched.
- `creado` orders as a separate "pendiente de verificar" group — excluded
  entirely, not shown.
- Aggregate financial reporting / KPI dashboards — that is Finanzas (Pantalla 7),
  a distinct future scope this screen must NOT overlap.
- Commission-payout decisions ("who to pay next") — that job belongs to the
  existing `operador-gestores` "Marcar comisión pagada" flow; no duplication here.
- Restock/pricing boards, inventory joins beyond the product cost lookup, auth,
  real persistence, and any routing/sidebar change (already wired).

## Locked decisions (ADR-style)

### D1 — Rank only `verificado`+ orders; exclude `creado` entirely

| | |
|---|---|
| **Decision** | Filter the ranking to `order.state !== 'creado'`. `creado` orders are omitted with no separate group or placeholder row. |
| **Rationale** | Margin needs frozen `totalMN`/`commissionMN`/`exchangeRateSnapshot`, which only exist from `verificado` onward. A `creado` order has no defensible margin to rank. Excluding keeps the screen a single-purpose "which real orders were worth it" view instead of mixing incomparable rows. |
| **Rejected — separate "pendiente" group** | Adds a second data shape and UI section for orders with no computable margin; more surface, more test cost, no decision value. |

### D2 — Convert commission with the order's OWN frozen snapshot rate

| | |
|---|---|
| **Decision** | `commissionUSD = order.commissionMN / order.exchangeRateSnapshot.usdToMn` — always the order's frozen snapshot, never `state.exchangeRates` (the live rate). |
| **Rationale** | Preserves the frozen-snapshot invariant already load-bearing across three prior screens: a later rate edit must not retroactively change a verified order's economics. Using the live rate would silently re-price historical margins every time someone edits `/tasas`. |
| **Rejected — live `state.exchangeRates.usdToMn`** | Breaks the core invariant; makes the ranking non-deterministic across rate edits. |

### D3 — Pure view-model helper + container/presentational split (mirror Inventario)

| | |
|---|---|
| **Decision** | Domain layer returns a numbers-only view model; the container loads it once via `useState`; two dumb presentational components render it. Money formatting lives only in the components. |
| **Rationale** | Mirrors `buildInventorySummary`/`inventario.tsx` exactly — the established read-only-screen precedent — so the helper is trivially unit-testable and the components render without touching the store. Keeps the review diff aligned with prior single-screen tasks. |
| **Rejected — compute/format inside the route** | Collapses the split, makes the metric untestable in isolation, diverges from the Inventario review baseline. |

### D4 — USD via `formatMoney`, MN as plain text; avoid the duplicate-heading trap

| | |
|---|---|
| **Decision** | Format all USD figures with `formatMoney` (`en-US`/`USD`); render any MN figure as plain `{value} MN` text. Nested subheadings must NOT contain the word "decisiones" (use e.g. "Ranking de rentabilidad de pedidos"). |
| **Rationale** | MN is not a real ISO currency — existing code (`order-card.tsx`) renders it as plain text. And the shared `routes.test.tsx` queries `getByRole('heading', { name: /decisiones/i })` singular; a second heading containing "decisiones" breaks it with "multiple elements found" (a gotcha already hit and documented in the tasas apply-progress). |
| **Rejected — `formatMoney` for MN** | Misrepresents MN as USD and diverges from `order-card.tsx`. |
| **Rejected — subheading repeating "Decisiones"** | Re-triggers the known duplicate-heading test failure. |

## Affected areas

| File | Change |
|---|---|
| `app/routes/decisiones.tsx` | Replace placeholder with a read-only `useState` container: `buildProfitabilityRanking(loadSeedState())`, render summary + ranked table. |
| `app/domain/decisiones.ts` | New pure helper `buildProfitabilityRanking(state)` — filter, product-join cost, frozen-rate commission, margin, sort desc, grand totals. |
| `app/components/decisiones/*.tsx` | New presentational summary card + ranked table/list (loss flag on `marginUSD < 0`). |
| `app/domain/__tests__/decisiones.test.ts` | New unit tests (filter, cost join + orphan-skip, frozen-rate commission, margin sign/sort, totals). |
| `app/components/decisiones/__tests__/*.test.tsx` | New component tests (rows, loss flag, money-format regex, MN plain text). |
| `app/routes/__tests__/decisiones.test.tsx` | New route/container test (heading, ranked render, no mutation affordance); replaces placeholder coverage. |
| `app/domain/types.ts`, `app/store/seed-store.ts` | **No change** — schema and mutations stay untouched. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Duplicate-heading breaks shared `routes.test.tsx` `/decisiones/i` query | Med | Keep exactly one `<h1>` containing "Decisiones"; word all subheadings clear of "decisiones" (D4). |
| Commission converted with the live rate instead of the frozen snapshot | Low | D2 uses `order.exchangeRateSnapshot.usdToMn` only; add a regression test that edits the live rate and asserts a ranked order's `commissionUSD`/`marginUSD` are unchanged. |
| Orphan `item.productId` (product removed) throws during cost join | Low | Defensive orphan-skip mirroring `buildInventorySummary`; covered by a unit test. |
| Divide-by-zero on `exchangeRateSnapshot.usdToMn` | Very Low | Not reachable (rates validated `> 0` at save), but add a defensive unit test anyway. |
| jsdom/AbortSignal container gotcha | Low | Avoided by construction: direct-render `useState`-only container, no `<Form>`/loader/`useNavigate` (same as `inventario.tsx`). |
| Scope bleed into Finanzas / operador-gestores | Low | Out-of-scope section draws the line explicitly; screen is read-only and per-order only, no aggregate reporting or payout mutation. |

## Testability note (strict TDD is active)

- Domain helper: filter excludes `creado`; cost join sums `quantity × costUSD`
  and skips orphans; commission uses the frozen snapshot rate; `marginUSD` sign
  and descending sort are correct; grand totals equal the row sums; live-rate-edit
  regression proves ranked orders don't move.
- Components: rows render revenue/cost/commission/margin, loss flag toggles on
  `marginUSD < 0`, USD matches `^\$[\d,]+\.\d{2}$`, MN renders as plain text.
- Container: heading present, ranked rows rendered, and no mutation affordance
  (no `<form>`, zero buttons).

## Next step

Proceed to `sdd-spec` (requirements/scenarios) and `sdd-design` (helper +
component shapes) — they can run in parallel from this locked proposal.
