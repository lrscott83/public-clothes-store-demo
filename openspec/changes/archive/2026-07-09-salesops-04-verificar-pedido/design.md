# Design: Pantalla 2 — Operador de gestores verifica pedidos (salesops-04-verificar-pedido)

## Technical Approach

The `operador-gestores` route becomes a **container** that owns a two-view UI via
`useState` (board ↔ review-detail), mirroring Task 3's step-swap wizard
(`pedidos-nuevo.tsx:39-146`). The container holds the full orders list, the current
view mode, and the selected order id; it passes props down to purely presentational
board/column/card/review components. All state transitions go through TWO new named
store write APIs — `verifyOrder` and `markCommissionPaid` — built over a single SHARED
private read-modify-write helper (`updateOrder`) that generalizes to Task 5's future
transitions. The rate-freeze math is extracted into a PURE, unit-testable domain module
(`domain/verify.ts`) that reuses `sumOrderCommission`, exactly as Task 3 extracted
`eligibleWarehouses`/`cartTotalUSD`. Actions are plain `onClick` handlers that call the
store, then RE-READ orders from the store and swap the view back to the board — NO RR7
`<Form>`/action/loader, NO `useNavigate` (sidesteps the jsdom+undici `AbortSignal`
gotcha), so everything is directly render-testable.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Board routing | 1 flat route + local `view`/`selectedOrderId` state | Nested RR7 routes / URL-per-column / loaders | Matches flat registration + known jsdom AbortSignal gotcha; direct-render testable |
| No D&D | Static 5-column layout; actions are buttons on cards | Drag & drop between columns | Plan §90; D&D is untestable via `render()`+`fireEvent` and out of MVP scope |
| Transition write path | Named `verifyOrder`/`markCommissionPaid` over a SHARED private `updateOrder(id, mutator)` | Inline load/find/save in each API; one monolithic `transition()` | DRY read-modify-write; `updateOrder` generalizes to Task 5 (transportando/entregado) without re-solving persistence |
| Where freeze math lives | PURE `domain/verify.ts` (`buildVerifiedTotals`); store only assigns | Math inline in the store mutator | Unit-testable in isolation; identical precedent `eligibleWarehouses`/`cartTotalUSD`; keeps store thin |
| Freeze formula | `commissionMN = sumOrderCommission(items)`, `totalMN = Math.round(totalUSD * usdToMn)` | Re-deriving from products; unrounded MN | Byte-identical to the seed's own precedent `generate.ts:185-187` → seeded and user-verified orders compute the same way |
| Freeze immutability | Freeze ONLY inside `verifyOrder`; nothing else writes snapshot/totalMN/commissionMN | Recompute on rate edit / on mark-paid | Hard rule (plan §111, proposal risk #1); `markCommissionPaid` only stamps a date |
| Inventory at verify | Informational re-display only (never mutated) | Decrement/reserve stock | Engram decision #780 — MVP flow-first; avoids "insufficient stock at verify" edge case |
| `now` injection | `verifyOrder(id, now = new Date())`, `markCommissionPaid(id, now = new Date())` | `Date.now()` inline | Consistent with `createOrder(input, now)`; tests pass a fixed Date |
| Wrong-state guard | Throw on state mismatch / order-not-found | Silent no-op | Fail-loud in tests; UI already only surfaces each action on its matching column so throws are defensive |
| Action result | Re-read orders from store + swap to board view | `useNavigate` redirect / optimistic in-memory patch | Zero router involvement; store is the single source of truth after a write |
| Gestor contact | Additive OPTIONAL `Gestor.phone?` + literals on `GESTORES` | Required field on `Gestor` | Keeps Task 2's frozen seed literals + `generate.ts` valid; same additive pattern as Task 3's `Client` |

## Interfaces / Contracts

```ts
// domain/types.ts — ADDITIVE, optional (GESTORES literals + generate.ts stay valid)
interface Gestor { id: string; name: string; phone?: string; }
// Order already carries exchangeRateSnapshot, totalMN, commissionMN, verifiedAt,
// commissionPaidAt — NO new Order fields needed.

// domain/verify.ts — PURE (mirrors generate.ts:185-187)
interface VerifiedTotals {
  exchangeRateSnapshot: { usdToMn: number };
  totalMN: number;
  commissionMN: number;
}
function buildVerifiedTotals(
  totalUSD: number, usdToMn: number, items: OrderItem[],
): VerifiedTotals;
// exchangeRateSnapshot = { usdToMn }
// totalMN            = Math.round(totalUSD * usdToMn)      // generate.ts:186-187
// commissionMN       = sumOrderCommission(items)          // generate.ts:185 / enrich-products.ts:25-27

// store/seed-store.ts — SHARED private read-modify-write helper
function updateOrder(
  id: string, mutator: (order: Order, state: SeedState) => void,
): Order;
// loadSeedState() → find order by id (throw if missing) → mutator(order, state)
//   mutates the order IN PLACE and may read state (e.g. state.exchangeRates)
// → saveSeedState(state) → return the updated order.

// store/seed-store.ts — named transition APIs (both over updateOrder)
function verifyOrder(id: string, now: Date = new Date()): Order;
// guard: order.state === 'creado' (else throw). Assigns from
//   buildVerifiedTotals(order.totalUSD, state.exchangeRates.usdToMn, order.items):
//   exchangeRateSnapshot, totalMN, commissionMN; sets state='verificado',
//   verifiedAt = now.toISOString(). Returns updated order.

function markCommissionPaid(id: string, now: Date = new Date()): Order;
// guard: order.state === 'entregado' (else throw). Sets state='comision_pagada',
//   commissionPaidAt = now.toISOString(). NEVER touches
//   exchangeRateSnapshot / totalMN / commissionMN.
```

The freeze reads `state.exchangeRates.usdToMn` (currently `EXCHANGE_RATES.usdToMn = 680`,
`constants.ts:55-59`) — the LIVE rate at verify time, snapshotted into the order.

## Data Flow

```
loadSeedState() ──orders──► OperadorGestores (container)
                              │  view='board', selectedOrderId=null
                              ▼
                    KanbanBoard(orders)  ── 5 OrderColumn ── OrderCard
                              │                 (creado card → "Revisar")
                              │                 (entregado card → "Marcar comisión pagada")
                 Revisar(id)  ▼
        OrderReview(order, gestor, availableAtWarehouse)   ← eligibleWarehouses(order.items,…)
                              │  (Aceptar)                     filtered to order.warehouseId
                              ▼
                    verifyOrder(id, now) ─► updateOrder ─► buildVerifiedTotals ─► saveSeedState
                              │
                              ▼
              setOrders(loadSeedState().orders); setView('board')   // re-read = source of truth
```

`markCommissionPaid` follows the same tail: card button → `markCommissionPaid(id)` →
re-read orders → board re-renders with the order in the `comision_pagada` column.

## Component Decomposition

- **`routes/operador-gestores.tsx` (container)** — CONTAINER-OWNED state:
  `orders` (`useState(() => loadSeedState().orders)`), `view: 'board' | 'review'`,
  `selectedOrderId: string | null`. Renders a persistent `<h1>Operador de gestores</h1>`
  (keeps `routes.test.tsx` heading green) in BOTH views. Handlers: `handleRevisar(id)`
  (set selected + view='review'), `handleAceptar(id)` (`verifyOrder` → reload → board),
  `handleMarkPaid(id)` (`markCommissionPaid` → reload), `handleBack()` (view='board').
  Derives `availableAtWarehouse` for the selected order via
  `eligibleWarehouses(order.items, inventory, warehouses)` filtered to `order.warehouseId`
  (INFORMATIONAL — no mutation). Looks up the order's gestor from `GESTORES`.
- **`components/tablero/kanban-board.tsx` (presentational)** — props:
  `orders`, `onRevisar(id)`, `onMarkPaid(id)`. Buckets orders by `state` into the 5
  fixed columns (`STATE_ORDER`) and renders an `OrderColumn` each. No state.
- **`components/tablero/order-column.tsx` (presentational)** — props: `title`/`state`,
  `orders` (already filtered), `onRevisar`, `onMarkPaid`. Renders the column header +
  count and one `OrderCard` per order.
- **`components/tablero/order-card.tsx` (presentational)** — props: `order`,
  `onRevisar`, `onMarkPaid`. Shows id/client/totalUSD (+ frozen `totalMN` when present).
  Renders "Revisar" ONLY when `state==='creado'`, "Marcar comisión pagada" ONLY when
  `state==='entregado'`; other states render no action button (read-only columns).
- **`components/tablero/order-review.tsx` (presentational)** — props: `order`, `gestor`,
  `availableAtWarehouse`, `onAceptar`, `onBack`. Shows items, client/delivery/payment,
  gestor `name` + `phone`, and the informational availability line. "Aceptar" → `onAceptar`.

Presentational components take props + callbacks only; the container owns ALL state and
every store call. Columns render as static flex/grid — no D&D — keeping every piece
drivable by `render()` + `fireEvent`.

## Types Delta

| Change | File | Breaking? |
|--------|------|-----------|
| `Gestor.phone?: string` (additive optional) | `app/domain/types.ts` | No — Task 2's `GESTORES` literals and `generate.ts` (uses `gestor.id`) stay valid |
| Phone literals on all 5 `GESTORES` | `app/seed/constants.ts` | No — extra property, seed determinism/hash unaffected (phone is not fed to the PRNG) |
| No `Order` field additions | — | — |

No input type needed for the transitions — both take `(id, now?)`. `VerifiedTotals` is a
new internal return type only.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/domain/types.ts` | Modify | Additive optional `Gestor.phone` |
| `app/seed/constants.ts` | Modify | Phone literals on `GESTORES` |
| `app/domain/verify.ts` | Create | Pure `buildVerifiedTotals` + `VerifiedTotals` |
| `app/store/seed-store.ts` | Modify | Private `updateOrder` helper + `verifyOrder` + `markCommissionPaid` |
| `app/routes/operador-gestores.tsx` | Modify | Replace placeholder with board/review container |
| `app/components/tablero/kanban-board.tsx` | Create | 5-column board (presentational) |
| `app/components/tablero/order-column.tsx` | Create | Single column (presentational) |
| `app/components/tablero/order-card.tsx` | Create | Order card + conditional action (presentational) |
| `app/components/tablero/order-review.tsx` | Create | Review-detail view (presentational) |

## Testing Strategy (strict TDD — RED → GREEN per unit)

| Layer | What | Approach |
|-------|------|----------|
| Unit | `buildVerifiedTotals` | snapshot echoes `usdToMn`; `totalMN === Math.round(totalUSD*usdToMn)` (incl. a fractional-round case); `commissionMN === sumOrderCommission(items)` |
| Unit | `verifyOrder` | `creado→verificado`; freezes snapshot/totalMN/commissionMN from CURRENT `state.exchangeRates`; stamps `verifiedAt` = injected `now`; persists + returns; **throws** on non-`creado` |
| Unit | `markCommissionPaid` | `entregado→comision_pagada`; stamps `commissionPaidAt`; frozen fields UNTOUCHED; **throws** on non-`entregado` |
| Unit | Immutability regression | `verifyOrder` an order at rate 680 → mutate `state.exchangeRates.usdToMn` to 999 + `saveSeedState` → reload / run a subsequent transition → assert the verified order's `exchangeRateSnapshot`/`totalMN`/`commissionMN` are UNCHANGED (no recompute path exists) |
| Component | `kanban-board` / `order-card` | direct `render()`: 5 columns present; orders bucketed by `state`; "Revisar" only on `creado`, "Marcar comisión pagada" only on `entregado`; `fireEvent.click` fires the right callback with the order id |
| Component | `order-review` | direct `render()`: renders items, client/payment, gestor name + `phone`, informational availability; Aceptar fires `onAceptar` |
| Component | container | `render(<OperadorGestores/>)`: Revisar → review view; Aceptar → back to board with the order now in the `verificado` column; heading persists |
| Route | `routes.test.tsx` | stays green — container keeps an `<h1>` matching `/operador de gestores/i`; the stub uses plain `Component` (no loaders/actions) so no AbortSignal path |

## Migration / Rollout

No migration. `Gestor.phone` is additive-optional; `VERSION` unchanged so persisted
`SeedState` still loads. User-verified orders live in the same `localStorage` key and are
discarded by `resetDemo()`. Verified totals are frozen on write and never recomputed.

## Open Questions / Risks

- **Freeze leak (High→mitigated)**: any future path that writes snapshot/totalMN/commissionMN
  breaks immutability. Mitigation: freeze lives ONLY in `verifyOrder`; the immutability
  regression test guards it. Task 5 transitions MUST use `updateOrder` WITHOUT touching
  frozen fields.
- **`updateOrder` mutates state in place**: acceptable — `loadSeedState()` returns a fresh
  parse each call, so there is no shared-reference aliasing across calls.
- **Availability semantics at review**: informational only; if the order's warehouse no
  longer covers the items, the review shows "insuficiente" but Aceptar is STILL allowed
  (decision #780). No open question — confirmed by the locked decision.
