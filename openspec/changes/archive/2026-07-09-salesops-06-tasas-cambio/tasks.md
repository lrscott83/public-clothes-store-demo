# Tasks: Pantalla 4 — Tasas de cambio (salesops-06-tasas-cambio, Task 6)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~250-350 (one store export + import + 2 store tests, one new presentational component + helpers, one container rewrite, 2 new test files) |
| 400-line budget risk | Low |
| Chained PRs recommended | No — direct commit to `salesops-mvp`, no PR, no size limit this session |
| Suggested split | Single delivery (no PR flow this session) |
| Delivery strategy | direct-commit (no-PR) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Store write `updateExchangeRates` (Phase 1) | No UI; safe to land first |
| 2 | `RatesForm` + `parseRatesDraft`/`ratesToDraft` (Phase 2) | Independent of Unit 1 |
| 3 | `tasas.tsx` container rewrite + regression (Phase 3) | Depends on Units 1-2 |

All units land in one direct commit this session per delivery instructions; split shown only for internal sequencing.

## Phase 1: Store write — `updateExchangeRates`

- [x] 1.1 RED — extend `app/store/__tests__/seed-store.test.ts`: `updateExchangeRates` suite — replaces all three rates in one call; `loadSeedState().exchangeRates` reflects new values after reload; returns the updated `SeedState`. Run `pnpm --filter salesops-mvp test`, confirm failing (export missing).
- [x] 1.2 RED (same file) — orders-untouched case: snapshot `JSON.stringify(loadSeedState().orders)` before → call `updateExchangeRates` → assert byte-identical after. Confirm failing.
- [x] 1.3 RED (same file) — IMMUTABILITY regression: `createOrder` → `verifyOrder` (freezes `usdToMn`) → `updateExchangeRates({ usdToMn: 999, zelle: 2, eur: 2 })` → reloaded verified order's `exchangeRateSnapshot`/`totalMN`/`commissionMN` UNCHANGED. Confirm failing.
- [x] 1.4 GREEN — implement `export function updateExchangeRates(rates: ExchangeRates): SeedState` in `app/store/seed-store.ts`, placed immediately after `resetDemo()` and before `createOrder`; import `ExchangeRates` into the existing type import; body: `loadSeedState()` → `state.exchangeRates = rates` → `saveSeedState(state)` → `return state`. Never reads/writes `state.orders`. Run vitest, confirm 1.1-1.3 passing.

## Phase 2: `RatesForm` presentational component

- [x] 2.1 RED — create `app/components/tasas/__tests__/rates-form.test.tsx`: render `<RatesForm draft={{usdToMn:'680',zelle:'1',eur:'1'}} onChange={fn} onSave={fn}/>` — three numeric inputs seeded from `draft`, labels USD→MN / Zelle / EUR present. Run vitest, confirm failing (module missing).
- [x] 2.2 RED (same file) — edit case: `fireEvent.change` on a field fires `onChange` with `{ ...draft, [key]: value }` (mirrors `client-step.test.tsx:116-124`). Confirm failing.
- [x] 2.3 RED (same file) — validation-gate case: empty / `"0"` / `"-5"` / `"abc"` in any field → Save `disabled` + inline error text rendered; clicking Save (forced) does NOT call `onSave`. Confirm failing.
- [x] 2.4 RED (same file) — save case: all-positive draft → Save enabled; click fires `onSave` exactly once. Confirm failing.
- [x] 2.5 RED (same file) — saved-feedback case: `saved={true}` prop renders a "Tasas guardadas" confirmation. Confirm failing.
- [x] 2.6 GREEN — create `app/components/tasas/rates-form.tsx`: export `RatesFormDraft`, `RatesFormProps`, `parseRatesDraft(draft): ExchangeRates | null` (per-field rule: `value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0`), `ratesToDraft(rates): RatesFormDraft`, and default `RatesForm` component (client-step.tsx `set<K>` idiom, `canSave = parseRatesDraft(draft) !== null`, Save `disabled={!canSave}`, per-field inline error, `saved` confirmation block). Run vitest, confirm 2.1-2.5 passing.

## Phase 3: Container wiring + regression

- [x] 3.1 RED — create `app/routes/__tests__/tasas.test.tsx`: `render(<Tasas/>)` directly (no router stub) shows inputs seeded from `loadSeedState().exchangeRates`; `<h1>` `/tasas de cambio/i` present. Run vitest, confirm failing (still `PlaceholderScreen`).
- [x] 3.2 RED (same file) — edit→persist case: change a field + click Save → `loadSeedState().exchangeRates` reflects the new value; confirmation text appears. Confirm failing.
- [x] 3.3 RED (same file) — invalid-blocks case: clear/zero a field → Save disabled → persisted `exchangeRates` unchanged after attempted save. Confirm failing.
- [x] 3.4 GREEN — rewrite `app/routes/tasas.tsx` per design: `useState<RatesFormDraft>` seeded via `ratesToDraft(loadSeedState().exchangeRates)`, `saved` boolean state, `handleChange` (`setDraft` + `setSaved(false)`), `handleSave` (`parseRatesDraft(draft)` → no-op on `null` → `updateExchangeRates(rates)` → `setSaved(true)`); render `<h1>Tasas de cambio</h1>` + `RatesForm`; keep existing `meta()`. Run vitest, confirm 3.1-3.3 passing.
- [x] 3.5 Verify `app/routes/__tests__/routes.test.tsx` still passes (`/tasas de cambio/i` heading on initial render, stub uses plain `Component`, no loaders/actions/AbortSignal path).
- [x] 3.6 Run the full `salesops-mvp` vitest suite (`pnpm --filter salesops-mvp test`) — confirm all green, including Task 2/4/5's seed-store, tablero, and operador-* regression suites.

## Verification

- [x] `pnpm --filter salesops-mvp typecheck` — confirm no type errors (new export, new component, no `ExchangeRates`/`Order`/`SeedState` shape change).
- [x] `pnpm --filter salesops-mvp test` — confirm full suite green (new tests + all prior task regressions).
