# Design: Pantalla 6 — Decisiones (salesops-08-decisiones)

## Technical Approach

The `/decisiones` route stops being a `PlaceholderScreen` and becomes a thin, read-only
**container** that computes an **Order Profitability / Margin Ranking** view model once on
mount and renders two dumb presentational components. It mirrors the shipped **Inventario**
screen 1:1 (`inventario.tsx` + `domain/inventory.ts` + `components/inventario/*`):

- A pure domain helper `buildProfitabilityRanking(state: SeedState): ProfitabilityView`
  produces a **numbers-only** view model (no formatting, no locale, no I/O).
- The container `routes/decisiones.tsx` loads it once via
  `useState(() => buildProfitabilityRanking(loadSeedState()))`, direct render, a single
  `<h1>Decisiones</h1>`, no RR7 `<Form>`/action/loader, no `useNavigate` (sidesteps the
  jsdom+undici `AbortSignal` gotcha) — byte-for-byte the `inventario.tsx` shape.
- Two presentational components under `app/components/decisiones/` — a grand-totals summary
  card (mirrors `InventorySummary`) and a ranked table (mirrors `WarehouseDetail`) — do ALL
  money formatting via `formatMoney`.

**Zero domain/store schema changes.** Every field the metric needs already lives on
`Order` (`totalUSD`, `commissionMN`, `exchangeRateSnapshot.usdToMn`, `items[]`, `state`,
`client`) and `SeededProduct` (`costUSD`). `types.ts` and `seed-store.ts` are untouched;
there is NO new store action because the screen writes nothing.

## Screen is all-USD — no MN, no live rate display (HOW-level refinement of D4)

Proposal D4 governs USD-vs-MN rendering. At the HOW level this screen displays **only USD
figures** (revenue, cost, commission, margin are all USD after the D2 conversion). Therefore
`formatMoney` is used throughout and there is **no MN figure rendered at all** — the "MN as
plain `{value} MN` text" clause of D4 is honored vacuously (nothing to render as MN).

Decision: do NOT surface the frozen `exchangeRateSnapshot.usdToMn` per row. It is an
internal conversion input, not a decision signal for "which order was worth it", and showing
it would (a) re-introduce an MN/rate column with no decision value and (b) risk a stray
`{rate} MN` string. The commission is presented already converted to USD. This keeps the
screen single-purpose and the money-format regex (`^\$[\d,]+\.\d{2}$`) unambiguous.

## The margin math (locked D2 — frozen snapshot, per order)

For each order with `state !== 'creado'`:

```
revenueUSD    = order.totalUSD
costUSD       = Σ over order.items of (item.quantity × productById.get(item.productId).costUSD)
                — product-by-id Map join; orphan items (no matching product) are SKIPPED
                  (excluded from costUSD) without throwing, mirroring buildInventorySummary
commissionUSD = order.commissionMN / order.exchangeRateSnapshot.usdToMn
                — the order's OWN frozen snapshot rate, NEVER state.exchangeRates (live)
marginUSD     = revenueUSD − costUSD − commissionUSD
marginPercent = revenueUSD > 0 ? (marginUSD / revenueUSD) × 100 : 0
isLoss        = marginUSD < 0
```

Grand totals are the column-wise sums of the surviving rows.

### Divide-by-zero / missing-snapshot guard stance

`exchangeRateSnapshot.usdToMn` is validated `> 0` upstream (rates are positive at save, and
`verifyOrder` freezes a positive `usdToMn`), so the divisor is never `0` in practice. Two
belt-and-suspenders guards are applied at the HOW level, and both are documented assumptions
rather than expected code paths:

- **Missing snapshot** — `Order.exchangeRateSnapshot` and `Order.commissionMN` are typed
  optional. The D1 filter (`state !== 'creado'`) guarantees they are present for every ranked
  order. Defensively, the helper reads `order.exchangeRateSnapshot?.usdToMn` and
  `order.commissionMN ?? 0`.
- **Zero/absent divisor** — `commissionUSD = usdToMn && usdToMn > 0 ? commissionMN / usdToMn : 0`.
  A non-positive or missing rate yields `commissionUSD = 0` instead of `Infinity`/`NaN`.

A unit test asserts the guard (a synthetic order with `usdToMn: 0` produces a finite
`commissionUSD` of `0`), even though the real seed never reaches it.

## Sort stability (deterministic ties)

Rows are sorted by `marginUSD` **descending**. Ties are broken deterministically by
`orderId` ascending so the ranking is fully reproducible run-to-run and test-to-test:

```ts
rows.sort((a, b) => b.marginUSD - a.marginUSD || a.orderId.localeCompare(b.orderId));
```

The explicit secondary comparator does not rely on `Array.prototype.sort` stability; equal
margins always resolve to the same order. A unit test with two equal-margin orders asserts
the `orderId`-ascending tie-break.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Layer split | Pure `buildProfitabilityRanking(state)` → numbers-only view model; container renders; formatting only in components (locked D3) | Compute/format inside the route | Mirrors `buildInventorySummary`/`inventario.tsx`; helper is trivially unit-testable, components render without the store, diff matches the prior single-screen baseline |
| Commission conversion | Order's OWN frozen `exchangeRateSnapshot.usdToMn` (locked D2) | Live `state.exchangeRates.usdToMn` | Preserves the frozen-snapshot invariant load-bearing across screens 3-5; a later `/tasas` edit must not re-price a verified order's margin |
| Filter | `state !== 'creado'` only; `creado` omitted entirely (locked D1) | Separate "pendiente" group | `creado` has no frozen totals → no defensible margin; a second shape/section adds test cost with no decision value |
| Cost join | Product-by-id `Map`, orphan items skipped without throwing | Nested `find` per item; throw on orphan | O(1) lookups; defends against partial/corrupt seed exactly like `buildInventorySummary` |
| Sort | `marginUSD` desc, tie-break `orderId` asc via explicit comparator | Rely on `sort` stability; sort by `marginPercent` | Deterministic regardless of engine; ranking is by absolute margin (D-scope), percent is a secondary display metric only |
| Totals shape | Nested `totals: { revenueUSD, costUSD, commissionUSD, marginUSD }` + `count` | Flat `totalRevenueUSD`… keys (proposal draft naming) | Cleaner view model; groups the four sums the summary card renders; `count` drives an empty-state/row-count assertion |
| Row label | `label = order.client.name`; `orderId` kept separate as the React key | Compose a formatted id string in the domain | Label is display data, key is identity; no formatting/locale enters the domain layer |
| MN / rate display | All figures USD via `formatMoney`; no MN, no per-row rate column (refines D4) | Show frozen rate or an MN column | Commission is pre-converted to USD; a rate/MN column has no decision value and risks a stray non-USD money string |
| Loss flag | `isLoss` boolean in the view model; table renders a "Pérdida" tag inline + row emphasis when `isLoss` | A separate `LossBadge` component file | Keeps the locked "two presentational components" count; the tag is a trivial conditional span, not worth a third file |
| Heading discipline | Exactly one `<h1>Decisiones</h1>`; subheadings "Resumen de rentabilidad" and "Ranking de rentabilidad de pedidos" (no "decisiones") (locked D4) | A subheading containing "Decisiones" | Shared `routes.test.tsx` queries `getByRole('heading', { name: /decisiones/i })` singular; a second "decisiones" heading breaks it with "multiple elements found" |
| Container shape | `useState(() => builder(loadSeedState()))`, direct render, no Form/loader/navigate | RR7 action/loader | Identical to `inventario.tsx`; render-testable, no AbortSignal path |

## Interfaces / Contracts

```ts
// app/domain/decisiones.ts — NEW. Pure, numbers-only. No formatting/locale/I/O.
import type { SeedState } from './types';

export interface ProfitabilityRow {
  orderId: string;        // React key + identity
  label: string;          // order.client.name (display)
  revenueUSD: number;     // = order.totalUSD
  costUSD: number;        // Σ item.quantity × product.costUSD (orphan-skip)
  commissionUSD: number;  // commissionMN / frozen usdToMn (0 if rate ≤ 0/missing)
  marginUSD: number;      // revenueUSD − costUSD − commissionUSD
  marginPercent: number;  // revenueUSD > 0 ? marginUSD/revenueUSD × 100 : 0
  isLoss: boolean;        // marginUSD < 0
}

export interface ProfitabilityTotals {
  revenueUSD: number;
  costUSD: number;
  commissionUSD: number;
  marginUSD: number;
}

export interface ProfitabilityView {
  rows: ProfitabilityRow[];      // sorted desc by marginUSD, tie-break orderId asc
  totals: ProfitabilityTotals;   // column-wise sums of rows
  count: number;                 // rows.length (ranked-order count)
}

/**
 * Pure profitability ranking. Filters out `creado` orders (no frozen totals),
 * computes per-order revenue/cost/commission/margin using each order's OWN
 * frozen exchangeRateSnapshot (never the live rate), skips orphan items, sorts
 * by marginUSD desc with a deterministic orderId tie-break, and returns grand
 * totals. No formatting — that happens only at the presentational leaves.
 */
export function buildProfitabilityRanking(state: SeedState): ProfitabilityView;
```

```tsx
// app/components/decisiones/profitability-summary.tsx — presentational (mirrors InventorySummary)
import type { ProfitabilityTotals } from '../../domain/decisiones';
export interface ProfitabilitySummaryProps {
  totals: ProfitabilityTotals;
  count: number;
}
// const MONEY = { locale: 'en-US', currency: 'USD' } as const;
// <h2>Resumen de rentabilidad</h2> + dl: Pedidos (count), Ingresos, Costo, Comisión, Margen.
// All money via formatMoney(value, MONEY). Margen emphasized red when totals.marginUSD < 0.
export function ProfitabilitySummary(props: ProfitabilitySummaryProps): JSX.Element;
```

```tsx
// app/components/decisiones/profitability-table.tsx — presentational (mirrors WarehouseDetail)
import type { ProfitabilityRow } from '../../domain/decisiones';
export interface ProfitabilityTableProps {
  rows: ProfitabilityRow[];
}
// <h2>Ranking de rentabilidad de pedidos</h2> + table:
//   Pedido (row.label) | Ingresos | Costo | Comisión | Margen | (loss tag)
// Every money cell via formatMoney(value, MONEY). When row.isLoss: render an inline
// "Pérdida" span + red emphasis on the margin cell. Fixed-height scroll container
// (max-h-96 overflow-y-auto) like WarehouseDetail so long lists stay bounded.
export function ProfitabilityTable(props: ProfitabilityTableProps): JSX.Element;
```

## Container — `routes/decisiones.tsx`

Replaces the current `PlaceholderScreen`. Direct render, `useState` only.

```tsx
export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Decisiones — Sales Ops Cockpit' }];
}

export default function Decisiones() {
  const [view] = useState(() => buildProfitabilityRanking(loadSeedState()));

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Decisiones</h1>
      <ProfitabilitySummary totals={view.totals} count={view.count} />
      <div className="mt-8">
        <ProfitabilityTable rows={view.rows} />
      </div>
    </main>
  );
}
```

`meta()` stays (title "Decisiones — Sales Ops Cockpit"). No loader/action → no AbortSignal
path. Exactly one `<h1>` containing "Decisiones".

## Data Flow

```
loadSeedState() ─► buildProfitabilityRanking(state)   [pure, numbers-only]
        │
        │  1. productById = Map(state.products → id)
        │  2. for each order where state !== 'creado':
        │         revenueUSD    = totalUSD
        │         costUSD       = Σ item.qty × productById.get(item.productId)?.costUSD  (orphan-skip)
        │         commissionUSD = usdToMn>0 ? commissionMN / usdToMn : 0   (FROZEN snapshot)
        │         marginUSD     = revenue − cost − commission
        │  3. sort rows: marginUSD desc, orderId asc
        │  4. totals = column sums; count = rows.length
        ▼
   ProfitabilityView { rows, totals, count }
        │
        ▼  useState(() => …) in Decisiones (container)
        │
        ├─► ProfitabilitySummary(totals, count)     formatMoney(USD) — "Resumen de rentabilidad"
        └─► ProfitabilityTable(rows)                formatMoney(USD) + "Pérdida" tag on isLoss
                                                    heading "Ranking de rentabilidad de pedidos"
```

## Types & Seed Delta

| Change | File | Breaking? |
|--------|------|-----------|
| New view-model types + helper | `app/domain/decisiones.ts` | No — new file |
| No `Order` / `OrderItem` / `SeededProduct` / `SeedState` shape change | `app/domain/types.ts` | Untouched |
| No new store action / mutation | `app/store/seed-store.ts` | Untouched |

## File Changes

| File | Action | ~Lines | Description |
|------|--------|-------|-------------|
| `app/domain/decisiones.ts` | Create | ~60 | `buildProfitabilityRanking` + view-model types |
| `app/domain/__tests__/decisiones.test.ts` | Create | ~90 | filter, cost join + orphan-skip, frozen-rate commission, margin sign, sort + tie-break, totals, divide-by-zero guard, live-rate regression |
| `app/components/decisiones/profitability-summary.tsx` | Create | ~40 | Grand-totals card, USD via `formatMoney`, loss emphasis |
| `app/components/decisiones/profitability-table.tsx` | Create | ~50 | Ranked table, USD cells, "Pérdida" tag on `isLoss`, scroll container |
| `app/components/decisiones/__tests__/profitability-summary.test.tsx` | Create | ~30 | labels, formatted totals, money regex |
| `app/components/decisiones/__tests__/profitability-table.test.tsx` | Create | ~40 | rows, loss tag toggle, money regex |
| `app/routes/decisiones.tsx` | Modify | ~28 | Replace placeholder with `useState` read-only container |
| `app/routes/__tests__/decisiones.test.tsx` | Create | ~45 | heading, ranked render, no mutation affordance; replaces placeholder coverage |
| `app/domain/types.ts`, `app/store/seed-store.ts` | Unchanged | 0 | Schema and mutations frozen |

Total ≈ **~380 changed lines** — in line with prior single-screen tasks. Single PR.

## Testing Strategy (strict TDD — RED → GREEN per unit)

Test runner: `vitest run` from `templates/apps/salesops-mvp`. Domain tests build a synthetic
`SeedState` directly (no store). Component tests build view-model literals and `render` them.
Route tests use `render` + `beforeEach(localStorage.clear)` + `loadSeedState()`
(`inventario.test.tsx:6-9`).

| Layer | What | Approach |
|-------|------|----------|
| Unit | filter excludes `creado` | order with `state:'creado'` is absent from `rows`; `count` counts only verificado+ |
| Unit | cost join | `costUSD === Σ item.quantity × product.costUSD` for a multi-item order |
| Unit | orphan skip | an item whose `productId` has no product is skipped from `costUSD` without throwing |
| Unit | frozen-rate commission | `commissionUSD === commissionMN / exchangeRateSnapshot.usdToMn` using the order's own snapshot |
| Unit | margin + loss | `marginUSD === revenue − cost − commission`; `isLoss === (marginUSD < 0)` |
| Unit | sort + tie-break | rows are marginUSD-desc; two equal-margin orders resolve `orderId` ascending |
| Unit | totals | `totals.{revenue,cost,commission,margin}USD` equal the column sums of `rows` |
| Unit | divide-by-zero guard | synthetic order with `usdToMn: 0` → finite `commissionUSD === 0` (no `Infinity`/`NaN`) |
| Unit | LIVE-RATE regression | build state → snapshot a ranked order's `commissionUSD`/`marginUSD` → mutate `state.exchangeRates.usdToMn` → rebuild → the ranked order's `commissionUSD`/`marginUSD` are UNCHANGED (proves D2) |
| Component | `ProfitabilitySummary` render | labels Ingresos/Costo/Comisión/Margen + Pedidos count; money matches `^\$[\d,]+\.\d{2}$` |
| Component | `ProfitabilitySummary` loss | negative `totals.marginUSD` renders with loss emphasis |
| Component | `ProfitabilityTable` rows | one row per `rows[]`; revenue/cost/commission/margin cells formatted |
| Component | `ProfitabilityTable` loss tag | `isLoss:true` row renders "Pérdida"; `isLoss:false` does not |
| Route | `decisiones` heading | `render(<Decisiones/>)` → `getByRole('heading', { name: /decisiones/i })` present (single) |
| Route | `decisiones` ranked render | rows rendered from the seeded state; at least one money string matches the regex |
| Route | `decisiones` no mutation | `container.querySelector('form')` null; `queryAllByRole('button')` length 0 |
| Route | shared `routes.test.tsx` | stays green — one `<h1>Decisiones</h1>`, subheadings free of "decisiones", plain `Component` (no loader/action) |

The LIVE-RATE regression test is MANDATORY — it proves the ranking uses each order's frozen
snapshot and does not move when the live rate is edited.

## Migration / Rollout

No migration. No type shape change; persisted `SeedState` still loads. `resetDemo()`
regenerates identically. The screen is read-only — reloading never mutates state.

## Open Questions / Risks

- **Duplicate-heading break (Med→mitigated)**: exactly one `<h1>` with "Decisiones";
  subheadings "Resumen de rentabilidad" / "Ranking de rentabilidad de pedidos" avoid the word.
- **Live-rate leak (Low→mitigated)**: D2 frozen snapshot only; the live-rate regression test
  is the end-to-end guard.
- **Orphan item throws (Low→mitigated)**: Map join + orphan-skip; covered by a unit test.
- **Divide-by-zero on `usdToMn` (Very Low→mitigated)**: not reachable (rates > 0 validated);
  defensive `usdToMn > 0 ? … : 0` + a synthetic unit test anyway.
- **AbortSignal/jsdom (Low→mitigated)**: direct-render `useState`-only container, no
  `<Form>`/loader/`useNavigate` — identical to `inventario.tsx`.
- **Scope bleed into Finanzas / operador-gestores (Low→mitigated)**: read-only, per-order
  only; no aggregate reporting and no payout mutation.
