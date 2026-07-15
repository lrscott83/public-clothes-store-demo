# Design — Mover margen/AOV de Decisiones a Finanzas (`salesops-13-margin-analysis-to-finanzas`)

Three money/profitability reads (**top productos por margen**, **pedidos de menor margen**, **AOV/ticket promedio**) move from `/decisiones` to `/finanzas`. The migration is a **re-home, not a redesign**: identical numbers, new owner. Finance recomputes each datum with its OWN private helpers under the USER-LOCKED "never import from decisiones" rule, mirroring the salesops-11 "reused-but-refinanced" convention 1:1. After this change `domain/decisiones.ts` is deleted and `/finanzas` is the single source of profitability truth.

This is a mechanical move with zero new infrastructure: no new chart primitive, no new help mechanism, no data-model/seed change, no mutation affordance (both dashboards stay read-only, preserving the jsdom+undici `AbortSignal` sidestep).

## Architecture: layering and boundaries (unchanged rings)

```
loadSeedState() ──► buildFinanceDashboard(state): FinanceDashboardView   (app/domain/finanzas-dashboard.ts)
                       │  pure, numeric, unit-tested — composes buildFinanceSummary + finance's OWN helpers
                       ▼
      finanzas.tsx ── useState(() => view)  — thin container, direct render
                       │  empty-state vs layers; no formatting logic
                       ▼
   Section components (app/components/finanzas/*)  — format + compose charts + own FINANZAS_HELP
                       │
                       ▼
   Generic primitives (app/components/charts/*, app/components/shared/*)  — no domain import
```

The governing rule (USER-LOCKED, from salesops-11): **the finanzas ring NEVER points sideways into the decisiones ring.** `finanzas-dashboard.ts` composes only `buildFinanceSummary`, the neutral `period-trend.ts`, and its OWN private per-order helpers. It does not import `buildProfitabilityRanking`, `buildTopMarginProducts`, `ProfitabilityRow`, or anything else from decisiones — importing them would violate the letter (module deletion) AND the spirit of the lock. Finance defines its OWN row interfaces.

Directional coupling after this change: `decisiones-dashboard.ts` **loses** its only import of `./decisiones`, so that module drops to zero runtime callers and is deleted (proposal Decision 1). No new edges are introduced anywhere.

## Data flow — the two new builders + AOV

All three additions reuse Finance's existing private spine in `finanzas-dashboard.ts` (already present, lines 22–64): `qualifying`, `sumUSD`, `sumMN`, `sumCommissionMN`, `orderCostUSD`, `orderCommissionUSD`, `orderMarginUSD`, `isCommissionPending`, `PENDING_COMMISSION_STATES`. **Nothing new is imported; nothing is re-exported.**

### 1. `buildProductMargin(state): ProductMarginView` (new, exported, Layer 3)

Per-product aggregate margin over qualifying order lines — mirrors the deleted `buildTopMarginProducts` line-for-line but Finance-owned.

```ts
export interface ProductMarginRow {
  productId: string;
  name: string;
  marginUSD: number;
}
export interface ProductMarginView {
  rows: ProductMarginRow[];
}

export function buildProductMargin(state: SeedState): ProductMarginView {
  const productById = new Map(state.products.map((p) => [p.id, p]));
  const qualifyingOrders = qualifying(state.orders);
  const marginByProduct = new Map<string, number>();

  for (const order of qualifyingOrders) {
    for (const item of order.items) {
      const product = productById.get(item.productId);
      if (!product) continue; // orphan skip — contributes 0, never throws
      const margin = item.quantity * (item.priceUSD - product.costUSD);
      marginByProduct.set(item.productId, (marginByProduct.get(item.productId) ?? 0) + margin);
    }
  }

  const rows: ProductMarginRow[] = [...marginByProduct.entries()].map(([productId, marginUSD]) => ({
    productId,
    name: productById.get(productId)!.name,
    marginUSD,
  }));
  rows.sort((a, b) => b.marginUSD - a.marginUSD); // desc, highest margin first
  return { rows };
}
```

Rules preserved verbatim: orphan `productId` skip (contributes 0), product with zero qualifying sales does NOT appear (not zero-padded), sort desc. NO per-line commission allocation (commission is order/gestor-level, not decomposable per item) — margin is `qty * (priceUSD - costUSD)` only.

### 2. `buildLowMarginOrders(state): LowMarginOrdersView` (new, exported, Layer 3)

Per-qualifying-order net margin, ascending (lowest first). Reuses `orderMarginUSD`/`orderCostUSD`/`orderCommissionUSD`. Replaces the old `lowestMargin` (an ascending re-sort of `buildProfitabilityRanking`).

```ts
export interface OrderMarginRow {
  orderId: string;
  clientName: string;
  revenueUSD: number;
  marginUSD: number;
}
export interface LowMarginOrdersView {
  rows: OrderMarginRow[];
}

export function buildLowMarginOrders(state: SeedState): LowMarginOrdersView {
  const productById = new Map(state.products.map((p) => [p.id, p]));
  const rows: OrderMarginRow[] = qualifying(state.orders).map((order) => ({
    orderId: order.id,
    clientName: order.client.name,
    revenueUSD: order.totalUSD,
    marginUSD: orderMarginUSD(order, productById),
  }));
  rows.sort((a, b) => a.marginUSD - b.marginUSD || a.orderId.localeCompare(b.orderId));
  return { rows };
}
```

**Lean type decision (proposal Decision 2):** `OrderMarginRow` carries ONLY what the leaf renders — `orderId` (key), `clientName` (Cliente col), `revenueUSD` (Ingresos col), `marginUSD` (Margen col). `costUSD`/`commissionUSD` are computed inside `orderMarginUSD` but NOT surfaced (the old table never rendered them). `marginPercent` and `isLoss` are **dropped** — the old leaf never read them and `isLoss` was explicitly asserted as NOT surfaced (no "pérdida"/"loss" copy). Field rename from decisiones: `label` → `clientName` (clearer; the old `ProfitabilityRow.label` was `client.name`).

Rules preserved verbatim: ascending sort with deterministic tie-break `a.marginUSD - b.marginUSD || a.orderId.localeCompare(b.orderId)`; frozen-rate commission via each order's OWN `exchangeRateSnapshot.usdToMn` (÷0 → 0, never NaN/throw, inside the existing `orderCommissionUSD`); orphan `productId` contributes 0 to cost.

### 3. `aovUSD: KpiTrend` on `FinanceKpiHeaderView` (new field, Layer 1)

```ts
export interface FinanceKpiHeaderView {
  ingresosFacturadosUSD: KpiTrend;
  ingresosLiquidadosMN: KpiTrend;
  comisionPendienteMN: KpiTrend;
  margenNetoUSD: KpiTrend;
  margenPercent: number;
  aovUSD: KpiTrend; // NEW — appended last (see 5th-tile ordering)
}
```

Inside `buildFinanceKpiHeader` (Finance tracks no order count today — add it), reusing existing `currentQ`/`priorQ`/`facturadoCurrent`/`facturadoPrior`:

```ts
const pedidosCurrent = currentQ.length;
const pedidosPrior = priorQ.length;
const aovCurrent = pedidosCurrent > 0 ? facturadoCurrent / pedidosCurrent : 0; // count-guard
const aovPrior = pedidosPrior > 0 ? facturadoPrior / pedidosPrior : 0;
// ...in the returned object:
aovUSD: buildKpiTrend(aovCurrent, aovPrior),
```

**Count-guard (proposal Decision 3):** the guard is on the order COUNT (`pedidosCurrent > 0`), matching Decisiones' `ventasCurrent / pedidosCurrent` parity — NOT a revenue guard. When there are 0 qualifying orders in a window, AOV is 0 (no Infinity/NaN). `pedidosCurrent`/`pedidosPrior` are private locals (Finance surfaces no "Pedidos" tile), used only to derive AOV. Window is the existing current-vs-prior split from `splitByPeriod`/`buildKpiTrend`.

## Domain layer

### 5. Wire into `buildFinanceDashboard`

Add two fields to `FinanceDashboardView` and compose the two new builders (AOV rides inside `kpis` already):

```ts
export interface FinanceDashboardView {
  hasData: boolean;
  kpis: FinanceKpiHeaderView;            // now carries aovUSD
  revenueTrend: RevenueTrendView;
  commissionLiability: CommissionLiabilityView;
  revenueByState: RevenueByStateView;
  currencyExposure: CurrencyExposureView;
  gestorCommission: GestorCommissionCostView;
  warehouseRevenue: WarehouseRevenueView;
  productMargin: ProductMarginView;      // NEW (Layer 3)
  lowMarginOrders: LowMarginOrdersView;  // NEW (Layer 3)
  stateBreakdown: FinanceStateRow[];
}
// in buildFinanceDashboard(state):
productMargin: buildProductMargin(state),
lowMarginOrders: buildLowMarginOrders(state),
```

`hasData` logic is untouched (still `state.orders.some((o) => o.state !== 'creado')`), so both new blocks are gated by the same empty-state as every other Layer-1/3 block.

## Component layer

### New: `components/finanzas/product-margin-bars.tsx` → `ProductMarginBars`

Mirror `revenue-by-state-bars.tsx` (BarChart leaf) plus the `TOP_N`/truncate concerns from the deleted `top-margin-products.tsx`.

- Props: `{ productMargin: ProductMarginView }`.
- `TOP_N = 8`, `MAX_LABEL = 22`, `truncate(name)` — copied from the deleted leaf (keeps long product names inside the bar gutter).
- `bars = productMargin.rows.slice(0, TOP_N).map((r) => ({ label: truncate(r.name), value: r.marginUSD }))`.
- Card chrome + `<h2>Top productos por margen</h2>` + `<InfoPopover {...FINANZAS_HELP.topProductosMargen} />` + horizontal `BarChart` with `formatValue={(v) => formatMoney(v, MONEY)}`, `MONEY = { locale: 'en-US', currency: 'USD' }`.
- Types imported ONLY from `../../domain/finanzas-dashboard`.

### New: `components/finanzas/low-margin-orders.tsx` → `LowMarginOrders`

Mirror the deleted `lowest-margin-orders.tsx` table, but with Finance's view-model + help.

- Props: `{ lowMarginOrders: LowMarginOrdersView }` (takes the view object, matching Finance's convention where leaves receive `revenueByState`/`warehouseRevenue`/etc.).
- Scrollable table (`max-h-72 overflow-y-auto`), sticky header, columns **Cliente / Ingresos / Margen** rendering `row.clientName` / `formatMoney(row.revenueUSD)` / `formatMoney(row.marginUSD)`.
- `<h2>Pedidos de menor margen</h2>` + `<InfoPopover {...FINANZAS_HELP.pedidosMenorMargen} />`.
- NO "pérdida"/"loss" label or styling — the framing is strictly a lower-margin ranking (invariant carried from decisiones). `row.key = row.orderId`.

### Edit: `components/finanzas/finance-kpi-header.tsx` — 5th AOV `StatTile`

Append AOV as the **last** tile (positions 1–4 unchanged → existing assertions stay stable except the count bump). Grid container `lg:grid-cols-4` stays as-is; the 5th tile wraps to a second row (minimal churn — do NOT restyle to `grid-cols-5`).

```tsx
<StatTile
  label="Ticket promedio"
  value={formatMoney(kpis.aovUSD.current, MONEY)}
  trend={kpis.aovUSD.trend}
  delta={kpis.aovUSD.delta}
  help={<InfoPopover {...FINANZAS_HELP.ticketPromedio} />}
/>
```

- Label `"Ticket promedio"` (warm Spanish, avoids the `AOV` acronym as a bare tile label; the acronym lives in the help text). `positiveIsGood` default (higher ticket is good).
- Update the docstring: `exactly 4 StatTiles` → `exactly 5 StatTiles`, and describe the new tile in the fixed order.

## `FINANZAS_HELP` — 3 new entries (voseo, "dinero", no banned vocab)

Append to `FINANZAS_HELP` in `components/finanzas/help-content.ts`. Copy respects the finance rules: no Gross/Net/Fees/refunds vocabulary, no "por cobrar"/receivable framing, no goal/target, voseo, "dinero" (never "plata").

```ts
// --- KPI header (Layer 1) ---
ticketPromedio: {
  title: 'Ticket promedio',
  text: 'Cuánto dinero gasta en promedio un cliente por compra en los últimos 10 días. La flecha compara contra los 10 días previos. Subir el ticket suele rendir más que salir a buscar clientes nuevos.',
},

// --- Layer 3 (actionable blocks) ---
topProductosMargen: {
  title: 'Top productos por margen',
  text: 'Los productos que más dinero te dejan, no los que más se venden. Son los que conviene empujar, tener siempre en stock y poner adelante.',
},
pedidosMenorMargen: {
  title: 'Pedidos de menor margen',
  text: 'Las ventas que menos dinero te dejaron. Revisalas para detectar descuentos de más, costos altos o precios que quedaron viejos.',
},
```

## Container: `routes/finanzas.tsx`

The AOV tile needs no route change (it lives inside `FinanceKpiHeader`). Add the two new Layer-3 blocks to the EXISTING `view.hasData` Layer-3 grid (currently `GestorCommissionTable` + `WarehouseRevenue`), making it a 2×2 block grid:

```tsx
import { ProductMarginBars } from '../components/finanzas/product-margin-bars';
import { LowMarginOrders } from '../components/finanzas/low-margin-orders';
// ...
{view.hasData && (
  <div className="mt-8 grid gap-4 lg:grid-cols-2">
    <GestorCommissionTable gestorCommission={view.gestorCommission} />
    <WarehouseRevenue warehouseRevenue={view.warehouseRevenue} />
    <ProductMarginBars productMargin={view.productMargin} />
    <LowMarginOrders lowMarginOrders={view.lowMarginOrders} />
  </div>
)}
```

Both blocks sit under the `view.hasData` gate, so they vanish in the empty-state along with the rest of Layer 3. Heading contract preserved: neither new heading contains "finanzas", so the single-`/finanzas/i`-heading route assertion stays green.

## Removal design (Decisiones)

### `domain/decisiones.ts` + `domain/__tests__/decisiones.test.ts` — DELETE

Both files deleted whole (proposal Decision 1). After the `lowestMargin` move, `buildProfitabilityRanking`/`ProfitabilityRow`/`ProfitabilityView`/`ProfitabilityTotals` have zero runtime callers.

### `domain/decisiones-dashboard.ts` — targeted deletions

- **Line 1**: delete `import { buildProfitabilityRanking, type ProfitabilityRow } from './decisiones';`.
- **Docstring (line 16)**: reword to drop the `buildProfitabilityRanking` reference.
- **`KpiHeaderView` (line 57)**: delete `aovUSD: KpiTrend;`. **Keep** `pedidos: KpiTrend` (order count stays — it's operational).
- **`buildKpiHeader` (lines 103–104, 114)**: delete `aovCurrent`/`aovPrior` locals and `aovUSD: buildKpiTrend(...)` from the return. **Keep** `pedidosCurrent`/`pedidosPrior` (still feed the Pedidos tile). Reword the docstring "Ventas/Margen/Pedidos/AOV" → "Ventas/Margen/Pedidos".
- **`buildTopMarginProducts` + `TopMarginRow` + `TopMarginView` (lines 326–367)**: delete the whole block.
- **`DashboardView` (lines 433, 435–436)**: delete `topMargin: TopMarginView;` and `lowestMargin: ProfitabilityRow[];`.
- **`buildDecisionesDashboard` (lines 446–449, 459, 461)**: delete the `ranking`/`lowestMargin` sort, `topMargin: buildTopMarginProducts(state)`, and `lowestMargin` from the returned object.
- **Out of scope — DO NOT touch**: `GestorRankingRow.aovUSD` (line 295) and its computation (lines 317, 320) — that is the per-gestor row field, a different metric.

### `components/decisiones/kpi-header.tsx`

- Delete the `sublabel={`AOV ${formatMoney(kpis.aovUSD.current, MONEY)}`}` line (42) from the Pedidos tile.
- Reword docstring line 15 (`Pedidos (+AOV sublabel)` → `Pedidos`).

### `components/decisiones/help-content.ts`

- Reword `pedidos` to drop the AOV sentence, e.g.: `'Cuántos pedidos cerraste en los últimos 10 días. La flecha compara contra los 10 días previos: es tu pulso de volumen, cuánto se mueve el negocio.'`
- Delete the `topProductosMargen` and `pedidosMenorMargen` entries (now unused in decisiones).

### `routes/decisiones.tsx`

- Delete imports (lines 11, 13) and JSX (lines 66, 68) for `TopMarginProducts`/`LowestMarginOrders`.

### `components/decisiones/{top-margin-products,lowest-margin-orders}.tsx` + their tests — DELETE

Four files deleted: the two leaves and `__tests__/top-margin-products.test.tsx` + `__tests__/lowest-margin-orders.test.tsx`.

## Test plan (Strict TDD — tests first)

Both directions are test-first: removal tests assert absence BEFORE the code is removed; addition tests are RED before the Finance builders/leaves exist.

Runner: `vitest run` from `templates/apps/salesops-mvp/`; typecheck `react-router typegen && tsc` from the same cwd.

## Edge cases (invariants preserved verbatim)

| Edge case | Guard | Where |
|-----------|-------|-------|
| Orphan `productId` (no matching product) | `if (!product) continue;` → contributes 0, never throws | `buildProductMargin` inner loop; `orderCostUSD` (already) inside `buildLowMarginOrders` |
| Frozen rate | commission uses order's OWN `exchangeRateSnapshot.usdToMn`; `usdToMn > 0 ? commissionMN / usdToMn : 0` (÷0 → 0, never NaN) | existing `orderCommissionUSD`, reused by `buildLowMarginOrders` |
| Empty state (all `creado`) | `hasData === false` → both new blocks + KPI header not rendered | `buildFinanceDashboard.hasData`; route `view.hasData` gate |
| AOV count-guard | `pedidosCurrent > 0 ? facturado/pedidos : 0` (guard on COUNT, not revenue) | `buildFinanceKpiHeader` |
| Product with zero qualifying sales | not zero-padded — only products with ≥1 qualifying line appear | `buildProductMargin` (Map only holds seen products) |
| Deterministic tie-break | `a.marginUSD - b.marginUSD || a.orderId.localeCompare(b.orderId)` | `buildLowMarginOrders` sort |

## Boundaries summary

- **Domain** (`finanzas-dashboard.ts`): owns `buildProductMargin`/`buildLowMarginOrders`/AOV via its OWN private helpers; imports `SeedState`/`types`/`buildFinanceSummary`/`period-trend` only. Never imports decisiones. Each builder is single-purpose (one aggregation each) and independently unit-tested.
- **Sections** (`components/finanzas/*`): `ProductMarginBars` (BarChart leaf) and `LowMarginOrders` (table leaf) take finance view-model types, format at the leaf, own their `FINANZAS_HELP` copy. Never import `SeedState`/`components/decisiones/*`.
- **Generic** (`components/charts/*`, `components/shared/*`): `BarChart`/`StatTile`/`InfoPopover` reused unchanged, zero domain knowledge.
