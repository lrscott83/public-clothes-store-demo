# Design: Pantalla 1 — Gestor crea pedido (salesops-03-crear-pedido)

## Technical Approach

Single flat route `pedidos/nuevo` becomes a container that owns a 3-step wizard via
`useState`. Steps are presentational (container-presentational): the route holds ALL
state (step, cart, client draft, payment draft, warehouse selection) and passes props
down. Two genuinely new pieces of logic ship as PURE, unit-tested modules: a
`createOrder` write API on the store, and a `eligibleWarehouses` availability helper.
Confirm is a plain `onClick` — no RR7 `<Form>`/action/loader (jsdom+undici AbortSignal
gotcha). On success the container renders an in-place success view (no navigation),
sidestepping the gotcha entirely.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Wizard routing | 1 route + local step state | Nested RR7 routes/actions | Matches flat registration + known test gotcha |
| Gestor identity | Module constant `GESTORES[0]` (gestor-1 Yasmani Alonso) | Selector / auth | MVP has no auth; header shows fixed persona |
| Domain extension | Additive OPTIONAL fields | Fields on `Order` | Keeps `generate.ts` literals valid; cohesive per 03-order-format |
| Order id | `order-user-${n}` from count of existing `order-user-*` | `order-${length+1}` | Seed ids are NON-contiguous (skipped nulls) → length collides |
| createdAt | Injected `now: Date = new Date()` | `Date.now()` inline | Tests pass a fixed Date; app uses wall clock |
| Confirm result | In-place success view | `useNavigate` redirect | Zero router involvement → fully render-testable |

## Interfaces / Contracts

```ts
// domain/types.ts — ADDITIVE, all optional (generate.ts stays valid)
interface Client { id: string; name: string;
  phone?: string; address?: string; deliveryMode?: 'domicilio' | 'recogida'; }
interface PaymentInfo { method: string; needsChange?: boolean; }

// domain/availability.ts — PURE
interface CartLine { productId: string; quantity: number; }
function eligibleWarehouses(
  cart: CartLine[], inventory: InventoryEntry[], warehouses: Warehouse[]
): Warehouse[];
// Rule: warehouse W eligible IFF for EVERY line, the InventoryEntry
// (W.id, line.productId) exists AND quantity >= line.quantity.
// Empty cart → vacuously all warehouses (UI gates cart non-empty upstream).

// domain/cart.ts — PURE
function cartTotalUSD(lines: Array<{ priceUSD: number; quantity: number }>): number;

// store/seed-store.ts — new write API (read-modify-write)
interface CreateOrderInput {
  items: OrderItem[]; client: Client; payment: PaymentInfo;
  warehouseId: string; gestorId: string;
  saleType?: string; observations?: string;
}
function createOrder(input: CreateOrderInput, now?: Date): Order;
// Builds Order born in state 'creado': totalUSD = cartTotalUSD(items),
// createdAt = now.toISOString(); leaves exchangeRateSnapshot/totalMN/
// commissionMN/verifiedAt+ UNSET. Loads state, pushes, saveSeedState, returns.
```

## Data Flow

```
catalogProvider.getProducts() ─┐
                               ├─→ CartStep ──cart──┐
loadSeedState().inventory ─────┘                    ├─→ eligibleWarehouses()
loadSeedState().warehouses ─────────────────────────┘        │
                                                             ▼
CartStep → ClientStep → WarehouseStep ──confirm──→ createOrder(input)
   (step + cart + client/payment + warehouseId all in PedidosNuevo)   │
                                                       read-modify-write
                                                       saveSeedState()  │
                                                             ▼
                                                     success view (order.id)
```

## Component Decomposition

- `routes/pedidos-nuevo.tsx` (container): `useState` for `step`, `cart: CartLine[]`
  (+ product lookup), `client`, `payment`, `warehouseId`, `created`. Header shows fixed
  gestor. Recomputes `eligibleWarehouses` when entering `almacen`. Confirm builds
  `CreateOrderInput` (items map cart→OrderItem using SeededProduct price+commissionMN),
  calls `createOrder`, sets `created`.
- `components/pedido/cart-step.tsx`: `ProductCard` grid + qty steppers, live
  `cartTotalUSD`. Next disabled when cart empty.
- `components/pedido/client-step.tsx`: name/phone/address inputs, deliveryMode radio,
  method select, needsChange checkbox. Next disabled unless name AND phone are non-empty,
  AND (deliveryMode !== 'domicilio' OR address non-empty). Address is required ONLY when
  deliveryMode = 'domicilio' (optional for 'recogida').
- `components/pedido/warehouse-step.tsx`: lists `eligible` warehouses (radio); empty
  eligible → block message + Confirm disabled.

Validation gating lives in the container (button `disabled`), steps stay presentational.
Cart step gate: cart non-empty. Client step gate:
`name && phone && (deliveryMode !== 'domicilio' || address)`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/domain/types.ts` | Modify | Additive optional Client/PaymentInfo fields |
| `app/domain/availability.ts` | Create | Pure `eligibleWarehouses` + `CartLine` |
| `app/domain/cart.ts` | Create | Pure `cartTotalUSD` |
| `app/store/seed-store.ts` | Modify | Add `createOrder` (read-modify-write) |
| `app/routes/pedidos-nuevo.tsx` | Modify | Replace placeholder with wizard container |
| `app/components/pedido/cart-step.tsx` | Create | Cart presentational step |
| `app/components/pedido/client-step.tsx` | Create | Client/payment presentational step |
| `app/components/pedido/warehouse-step.tsx` | Create | Warehouse picker step |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `eligibleWarehouses` | Exact-cover, insufficient-qty, missing entry, zero-eligible, multi-line |
| Unit | `cartTotalUSD` | Sum price*qty |
| Unit | `createOrder` | Appends to orders, persists, `now` injected, state='creado', empty commission/rate; `resetDemo` discards user order; id `order-user-*` unique |
| Component | step components | Direct `render()` + `fireEvent` (NO RR7 nav); gating (disabled buttons) |
| Component | container | `render(<PedidosNuevo/>)`, drive step transitions, confirm → success view |

## Migration / Rollout

No migration required. Additive optional fields; `VERSION` unchanged. User orders live in
the same `localStorage` key and are correctly discarded by `resetDemo()`.

## Open Questions

None.
