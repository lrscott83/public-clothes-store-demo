# Design: salesops-12-commission-liability

Technical design for removing the false "Cobrado vs pendiente" customer-receivable
concept and repurposing the freed visuals to REAL revenue, symmetrically across
`/finanzas` and `/decisiones`.

App root: `templates/apps/salesops-mvp`
Artifact store: hybrid (openspec + engram `sdd/salesops-12-commission-liability/design`)
Reads: proposal (required), exploration (file:line map).

---

## 0. Grounding fact established by reading the code

`qualifying(orders)` everywhere in this codebase means `state !== 'creado'`
(`finanzas-dashboard.ts:28-30`, `decisiones-dashboard.ts:72-74`). Every revenue
aggregation already uses it (`sumUSD(qualifying)`), and `hasData` is
`orders.some(o => o.state !== 'creado')`.

The two removed sets partition exactly that space:

```
COBRADO_STATES    = ['entregado','comision_pagada']
PENDIENTE_STATES  = ['verificado','transportando']
COBRADO ∪ PENDIENTE = every non-'creado' state = qualifying()
```

Therefore **`cobradoUSD + pendienteUSD` == period revenue == `sumUSD(qualifying)`**,
by construction. `OrderState` has no cancelled/void state; `creado` is the only
non-realized state. This is the anchor for every decision below:

> A "realized sale" = any order with `state !== 'creado'`. Revenue = `Σ totalUSD`
> over those orders. There is no separate "collected" subset to show — collected
> IS revenue.

---

## 1. Domain layer

### 1a. `app/domain/finanzas-dashboard.ts`

**Remove**
- L25-26: `COBRADO_STATES`, `PENDIENTE_STATES` constants. DELETE (nothing else references them after the changes below). Keep `PENDING_COMMISSION_STATES` (L24) — commission logic is out of scope and correct.
- L73-74: `FinanceKpiHeaderView.cobradoUSD`, `.pendienteUSD` fields. DELETE.
- L102-106: `cobradoCurrent/Prior`, `pendienteCurrent/Prior` locals. DELETE.
- L117-118: the two `buildKpiTrend(...)` returns for those fields. DELETE.
- L127-175: `CashFlowTrendPoint`, `CashFlowTrendView`, `buildCashFlowTrend`. REPLACE (see below).
- L287-315: `WarehouseCashFlowRow`, `WarehouseCashFlowView`, `buildWarehouseCashFlow`. REPLACE (see below).

**Replace — revenue-over-time (was `buildCashFlowTrend`)**

New pure function, same 20-day windowing, single (unsplit) series:

```ts
export interface RevenueTrendPoint {
  /** 0 = anchor day (newest), 19 = oldest day in the 20-day window. */
  dayOffset: number;
  revenueUSD: number;
}
export interface RevenueTrendView {
  /** Ordered oldest -> newest (dayOffset 19 .. 0); every day present, zero-filled. */
  points: RevenueTrendPoint[];
}
export function buildRevenueTrend(state: SeedState): RevenueTrendView;
```

Body = the old `buildCashFlowTrend` with the COBRADO/PENDIENTE branch collapsed:
for each order where `state !== 'creado'` and inside the window, add `order.totalUSD`
to that day's `revenueUSD`. No state bucketing. (Numerically identical to the old
`cobradoUSD + pendienteUSD` per day.) This is genuinely NEW signal for `/finanzas`
— the panel had no revenue-over-time trend before; the only trend was the false
cobrado/pendiente one.

**Replace — revenue-per-warehouse (was `buildWarehouseCashFlow`)**

```ts
export interface WarehouseRevenueRow {
  warehouseId: string;
  warehouseName: string;
  revenueUSD: number;
  count: number; // # qualifying orders, gives the table a second column
}
export interface WarehouseRevenueView {
  rows: WarehouseRevenueRow[]; // desc by revenueUSD, zero-order warehouses included
}
export function buildWarehouseRevenue(state: SeedState): WarehouseRevenueView;
```

Body: for each `state.warehouses`, filter `qualifying(state.orders)` by
`warehouseId`, `revenueUSD = sumUSD(orders)`, `count = orders.length`, sort desc by
`revenueUSD`. (Equivalent to old `cobradoUSD + pendienteUSD` per warehouse.)
Note: finance keeps its OWN copy — it does NOT import decisiones'
`buildWarehouseSales` even though the shape now matches (the "never import each
other" rule is deliberate; see proposal risk #1).

**Orchestrator (`FinanceDashboardView` + `buildFinanceDashboard`)**
- Rename field `cashFlowTrend: CashFlowTrendView` -> `revenueTrend: RevenueTrendView`.
- Rename field `warehouseCashFlow: WarehouseCashFlowView` -> `warehouseRevenue: WarehouseRevenueView`.
- Wire `buildRevenueTrend(state)` and `buildWarehouseRevenue(state)`.
- Update the module doc comment (L6-20) — drop the cobrado/pendiente framing.

### 1b. `app/domain/decisiones-dashboard.ts`

Smaller change — **the false trend/warehouse visuals do NOT exist here.** Decisiones
already has correct revenue aggregations: `buildSalesTrend` (L150, `valueUSD`) and
`buildWarehouseSales` (L232, `revenueUSD`). The bug in decisiones is ONLY the KPI
cobrado/pendiente fields.

**Remove**
- L65-66: `COBRADO_STATES`, `PENDIENTE_STATES`. DELETE. Keep `PENDING_COMMISSION_STATES` (L64).
- L59-60: `KpiHeaderView.cobradoUSD`, `.pendienteUSD` fields. DELETE.
- L113-114, L116-117: `cobradoCurrent/Prior`, `pendienteCurrent/Prior` locals. DELETE.
- L126-127: the two returns. DELETE.
- Update the `buildKpiHeader` doc comment (L84-90) — drop the cobrado/pendiente sentence.

No new functions in decisiones. This asymmetry (finanzas gets two new builders,
decisiones gets none) is correct and intentional: the duplicated *domain constants*
existed in both, but the false *visuals* (trend + warehouse table) were finanzas-only.

### 1c. `app/domain/finanzas.ts`
Out of scope. The commission-liability split is verified correct; leave untouched
(exploration §2, proposal "Out of scope").

---

## 2. KPI tile — the critical finding

The task asked to CONFIRM the replacement doesn't duplicate an existing revenue
tile. It DOES. Reading both headers:

**`finance-kpi-header.tsx` current 5 tiles:**
1. **Ingresos facturados** — `formatMoney(ingresosFacturadosUSD.current)` = period revenue in **USD**.
2. **Ingresos liquidados** — same revenue in **MN** (FX-exposure framing).
3. **Cobrado vs pendiente** — the lie (removed).
4. **Comisión pendiente** — commission liability (MN, correct).
5. **Margen neto** — net margin (USD + %).

**`decisiones/kpi-header.tsx` current 5 tiles:**
1. **Ventas** — `formatMoney(ventasUSD.current)` = period revenue in **USD**.
2. **Margen** — margin (USD + %).
3. **Pedidos** — order count, with **AOV** sublabel.
4. **Comisión pendiente** — commission liability (MN).
5. **Cobrado vs pendiente** — the lie (removed).

**Finding:** BOTH headers ALREADY render period revenue as tile #1 (finanzas
"Ingresos facturados" USD + "Ingresos liquidados" MN; decisiones "Ventas" USD).
Since `cobrado + pendiente == period revenue` (§0), the proposal's suggested
"Ventas del periodo" tile is a **strict duplicate** of tile #1 in both dashboards.
No genuinely distinct, useful 5th metric is available either: margin, order count,
AOV, and commission liability are all already shown (decisiones shows all four;
finanzas shows revenue×2 + commission + margin).

### Decision D-KPI (recommended): drop to 4 tiles in BOTH headers

- `finance-kpi-header.tsx`: remove the "Cobrado vs pendiente" `StatTile` (L38-45);
  `lg:grid-cols-5` -> `lg:grid-cols-4` (L23). Result: Ingresos facturados,
  Ingresos liquidados, Comisión pendiente, Margen neto.
- `decisiones/kpi-header.tsx`: remove the "Cobrado vs pendiente" `StatTile`
  (L53-60); `lg:grid-cols-5` -> `lg:grid-cols-4` (L21). Result: Ventas, Margen,
  Pedidos, Comisión pendiente.

**Why 4, not 5 (reverses the proposal's "keep 5 tiles" preference):** the
proposal's preference was explicitly predicated on repurposing to a *TRUE revenue
metric that is not a duplicate*. Reading the code shows that metric already exists
as tile #1 in both headers, so the premise is false. Preserving `grid-cols-5`
would force us to invent or reshuffle a weak/duplicate tile purely to keep a layout
constant — reintroducing the exact "invent signal the business doesn't have"
anti-pattern this whole change removes. The revenue signal the proposal wanted to
preserve is NOT lost: it moves into the repurposed **revenue-over-time trend** and
**revenue-per-warehouse table** (genuinely new to `/finanzas`).

> This flips the proposal's stated "keep 5 tiles". Because it changes an approved
> artifact, it is flagged as a decision needing owner confirmation (see Risks). If
> the owner insists on 5, apply Alternative A below.

**Alternative A (keep 5, rejected):** give `/finanzas` a distinct **Ticket promedio
(AOV)** tile — `value = aovUSD`, sublabel `Pedidos {n}` — which finanzas genuinely
lacks today (non-duplicative). But `/decisiones` already shows Pedidos+AOV, so it
has NO distinct metric available and would still go to 4 — producing asymmetric
tile counts (finanzas 5 / decisiones 4) and injecting a decisiones-flavored
volume metric into the money-focused finance panel. Rejected: worse than a clean,
symmetric 4/4.

**Alternative B (keep 5 via reshuffle, rejected):** promote AOV to its own tile in
both. Pure rearrangement of already-shown data to satisfy `grid-cols-5`; adds no
signal. Rejected as cargo-cult.

Layout impact of D-KPI: two one-line class changes (`lg:grid-cols-5` ->
`lg:grid-cols-4`); `sm:grid-cols-2` unchanged. Two test assertions ("exactly 5" /
label arrays / InfoPopover count) update to 4 (see §4).

---

## 3. Components

### 3a. `finanzas/finance-kpi-header.tsx`
Remove the "Cobrado vs pendiente" tile + its `FINANZAS_HELP.cobradoPendiente`
reference; `grid-cols-5` -> `grid-cols-4`; update the doc comment (L13-20) to
describe 4 tiles.

### 3b. `decisiones/kpi-header.tsx`
Remove the "Cobrado vs pendiente" tile + its `DECISIONES_HELP.cobradoPendiente`
reference; `grid-cols-5` -> `grid-cols-4`; update doc comment (L13-18).

### 3c. `finanzas/cash-flow-trend-section.tsx` -> revenue trend (drop toggle)
Rename file/component `cash-flow-trend-section.tsx` / `CashFlowTrendSection`
-> `revenue-trend-section.tsx` / `RevenueTrendSection` (the name "cash flow" is
itself part of the lie). Rewrite:
- Prop type -> `RevenueTrendView`; `points.map` -> `{ label: 'd-'+dayOffset, value: revenueUSD }`.
- **Delete** `useState`, the `Series` type, and both toggle `<button>`s.
- Single `AreaTrend` (one polyline), `ariaLabel="Ventas por día"`.
- Heading: "Ventas por día (últimos 20 días)". Help -> new `FINANZAS_HELP.tendenciaVentas`.

Before: two-series toggle (Cobrado | Pendiente), heading "Cobros estimados por
estado (20 días)". After: single revenue polyline, no toggle, heading
"Ventas por día (últimos 20 días)".

Wire-up: `finanzas.tsx:52` `trend={view.revenueTrend}`; update import (L6);
update the route doc comment (L18-29) that mentions the cobrado/pendiente toggle.

### 3d. `finanzas/warehouse-cash-flow.tsx` -> "Ventas por almacén"
Rename file/component `warehouse-cash-flow.tsx` / `WarehouseCashFlow`
-> `warehouse-revenue.tsx` / `WarehouseRevenue`. Rewrite:
- Prop type -> `WarehouseRevenueView`.
- Heading: "Ventas por almacén". Help -> new `FINANZAS_HELP.ventasPorAlmacen`.
- Columns: "Almacén" | "Ventas" (`formatMoney(row.revenueUSD)`) | "Pedidos" (`row.count`).

Before: title "Cobros pendientes por almacén", columns Cobrado / Pendiente.
After: title "Ventas por almacén", columns Ventas / Pedidos.

Wire-up: `finanzas.tsx:62` `warehouseRevenue={view.warehouseRevenue}`; update import (L11).

### 3e. `finanzas/help-content.ts`
- Delete `cobradoPendiente` (L33-36).
- Rename `tendenciaCobros` (L47-50) -> `tendenciaVentas`: title "Ventas por día",
  text reframed to revenue over the last 20 days (no "cobrado/pendiente/estimado").
- Rename `cobrosPendientesAlmacen` (L69-72) -> `ventasPorAlmacen`: title
  "Ventas por almacén", text = revenue per warehouse (drop "trabada / no terminó de entrar").
- Fix `ingresosPorEstado` (L55-58): drop "todavía no terminó de convertirse en
  cobro" -> neutral revenue-by-stage wording.
- Update the file header caveat block (L6-16): remove the "Cobrado vs pendiente is
  a STATE proxy" bullet and the salesops-11 Decision 4 reference.

### 3f. `decisiones/help-content.ts`
- Delete `cobradoPendiente` (L30-32) — "Cuánto ya entró a caja y cuánto te falta
  cobrar… dinero que aún no tenés en la mano" (the most explicit violation). The
  tile is gone, so the entry is removed entirely.

All new/edited Spanish copy stays in warm Rioplatense voseo, revenue +
commission-liability framing only; no "por cobrar / falta cobrar / no lo tenés en
la mano" anywhere.

---

## 4. Test impact (Strict TDD — sequence red -> green in sdd-tasks)

7 files assert removed strings/fields and must be updated (the 8th candidate,
`domain/__tests__/decisiones-dashboard.test.ts`, does NOT reference cobrado/
pendiente — grep-confirmed — and needs no change beyond staying green):

1. **`app/domain/__tests__/finanzas-dashboard.test.ts`** — imports
   `buildCashFlowTrend`/`buildWarehouseCashFlow` (L3,8); asserts KPI
   `cobradoUSD/pendienteUSD` (L91-92); whole `buildCashFlowTrend` block (L170-213,
   asserts `.cobradoUSD/.pendienteUSD` per day); whole `buildWarehouseCashFlow`
   block (L304-338). -> import `buildRevenueTrend`/`buildWarehouseRevenue`; drop
   the two KPI asserts; rewrite both blocks to assert `revenueUSD` (per day =
   old cobrado+pendiente sum; per warehouse = same) and `count`.
2. **`app/components/finanzas/__tests__/finance-kpi-header.test.tsx`** — fixture
   has `cobradoUSD/pendienteUSD` (L10-11); asserts "Cobrado vs pendiente",
   "$150.00", "Pendiente $275.00" (L29-31); "renders all 5 tiles" (L20);
   InfoPopover count `.toBe(5)` (L44). -> drop the two fixture fields + the three
   asserts; title -> "4 tiles"; InfoPopover count -> 4.
3. **`app/components/finanzas/__tests__/cash-flow-trend-section.test.tsx`** ->
   rename to `revenue-trend-section.test.tsx`. `buildTrend` uses
   `cobradoUSD/pendienteUSD` (L10); asserts default cobrado polyline (L16-22),
   toggle-to-pendiente (L24-33), heading "cobros estimados por estado" (L38).
   -> fixture `{ dayOffset, revenueUSD }`; assert single `svg[role=img]` + single
   `polyline`; DELETE the toggle test; heading -> /ventas por día/i; ariaLabel
   /ventas/i.
4. **`app/components/finanzas/__tests__/warehouse-cash-flow.test.tsx`** -> rename to
   `warehouse-revenue.test.tsx`. Rows use `cobradoUSD/pendienteUSD` (L9-10);
   asserts "Cobros pendientes por almacén" (L33). -> rows `{ revenueUSD, count }`;
   assert "Ventas por almacén" + revenue/count cells.
5. **`app/routes/__tests__/finanzas.test.tsx`** — asserts "Cobrado vs pendiente"
   (L25), "cobros estimados por estado" (L30), "Cobros pendientes por almacén"
   (L37, and empty-state L80). Comment "5 KPI tiles" (L20). -> drop
   "Cobrado vs pendiente"; heading -> /ventas por día/i; -> "Ventas por almacén"
   (L37 and L80); comment "4 KPI tiles".
6. **`app/components/decisiones/__tests__/kpi-header.test.tsx`** — fixture
   `cobradoUSD/pendienteUSD` (L18-19); labels array includes 'Cobrado vs pendiente'
   + "exactly 5 StatTiles" (L23,26). -> drop the two fixture fields; labels array
   -> `['Ventas','Margen','Pedidos','Comisión pendiente']`; title "exactly 4".
7. **`app/routes/__tests__/decisiones.test.tsx`** — asserts "Cobrado vs pendiente"
   (L27). -> remove that assertion.

`app/components/charts/__tests__/stat-tile.test.tsx` matched the grep only via the
generic word "pendiente" in unrelated cases — no change needed.

---

## 5. ADR — reversal of salesops-11 Decision 4

**Context.** `salesops-11-finanzas-dashboard/design.md` "Decision 4" deliberately
introduced "Cobrado vs pendiente" as an order-`state` proxy for cash collection,
codified as MUST scenarios in `openspec/specs/salesops-mvp/spec.md:829-857,1206-1259`,
with help copy explicitly hedged as "aprox./estimado, no un extracto bancario".

**Decision.** Reverse it. The proxy models a customer receivable that does not
exist — every sale in this business is fully collected (the only liability is
owner -> gestor commission, modeled separately and correctly). Because
`cobrado + pendiente` is definitionally equal to period revenue, the tile/trend/
table carried zero unique signal beyond revenue while actively teaching the owner
a false mental model of "money the client still owes".

**Consequences.**
- Domain: `COBRADO_STATES`/`PENDIENTE_STATES`, `cobradoUSD`/`pendienteUSD`,
  `buildCashFlowTrend`, `buildWarehouseCashFlow` removed; `buildRevenueTrend`,
  `buildWarehouseRevenue` added (finanzas).
- Spec: sdd-spec must rewrite `spec.md:829-857,1206-1259` from cobrado/pendiente
  MUST scenarios to revenue visuals, and forbid any customer-receivable framing.
- The hedged "aprox./estimado" help copy that Decision 4 required is deleted, not
  softened — the honest fix is removal, not better disclaimers.

**Rejected alternatives** (from proposal): delete-to-4-tiles-without-repurposing
(loses the genuinely useful revenue-over-time / per-warehouse cuts); reinterpret as
commission-owed-to-gestores (duplicates the already-correct commission-liability
KPI + donut).

---

## 6. Out of scope (preserve exactly)
`buildFinanceSummary` commission split, commission-liability KPI/donut,
gestor-commission-table, gestor-ranking, "Marcar comisión pagada"
(`entregado`-gated). Verified correct in exploration §2; do not touch.
