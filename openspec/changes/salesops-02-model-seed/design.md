# Design: salesops-02-model-seed (domain model + deterministic seed)

## Technical Approach

Pure, framework-free TypeScript under `templates/apps/salesops-mvp/app/`, split into three layers:
`domain/` (types only), `seed/` (pure builders + PRNG, zero React/localStorage), `store/` (the only
side-effecting layer — localStorage load/save/reset). Everything in `seed/` is a deterministic pure
function of fixed constants: same input constants ⇒ byte-identical `SeedState`. Tasks 3–5 consume this
strictly through `store/` (`loadSeedState()`) and thin pure selectors — no UI built here.

Data flow:

    catalog.json ─→ enrichProducts() ─→ SeededProduct[]
                         (commission-map + cost)      │
    constants (SEED, ANCHOR) ─→ mulberry32() ─→ generateSeedState() ─→ SeedState
                                                     │  (inventory-first, then order funnel)
    store/seed-store.ts ── load/save/reset ──→ localStorage["salesops-mvp:seed:v1"]
                                                     │
    Tasks 3-5 ── loadSeedState() + selectors ────────┘

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/domain/types.ts` | Create | All domain types (SeededProduct, Warehouse, Gestor, Transportista, ExchangeRates, InventoryEntry, OrderItem, Client, PaymentInfo, OrderState, Order, SeedState). |
| `app/seed/prng.ts` | Create | `mulberry32(seed)` + `hashSeed(str)` (uint32 FNV-1a). Pure. |
| `app/seed/constants.ts` | Create | SEED, ANCHOR_ISO, counts, name pools, distributions. |
| `app/seed/commission-map.ts` | Create | `normalizeName`, `KEYWORD_COMMISSIONS`, `CATEGORY_DEFAULTS`, `CATCH_ALL`, `deriveCommission(name, category)`. |
| `app/seed/enrich-products.ts` | Create | `enrichProducts(catalog)` → adds `commissionMN` + `costUSD`. Pure, no PRNG. |
| `app/seed/generate.ts` | Create | `generateSeedState(): SeedState`. |
| `app/seed/review-table.ts` | Create | `buildCommissionReviewTable`, `formatCommissionTableMarkdown`. |
| `app/store/seed-store.ts` | Create | STORAGE_KEY + VERSION, `loadSeedState()`, `resetDemo()`, `saveSeedState()`. |
| `app/seed/__tests__/*.test.ts` | Create | Determinism/unit tests (vitest). |
| `app/seed/__snapshots__/commission-table.md` | Create | Committed reviewable product→commissionMN table (via snapshot test). |
| `app/routes/dev-commissions.tsx` | Create | Dev-only route rendering the review table in-browser (⚠ flags on fallbacks). |

## Architecture Decisions

### Decision: Layer split domain / seed / store
**Choice**: `seed/` is 100% pure; only `store/` touches `localStorage`.
**Alternatives**: single `data/seed.ts` mixing generation + persistence.
**Rationale**: purity makes determinism trivially unit-testable and keeps the date/PRNG gotchas contained.

### Decision: Frozen anchor date + fixed hashed seed
**Choice**: `ANCHOR_ISO = "2026-07-10T12:00:00.000Z"`; `SEED = hashSeed("salesops-mvp-demo-v1")`. 20-day window = `anchor - i*day`, `i=0..19` (late-June → 10 Jul 2026, reads as current). Never `Date.now()`/`Math.random()`.
**Alternatives**: window relative to today.
**Rationale**: only fixed anchor keeps "identical every run" true across calendar days and makes snapshot tests stable.

### Decision: Commission = frozen output of build-time matcher
**Choice**: `deriveCommission` runs at enrich time; the resolved number is baked into `SeededProduct.commissionMN`. Order commission = `sum(item.product.commissionMN * item.quantity)`.
**Alternatives**: runtime matcher; order-level combo-by-quantity tiers.
**Rationale**: reviewable, stable, testable; combo tiers explicitly locked out.

### Decision: costUSD flat 60%
**Choice**: `costUSD = Math.round(price * 0.60)` — flat, locked. No PRNG, no jitter.
**Alternatives**: seeded 55–70% jitter (rejected).
**Rationale**: MVP simplicity; trivially testable.

### Decision: Inventory-first generation
**Choice**: seed 297 inventory rows, then generate orders picking a warehouse that holds the whole cart, decrementing on each order.
**Rationale**: keeps Pantalla 5 numbers consistent with the golden rule (full cart in one warehouse).

### Decision: Per-verified-order rate snapshot with variance
**Choice**: current `ExchangeRates.usdToMn = 680`. Each `verificado`+ order snapshots `usdToMn` drawn deterministically from `{660,670,680,690}`; `totalMN = round(totalUSD * snapshot)`. Rate never recalculated after.
**Rationale**: gives Pantallas 4/7 believable intra-window rate variance while honoring the freeze rule.

## Concrete defaults (resolved)

| Constant | Value |
|----------|-------|
| SEED | `hashSeed("salesops-mvp-demo-v1")` (uint32 FNV-1a) |
| ANCHOR_ISO | `2026-07-10T12:00:00.000Z` |
| Warehouses | 3 (Nave Central, Sucursal Este, Sucursal Oeste) |
| Gestores | 5 |
| Transportistas | 3 |
| Days | 20 (`i=0` newest … `i=19` oldest) |
| Orders/day | PRNG 3–6 (~90 orders total) |
| Cart-size dist | 1:78%, 2:20%, 3:2%, 4+:0% (never generate 4+) — real-world: almost always 1 item, sometimes 2, rarely 3 |
| Inventory qty/row | PRNG weighted 2–15 (never 0 → 297 rows all stocked) |
| ExchangeRates | usdToMn 680, zelle 1, eur 1 |
| Rate snapshot pool | {660,670,680,690} |
| STORAGE_KEY / VERSION | `salesops-mvp:seed:v1` / `1` |
| Client-name pool | 24 names (Ana Torres, Luis Pérez, Marta Gómez, José Díaz, Yane­t Cruz, Carlos Mena, Dania Rojas, Pedro Sánchez, Elena Vega, Raúl Blanco, Mabel Soto, Iván Reyes, Tania Lima, Osmany Ruiz, Gladys Peña, Frank Mora, Yusimí Alba, Damián León, Noel Ferrer, Odalys Prieto, Ramón Cepero, Yaidel Nores, Suanys Roque, Beatriz Ortega) |

## State funnel by day-offset (weights)

| Offset i | creado | verificado | transportando | entregado | comision_pagada |
|----------|--------|-----------|---------------|-----------|-----------------|
| 0 (today) | 55 | 35 | 10 | 0 | 0 |
| 1–3 | 20 | 30 | 25 | 20 | 5 |
| 4–9 | 5 | 15 | 20 | 35 | 25 |
| 10–19 | 0 | 5 | 10 | 30 | 55 |

Timestamps back-filled per reached state (createdAt = day; each later stamp = previous + PRNG minutes).
`exchangeRateSnapshot`/`totalMN`/`commissionMN` populate only from `verificado` onward.

## Commission dictionary (precise, ordered — first match wins)

Normalize: lowercase, strip accents/diacritics, collapse punctuation/quotes/whitespace.
Bundle pre-check: if normalized name contains `" + "`, split, resolve each segment via keyword/category,
`commissionMN = sum(segments)`.

Ordered keyword → MN (most specific first):

| # | keyword (normalized `includes`) | MN |
|---|------|----|
|1| `lavadora semi` | 3000 |
|2| `lavadora automatica` | 3000 |
|3| `lavadora/secadora` | 3000 |
|4| `lavadora` | 3000 |
|5| `cafetera de fogon` | 500 |
|6| `maquina de cafe` / `expreso` | 1000 |
|7| `cafetera` | 500 |
|8| `microondas` | 2000 |
|9| `hidrolavadora` | 2000 |
|10| `contadora` | 2000 |
|11| `toldo` | 2000 |
|12| `escalera 6` | 2000 |
|13| `escalera 4` / `escalera` | 1000 |
|14| `bomba` | 1000 |
|15| `calentador` | 3000 |
|16| `inversor` | 5000 |
|17| `bateria` | 5000 |
|18| `panel solar` | 1000 |
|19| `base para paneles` / `base de paneles` | 1000 |
|20| `lampara solar` / `luz recargable` / `recargable solar` | 2000 |
|21| `lampara` | 500 |
|22| `exhibidor 20` | 5000 |
|23| `exhibidor` | 4000 |
|24| `refrigerador` | 4000 |
|25| `nevera` | 3000 |
|26| `dispensador` | 2000 |
|27| `filtro de agua` | 1000 |
|28| `maquina de frio` / `maquina de refrigerador` | 1000 |
|29| `smart tv` / `tv` | 3000 |
|30| `equipo de musica` | 2000 |
|31| `cajita` | 500 |
|32| `base fija para tv` / `base para tv` / `base giratoria` / `base de pared` | 500 |
|33| `split` | 3000 |
|34| `ventilador industrial` | 3000 |
|35| `ventilador de techo` | 2000 |
|36| `ventilador` | 1000 |
|37| `fogon de petroleo` | 500 |
|38| `fogon infrarrojo` | 1500 |
|39| `fogon grande con horno` / `fogon ... horno` | 3000 |
|40| `escritorio` | 2000 |
|41| `base` (bare, last) | 500 |

Per-category defaults (used when no keyword matches):

| category | default MN |
|----------|-----------|
| cafeteras | 500 |
| climatizacion | 3000 |
| cocinas | 1000 |
| energia-solar | 1000 |
| freidoras | 1000 |
| lavadoras | 3000 |
| licuadoras | 1000 |
| ollas | 1000 |
| refrigeracion | 4000 |
| tv-y-audio | 3000 |
| utiles | 1000 |

Catch-all (no keyword, no category): `1000` (grounded in "Demás equipos pequeños | 1000").
Bundles resolved by sum: e.g. id77/78/80 `Smart TV + Cajita + Base` → 3000+500+500 = 4000; id35/38 kits
`Inversor + Batería` → 5000+5000 = 10000.

## Review table (surface — dual, locked)

`buildCommissionReviewTable(products)` → rows `{ id, name, category, price, costUSD, commissionMN, rule }`
where `rule ∈ keyword|category-default|catch-all|bundle-sum`. Surfaced BOTH ways:
(a) **generated data artifact** — the enriched-product builder emits the table via
`formatCommissionTableMarkdown()`, committed + snapshot-asserted at `app/seed/__snapshots__/commission-table.md`
(also exposable via `pnpm seed:table`);
(b) **dev-only route/view** — `app/routes/dev-commissions.tsx` renders the same rows in-browser so the user
can eyeball assignments live.
Rows resolved by `category-default`/`catch-all` (the 1000 fallback) are flagged with `⚠` in BOTH surfaces
for human sign-off.

## Interfaces / Contracts (key signatures)

```ts
export type OrderState = 'creado' | 'verificado' | 'transportando' | 'entregado' | 'comision_pagada';
export interface SeededProduct extends StoreProduct { commissionMN: number; costUSD: number }
export interface InventoryEntry { productId: string; warehouseId: string; quantity: number }
export interface Order {
  id: string; items: OrderItem[]; client: Client; payment: PaymentInfo;
  warehouseId: string; gestorId: string; transportistaId?: string;
  state: OrderState; totalUSD: number;
  exchangeRateSnapshot?: { usdToMn: number }; totalMN?: number; commissionMN?: number;
  saleType?: string; observations?: string;
  createdAt: string; verifiedAt?: string; transportingAt?: string; deliveredAt?: string; commissionPaidAt?: string;
}
export interface SeedState {
  version: number; generatedAt: string;
  products: SeededProduct[]; warehouses: Warehouse[]; gestores: Gestor[];
  transportistas: Transportista[]; inventory: InventoryEntry[];
  exchangeRates: ExchangeRates; orders: Order[];
}
export function mulberry32(seed: number): () => number;
export function deriveCommission(name: string, category: string): { commissionMN: number; rule: string };
export function generateSeedState(): SeedState;      // pure, no Date.now / Math.random
export function loadSeedState(): SeedState;          // read key; regenerate+persist if missing/version-mismatch
export function resetDemo(): SeedState;              // clear key → regenerate → byte-identical
```

## Testing Strategy (strict TDD, vitest)

| Layer | What | Approach |
|-------|------|----------|
| Unit | mulberry32 | fixed seed → asserted first-N float sequence |
| Unit | deriveCommission | keyword, category-default, catch-all, bundle-sum cases |
| Unit | enrichProducts | costUSD = round(price*0.6); commission frozen |
| Unit | Order.commissionMN | = Σ(item.commissionMN × qty) |
| Determinism | generateSeedState | call twice → `toEqual`; and `toMatchSnapshot` |
| Determinism | no wall-clock | assert `generatedAt === ANCHOR_ISO` (`2026-07-10T12:00:00.000Z`); static guard: no `Date.now`/`Math.random` in `seed/` |
| Integration | seed-store | load persists; reset restores byte-identical (JSON.stringify equal) |
| Snapshot | review table | committed markdown asserted stable |

## Migration / Rollout

No migration. Versioned key (`v1`); a model change bumps VERSION → load detects mismatch → regenerate.
Rate edits (Pantalla 4, later task) are read-modify-write on `exchangeRates` only, never a full regenerate.

## Downstream consumption (Tasks 3–5, not built here)

Task 2 exposes `loadSeedState()`/`resetDemo()` plus room for thin pure selectors
(`getInventoryFor(productId, warehouseId)`, `getOrdersByState(state)`, `gestorTotals()`). Screens read
through these; interactive state transitions and verify-time rate freeze are later-task behaviors.

## Open Questions

None.
