# Proposal — Mover margen/AOV de Decisiones a Finanzas (`salesops-13-margin-analysis-to-finanzas`)

Move the three money/profitability features that still live in the `/decisiones` dashboard over to `/finanzas`, where the "dinero" angle already lives: (1) **Top productos por margen** (`buildTopMarginProducts`), (2) **Pedidos de menor margen** (`lowestMargin`, the ascending re-sort of `buildProfitabilityRanking`), and (3) **AOV / ticket promedio** (`aovUSD` in the Decisiones KPI header). After this change `/decisiones` is purely operational/commercial and `/finanzas` owns every profitability read. Finance recomputes each moved datum locally under its USER-LOCKED "never import from decisiones" rule — no data model, seed, or chart-primitive change.

## Intent

- **Problem:** `/decisiones` still mixes two mental models. It surfaces margin per product, the least-profitable orders, and the average ticket (AOV) — all pure "dinero" questions — alongside its operational/commercial reads. `/finanzas` was built (salesops-11) precisely to answer *"¿dónde está mi dinero y hacia dónde se va?"*, yet the owner has to jump back to `/decisiones` to see what is profitable and what the average order is worth. The two dashboards leak into each other.
- **Why now:** `/finanzas` already owns the profitability spine that makes these three reads trivial to host: it privately computes `orderCostUSD`, `orderCommissionUSD`, `orderMarginUSD`, `qualifying`, `sumUSD` and the windowed `buildFinanceKpiHeader`. The margin-per-order math the moved features need is *already running inside Finance* — only the per-product margin loop and an AOV field are missing. Doing it now, while the salesops-11 architecture is fresh and its "reused-but-refinanced" naming convention is established, keeps the migration mechanical and single-PR-sized.
- **Success looks like:** `/decisiones` no longer renders "Top productos por margen", "Pedidos de menor margen", or the AOV sublabel — and no Decisiones test asserts on them. `/finanzas` renders both margin blocks in Layer 3 and an AOV tile in its KPI header, each fed by Finance-owned builders with their own unit tests, each with an `InfoPopover` + `FINANZAS_HELP` entry that respects the finance copy rules. Every moved number still traces to a real seed field; the frozen-rate conversion, orphan-productId skip, and deterministic tie-breaks are preserved verbatim in the new Finance builders. `domain/decisiones.ts` is gone.

## Scope

### In scope

- **Decisiones — remove the three money reads:**
  - Delete `buildTopMarginProducts` + `TopMarginRow`/`TopMarginView` and the `topMargin` field from `DashboardView`/`buildDecisionesDashboard`.
  - Delete the `lowestMargin` field and the `buildProfitabilityRanking` import + ascending re-sort from `buildDecisionesDashboard`.
  - Delete `aovUSD` from `KpiHeaderView` and its `aovCurrent`/`aovPrior` computation in `buildKpiHeader`; remove the `sublabel={\`AOV …\`}` from the "Pedidos" `StatTile`.
  - Delete the two decisiones components + their tests (`top-margin-products.tsx`, `lowest-margin-orders.tsx`); remove their JSX/imports from `routes/decisiones.tsx`.
  - Reword `DECISIONES_HELP.pedidos` to drop its explicit AOV mention; retire `DECISIONES_HELP.topProductosMargen`/`pedidosMenorMargen`.
  - Update the affected Decisiones tests (dashboard composition, kpi-header, route, top-margin/lowest-margin component tests) so nothing asserts on the removed symbols.
- **Finanzas — add the three money reads (recomputed locally, Finance-owned names):**
  - New private per-product margin builder + `ProductMarginRow`/`ProductMarginView` in `finanzas-dashboard.ts`.
  - New private per-order lowest-margin builder + `OrderMarginRow`/`LowMarginOrdersView` in `finanzas-dashboard.ts`, reusing the existing `orderCostUSD`/`orderCommissionUSD`/`orderMarginUSD`/`qualifying` helpers.
  - New `aovUSD: KpiTrend` field on `FinanceKpiHeaderView`, plus new private `pedidosCurrent`/`pedidosPrior` counts inside `buildFinanceKpiHeader`.
  - New `components/finanzas/product-margin-bars.tsx` and `components/finanzas/low-margin-orders.tsx` (types imported only from `domain/finanzas-dashboard`, `InfoPopover` + `FINANZAS_HELP`, `formatMoney` with the existing `MONEY` const, `BarChart` reused for the product-margin chart).
  - New AOV `StatTile` (5th tile) in `finance-kpi-header.tsx`; bump the "exactly 4 tiles" docstring and the `toBe(4)` test to 5.
  - New `FINANZAS_HELP` entries for margin products, lowest-margin orders, and AOV — respecting the finance copy rules.
  - Wire the two new components into `routes/finanzas.tsx` Layer 3 and add their headings + the AOV tile to `routes/__tests__/finanzas.test.tsx`; new Finance unit tests (margin-per-product, lowest-margin ascending + tie-break, orphan skip, frozen-rate regression, AOV trend).
- **Delete the now-orphaned `domain/decisiones.ts` + `domain/__tests__/decisiones.test.ts`** (see Decision 1).

### Out of scope

- **`GestorRankingRow.aovUSD`** — the per-gestor row-level average in the gestor ranking is a *different* field; this change touches only the KPI-header-level `aovUSD`. `buildGestorRanking`/`GestorCommissionCostRow` are not touched.
- Any change to the shared spine Finance already consumes: `buildFinanceSummary`, `period-trend.ts`, `buildCurrencyMix`/`buildGestorRanking`, or the chart primitives' shapes. This change consumes them unchanged.
- Any new data model, seed change, or persisted field beyond what `SeedState` already exposes.
- No re-open of salesops-11 locked decisions (no target/meta, no Gross/Net/Fees, "cobrado" stays a state proxy).
- No mutation affordances anywhere — both dashboards stay read-only (preserves the jsdom+undici `AbortSignal` sidestep).
- No visual/UX redesign of the two moved blocks beyond re-homing them under the finance card/section chrome and help pattern.

## Resolved decisions

### Decision 1 — Delete `domain/decisiones.ts` (and its test)

**Recommendation: DELETE the module and `domain/__tests__/decisiones.test.ts` (9 tests).**

`buildProfitabilityRanking`/`ProfitabilityRow`/`ProfitabilityView`/`ProfitabilityTotals` have exactly one app consumer today — `decisiones-dashboard.ts`, via the `lowestMargin` re-sort — plus their own direct unit test. Once `lowestMargin` moves and Finance recomputes the ranking locally (it MUST: `finanzas-dashboard.ts` is USER-LOCKED to never depend on decisiones code, so importing `buildProfitabilityRanking` is off the table by design), the module has **zero** runtime callers.

Keeping it would leave a module literally named *decisiones* that no dashboard uses, carrying 9 tests that guard code nobody runs — dead weight that will confuse the next reader ("why does Finance not use this?") and rot silently. The financial logic it encodes is not lost: it survives, better-homed, inside Finance's own margin builder with its own tests. Deleting is the hygienic, intention-revealing choice and is safe precisely because Finance never depended on it. Delete both files as part of this change.

### Decision 2 — Finance-owned names for the two moved shapes

**Recommendation: recompute locally with Finance-flavored `<Noun><Angle>Row` types and descriptive kebab-case component files, matching the established salesops-11 convention** (`GestorRankingRow`→`GestorCommissionCostRow`, `WarehouseSalesRow`→`WarehouseRevenueRow`, `CurrencyMixBucket`→`CurrencyExposureSlice`, `SalesTrendPoint`→`RevenueTrendPoint`; components `gestor-commission-table.tsx`, `warehouse-revenue.tsx`, `revenue-by-state-bars.tsx`).

| Moved from (decisiones) | New Finance type | New Finance view | New component file → export |
|-------------------------|------------------|------------------|----------------------------|
| `TopMarginRow` / `TopMarginView` (`buildTopMarginProducts`) | `ProductMarginRow` | `ProductMarginView` | `components/finanzas/product-margin-bars.tsx` → `ProductMarginBars` |
| `ProfitabilityRow` re-sorted asc (`lowestMargin`) | `OrderMarginRow` | `LowMarginOrdersView` | `components/finanzas/low-margin-orders.tsx` → `LowMarginOrders` |

Rationale: these names are consistent with every other reused-but-refinanced datum in `finanzas-dashboard.ts`, they read as finance nouns (product margin / order margin), and `product-margin-bars.tsx` mirrors the existing `revenue-by-state-bars.tsx` (both are `BarChart` leaves). Finance defines its OWN row interfaces — no type-only import of `ProfitabilityRow`, which would violate the spirit of the USER-LOCKED rule even where the letter allows it.

**Carry-forward of unused fields:** `ProfitabilityRow.marginPercent` and `isLoss` are never read by the leaf render today (only `revenueUSD`/`marginUSD` render; `isLoss` is explicitly asserted as NOT surfaced — no "pérdida"/"loss" copy). **Drop both** from `OrderMarginRow` — carry only what the component renders. A lean Finance type is preferable to porting dead fields.

### Decision 3 — AOV as a dedicated 5th KPI tile in Finance

**Recommendation: add AOV as a standalone 5th `StatTile` (not a sublabel).**

In Decisiones, AOV rides as a sublabel on the "Pedidos" (order-count) tile — a natural host because that tile already shows the order count AOV divides by. **Finance has no "Pedidos" tile at all.** Forcing AOV as a sublabel on "Ingresos facturados" would misrepresent it: AOV is not a component or breakdown of billed revenue, and hiding a `KpiTrend`-tracked metric inside another tile's sublabel buries its own current-vs-prior trend. A dedicated tile treats AOV consistently with every other KPI-header field (each is a `KpiTrend` with its own up/flat/down arrow).

This requires:
- New private `pedidosCurrent = currentQ.length` / `pedidosPrior = priorQ.length` inside `buildFinanceKpiHeader` (Finance tracks no order count today).
- `aovCurrent = pedidosCurrent > 0 ? facturadoCurrent / pedidosCurrent : 0` (guard on the **count**, matching Decisiones' `ventasCurrent/pedidosCurrent` parity — not a revenue guard), same for prior; `aovUSD: buildKpiTrend(aovCurrent, aovPrior)`.
- Add `aovUSD: KpiTrend` to `FinanceKpiHeaderView`; bump the "exactly 4 StatTiles" docstring to 5 and the `finance-kpi-header.test.tsx` `toBe(4)` InfoPopover count to 5.

The AOV tile lands last in the fixed order (after `margenNetoUSD`), so the four existing tiles keep their positions and existing assertions stay stable except for the count bump.

## Approach

Mechanical, test-first migration that mirrors the salesops-11 "reused-but-refinanced" pattern 1:1. Nothing is invented; the moved logic is re-homed, not redesigned.

| Decision | Rationale |
|----------|-----------|
| Recompute both rankings inside `finanzas-dashboard.ts` with private helpers, reusing the existing `orderCostUSD`/`orderCommissionUSD`/`orderMarginUSD`/`qualifying`/`sumUSD` | The only approach consistent with the file's USER-LOCKED "never import from decisiones" rule and with every prior finance reuse. Zero cross-dashboard coupling; lets `domain/decisiones.ts` be deleted safely. The per-order margin math already runs here — the lowest-margin builder is a sort + shape over existing helpers. |
| New private per-item loop for product margin (`item.quantity * (item.priceUSD − product.costUSD)` keyed by `productId`, orphan skip, sort desc) | Finance has no existing per-product aggregation. The loop mirrors `buildTopMarginProducts` almost line-for-line but lives in and is owned by Finance. |
| Preserve frozen-rate conversion, orphan-productId skip, and deterministic tie-break **verbatim** | Non-negotiable correctness invariants. Commission MN→USD uses the order's own `exchangeRateSnapshot.usdToMn` (÷0 → 0, never throw/NaN); orphan `productId` contributes 0 without throwing; lowest-margin ties break by `a.marginUSD - b.marginUSD || a.orderId.localeCompare(b.orderId)` ascending — copied exactly. Each gets an explicit Finance test (the orphan/tie coverage that currently lives only in the deleted decisiones tests must be re-created Finance-side). |
| Reuse `BarChart` + `InfoPopover` + `FINANZAS_HELP` + `formatMoney`/`MONEY` unchanged | Both moved views fit the existing finance leaf pattern. No new chart primitive, no new help mechanism. |
| Move help copy into `FINANZAS_HELP`, reworded only to satisfy finance copy rules | New entries for margin products / lowest-margin / AOV must avoid Gross/Net/Fees/refunds vocabulary and any "por cobrar" framing, use voseo and "dinero" (not "plata"). Existing Decisiones copy for these three already avoids the banned vocabulary, so it ports with light rewording. `DECISIONES_HELP.pedidos` loses its AOV sentence. |
| Strict TDD: write/adjust tests first, in both directions | Decisiones tests that assert on removed symbols are updated to expect their absence *before* removal; new Finance builder/component/route tests are written *before* the Finance implementation. Runner: `vitest run` from `templates/apps/salesops-mvp/`; typecheck `react-router typegen && tsc` same cwd. |

## Impact

- **`domain/decisiones-dashboard.ts`** — removes `buildTopMarginProducts`, `TopMarginRow`/`TopMarginView`, the `topMargin`/`lowestMargin` `DashboardView` fields, the `buildProfitabilityRanking` import + re-sort, and `aovUSD` from `KpiHeaderView`/`buildKpiHeader`. `hasData` untouched.
- **`domain/decisiones.ts` + `domain/__tests__/decisiones.test.ts`** — deleted (Decision 1).
- **`domain/finanzas-dashboard.ts`** — adds two builders + `ProductMarginRow`/`ProductMarginView`, `OrderMarginRow`/`LowMarginOrdersView`, and `aovUSD` + `pedidosCurrent`/`pedidosPrior` in `buildFinanceKpiHeader`.
- **`components/decisiones/`** — deletes `top-margin-products.tsx` + `lowest-margin-orders.tsx` (+ tests); edits `kpi-header.tsx` (drop AOV sublabel) and `help-content.ts` (reword `pedidos`, retire two entries).
- **`components/finanzas/`** — adds `product-margin-bars.tsx` + `low-margin-orders.tsx` (+ tests); edits `finance-kpi-header.tsx` (5th tile, docstring + test count) and `help-content.ts` (3 new entries).
- **`routes/decisiones.tsx`** — removes two blocks; **`routes/finanzas.tsx`** — adds two Layer-3 blocks + AOV tile.
- **Tests** — Decisiones: update dashboard-composition, kpi-header, route tests to expect absence; delete the two moved component tests. Finanzas: new builder tests (margin-per-product, lowest-margin asc + tie-break + orphan + frozen-rate), extend kpi-header for AOV (`toBe(5)`), extend route test for two headings + AOV tile.
- **Behavioral net:** identical numbers, new home. `/decisiones` becomes purely operational; `/finanzas` becomes the single source of profitability truth. Single PR, size-appropriate.

## Constraints to honor

- Strict TDD active — tests before implementation, both for removals (expect-absence) and additions.
- Frozen-rate commission conversion, orphan-productId skip (contributes 0, never throws), and the exact ascending tie-break comparator preserved verbatim in the new Finance builders.
- Do NOT touch `GestorRankingRow.aovUSD` — scope is strictly the KPI-header AOV.
- `FINANZAS_HELP` copy: no Gross/Net/Fees/refunds vocabulary, no "por cobrar" framing, voseo, "dinero" not "plata".
- No new data model, seed change, or chart primitive; both dashboards stay read-only.

## Next step

Run `sdd-spec` and `sdd-design` (they can proceed in parallel). `sdd-design` owns the precise builder signatures/placement, the exact new `FINANZAS_HELP` copy, and confirming the 5th-tile ordering + test-count updates.
