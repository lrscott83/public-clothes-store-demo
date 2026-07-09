# Design: Pantalla 3 — Operador de almacén (salesops-05-operador-almacen)

## Technical Approach

The `operador-almacen` route stops being a `PlaceholderScreen` and becomes a **container**
that owns a two-view UI via `useState` (board ↔ transportista-picker detail), mirroring
`operador-gestores.tsx` exactly. The container holds the full orders list, the current view
mode, the selected order id, the locally-selected warehouse identity, and the in-flight
transportista pick. It passes props down to purely presentational board/column/card/picker
components. The two new lifecycle transitions go through TWO new named store write APIs —
`assignTransportista` and `markDelivered` — built over the SAME shared private
read-modify-write helper (`updateOrder`, `seed-store.ts:103-111`) that Task 4's
`verifyOrder`/`markCommissionPaid` already use, honoring the Task-4 design's explicit promise
that `updateOrder` "generalizes to Task 5's future transitions."

Board reuse is **additive extension**, not a fork: the shared `KanbanBoard`/`OrderColumn`/
`OrderCard` gain optional per-state action callbacks + an optional `visibleStates` prop. Every
action button — old and new — becomes guarded by `state === X && callback`, so Pantalla 2
(which passes `onRevisar`/`onMarkPaid`) renders byte-identically to today while Pantalla 3
(which passes `onAsignarTransportista`/`onMarcarEntregado` and OMITS the Pantalla-2 callbacks)
surfaces only its own actions. `visibleStates` defaults to all 5 states, so Pantalla 2's
"exactly 5 columns" assertion stays valid without editing a single existing test.

Actions are plain `onClick` handlers that call the store, then RE-READ orders from
`loadSeedState()` — the single source of truth after a write — and swap the view. NO RR7
`<Form>`/action/loader, NO `useNavigate` (sidesteps the jsdom+undici `AbortSignal` gotcha),
so every piece is directly render-testable. Every choice control is a `<fieldset>` of
`<input type="radio">` (the `warehouse-step.tsx` / `client-step.tsx` convention) — never a
`<select>`.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Board reuse mechanism | EXTEND shared components with optional callbacks + `visibleStates?` (locked D1) | Fork Almacén\* variants; data-driven `actionsByState` registry | Single presentational source of truth ("mismo tablero"); strictly additive so Task-4 tests stay valid by construction, not by rewrite |
| Action-button additivity | Guard EVERY action (old + new) by `state === X && callback` | Leave `creado`/`entregado` buttons unconditional | A screen that omits a callback must render NO button for it — otherwise an entregado card in Almacén would call an undefined `onMarkPaid` on click. Guarding keeps Pantalla 2 green (it always passes the callbacks) AND makes Pantalla 3 safe |
| `onRevisar`/`onMarkPaid` arity | Widen from required → OPTIONAL on all 3 components | Keep required; force Pantalla 3 to pass no-ops | Widening is non-breaking: existing callers/tests still pass them. Pantalla 3 renders the board with neither, so gestor/admin actions never appear in Almacén |
| Column subset | `KanbanBoard` gains `visibleStates?: OrderState[]` default all 5; Almacén passes `['verificado','transportando','entregado']` | Hardcode 3 columns in a fork; render all 5 always | Default preserves Pantalla 2's exactly-5-columns test untouched; the subset is the operator's actionable lane (assign → deliver → done) and is the whole point of the prop |
| Transportista UX | PICKER-then-confirm detail view (locked D2), radio-fieldset of carriers | One-click auto-assign from the card | Stronger demo; store transition needs a `transportistaId` param either way; mirrors `order-review.tsx`'s board↔detail swap and `warehouse-step.tsx`'s radio-fieldset |
| Mark-delivered UX | One-click button on the `transportando` card | Second picker/confirm view | `transportando → entregado` carries no extra data; identical simplicity to `markCommissionPaid` |
| Warehouse identity | IN-SCREEN radio-fieldset selector, local `useState<string>` default `WAREHOUSES[0].id` (locked D3) | Fixed `WAREHOUSES[0]`; real auth/persisted warehouse | Extends the codebase's "role simulated via UI, not login" philosophy; enables the core warehouse-scoped filtering demo. Board filters `orders` by `warehouseId` before rendering |
| Transition write path | Named `assignTransportista`/`markDelivered` over the EXISTING private `updateOrder(id, mutator)` | Inline load/find/save; new helper | Reuses Task 4's shared read-modify-write; zero new persistence code; keeps the frozen-field discipline in one place |
| Frozen-field immutability | Neither mutator reads or writes `exchangeRateSnapshot`/`totalMN`/`commissionMN` | Recompute on transport/deliver | Hard constraint; carries Task 4's immutability regression test forward for BOTH new mutators |
| `now` injection | `assignTransportista(id, transportistaId, now = new Date())`, `markDelivered(id, now = new Date())` | `Date.now()` inline | Consistent with `verifyOrder`/`markCommissionPaid`/`createOrder`; tests inject a fixed `Date` |
| Wrong-state guard | Throw on state mismatch / order-not-found | Silent no-op | Fail-loud in tests; UI only surfaces each action on its matching column, so throws are defensive |
| Action result | Re-read orders from store + swap to board view | `useNavigate` redirect / optimistic in-memory patch | Zero router involvement; store is the single source of truth after a write |
| Transportista contact | Additive OPTIONAL `phone?`/`zona?` + literals on `TRANSPORTISTAS` (locked D4) | Required fields; defer | Same additive pattern as Task 4's `Gestor.phone`; seed determinism unaffected (not fed to the PRNG); strengthens the picker detail view |

## Interfaces / Contracts

```ts
// domain/types.ts — ADDITIVE, optional (TRANSPORTISTAS literals + generate.ts stay valid)
interface Transportista { id: string; name: string; phone?: string; zona?: string; }
// Order ALREADY carries transportistaId?, transportingAt?, deliveredAt? — NO new Order fields.

// store/seed-store.ts — named transition APIs (BOTH over the EXISTING private updateOrder)
function assignTransportista(id: string, transportistaId: string, now: Date = new Date()): Order;
// guard: order.state === 'verificado' (else throw). Mutates ONLY:
//   order.transportistaId = transportistaId
//   order.state          = 'transportando'
//   order.transportingAt = now.toISOString()
// NEVER touches exchangeRateSnapshot / totalMN / commissionMN. Returns updated order.

function markDelivered(id: string, now: Date = new Date()): Order;
// guard: order.state === 'transportando' (else throw). Mutates ONLY:
//   order.state       = 'entregado'
//   order.deliveredAt = now.toISOString()
// NEVER touches exchangeRateSnapshot / totalMN / commissionMN. Returns updated order.
```

Both route through the untouched `updateOrder(id, mutator)` helper
(`seed-store.ts:103-111`): `loadSeedState()` → find by id (throw if missing) →
`mutator(order)` in place → `saveSeedState(state)` → return. Neither mutator reads
`state.exchangeRates`, so there is no path by which a frozen field could change.

## Component Changes (additive extension of shared board)

```ts
// components/tablero/kanban-board.tsx
interface KanbanBoardProps {
  orders: Order[];
  onRevisar?: (id: string) => void;               // was required → now OPTIONAL
  onMarkPaid?: (id: string) => void;              // was required → now OPTIONAL
  onAsignarTransportista?: (id: string) => void;  // NEW — opens the picker detail view
  onMarcarEntregado?: (id: string) => void;       // NEW — one-click transportando→entregado
  visibleStates?: OrderState[];                    // NEW — default COLUMN_ORDER (all 5)
}
// Renders (visibleStates ?? COLUMN_ORDER).map(...) columns; threads all four callbacks down.

// components/tablero/order-column.tsx — same 4 optional callbacks threaded to each OrderCard.
// components/tablero/order-card.tsx — renders, each guarded by state === X && callback:
//   state === 'creado'        && onRevisar             → "Revisar"
//   state === 'entregado'     && onMarkPaid            → "Marcar comisión pagada"
//   state === 'verificado'    && onAsignarTransportista→ "Asignar transportista"
//   state === 'transportando' && onMarcarEntregado     → "Marcar entregado"
```

**Why this keeps Task 4's tests green WITHOUT edits:**

- `kanban-board.test.tsx:21-33` (exactly-5-columns) passes NO `visibleStates` → it falls back
  to `COLUMN_ORDER` (all 5) → still 5 headings in funnel order. Green by construction.
- `order-card.test.tsx:64-69` (no-button-on-`transportando`) passes ONLY `onRevisar`/`onMarkPaid`,
  NOT `onMarcarEntregado` → the `state === 'transportando' && onMarcarEntregado` guard is falsy
  → no button. Green by construction.
- `order-card.test.tsx:44-62` (Revisar on creado / Marcar on entregado) always passes the
  matching callback → the added `&& onRevisar` / `&& onMarkPaid` guard is truthy → buttons
  still render. Green.
- `operador-gestores.test.tsx` renders the board with both Pantalla-2 callbacks and no
  `visibleStates` → identical behavior. Green.

Only NEW test cases are added (see Testing Strategy) — no existing assertion is rewritten.

## New Components

```ts
// components/tablero/transportista-picker.tsx (presentational, mirrors order-review.tsx)
interface TransportistaPickerProps {
  order: Order;
  transportistas: Transportista[];
  selectedTransportistaId: string | null;   // container-owned selection
  onSelect: (transportistaId: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}
// <section> with <h2>Asignar transportista {order.id}</h2>, a summary block (client, total),
// then a radio <fieldset> (legend "Transportista") of `transportistas` labels showing
// name + optional phone/zona — the warehouse-step.tsx radio convention. Footer buttons:
// "Atrás" → onBack; "Confirmar" → onConfirm, disabled while selectedTransportistaId === null.

// components/tablero/warehouse-selector.tsx (presentational)
interface WarehouseSelectorProps {
  warehouses: Warehouse[];
  selectedWarehouseId: string;
  onSelect: (warehouseId: string) => void;
}
// A radio <fieldset> (legend "Almacén") at the top of the board view. Always has a
// selection (defaults to WAREHOUSES[0].id in the container) — no confirm button, selecting
// re-filters the board immediately.
```

Both are pure props+callbacks; the container owns ALL state. Neither mutates the store.

## Container — `routes/operador-almacen.tsx`

Replaces the current `PlaceholderScreen`. Follows `operador-gestores.tsx` verbatim in shape:
direct render, `useState` only, no `<Form>`/loader/`useNavigate`.

```ts
type View = 'board' | 'asignar';

const [orders, setOrders]                       = useState<Order[]>(() => loadSeedState().orders);
const [view, setView]                           = useState<View>('board');
const [selectedOrderId, setSelectedOrderId]     = useState<string | null>(null);
const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(WAREHOUSES[0].id);
const [selectedTransportistaId, setSelectedTransportistaId] = useState<string | null>(null);

function reloadOrders() { setOrders(loadSeedState().orders); }

function handleAsignarTransportista(id) { setSelectedOrderId(id); setSelectedTransportistaId(null); setView('asignar'); }
function handleSelectTransportista(tid) { setSelectedTransportistaId(tid); }
function handleConfirmAsignar()          { assignTransportista(selectedOrderId!, selectedTransportistaId!); reloadOrders(); setView('board'); }
function handleMarcarEntregado(id)       { markDelivered(id); reloadOrders(); }
function handleSelectWarehouse(id)       { setSelectedWarehouseId(id); }
function handleBack()                    { setView('board'); }

const visibleOrders = orders.filter((o) => o.warehouseId === selectedWarehouseId);
const selectedOrder = selectedOrderId ? orders.find((o) => o.id === selectedOrderId) : undefined;
const { transportistas } = loadSeedState();
```

Render:
- Persistent `<h1>Operador de almacén</h1>` in BOTH views (keeps `routes.test.tsx`
  `/operador de almacén/i` green).
- `view === 'board'`: `<WarehouseSelector .../>` then
  `<KanbanBoard orders={visibleOrders} visibleStates={['verificado','transportando','entregado']}
   onAsignarTransportista={handleAsignarTransportista} onMarcarEntregado={handleMarcarEntregado} />`.
  Note: NO `onRevisar`/`onMarkPaid` passed → creado/entregado gestor/admin buttons never appear.
- `view === 'asignar' && selectedOrder`: `<TransportistaPicker order={selectedOrder}
   transportistas={transportistas} selectedTransportistaId={selectedTransportistaId}
   onSelect={handleSelectTransportista} onConfirm={handleConfirmAsignar} onBack={handleBack} />`.

## Data Flow

```
loadSeedState() ──orders──► OperadorAlmacen (container)
                              │  view='board', selectedWarehouseId=WAREHOUSES[0].id
                              ▼
                    WarehouseSelector(warehouses, selected)  ── onSelect ─► re-filter
                              │
                    visibleOrders = orders.filter(warehouseId === selectedWarehouseId)
                              ▼
        KanbanBoard(visibleOrders, visibleStates=['verificado','transportando','entregado'])
              │                         │
   verificado card                transportando card
   "Asignar transportista"        "Marcar entregado" (one-click)
              │                         │
   onAsignarTransportista(id)     markDelivered(id) ─► updateOrder ─► saveSeedState
              ▼                         │                    (state=entregado, deliveredAt=now)
   TransportistaPicker(order, transportistas)                │
   radio-fieldset → onSelect(tid) → Confirmar                ▼
              │                              setOrders(loadSeedState().orders)  // re-read
              ▼
   assignTransportista(id, tid) ─► updateOrder ─► saveSeedState
              │        (transportistaId, state=transportando, transportingAt=now)
              ▼
   setOrders(loadSeedState().orders); setView('board')   // re-read = source of truth
```

## Types & Seed Delta

| Change | File | Breaking? |
|--------|------|-----------|
| `Transportista.phone?: string`, `Transportista.zona?: string` (additive optional) | `app/domain/types.ts` | No — Task 2's `TRANSPORTISTAS` literals and `generate.ts` (uses `transportista.id`) stay valid |
| Backfill `phone`/`zona` literals on all 3 `TRANSPORTISTAS` | `app/seed/constants.ts` | No — extra properties; seed determinism/hash unaffected (not fed to the PRNG) |
| No `Order` field additions | — | `transportistaId?`/`transportingAt?`/`deliveredAt?` already exist (`types.ts:66,76,77`) |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/domain/types.ts` | Modify | Additive optional `Transportista.phone`/`zona` |
| `app/seed/constants.ts` | Modify | Backfill phone/zona literals on `TRANSPORTISTAS` |
| `app/store/seed-store.ts` | Modify | Add `assignTransportista` + `markDelivered` over existing `updateOrder` |
| `app/components/tablero/kanban-board.tsx` | Modify | Optional `onAsignarTransportista`/`onMarcarEntregado`/`visibleStates` + widen `onRevisar`/`onMarkPaid` to optional |
| `app/components/tablero/order-column.tsx` | Modify | Thread the same 4 optional callbacks |
| `app/components/tablero/order-card.tsx` | Modify | Two new guarded buttons; guard existing buttons by `&& callback` |
| `app/components/tablero/transportista-picker.tsx` | Create | Radio-fieldset carrier picker detail view |
| `app/components/tablero/warehouse-selector.tsx` | Create | Radio-fieldset warehouse identity selector |
| `app/routes/operador-almacen.tsx` | Modify | Replace `PlaceholderScreen` with board ↔ picker container |

## Testing Strategy (strict TDD — RED → GREEN per unit)

| Layer | What | Approach |
|-------|------|----------|
| Unit | `assignTransportista` | `verificado→transportando`; sets `transportistaId`; stamps `transportingAt` = injected `now`; persists + returns; **throws** on non-`verificado` |
| Unit | `markDelivered` | `transportando→entregado`; stamps `deliveredAt` = injected `now`; persists + returns; **throws** on non-`transportando` |
| Unit | Immutability regression (assignTransportista) | Verify an order (freeze at rate 680) → `assignTransportista` → assert `exchangeRateSnapshot`/`totalMN`/`commissionMN` UNCHANGED |
| Unit | Immutability regression (markDelivered) | Reach `transportando` → `markDelivered` → assert the same three frozen fields UNCHANGED |
| Component | `kanban-board` (NEW cases) | `visibleStates={['verificado','transportando','entregado']}` renders exactly those 3 columns; omitting `visibleStates` still renders 5 (existing test unchanged) |
| Component | `order-card` (NEW cases) | "Asignar transportista" renders on `verificado` ONLY when `onAsignarTransportista` given, click fires it with the id; "Marcar entregado" renders on `transportando` ONLY when `onMarcarEntregado` given, click fires it; existing no-button-on-`transportando` case (no new callbacks) stays green |
| Component | `transportista-picker` | direct `render()`: lists carriers (name + phone/zona) as radios; selecting fires `onSelect(tid)`; "Confirmar" disabled until a pick, then fires `onConfirm`; "Atrás" fires `onBack` |
| Component | `warehouse-selector` | direct `render()`: renders a radio per warehouse; selecting fires `onSelect(id)`; the current `selectedWarehouseId` is checked |
| Component | container | `render(<OperadorAlmacen/>)`: warehouse selector filters the board to that warehouse's orders; "Asignar transportista" → picker view → Confirmar returns to board with the order in `transportando`; "Marcar entregado" moves an order to `entregado`; `<h1>` matching `/operador de almacén/i` persists in both views |
| Route | `routes.test.tsx` | stays green — container keeps `<h1>` `/operador de almacén/i`; stub uses plain `Component` (no loaders/actions) → no AbortSignal path |

The two immutability regression tests are MANDATORY (one per new mutator) — they are the
direct carry-forward of Task 4's frozen-field guarantee.

## Migration / Rollout

No migration. `Transportista.phone`/`zona` are additive-optional; `VERSION` unchanged so
persisted `SeedState` still loads. Seeded fixtures already contain `transportando`/`entregado`
orders with `transportistaId`/`transportingAt`/`deliveredAt` populated (`generate.ts:191-201`),
so the new board lane renders real data on first load. `resetDemo()` regenerates identically.

## Open Questions / Risks

- **Additivity leak (Medium→mitigated)**: the whole approach hinges on `state === X && callback`
  guards. If any button is left unconditional, a screen that omits that callback crashes on click
  OR a Task-4 assertion breaks. Mitigation: guard every action; new component tests assert
  buttons appear ONLY when their callback is supplied.
- **Frozen-field leak (High→mitigated)**: neither new mutator may read/write
  `exchangeRateSnapshot`/`totalMN`/`commissionMN`. Mitigation: both go through `updateOrder`
  and touch only transport/deliver fields; two immutability regression tests guard it.
- **jsdom+undici `AbortSignal` gotcha**: avoided by keeping the container direct-render,
  `useState`-only, no `<Form>`/loader/`useNavigate` — identical to `operador-gestores.tsx`.
- **Warehouse selector is ephemeral**: `selectedWarehouseId` is local `useState`, reset on
  reload. Intentional (no persisted warehouse identity in scope); it exists to demonstrate
  scoped filtering, not to model real auth.
```
