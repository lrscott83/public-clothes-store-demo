# Proposal — Rediseño operativo del dashboard de Decisiones (`salesops-14-decisiones-operativo`)

Reconvert `/decisiones` (Pantalla 6 del cockpit `salesops-mvp`) from a mixed sales/margin analytical dashboard into an **operational cockpit**: three stacked layers (**pulso inmediato**, **qué atiendo YA**, **comportamiento en el tiempo con filtro 7d/30d**) plus an **Análisis** section kept from the current dashboard. The full approved design is `docs/plans/dashboard-decisiones-operativo-design.md` and is the source of truth for intent. Every new operational read derives from fields the seed already stores (per-state timestamps `verifiedAt`/`transportingAt`/`deliveredAt`/`commissionPaidAt`, `transportistaId`, order `state`); `buildInventoryAlerts` and `period-trend.ts` are reused as-is. No data-model, seed, or chart-primitive change.

## Intent

- **Problem:** The owner opens `/decisiones` in the morning to run the day, but today's view answers analytical/commercial questions (sales trend, currency mix, gestor ranking) — not *operational* ones. There is no single place to see what is happening NOW: active orders by state and warehouse, transportista capacity and the "mercadería lista parada" bottleneck, commissions falling overdue, and orders stuck too long in a stage.
- **Why now:** `salesops-13` (archived 2026-07-15) just moved all profitability reads to `/finanzas`, leaving `/decisiones` ready to become **purely operational**. The seed already persists per-state timestamps and `transportistaId`, so every derived operational rule is computable with **zero** data-model change — this is a view-model + presentation redesign, not a data change.
- **Success looks like:** `/decisiones` renders the 3 operational layers plus an Análisis section limited to **Ventas por almacén, Mix por moneda, Ranking de gestores**. Every operational figure traces to a real seed field; windows anchor to `state.generatedAt` (never `Date.now()`) and every MN↔USD uses the order's own frozen `exchangeRateSnapshot.usdToMn`. The dashboard stays read-only.

## Scope

### In scope

- **Capa 1 — Pulso inmediato (3 cards):**
  - **1.1 Pedidos activos por estado y almacén** — bar chart over the **3 non-completed states** (`creado`/`verificado`/`transportando`), counts per warehouse with fixed colors (Pinar=verde, Consolación=azul, Herradura=amarillo). `entregado` excluded.
  - **1.2 Transportistas** — capacity: *ocupado* = has an order in `transportando`, *disponible* = otherwise; plus **"Sin chofer"** = `verificado` orders with no `transportistaId`.
  - **1.3 Comisiones por pagar** — total + most-overdue rows, one per gestor (no repeats): días de atraso (days since the order reached `entregado` unpaid), valor de esa comisión, total pendiente del gestor.
- **Capa 2 — Qué atiendo YA:** critical stock per warehouse (reuse `buildInventoryAlerts`); **pedidos demorados/trabados** (age in current stage past a per-stage threshold, using the per-state timestamps).
- **Capa 3 — Comportamiento en el tiempo, filtro `[7d/30d]`:** entra vs. sale (creados vs. entregados en período), ciclo promedio (`creado`→`entregado` con Δ vs. período previo), pedidos/día (toggle Nº ⇄ valor de venta), pedidos completados/día (+ tasa de completado).
- **Sección Análisis (con filtros):** Ventas por almacén, Mix por moneda, Ranking de gestores — reusing `buildWarehouseSales`, `buildCurrencyMix`, `buildGestorRanking`.

### Out of scope (non-goals)

- **"Top productos por margen" y "Pedidos de menor margen" — EXPLICITLY EXCLUDED.** The design doc (lines 69-70) still lists them in the Análisis section, but they were already moved to `/finanzas` by `salesops-13` (archived 2026-07-15). This proposal **deliberately deviates** from the design doc on this point. Governing rule: **lo operativo vive en Decisiones, el dinero vive en Finanzas.** The Análisis section keeps ONLY the three blocks listed above.
- **KPI-header AOV / ticket promedio** — already lives in Finanzas (`salesops-13`); not reintroduced here.
- **Delayed-order threshold VALUES** — the per-stage "cuántos días sin avanzar dispara la alerta" is an OPEN QUESTION in the design (lines 148-149); the mechanism is in scope, the exact numbers are deferred to `sdd-spec`/`sdd-design`.
- No data-model, seed, or chart-primitive change; no new persisted field beyond what `SeedState` already exposes.
- No mutation affordances — both dashboards stay read-only (preserves the jsdom+undici `AbortSignal` sidestep).
- No changes to `/finanzas` — profitability ownership is untouched.

## Derived rules (no raw field exists — defined by this change)

1. **Transportista ocupado/disponible** — derived from having an order in `transportando` (no status field on `Transportista`).
2. **Sin chofer** — `verificado` orders with no `transportistaId`.
3. **Comisión atrasada** — días desde `deliveredAt` con `commissionPaidAt == null`.
4. **Pedido demorado** — age in the current stage above a per-stage threshold (threshold TBD — see out-of-scope).

## Capabilities

### New Capabilities
- None. This project uses a single consolidated spec (`openspec/specs/salesops-mvp/spec.md`); no new capability file is introduced.

### Modified Capabilities
- `salesops-mvp`: the **Decisiones** requirements change from a sales/margin analytical dashboard to an operational cockpit. Delta spec MUST revise "Decisiones Route Renders the Three-Layer Decision Dashboard" and its sub-requirements (KPI header, sales-trend, stage-distribution, warehouse/currency/gestor blocks) to the new 3-layer-plus-Análisis structure, and ADD requirements for the operational reads (active-orders-by-state-and-warehouse, transportista capacity + Sin chofer, comisiones por pagar/atrasadas, pedidos demorados, entra-vs-sale, ciclo promedio, pedidos-por-día and completados-por-día under the 7d/30d filter).

## Approach

Mechanical, test-first extension of the existing pure view-model pattern. Nothing about the data layer changes.

| Decision | Rationale |
|----------|-----------|
| Add new operational builders to `domain/decisiones-dashboard.ts` (or a sibling operational module), each independently exported and unit-tested, composed by `buildDecisionesDashboard` | Mirrors the file's established one-helper-per-block pattern; keeps every operational read pure and testable in isolation. |
| Reuse `buildInventoryAlerts`, `buildWarehouseSales`, `buildCurrencyMix`, `buildGestorRanking`, and the `period-trend.ts` window/trend helpers unchanged | The Análisis section and the 7d/30d layer are already served by existing pure builders; no duplication. |
| Derive operational state (busy transportista, Sin chofer, overdue commission, delayed order) from existing timestamps/ids | Zero data-model change; the seed already carries `verifiedAt`/`transportingAt`/`deliveredAt`/`commissionPaidAt`/`transportistaId`. |
| Keep the route a read-only direct-render component driven by local `useState`, no RR7 `<Form>`/action/loader | Preserves the jsdom+undici `AbortSignal` sidestep already used by `decisiones.tsx`/`inventario.tsx`. |
| Anchor all windows to `state.generatedAt`; all MN↔USD via the order's frozen `exchangeRateSnapshot.usdToMn` | Correctness invariants shared across every dashboard here. |
| Strict TDD — builder/component/route tests first | Runner: `vitest run` from `templates/apps/salesops-mvp/`; typecheck `react-router typegen && tsc` same cwd. |

## Impact

| Area | Impact | Description |
|------|--------|-------------|
| `templates/apps/salesops-mvp/app/domain/decisiones-dashboard.ts` | Modified | New operational builders (active-orders-by-state-and-warehouse, transportista capacity + Sin chofer, comisiones atrasadas, pedidos demorados, entra-vs-sale, ciclo promedio, per-day + completed-per-day); reshaped `DashboardView`; retire the sales-trend/KPI-header shape that no longer fits the operational framing. |
| `templates/apps/salesops-mvp/app/domain/inventory.ts` / `period-trend.ts` | Reused | Consumed unchanged. |
| `templates/apps/salesops-mvp/app/components/decisiones/` | New/Modified | New leaf components for the 3 layers; Análisis components (warehouse/currency/gestor) kept. |
| `templates/apps/salesops-mvp/app/routes/decisiones.tsx` | Modified | Recomposed into the 3 layers + Análisis section with the 7d/30d filter, read-only. |
| `openspec/specs/salesops-mvp/spec.md` | Modified (via delta) | Decisiones requirements rewritten/extended per the Capabilities section. |
| Tests | New/Modified | New builder + component + route tests; update Decisiones tests that assert the old sales/margin layout. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Delayed-order threshold undefined → ambiguous spec | High | Flagged as an open question; `sdd-spec`/`sdd-design` MUST fix per-stage values before `sdd-apply`. |
| Redesign touches many components/tests → PR exceeds the 400-line review budget | Medium | `sdd-tasks` forecasts workload; likely chained/stacked slices (Capa 1 / Capa 2 / Capa 3 / Análisis). |
| Derived-rule semantics (busy, Sin chofer, overdue, demorado) misread the model | Low | Each rule pinned to a concrete seed field here; each gets its own unit test. |
| Design-doc deviation (margin blocks) causes confusion later | Low | Deviation documented explicitly in this proposal's out-of-scope. |

## Rollback Plan

Single-feature, additive-then-swap change confined to `domain/decisiones-dashboard.ts`, `components/decisiones/`, `routes/decisiones.tsx`, their tests, and the `salesops-mvp` delta spec. Revert via `git revert` of the change PR(s); no data migration, seed change, or `/finanzas` coupling to unwind. If chained, each slice has an autonomous rollback boundary.

## Dependencies

- `salesops-13-margin-analysis-to-finanzas` (archived 2026-07-15) — establishes that margin reads live in Finanzas, enabling the operational-only Análisis section.
- Per-stage "demorado" threshold decision — owed by `sdd-spec`/`sdd-design`.

## Success Criteria

- [ ] `/decisiones` renders Capa 1 (3 cards), Capa 2 (stock crítico + pedidos demorados), Capa 3 (entra-vs-sale, ciclo promedio, pedidos/día, completados/día under `[7d/30d]`), and an Análisis section with exactly Ventas por almacén, Mix por moneda, Ranking de gestores.
- [ ] No margin block (top productos / menor margen) and no AOV tile render on `/decisiones`.
- [ ] Transportista busy/available, Sin chofer, comisión atrasada, and pedido demorado each trace to a real seed field and have unit tests.
- [ ] Windows anchor to `state.generatedAt`; MN↔USD uses the order's frozen snapshot rate.
- [ ] `/decisiones` stays read-only; `vitest run` and `react-router typegen && tsc` pass from `templates/apps/salesops-mvp/`.

## Next step

Run `sdd-spec` and `sdd-design` (they can proceed in parallel). `sdd-design` owns the exact operational builder signatures/placement, the per-stage "demorado" threshold, the 7d/30d filter mechanics, and the fixed warehouse-color mapping.
