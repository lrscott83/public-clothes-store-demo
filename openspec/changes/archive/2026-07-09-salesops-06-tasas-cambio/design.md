# Design: Pantalla 4 — Tasas de cambio (salesops-06-tasas-cambio)

## Technical Approach

The `/tasas` route stops being a `PlaceholderScreen` and becomes a thin **container**
that owns an `ExchangeRates`-shaped **string draft** via `useState`, mirroring the
`operador-gestores.tsx` direct-render pattern (no RR7 `<Form>`/action/loader, no
`useNavigate` — sidesteps the jsdom+undici `AbortSignal` gotcha). It loads the current
rates once on mount (`loadSeedState().exchangeRates`), seeds the draft, renders a purely
presentational `RatesForm`, and on save calls a NEW named store export
`updateExchangeRates(rates)`.

`updateExchangeRates` is a **top-level singleton write**, deliberately NOT built on the
id-keyed private `updateOrder(id, mutator)` helper: it loads state, swaps
`state.exchangeRates` wholesale, saves, and returns the updated state. It never reads or
writes `state.orders`, so already-verified orders keep their frozen
`exchangeRateSnapshot` / `totalMN` / `commissionMN`; only FUTURE `verifyOrder` calls read
the new `usdToMn`. This is the write half of the invariant the store layer already
regression-tests (`seed-store.test.ts:238-255`).

`RatesForm` follows the `client-step.tsx` draft/`onChange` idiom exactly: the container
owns the draft, every field change emits `onChange({ ...draft, [key]: value })`, the form
derives `canSave` from the D2 positive-number rule and disables its Save button until all
three fields are valid. Validation lives in ONE pure helper (`parseRatesDraft`) shared by
both the form (for `canSave` + inline errors) and the container (to convert the draft to a
numeric `ExchangeRates` on save) — a single source of validation truth. Hand-rolled
Tailwind, no `web-common` Card (no precedent in this app).

## Draft-is-strings decision (HOW-level refinement of proposal D3)

The proposal's D3 says "`ExchangeRates`-shaped draft". At the HOW level the draft is
**string-keyed** (`{ usdToMn: string; zelle: string; eur: string }`), not numeric. This is
the correct shape to satisfy D2's explicit empty-string / NaN edge case (proposal Risk
"Numeric-input edge cases", Med): a numeric draft cannot represent a half-typed or cleared
field without collapsing `''` to `0` or `NaN` and losing the user's in-progress edit. The
form still emits per-field `onChange`, the container still owns persistence, `canSave` is
still derived from D2 — the intent of D3 is fully honored; only the draft's field type is a
string mirror of `ExchangeRates`. The numeric `ExchangeRates` contract (what the store
action receives) is unchanged. **The `ExchangeRates` TYPE SHAPE is NOT changed.**

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Store write path | NEW `updateExchangeRates(rates)` singleton replace (locked D1) | Reuse/generalize `updateOrder`; inline `saveSeedState` in the route | `updateOrder` is id-keyed over the orders collection; `exchangeRates` is an id-less top-level singleton. A standalone named export keeps every mutation tested (Tasks 3-5 convention) and structurally guarantees `state.orders` is untouched |
| Never touch orders | Action reads/writes ONLY `state.exchangeRates` | Recompute verified totals on rate change | Hard invariant: verified orders are frozen. No code path from this action reaches `state.orders`; an immutability regression test guards it |
| Return type | `updateExchangeRates(rates): SeedState` | `: void`; `: ExchangeRates` | Matches proposal signature and lets the caller/test assert the full persisted state in one read; consistent with `loadSeedState`/`resetDemo` returning `SeedState` |
| Draft field type | String-keyed draft, parsed on validate/save (see above) | Numeric `ExchangeRates` draft | Cleanly represents empty/half-typed/NaN input required by D2; numeric draft collapses `''`→`0` and drops in-progress edits |
| Validation location | ONE pure helper `parseRatesDraft(draft): ExchangeRates \| null` (locked D2) | Inline duplicated checks in form AND container; schema/library | Single source of truth: form derives `canSave`/inline errors from it, container reuses it to get numbers on save. Positive-number check only — no ranges/formatting (demo-simple) |
| Error surfacing | Per-field inline error text when a field is non-empty but not a positive number; Save disabled whenever `!canSave` | Global toast; block typing | Mirrors form-field precedent; keeps the form editable while invalid (D2); nothing is written until valid |
| Save-gating | `RatesForm` disables its Save button via `canSave`; container's `handleSave` re-parses defensively and no-ops on `null` | Let container catch invalid at store layer | Button-level gate is the cheapest correct place (D2); the container guard is belt-and-suspenders, never expected to fire |
| Container shape | `useState` string draft + `saved` flag, direct render, no loader/`<Form>`/`useNavigate` | RR7 action/loader | Identical to `operador-gestores.tsx`; direct render-testable, no AbortSignal path |
| Saved feedback | `saved` boolean prop → inline "Tasas guardadas" confirmation; cleared on the next edit | Redirect; nothing | Minimal demo feedback that the write happened; zero router involvement |
| Field controls | 3 `<input type="number">` labeled USD→MN / Zelle / EUR, hand-rolled Tailwind | `web-common` Card; `<select>` | No Card precedent in this app; numeric inputs mirror `client-step.tsx` text inputs |

## Interfaces / Contracts

```ts
// domain/types.ts — NO CHANGE. ExchangeRates stays { usdToMn; zelle; eur } (all numbers).

// store/seed-store.ts — NEW named export (import ExchangeRates into the existing type import)
/**
 * Replaces the live exchange rates in the persisted SeedState. Top-level
 * singleton write: load → swap state.exchangeRates wholesale → save → return.
 * Deliberately NOT built on updateOrder (id-keyed over the orders collection).
 * NEVER reads or writes state.orders, so already-verified orders keep their
 * frozen exchangeRateSnapshot/totalMN/commissionMN — only FUTURE verifyOrder
 * calls read the new usdToMn.
 */
export function updateExchangeRates(rates: ExchangeRates): SeedState {
  const state = loadSeedState();
  state.exchangeRates = rates;
  saveSeedState(state);
  return state;
}
// Placement: alongside the other top-level SeedState operations, immediately
// after resetDemo() (~line 51) and before createOrder — it is a singleton
// replace like reset, NOT an order transition, so it lives above updateOrder.
```

```ts
// components/tasas/rates-form.tsx — presentational (mirrors client-step.tsx)
export interface RatesFormDraft {
  usdToMn: string;
  zelle: string;
  eur: string;
}

export interface RatesFormProps {
  draft: RatesFormDraft;
  onChange: (draft: RatesFormDraft) => void;
  onSave: () => void;
  saved?: boolean; // container sets true after a successful write; cleared on next edit
}

/** Pure validation helper — the single source of truth for D2. Returns the
 * numeric ExchangeRates when ALL three fields parse to positive finite numbers,
 * else null. Reused by the container's handleSave. */
export function parseRatesDraft(draft: RatesFormDraft): ExchangeRates | null;
// per-field rule: value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0

/** Helper for the container to seed a draft from persisted numeric rates. */
export function ratesToDraft(rates: ExchangeRates): RatesFormDraft;
// { usdToMn: String(rates.usdToMn), zelle: String(rates.zelle), eur: String(rates.eur) }
```

`RatesForm` internals: `set<K>(key, value)` → `onChange({ ...draft, [key]: value })` (the
`client-step.tsx` idiom). `canSave = parseRatesDraft(draft) !== null`. Per-field inline error
computed as `field.trim() === '' ? 'Requerido' : Number(field) > 0 ? null : 'Debe ser > 0'`.
Save `<button>` `disabled={!canSave}`. When `saved`, render an inline confirmation.

## Container — `routes/tasas.tsx`

Replaces the current `PlaceholderScreen`. Direct render, `useState` only.

```ts
export default function Tasas() {
  const [draft, setDraft] = useState<RatesFormDraft>(() => ratesToDraft(loadSeedState().exchangeRates));
  const [saved, setSaved] = useState(false);

  function handleChange(next: RatesFormDraft) {
    setDraft(next);
    setSaved(false); // any edit invalidates the prior "guardadas" confirmation
  }

  function handleSave() {
    const rates = parseRatesDraft(draft);
    if (!rates) return;            // defensive; RatesForm disables Save when invalid
    updateExchangeRates(rates);
    setSaved(true);
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Tasas de cambio</h1>
      <RatesForm draft={draft} onChange={handleChange} onSave={handleSave} saved={saved} />
    </main>
  );
}
```

`meta()` stays (title "Tasas de cambio — Sales Ops Cockpit").

## Data Flow

```
loadSeedState().exchangeRates ──► Tasas (container)
        ratesToDraft()              draft: { usdToMn:"680", zelle:"1", eur:"1" }, saved:false
              │
              ▼
        RatesForm(draft, onChange, onSave, saved)
              │  3 numeric inputs, per-field inline error, Save disabled while !canSave
              │
   edit field ─► onChange({...draft,[k]:v}) ─► setDraft + setSaved(false)
              │
   click Save (only enabled when canSave) ─► onSave
              ▼
        handleSave: parseRatesDraft(draft) → ExchangeRates
              │
              ▼
        updateExchangeRates(rates) ─► loadSeedState → state.exchangeRates = rates
              │                        → saveSeedState (state.orders UNTOUCHED)
              ▼
        setSaved(true)  // "Tasas guardadas" confirmation; reload reflects new rates
```

## Types & Seed Delta

| Change | File | Breaking? |
|--------|------|-----------|
| Add `ExchangeRates` to the existing type import | `app/store/seed-store.ts` | No — additive import |
| `updateExchangeRates` new export | `app/store/seed-store.ts` | No — additive |
| No `ExchangeRates` / `Order` / `SeedState` shape change | `app/domain/types.ts` | Untouched |
| No `verify.ts` / `verifyOrder` change | read side | Untouched |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/store/seed-store.ts` | Modify | Add `updateExchangeRates` singleton replace + import `ExchangeRates` |
| `app/routes/tasas.tsx` | Modify | Replace `PlaceholderScreen` with the `useState` container |
| `app/components/tasas/rates-form.tsx` | Create | Presentational form + `parseRatesDraft` / `ratesToDraft` helpers |
| `app/store/__tests__/seed-store.test.ts` | Modify | Add `updateExchangeRates` unit + immutability regression tests |
| `app/components/tasas/__tests__/rates-form.test.tsx` | Create | Component test (render, edit, validation gate, save) |
| `app/routes/__tests__/tasas.test.tsx` | Create | Route/container test (load → edit → persist; invalid blocks) |
| `app/domain/types.ts`, `app/domain/verify.ts` | Unchanged | Read side stays frozen |

## Testing Strategy (strict TDD — RED → GREEN per unit)

Test runner: `vitest run` from `templates/apps/salesops-mvp`. Store tests use the existing
`beforeEach(localStorage.clear + vi.resetModules)` + dynamic-import idiom
(`seed-store.test.ts:8-11`). Component/route tests use `render` + `fireEvent` with
`beforeEach(localStorage.clear)` (`operador-almacen.test.tsx:44-46`).

| Layer | What | Approach |
|-------|------|----------|
| Unit | `updateExchangeRates` happy path | replaces all three rates; reload via `loadSeedState().exchangeRates` reflects new values; returns the updated `SeedState` |
| Unit | orders untouched | snapshot `JSON.stringify(loadSeedState().orders)` before → call `updateExchangeRates` → assert byte-identical after (mirrors the inventory-untouched assertion `seed-store.test.ts:198-207`) |
| Unit | IMMUTABILITY regression | `createOrder` → `verifyOrder` (freezes `usdToMn:680`) → `updateExchangeRates({ usdToMn:999, zelle:2, eur:2 })` → reloaded verified order's `exchangeRateSnapshot` / `totalMN` / `commissionMN` UNCHANGED (direct carry-forward of `seed-store.test.ts:238-255`, now driven through the NEW action) |
| Component | `RatesForm` render | seeds three numeric inputs from `draft`; labels USD→MN / Zelle / EUR present |
| Component | `RatesForm` edit | typing a field fires `onChange` with `{ ...draft, [key]: value }` (the `client-step.test.tsx:116-124` pattern) |
| Component | `RatesForm` validation gate | empty / `"0"` / `"-5"` / `"abc"` in any field → Save `disabled` + inline error rendered; `onSave` NOT called on click |
| Component | `RatesForm` save | all-positive draft → Save enabled, click fires `onSave` once |
| Component | `RatesForm` saved feedback | `saved` true → confirmation text present |
| Route | `tasas` load | `render(<Tasas/>)` shows inputs seeded from `loadSeedState().exchangeRates`; `<h1>` `/tasas de cambio/i` present |
| Route | `tasas` edit → persist | change a field + click Save → `loadSeedState().exchangeRates` reflects the new value; reload-safe |
| Route | `tasas` invalid blocks | clear/zero a field → Save disabled → persisted `exchangeRates` unchanged |
| Route | `routes.test.tsx` | stays green — container keeps `<h1>` and uses plain `Component` (no loader/action → no AbortSignal path) |

The immutability regression test is MANDATORY — it proves the write action honors the
frozen-snapshot invariant end to end.

## Migration / Rollout

No migration. `VERSION` unchanged; no type shape change, so persisted `SeedState` still
loads. Seeded default `{ usdToMn:680, zelle:1, eur:1 }` renders on first load.
`resetDemo()` regenerates identically and discards any edited rates.

## Open Questions / Risks

- **Retroactive recalculation leak (Low→mitigated)**: `updateExchangeRates` writes only
  `state.exchangeRates`; the immutability regression test through the new action is the guard.
- **Coupling to `updateOrder`/`verifyOrder` (Low→mitigated)**: standalone singleton replace;
  the frozen Task 2-5 tests stay green as the boundary guard.
- **Numeric edge cases empty/NaN (Med→mitigated)**: string draft + `parseRatesDraft` treats
  empty/NaN/≤0 as invalid under D2; covered by the component validation-gate test.
- **AbortSignal/jsdom gotcha (Low→mitigated)**: direct-render `useState`-only container,
  no `<Form>`/loader/`useNavigate` — identical to `operador-gestores.tsx`.
- No `ExchangeRates` type-shape change is required (flagged per instructions: none needed).
