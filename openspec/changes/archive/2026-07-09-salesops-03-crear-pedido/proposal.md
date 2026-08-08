# Proposal — Pantalla 1: Gestor crea un pedido (salesops-03-crear-pedido)

Add the first interactive screen of the Sales Ops cockpit: a 3-step "crear pedido"
wizard (Carrito → Cliente → Almacén) that turns a cart plus client/delivery data into
a persisted `Order` in state `creado`. It replaces the `pedidos/nuevo` placeholder and
gives the demo its first real end-to-end action — a gestor building an order that
later flows through Pantalla 2/3. Frontend-only, localStorage-backed, no backend.

## Intent

| Question | Answer |
|----------|--------|
| What problem | The app can seed and display data (Task 2) but a user cannot yet *create* anything. There is no write path into `SeedState.orders` and no UI to compose an order. |
| Why now | It is Task 3 of the MVP and the entry point of the whole order lifecycle. Pantalla 2 (verify) and 3 (warehouse) have nothing to act on until orders can be born in `creado`. |
| Success looks like | A gestor opens `pedidos/nuevo`, picks products with quantities, fills client + delivery + payment data, picks a warehouse that fully covers the cart, confirms, and a new `Order` (state `creado`) is appended to persisted `SeedState.orders`. If no warehouse covers the full cart, creation is blocked with a clear message. |

## Quick path (the 3-step UX)

The wizard lives in ONE route component (`PedidosNuevo`) driving local step state
`useState<'carrito' | 'cliente' | 'almacen'>` — no nested RR7 routes, no RR7
`<Form>`/`action` (avoids the documented jsdom+undici `AbortSignal` gotcha). A fixed
demo gestor persona is shown at the top of the wizard for context.

1. **Carrito** — browse the appliances catalog (`catalogProvider` + `ProductCard`),
   add products with a quantity stepper. Running **total in USD** shown live
   (`items.reduce((s,i) => s + i.priceUSD * i.quantity, 0)`). At least one line
   required to advance.
2. **Cliente** — name, phone, address, **domicilio vs. recogida en almacén** toggle,
   forma de pago, **¿lleva cambio?** flag, observaciones. Mirrors the field grouping
   of `docs/plans/reference/03-order-format.md`.
3. **Almacén** — only warehouses that cover the ENTIRE cart at sufficient quantity are
   selectable (golden rule). If none qualify, the order cannot be created and the step
   explains why. Confirm → a new `Order` in state `creado` is persisted.

## Scope

### In scope (Task 3 only)
- Replace the `pedidos/nuevo` placeholder with the working 3-step wizard.
- Fixed demo gestor persona (constant `gestor-1` "Yasmani Alonso" from the 5 seeded
  gestores) shown at the top; created order's `gestorId` = that constant. **No selector.**
- Additive-only extension of `Client` and `PaymentInfo` in `domain/types.ts`.
- New write API `createOrder(input)` in `store/seed-store.ts` (append + persist).
- New PURE availability helper module (unit-testable in isolation).
- Live USD total (reuse the existing reduce pattern; no new shared helper strictly required).
- Local step/form components under `app/components/`.
- Tests: availability helper (unit), `createOrder` (store), wizard component
  (direct-render pattern, no real RR7 navigation).

### Out of scope
- Gestor selector / any auth or session identity (persona is fixed).
- Pantallas 2–7 and any state transition past `creado`.
- Rate snapshot, `totalMN`, `commissionMN` — these are populated at **verificado**
  (Task 4), NOT at creation. Order is born in `creado` with `totalUSD` only.
- CRUD of master data (products, warehouses, gestores) — all seeded.
- Shared form primitives (`web-common` has none; build local Tailwind inputs).
- RR7 nested routes / URL-per-step / loaders / actions.

## Approach and rationale (locked decisions)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Wizard shape | Single flat route + local `useState` step state | Matches the existing single flat-route registration; sidesteps the jsdom+undici `AbortSignal` incompatibility that breaks loader/action-driven `createRoutesStub` navigation in this repo; testable with plain `render()` + `fireEvent`. |
| Gestor identity | Fixed demo persona `gestor-1`, no selector | App has zero auth by spec. A single fixed persona keeps the demo focused; the header shows who is creating for context. |
| Client/PaymentInfo | Additive-only optional fields | Must NOT break Task 2's frozen seed generator/tests. Seed builds `{ id, name }` and `{ method: 'efectivo' }`; new fields are optional so those literals still satisfy the interfaces without touching `generate.ts`. |
| Order write path | New `createOrder(input)` in `seed-store.ts` | No add-order API exists today. Read-modify-write: `loadSeedState()` → push to `orders` → `saveSeedState()`. A created order is runtime state, not deterministic seed; `resetDemo()` correctly discards it. |
| Availability | New pure module (e.g. `app/domain/availability.ts`) | The golden rule is only encoded inside the seed's `buildOrder`, not reusable. Extract a pure `(inventory, cart, warehouses) → Warehouse[]` function so it is unit-testable and reusable by later screens. |
| Confirm persistence | Plain `onClick`/`onSubmit` + `preventDefault`, no RR7 action | Re-avoids the `AbortSignal` gotcha; calls `createOrder` directly. |

### Additive type changes (`domain/types.ts`)

```
Client {
  id, name,
  phone?: string,               // NEW — optional
  address?: string,             // NEW — optional
  deliveryMode?: 'domicilio' | 'recogida'  // NEW — optional
}

PaymentInfo {
  method,
  needsChange?: boolean         // NEW — "¿lleva cambio?", optional
}
```

`Order` already carries `observations?`, `saleType?`, `warehouseId`, `gestorId` — no new
`Order` fields needed. All new fields optional → Task 2's seed generator literals stay valid.

### New store API (`store/seed-store.ts`)

`createOrder(input)` — accepts the composed cart + client + payment + warehouse (and the
fixed `gestorId`); constructs an `Order` with `id`, `state: 'creado'`, `totalUSD`,
`createdAt`; loads state, appends to `orders`, persists via `saveSeedState`; returns the
new order. Exact input shape and id strategy are for spec/design.

### New availability helper (new pure module)

Given `InventoryEntry[]` + cart lines (`{ productId, quantity }[]`) + `Warehouse[]`,
returns the warehouses where EVERY cart line's requested quantity ≤ that warehouse's
`InventoryEntry.quantity` for that product. Empty result ⇒ order cannot be created.
No side effects, no PRNG — pure and directly unit-testable.

## Where state lives

| State | Location |
|-------|----------|
| Current step (`carrito`/`cliente`/`almacen`) | Local `useState` in `PedidosNuevo` |
| Cart lines, client/delivery/payment fields, chosen warehouse | Local component state, lifted to the wizard container |
| Fixed gestor persona | Module constant (`gestor-1`) |
| Catalog (read) | `catalogProvider.getProducts()` |
| Inventory + warehouses (read for availability) | `loadSeedState()` |
| The created order (write) | Appended to persisted `SeedState.orders` via `createOrder` |

## Checklist (acceptance intent for downstream phases)

- [ ] `pedidos/nuevo` renders a 3-step wizard with a fixed gestor header.
- [ ] Carrito step: add/remove products, quantity stepper, live USD total, requires ≥1 line.
- [ ] Cliente step: name, phone, address, domicilio/recogida, forma de pago, ¿cambio?, observaciones.
- [ ] Almacén step: only full-cart-covering warehouses selectable; zero ⇒ creation blocked with a message.
- [ ] Confirm appends an `Order` in state `creado` (with `totalUSD`, no snapshot/MN/commission) to persisted `orders`.
- [ ] `Client`/`PaymentInfo` extended additively; Task 2 seed generator + tests still pass.
- [ ] Pure availability helper + `createOrder` are unit-tested; wizard tested via direct render.

## Risks

- **Domain type churn** — extending `Client`/`PaymentInfo` risks Task 2's frozen
  generator/determinism tests. Mitigation: additive-optional fields only; verify
  `generate.ts`'s `{ id, name }` / `{ method: 'efectivo' }` literals still typecheck.
- **Availability correctness** — must satisfy the golden rule exactly (per-warehouse,
  every line, requested qty ≤ available); zero-eligible must hard-block creation.
- **jsdom/RR7 AbortSignal gotcha** — no RR7 `<Form>`/`action`/loader-driven navigation
  even without extra routes; use a plain handler for confirm.
- **Commission at creation** — spec must confirm that `commissionMN`/`totalMN`/snapshot
  stay empty at `creado` (populated only from `verificado` onward). Live USD total is
  display-only; do not persist derived MN/commission yet.
- **Artifact-store consistency** — Tasks 1–2 history lives in `openspec/`; this change
  runs HYBRID (openspec + engram). Downstream phases should keep writing openspec files.

## Next step

Run `sdd-spec` and `sdd-design` in parallel (both read this proposal): spec formalizes
the acceptance criteria above; design details the `createOrder` input contract, the
availability module signature, and the wizard component decomposition.
