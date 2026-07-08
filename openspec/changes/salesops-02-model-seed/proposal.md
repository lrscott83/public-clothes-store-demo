# Proposal — salesops-02-model-seed (domain model + deterministic seed)

Give the salesops-mvp demo a **frozen, app-local domain model** and a **fully deterministic seed generator** so all 7 screens read from one believable, reproducible dataset. This task defines the types, enriches the 99-product catalog with explicit per-product `commissionMN` and `costUSD`, and generates 20 days of inventory-validated order history into localStorage — with a "Reiniciar demo" that always returns to byte-identical state. No UI screens are built here.

- **Change:** salesops-02-model-seed (Task 2 of `docs/plans/mvp-sales-ops-cockpit.md`)
- **Phase:** propose
- **Artifact store:** hybrid (this file + engram `sdd/salesops-02-model-seed/proposal`)
- **Depends on:** Task 1 scaffold (app exists at `templates/apps/salesops-mvp/`, catalog copied locally)

---

## 1. Intent

### Problem
The scaffold ships a catalog provider (`app/data/catalog.ts` → 99 products, 11 categories) but the products carry only storefront fields (`id, name, price /*USD*/, categoryId, image`). They have **no commission and no cost**, there is **no domain model** for orders/warehouses/gestores/inventory/rates, and there is **no seeded data** for the dashboards to render. Every downstream screen (create-order flow, kanban boards, inventory, decisions/finance dashboards) is blocked on this.

### Why now
Task 2 is the single hard dependency for Tasks 3–9. Screens cannot be built against an undefined model, and the two dashboards (Pantallas 6/7) are meaningless without ~20 days of historical orders in varied states and currencies. Getting the model and seed right once, deterministically, de-risks all seven screens.

### Success looks like
- Every one of the 99 catalog products has an **explicit, reviewable** `commissionMN` and `costUSD` baked into the enriched product data — not computed at render time.
- A single call regenerates the entire `SeedState` (products, 3 warehouses, gestores, transportistas, 297 inventory rows, exchange rates, ~20 days of orders) **byte-identical on every run**, independent of wall-clock time.
- "Reiniciar demo" clears the localStorage key and restores the exact same state.
- Seed history is internally consistent: every historical order was validated against and decremented from inventory, and states follow a believable older→later funnel.
- The applied output includes a **product → commissionMN review table** so the user can eyeball assignments, especially catch-all/category-default fallbacks.

---

## 2. Scope

### In scope
- App-local TypeScript **type set** for the whole domain (products, warehouses, gestores, transportistas, inventory, exchange rates, orders, order items, client/delivery, payment, seed root).
- **Commission assignment**: a build-time derivation that produces an explicit `commissionMN` per product using the exploration's mapping strategy (keyword dictionary → category default → 1000 MN catch-all; bundle SKUs sum their segments).
- **costUSD assignment**: deterministic `round(price * 0.60)` per product.
- **Deterministic seed generator**: mulberry32 PRNG (fixed embedded seed constant) + fixed anchor-date constant for the 20-day window.
- **Inventory-first generation**: 99×3 inventory, then 20 days of historical orders validated/decremented against it, with a day-offset-weighted state funnel.
- **localStorage persistence**: single namespaced+versioned key holding the full `SeedState`; load/save/reset helpers.
- A **product → commissionMN/costUSD review table** produced as part of apply output for human sign-off.

### Out of scope (explicit)
- Any UI screen, component, route, or chart (Tasks 3–9).
- Editing `catalog.json` (prices/images taken as-is).
- Backend, API, real persistence, auth/roles.
- Order **mutation** flows (create/verify/assign/deliver) — those are screen behaviors in later tasks. This task seeds already-progressed historical orders and provides the pure state model; it does not implement the interactive state-machine transitions or the verify-time rate-freeze action.
- Charting/KPI aggregation logic (lives with the dashboards).
- Combo-by-quantity commission tiers (locked out; order commission = sum of item `commissionMN`).

---

## 3. Approach

### 3.1 Enriched product model (first-class fields)

`SeededProduct` extends the existing storefront `StoreProduct` with two **first-class, explicitly-assigned** fields. These are baked into the generated product array — not resolved by a runtime matcher at render time.

| Field | Source | Rule |
|-------|--------|------|
| `commissionMN: number` | reference/04-commissions.md via derivation | Explicit per-product value, frozen into seed |
| `costUSD: number` | derived from price | `round(price * 0.60)` (flat 60%) |

Per-warehouse stock is **not** on the product — it lives in a separate `InventoryEntry` join (product × warehouse), because the "carrito completo en un mismo almacén" rule needs per-warehouse per-product quantities.

### 3.2 Commission-assignment approach (derivation → frozen output)

The derivation is a pure function of `name` + `category`. The **matcher runs at build/seed time; the OUTPUT is a frozen, reviewable per-product `commissionMN`.**

Resolution order (first match wins):

1. **Normalize** name: lowercase, strip accents/diacritics, strip punctuation/quotes.
2. **Bundle pre-check**: if the normalized name contains `" + "`, split on it, resolve each segment via steps 3–4 recursively, and set `commissionMN = sum(segments)`.
3. **Keyword dictionary** (built line-by-line from reference/04, most-specific phrases first): `name.includes(keyword)` after normalization. E.g. `lavadora semiautomatica`, `lavadora automatica`, `fogon de petroleo`, `nevera de 16`, `smart tv`/`tv`, `split`, `refrigerador`, `microondas`, `hidrolavadora`, `contadora`, `toldo`, `escalera 4`/`escalera 6`, `bomba de agua`, `inversor`, `bateria`, `panel solar`, `base de paneles`, `lampara solar` vs generic `lampara`, `equipo de musica`, `escritorio`, bare `base` → Bases de TV (500).
4. **Category default**: one representative `commissionMN` per category from that category's dominant reference row (e.g. refrigeracion→4000, tv-y-audio→3000, lavadoras→3000, climatizacion→3000, energia-solar→1000).
5. **Catch-all**: `1000` MN — grounded in the business's own "Demás equipos pequeños | 1000" row, not an invented number.

**Mandatory review artifact:** the apply phase MUST emit a `product → commissionMN` table (id, name, category, commissionMN, costUSD, and which rule fired: keyword / category-default / catch-all / bundle-sum) so the user can eyeball assignments. Products that fell to category-default or the 1000 catch-all MUST be visibly flagged, since ~20–30% of the catalog has no direct reference match.

### 3.3 Full app-local type set (target for spec/design)

All local to `templates/apps/salesops-mvp/app/` (no shared package, per locked decision):

| Type | Shape (summary) |
|------|-----------------|
| `SeededProduct` | `StoreProduct + { commissionMN: number; costUSD: number }` |
| `Warehouse` | `{ id, name, location, pickupSchedule, workSchedule }` (×3); schedules = per-day open/close windows |
| `Gestor` | `{ id, name, phone, card, accumulatedSalesUSD, accumulatedCommissionMN }` |
| `Transportista` | `{ id, name, phone, zone, activeDeliveries }` |
| `ExchangeRates` | `{ usdToMn, zelle, eur, updatedAt }` — only user-editable seed data |
| `InventoryEntry` | `{ productId, warehouseId, quantity }` (99×3 = 297 rows) |
| `OrderItem` | `{ productId, quantity, unitPriceUSD }` (price snapshot at order time) |
| `Client` | `{ name, phone, address?, deliveryMethod: 'domicilio' \| 'recogida' }` |
| `PaymentInfo` | `{ method: 'efectivo' \| 'mn' \| 'zelle' \| 'eur', needsChange: boolean }` |
| `OrderState` | `'creado' \| 'verificado' \| 'transportando' \| 'entregado' \| 'comision_pagada'` |
| `Order` | items, client, payment, warehouseId, gestorId, transportistaId?, state, totalUSD, exchangeRateSnapshot?, totalMN?, commissionMN?, saleType?, observations?, + per-state timestamps |
| `SeedState` | root: `{ version, generatedAt, products, warehouses, gestores, transportistas, inventory, exchangeRates, orders }` |

Historical "Ventas" need **no separate type** — they are `Order[]` with backdated, already-progressed states; dashboards derive KPIs by aggregating `Order[]`.

**Order money/commission rules (locked):**
- `exchangeRateSnapshot`, `totalMN`, `commissionMN` populate only from `verificado` onward (rate frozen at verification, never recalculated).
- `Order.commissionMN = sum(item.product.commissionMN × item.quantity)` — combo-by-quantity tiers ignored.

### 3.4 Seed generator design (proposal level)

- **PRNG:** `mulberry32(seed)` — small, pure, `(seed) => () => number`. Seed is a **fixed embedded constant** (e.g. `hashSeed('salesops-mvp-demo-v1')`), never `Date.now()`/`Math.random()`.
- **Fixed anchor date:** a hardcoded ISO constant. The 20-day window is generated as `anchor - i*day` for `i = 0..19` — fully wall-clock-independent. This is the critical gotcha: naive `new Date()` breaks "identical every run" across calendar days.
- **Generation order (inventory-first):**
  1. Enrich products (`commissionMN`, `costUSD`) — pure, no PRNG.
  2. Seed 3 warehouses, N gestores, M transportistas (deterministic).
  3. Seed inventory: 297 `InventoryEntry` rows, per-warehouse quantities from PRNG.
  4. Generate ~20 days of orders: for each order pick a cart, then a warehouse that actually has stock for the whole cart, then **decrement** inventory. Assign gestor/transportista, payment method, client via PRNG.
  5. State funnel: weight state by day-offset — older days skew to `entregado`/`comision_pagada`, most recent 1–2 days skew to `creado`/`verificado`. Populate timestamps and (for verified+) `exchangeRateSnapshot`/`totalMN`/`commissionMN`.
  6. Roll up `accumulatedSalesUSD` / `accumulatedCommissionMN` per gestor from their orders.
- **costUSD:** flat `round(price * 0.60)` — pure, does not touch the PRNG (trivially unit-testable).

### 3.5 localStorage shape + reset

- **Single key:** namespaced + versioned, e.g. `salesops-mvp:seed:v1`, holding the whole `SeedState` blob as JSON.
- **Load:** on app start, read the key; if missing or version-mismatched, run the generator and persist.
- **Reset ("Reiniciar demo"):** clear the key, re-run the deterministic generator → same seed + same anchor ⇒ byte-identical `SeedState`.
- **Rate edits (Pantalla 4, later task):** a read-modify-write of `exchangeRates` on the same blob — NOT a full regenerate. Verified orders keep their frozen snapshot.

---

## 4. Risks and open questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bundle commission ambiguity (sum-of-segments vs order-level combo tiers) | Wrong commission on a few bundle SKUs | Locked: sum-of-segments per product; combo-by-quantity ignored. No action, just noted. |
| ~20–30% of products fall to category-default / 1000 catch-all | Commissions could look off to the owner | Mandatory review table flags every fallback for human sign-off (§3.2) |
| Date-anchor gotcha (naive `new Date()` in generator) | Breaks "identical every run"; breaks snapshot tests | Enforce fixed anchor constant; add a regression test asserting stable output |
| Inventory feasibility vs generated carts | Order references stock a warehouse lacks | Inventory-first + validate-and-decrement per order; skip/resize carts that can't be fulfilled |
| Gestor/transportista/warehouse counts not yet fixed | Affects believability of dashboards | Design phase to pin exact counts (proposal assumes 3 warehouses per plan; gestores/transportistas TBD) |
| localStorage version bump strategy | Stale blobs after model changes | Versioned key + version check on load triggers regenerate |

**Open for design:**
- Exact counts of gestores and transportistas, and the client-name pool.
- Number of orders per day and cart-size distribution.
- Whether `costUSD` ever needs margin variance (Option B seeded jitter) — proposal recommends flat 60% for MVP.

---

## 5. Next step

Proceed to **sdd-spec** and **sdd-design** (parallelizable):
- `sdd-spec` — formal requirements/acceptance for the model, commission table, and seed determinism.
- `sdd-design` — pin type shapes, generator module boundaries, gestor/transportista counts, order/day distribution, and the review-table format.
