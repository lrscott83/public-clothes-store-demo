# Tasks: salesops-02-model-seed (domain model + deterministic seed)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950-1150 (9 new source files + 8-9 test files + 1 snapshot + 1 route) |
| 400-line budget risk | High |
| Chained PRs recommended | No (session override) |
| Suggested split | Single commit set to `salesops-mvp` branch, no PR |
| Delivery strategy | no PR — commit directly to `salesops-mvp`, no size limit (size:exception effectively granted) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

Rationale: raw size crosses 400 lines, but the session has already granted a size exception (no PR gate, direct commits to `salesops-mvp`). Work units below are informational — for buildable checkpoints and rollback boundaries — not PR boundaries.

### Suggested Work Units (informational, not PR gates)

| Unit | Goal | Notes |
|------|------|-------|
| 1 | domain/types.ts + seed/prng.ts + seed/constants.ts | Zero-dependency foundation |
| 2 | seed/commission-map.ts + seed/enrich-products.ts + seed/review-table.ts | Commission derivation, pure |
| 3 | seed/generate.ts (inventory-first + order funnel) | Depends on Unit 1+2 |
| 4 | store/seed-store.ts + routes/dev-commissions.tsx | Depends on Unit 3; only side-effecting layer |

## Phase 1: Domain Types + PRNG Foundation

- [x] 1.1 RED: `app/seed/__tests__/prng.test.ts` — `mulberry32(seed)` with fixed seed asserts exact first-N float sequence; `hashSeed(str)` asserts fixed uint32 for `"salesops-mvp-demo-v1"`.
- [x] 1.2 GREEN: create `app/seed/prng.ts` — `mulberry32(seed): () => number`, `hashSeed(str): number` (FNV-1a uint32).
- [x] 1.3 Create `app/domain/types.ts` — `SeededProduct`, `Warehouse`, `Gestor`, `Transportista`, `ExchangeRates`, `InventoryEntry`, `OrderItem`, `Client`, `PaymentInfo`, `OrderState`, `Order`, `SeedState` per design interfaces (no tests — types only, checked via `tsc`).
- [x] 1.4 Create `app/seed/constants.ts` — `SEED = hashSeed("salesops-mvp-demo-v1")`, `ANCHOR_ISO = "2026-07-10T12:00:00.000Z"`, 3 warehouses, 5 gestores, 3 transportistas, 20-day window, cart-size dist, rate-snapshot pool `{660,670,680,690}`, client-name pool (24 names).
- [x] 1.5 REFACTOR: confirm no `Date.now`/`Math.random` literal in `app/seed/prng.ts` or `app/seed/constants.ts`.

## Phase 2: Commission Derivation + Product Enrichment (Requirement: Enriched Product Model)

- [x] 2.1 RED: `app/seed/__tests__/commission-map.test.ts` — cases for `normalizeName` (accents/punctuation), each keyword-precedence tier (at least: `lavadora semi` before `lavadora`, `escalera 6` before `escalera`, bare `base` last), category-default fallback, catch-all `1000`, bundle `" + "` sum (e.g. `Inversor + Batería` → 10000).
- [x] 2.2 GREEN: create `app/seed/commission-map.ts` — `normalizeName`, `KEYWORD_COMMISSIONS` (41 ordered entries), `CATEGORY_DEFAULTS` (11 entries), `CATCH_ALL = 1000`, `deriveCommission(name, category): { commissionMN, rule }`.
- [x] 2.3 RED: `app/seed/__tests__/enrich-products.test.ts` — `costUSD = Math.round(price * 0.60)` for a sample; `commissionMN` frozen per `deriveCommission`; runs over full 99-product catalog and every product has `commissionMN > 0`.
- [x] 2.4 GREEN: create `app/seed/enrich-products.ts` — `enrichProducts(catalog): SeededProduct[]`, pure, no PRNG.
- [x] 2.5 RED: `app/seed/__tests__/order-commission.test.ts` — `sumOrderCommission(items)` with `{qty:1, commissionMN:4000}` + `{qty:2, commissionMN:1000}` → `6000`; assert combo/quantity tiers are ignored.
- [x] 2.6 GREEN: add `sumOrderCommission(items: OrderItem[]): number` to `app/seed/enrich-products.ts` (or co-located helper module) per Requirement: Order Commission Aggregation.
- [x] 2.7 RED: `app/seed/__tests__/review-table.test.ts` — `buildCommissionReviewTable(products)` returns exactly 99 rows with `{id, name, category, price, costUSD, commissionMN, rule}`; fallback rows (`category-default`/`catch-all`) flagged `⚠`.
- [x] 2.8 GREEN: create `app/seed/review-table.ts` — `buildCommissionReviewTable`, `formatCommissionTableMarkdown`.
- [x] 2.9 Snapshot: add `app/seed/__tests__/review-table.snapshot.test.ts` asserting `formatCommissionTableMarkdown(...)` matches committed `app/seed/__snapshots__/commission-table.md`.

## Phase 3: Deterministic Seed Generation (Requirements: Deterministic Seed Generation, Inventory Coverage, Order State Machine, Rate Snapshot)

- [x] 3.1 RED: `app/seed/__tests__/generate.determinism.test.ts` — call `generateSeedState()` twice in-process, assert `JSON.stringify` outputs are identical (`toEqual` + string equality); assert `generatedAt === ANCHOR_ISO`.
- [x] 3.2 RED: static-guard test in same file — read `app/seed/generate.ts` (and sibling `seed/*.ts`) source text, assert no occurrence of `Date.now(` or `Math.random(`.
- [x] 3.3 RED: `app/seed/__tests__/generate.inventory.test.ts` — `SeedState.inventory` has exactly 297 entries, one per unique `(productId, warehouseId)` pair, `quantity >= 0`.
- [x] 3.4 RED: `app/seed/__tests__/generate.orders.test.ts` — every order `state` is one of the 5 valid states; populated per-state timestamps are chronologically non-decreasing; every order date falls within `[ANCHOR - 19d, ANCHOR]`.
- [x] 3.5 RED (same file): cart-fulfillment case — for a sample of generated orders, the chosen `warehouseId` held every cart item's quantity at generation time (reconstruct pre-decrement via order of generation, or assert final inventory non-negative as an invariant).
- [x] 3.6 RED: `app/seed/__tests__/generate.rates.test.ts` — orders in `verificado`+ have `exchangeRateSnapshot`, `totalMN`, `commissionMN` all defined and `commissionMN === sumOrderCommission(items)`; orders in `creado` have all three `undefined`.
- [x] 3.7 GREEN: create `app/seed/generate.ts` — `generateSeedState(): SeedState`: seed 297 inventory rows first (weighted qty 2-15, PRNG-driven, never 0), then day-by-day order funnel (i=0..19, PRNG 3-6 orders/day, cart-size dist, state-funnel weights by day-offset per design table), decrementing chosen warehouse stock per order, back-filling timestamps per reached state, snapshotting rate from `{660,670,680,690}` and computing `totalMN`/`commissionMN` only from `verificado` onward.
- [x] 3.8 REFACTOR: extract any repeated PRNG-draw helpers (weighted pick, date-offset) into small private functions inside `generate.ts`; re-run Phase 3 tests green.

## Phase 4: localStorage Store (Requirement: localStorage Persistence Round-Trip)

- [x] 4.1 RED: `app/store/__tests__/seed-store.test.ts` — save then load returns a deep-equal `SeedState`; missing key triggers regeneration + persist; version-mismatched key triggers regeneration + persist; `resetDemo()` clears key and re-runs generator producing a byte-identical `SeedState` to the original first-run output (JSON.stringify equal).
- [x] 4.2 GREEN: create `app/store/seed-store.ts` — `STORAGE_KEY = "salesops-mvp:seed:v1"`, `VERSION = 1`, `saveSeedState(state)`, `loadSeedState()`, `resetDemo()`.

## Phase 5: Dev Commission-Review Route + Wiring

- [x] 5.1 RED: `app/routes/__tests__/dev-commissions.test.tsx` — renders 99 rows from `loadSeedState().products` via `buildCommissionReviewTable`; fallback rows show the `⚠` marker in the DOM.
- [x] 5.2 GREEN: create `app/routes/dev-commissions.tsx` — dev-only route rendering the review table in-browser using `store/seed-store.ts` + `seed/review-table.ts`.
- [x] 5.3 Register `dev-commissions` route in `app/routes.ts` alongside existing routes.
- [x] 5.4 Run full `app/seed`, `app/store`, `app/routes` test suites; confirm all Phase 1-5 tests green and no regressions in existing `sidebar`/`product-card`/`routes` tests.

## Phase 6: Documentation / Closeout

- [x] 6.1 Add a short header comment in `app/seed/generate.ts` documenting the frozen SEED/ANCHOR_ISO constants and the "never Date.now/Math.random" rule for future maintainers.
- [x] 6.2 Verify committed `app/seed/__snapshots__/commission-table.md` is human-reviewable (all 99 rows, fallbacks flagged) as the reviewable product→commissionMN artifact required by spec.
