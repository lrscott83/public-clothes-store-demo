# Tasks: Pantalla 1 — Gestor crea pedido (salesops-03-crear-pedido, Task 3)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700-900 (2 new pure modules + createOrder + 3 step components + container rewrite, all with tests) |
| 400-line budget risk | High |
| Chained PRs recommended | No — session delivery is direct commit to `salesops-mvp`, no PR, no size limit |
| Suggested split | Single delivery (no PR flow this session) |
| Delivery strategy | direct-commit (no-PR) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Domain foundation + pure helpers (Phases 1-3) | No UI; safe to land first |
| 2 | Store write API `createOrder` (Phase 4) | Depends on Unit 1 (`cartTotalUSD`) |
| 3 | Wizard step components + container wiring (Phases 5-6) | Depends on Units 1-2 |

All units land in one direct commit this session per delivery instructions; split shown only for internal sequencing.

## Phase 1: Domain Foundation

- [x] 1.1 Edit `app/domain/types.ts`: add optional `phone?`, `address?`, `deliveryMode?: 'domicilio' | 'recogida'` to `Client`; add optional `needsChange?: boolean` to `PaymentInfo`.
- [x] 1.2 Run `app/seed/__tests__/*` and `app/store/__tests__/seed-store.test.ts` (Task 2's determinism/seed suites) — confirm all green, unaffected by the additive edit.

## Phase 2: `eligibleWarehouses` (pure)

- [x] 2.1 RED — create `app/domain/__tests__/availability.test.ts`: exact-cover eligible, insufficient-qty excluded, missing-inventory-entry excluded, zero-eligible, multi-line requires every line covered. Run vitest, confirm failing (module missing).
- [x] 2.2 GREEN — create `app/domain/availability.ts` exporting `CartLine` and `eligibleWarehouses(cart, inventory, warehouses)` per the coverage rule; tests pass.

## Phase 3: `cartTotalUSD` (pure)

- [x] 3.1 RED — create `app/domain/__tests__/cart.test.ts`: `sum(priceUSD * quantity)` across lines; empty cart → 0.
- [x] 3.2 GREEN — create `app/domain/cart.ts` exporting `cartTotalUSD`.

## Phase 4: `createOrder` store API

- [x] 4.1 RED — extend `app/store/__tests__/seed-store.test.ts`: appends `Order` with `state: 'creado'`; `totalUSD = cartTotalUSD(items)`; `createdAt` from injected `now`; `commissionMN`/`totalMN`/`exchangeRateSnapshot` all `undefined`; id `order-user-${n}` unique/increments; order survives `loadSeedState` reload; `resetDemo` discards it.
- [x] 4.2 GREEN — implement `CreateOrderInput` + `createOrder(input, now = new Date())` in `app/store/seed-store.ts`: `loadSeedState` → count existing `order-user-*` → push new `Order` → `saveSeedState` → return.

## Phase 5: Wizard step components (presentational, render-tested directly)

- [x] 5.1 RED — `app/components/pedido/__tests__/cart-step.test.tsx`: render `<CartStep/>` directly with catalog/cart/onChange props; assert add/remove/qty-change call handlers, live total display, "Siguiente" disabled when cart empty.
- [x] 5.2 GREEN — create `app/components/pedido/cart-step.tsx`.
- [x] 5.3 RED — `app/components/pedido/__tests__/client-step.test.tsx`: address field visible+required only when `deliveryMode === 'domicilio'`; "Siguiente" disabled unless `name && phone && (mode !== 'domicilio' || address)`.
- [x] 5.4 GREEN — create `app/components/pedido/client-step.tsx`.
- [x] 5.5 RED — `app/components/pedido/__tests__/warehouse-step.test.tsx`: only eligible warehouses selectable; zero-eligible → block message + "Confirmar" disabled.
- [x] 5.6 GREEN — create `app/components/pedido/warehouse-step.tsx`.

Component tests render step components directly with props/fireEvent — no `<Form>`/action/loader navigation, avoiding the jsdom+undici RR7 `AbortSignal` gotcha.

## Phase 6: Wizard container wiring + confirm/success + regression

- [x] 6.1 RED — create `app/routes/__tests__/pedidos-nuevo.test.tsx`: `render(<PedidosNuevo/>)` directly (no router stub needed, sidesteps the nav gotcha); drive carrito→cliente→almacen via `fireEvent`, assert the spec's blocking scenarios, assert confirm calls `createOrder` and renders the in-place success view (no `useNavigate`).
- [x] 6.2 GREEN — rewrite `app/routes/pedidos-nuevo.tsx` as container: `useState` for `step | cart | client | payment | warehouseId | created`; fixed gestor header (`GESTORES[0]`); recompute `eligibleWarehouses` on entering almacén; confirm maps cart → `OrderItem` via `SeededProduct` price/commission, calls `createOrder`, renders success view in place.
- [x] 6.3 Verify `app/routes/__tests__/routes.test.tsx` still passes (`/nuevo pedido/i` heading on initial carrito step) and `app/components/__tests__/sidebar.test.tsx` is unaffected — the `/pedidos/nuevo` nav item already exists in `sidebar.tsx`, no sidebar change needed.
- [x] 6.4 Run the full `salesops-mvp` vitest suite — confirm all green, including Task 2's seed/determinism suite (regression per 1.2).
