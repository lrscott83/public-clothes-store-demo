# Apply Progress: Pantalla 4 — Tasas de cambio (salesops-06-tasas-cambio, Task 6)

**Mode**: Strict TDD (RED → GREEN per behavior, each RED confirmed with real `vitest run` output)
**Delivery**: direct commit to `salesops-mvp`, no PR
**Status**: COMPLETE — 16/16 tasks, full suite 202/202 green, typecheck clean

## Phases

### Phase 1 — Store write `updateExchangeRates` (RED×3 → GREEN)
- [x] 1.1 RED: test `updateExchangeRates` persists new rates + reflected on reload
- [x] 1.2 RED: test `updateExchangeRates` never mutates `state.orders` (reference-unchanged)
- [x] 1.3 RED: test frozen `exchangeRateSnapshot` unchanged after rate edit; subsequently verified order uses NEW rate
- [x] 1.4 GREEN: implement `export function updateExchangeRates(rates: ExchangeRates): SeedState` in `app/store/seed-store.ts` (after `resetDemo`, before `createOrder`) — load → set only `state.exchangeRates` → save → return

### Phase 2 — `RatesForm` + validation helpers (RED×5 → GREEN)
- [x] 2.1-2.5 RED: renders 3 prefilled fields; edit+save calls onSave; invalid input (`''`/`'0'`/`'-5'`/`'abc'`) blocks save + inline error; form stays editable
- [x] 2.6 GREEN: `parseRatesDraft` / `ratesToDraft` pure helpers + `RatesForm` presentational component (client-step draft/onChange idiom, hand-rolled Tailwind, no web-common Card)

### Phase 3 — Container rewrite + regression gates
- [x] 3.1-3.5 `app/routes/tasas.tsx` placeholder → `useState` container (string draft seeded from `loadSeedState().exchangeRates`, onChange + onSave → `updateExchangeRates`, saved/invalid feedback)
- [x] 3.6 Regression gate: `routes.test.tsx` + full suite + typecheck all green

## Final verification (real output)
- `npx vitest run`: **33 files, 202 tests passed** (2.24s)
- `npm run typecheck` (`react-router typegen && tsc`): **exit 0, no errors**

## Files touched
- Modified: `app/store/seed-store.ts` — added `updateExchangeRates`
- Modified: `app/store/__tests__/seed-store.test.ts` — +3 tests
- Modified: `app/routes/tasas.tsx` — placeholder → live container
- Created: `app/components/tasas/rates-form.tsx`
- Created: `app/components/tasas/__tests__/rates-form.test.tsx`
- Created: `app/routes/__tests__/tasas.test.tsx`

## Deviation (documented, non-functional)
Dropped the `<h2>Tasas de cambio</h2>` originally sketched inside `RatesForm` — it duplicated the container's `<h1>Tasas de cambio</h1>`, breaking `getByRole('heading', ...)` with a "multiple elements found" error. Kept a bare `<section>` wrapper. Does not violate any spec requirement (spec mandates the route heading + 3 editable fields only). Saved as reusable gotcha in engram (#815).

## Guardrails held
No recalculation logic introduced; `verifyOrder` untouched; `ExchangeRates` type shape unchanged.
