# Proposal — salesops-06-tasas-cambio (Pantalla 4: Tasas de cambio)

Replace the `/tasas` placeholder with a real exchange-rates editor: the three
live rates (USD→MN, Zelle, EUR) rendered as editable numeric fields, saved
through a NEW pure store action `updateExchangeRates(rates)` that writes only
`state.exchangeRates` and never touches `state.orders`. This is the screen that
drives the invariant the whole domain already protects — editing rates changes
only FUTURE verifications; already-verified orders keep their frozen snapshot.

## Why now

- Tasks 3–5 are archived. The `ExchangeRates` type, the seeded default
  (`{ usdToMn: 680, zelle: 1, eur: 1 }`), the `/tasas` route, and the sidebar
  entry all already exist — there are **no blocking unknowns**.
- `verifyOrder` already freezes `state.exchangeRates.usdToMn` onto
  `Order.exchangeRateSnapshot` at verify time, and the "a later rate change does
  not alter a verified order" invariant is already regression-tested at the
  store layer. The only missing pieces are the write action and the screen.
- `/tasas` is the last remaining `PlaceholderScreen` for this batch of tasks.

## What success looks like

- A user opens `/tasas`, sees the current three rates as editable numeric
  inputs, changes one, saves, reloads — the new values persist in localStorage.
- Saving persists ONLY `state.exchangeRates`; existing verified orders keep
  their `exchangeRateSnapshot` / `totalMN` / `commissionMN` untouched. A new
  verification performed after the edit uses the new `usdToMn`.
- Non-positive input (≤ 0) is rejected with an inline error; the form stays
  editable and nothing is written until the values are valid.
- Every Task 2–5 frozen test stays green; `verifyOrder` and the `ExchangeRates`
  type shape are unchanged.

## Scope

### In scope

- New store action `updateExchangeRates(rates: ExchangeRates): SeedState` in
  `seed-store.ts` — a pure single-field replace
  (`loadSeedState() → state.exchangeRates = rates → saveSeedState`), NOT built on
  the order-keyed `updateOrder` helper. Its own unit test + immutability
  regression test (edit via the new action, assert verified orders unchanged).
- A presentational `RatesForm` component (new `app/components/tasas/` folder)
  following the `ClientStep` draft/`onChange` idiom: an `ExchangeRates`-shaped
  draft, per-field `onChange`, a save button, and inline validation state.
- Rewrite `routes/tasas.tsx` as a `useState`-driven container that loads rates on
  mount and calls `updateExchangeRates` on save (direct render, no loader/`<Form>`).
- Route test (`routes/__tests__/tasas.test.tsx`) + component test
  (`components/tasas/__tests__/rates-form.test.tsx`).

### Out of scope

- Any retroactive recalculation of verified orders — this logic must NOT exist.
- Changes to `verifyOrder`, `buildVerifiedTotals`, or `verify.ts` (read side).
- Changing the `ExchangeRates` type shape or `Order.exchangeRateSnapshot`.
- Master-data CRUD for other entities (gestores, transportistas, products),
  inventory, dashboards, or finance — those are later screens.
- Real persistence beyond localStorage; auth; a new route or sidebar entry
  (both already wired).

## Locked decisions (ADR-style)

### D1 — New dedicated store action, NOT a reuse of `updateOrder`

| | |
|---|---|
| **Decision** | Add `updateExchangeRates(rates)` as a new named export that replaces the `state.exchangeRates` singleton in one write. |
| **Rationale** | `updateOrder` is keyed by order id and mutates a collection member — `exchangeRates` is a top-level singleton with no id. A separate pure action keeps every `SeedState` mutation as a named, independently-tested export (Tasks 3–5 convention) and structurally guarantees `state.orders` is never touched. |
| **Rejected — inline `saveSeedState` in the route** | Marginally less code, but breaks the "all mutations go through named store exports" convention and is far harder to unit-test in isolation. |
| **Rejected — generalize `updateOrder` into `updateEntity`** | Over-engineering for a demo; forces reworking proven order actions for zero benefit. |

### D2 — Reject non-positive rates (validation the plan left unspecified)

| | |
|---|---|
| **Decision** | Block save when any rate ≤ 0. Show an inline error and keep the form editable; write nothing until all three rates are positive numbers. |
| **Rationale** | `totalMN = round(totalUSD * usdToMn)` — a zero or negative `usdToMn` silently corrupts every future verification. Guarding at the form is the cheapest correct place. Kept demo-simple: positive-number check only, no min/max ranges or currency formatting rules. |
| **Rejected — no validation** | Fastest, but lets a presenter break the core money math mid-demo. |
| **Rejected — schema/library-based validation** | Over-engineered for three numeric fields with a single rule. |

### D3 — Presentational `RatesForm` via the `ClientStep` draft/`onChange` idiom

| | |
|---|---|
| **Decision** | `RatesForm` owns a draft `ExchangeRates`, emits per-field changes via `onChange({ ...draft, [key]: value })`, exposes a save handler, and derives a `canSave` boolean from the D2 rule; the container owns persistence. |
| **Rationale** | Mirrors `client-step.tsx` exactly (the established form precedent) and preserves the container-presentational split used across Tasks 3–5 — the component never calls store actions itself, so it is trivially testable. |
| **Rejected — form logic inside the route** | Collapses the split, makes the form untestable without the store, and diverges from Task 3–5 review expectations. |

## Affected areas

| File | Change |
|---|---|
| `app/routes/tasas.tsx` | Replace placeholder with a `useState` container: load rates on mount, render `RatesForm`, persist via `updateExchangeRates`. |
| `app/store/seed-store.ts` | Add `updateExchangeRates(rates)` single-field replace export (never touches `state.orders`). |
| `app/components/tasas/rates-form.tsx` | New presentational form (draft/`onChange`, save, inline validation) following `ClientStep`. |
| `app/store/__tests__/seed-store.test.ts` | Add happy-path + immutability regression tests for the new action. |
| `app/components/tasas/__tests__/rates-form.test.tsx` | New component test (edit, validation gate, save callback). |
| `app/routes/__tests__/tasas.test.tsx` | New route/container test (load → edit → persist). |
| `app/domain/types.ts`, `app/domain/verify.ts`, `app/store/seed-store.ts` verify path | **No change** — read side stays untouched. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Rate edit retroactively alters verified orders | Low | `updateExchangeRates` writes only `state.exchangeRates`; add an explicit immutability regression test via the new action (analogous to the existing store-layer one). |
| New action accidentally coupled to `updateOrder`/`verifyOrder` | Low | Keep it a standalone single-field replace; leave existing order actions untouched — frozen Task 2–5 tests stay green as the guard. |
| AbortSignal/jsdom gotcha in the container | Low | Keep the direct-render, `useState`-only, no-`<Form>`/no-loader pattern of `operador-almacen.tsx`; container test renders the component directly. |
| Numeric-input edge cases (empty string, non-numeric) | Med | Treat empty/NaN as invalid under the D2 gate; keep parsing simple and covered by the component test. |

## Testability note (strict TDD is active)

- Store action: test happy path (rates replaced, persisted), the D2 rejection is
  a UI concern but the action stays pure, and an immutability regression proving
  a verified order's frozen fields are unchanged after an edit.
- `RatesForm`: test per-field edit, the `canSave`/inline-error gate on ≤ 0, and
  that save fires `onChange`/submit only with valid positive rates.
- Container: load → edit → save → assert `updateExchangeRates` persisted and the
  reload reflects the new values.

## Next step

Proceed to `sdd-spec` (requirements/scenarios) and `sdd-design` (store action +
component shapes) — they can run in parallel from this locked proposal.
