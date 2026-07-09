# Proposal — salesops-05-operador-almacen (Pantalla 3: Operador de almacén)

Give the warehouse operator a working screen that moves an order through the two
transitions the domain model already reserves but nobody drives yet:
`verificado → transportando` (assign a carrier) and `transportando → entregado`
(mark delivered). This closes the middle of the order lifecycle between Task 4's
gestor acceptance and its final commission payout, using the board, container,
and `updateOrder` patterns those earlier tasks already established.

## Why now

- Task 3 (crear-pedido) and Task 4 (operador-gestores) are archived. The domain
  model, seed data, and the private `updateOrder` transition helper are all
  already in place — there are **no blocking unknowns**.
- `OrderState` already defines `transportando`/`entregado`; `Order` already
  carries `transportistaId?`, `transportingAt?`, `deliveredAt?`; the seed
  generator already assigns carriers and stamps timestamps for orders that
  reached `transportando`+. Everything is wired except the operator-facing
  transitions and screen.
- `/operador-almacen` is still a `PlaceholderScreen`. It is the only lifecycle
  stage with no interactive owner.

## What success looks like

- A warehouse operator opens `/operador-almacen`, picks which warehouse they are,
  and sees only that warehouse's orders on the shared kanban.
- On a `verificado` order they choose a carrier from a picker and confirm →
  order becomes `transportando`, `transportingAt` stamped, `transportistaId` set.
- On a `transportando` order they mark it delivered → order becomes `entregado`,
  `deliveredAt` stamped. That `entregado` order then becomes actionable for
  Task 4's "Marcar comisión pagada" — the lifecycle joins up end to end.
- Task 2/3/4's frozen tests stay green; the two new transitions never touch
  `exchangeRateSnapshot` / `totalMN` / `commissionMN`.

## Scope

### In scope

- Two new store transitions over the existing private `updateOrder` helper:
  - `assignTransportista(orderId, transportistaId)` — guard `state === 'verificado'`,
    set `transportistaId`, `state = 'transportando'`, stamp `transportingAt`.
  - `markDelivered(orderId)` — guard `state === 'transportando'`,
    `state = 'entregado'`, stamp `deliveredAt`.
- Replace the `operador-almacen.tsx` placeholder with a board↔detail container
  mirroring `operador-gestores.tsx` (direct render, `useState` only).
- An in-screen warehouse-identity selector that filters the board to one warehouse.
- A transportista picker (radio-fieldset) in a detail view for the assign action.
- Extend the shared `components/tablero/*` with strictly additive, optional
  per-state action props + a `visibleStates` prop.
- Additively enrich `Transportista` with `phone?` / `zona?` and seed them.

### Out of scope

- Real authentication, roles, or a persisted "current warehouse" — identity stays
  simulated in-screen, consistent with plan §56.
- Any change to Task 4's actions (`Revisar`/`Aceptar`, `Marcar comisión pagada`)
  or to the `creado → verificado` / `entregado → comision_pagada` transitions.
- Recomputing or mutating the frozen financial fields.
- Inventory decrement, carrier capacity/`entregas activas` logic, delivery
  scheduling, or notifications — not required for this lifecycle step.
- A new route, nav entry, or `:warehouseId` URL param — the route and sidebar
  entry already exist and the heading test already passes.

## Locked decisions (ADR-style)

Mirrors Task 4's design decision-table format: decision + rationale + rejected.

### D1 — Board reuse: EXTEND the shared components (not fork, not generalize)

| | |
|---|---|
| **Decision** | Add optional, per-state action props (`onAsignarTransportista?`, `onMarcarEntregado?`) to `OrderCard`/`OrderColumn`/`KanbanBoard`, each rendered only when `state === X && callback`; add a `visibleStates?: OrderState[]` prop to `KanbanBoard` defaulting to all 5 states. |
| **Rationale** | Honors the plan's explicit "mismo tablero" framing, keeps one presentational source of truth, and is strictly additive: Pantalla 2 passes none of the new props and its `visibleStates` default is unchanged, so every existing Task-4 assertion stays valid by construction. New behavior is covered by **new** test cases, not rewrites. |
| **Rejected — Fork parallel Almacén components** | Zero regression risk and cleanest PR boundary, but ~80% markup duplication, violates DRY and the "mismo tablero" wording, and creates two places to maintain column styling. |
| **Rejected — Data-driven `actionsByState` registry** | Most scalable long-term, but a breaking change to the public prop contract that forces rewriting every Task-4 board test — highest regression risk for a change scoped to one screen. |

### D2 — Transportista assignment: PICKER-then-confirm (not one-click auto)

| | |
|---|---|
| **Decision** | "Asignar transportista" on a `verificado` card opens a detail view (analogous to `OrderReview`) containing a radio-fieldset of the seeded carriers (`warehouse-step.tsx` convention); confirming calls `assignTransportista(orderId, transportistaId)`. |
| **Rationale** | The store transition needs a `transportistaId` argument either way; a deliberate human choice is a stronger sales-demo moment and matches "Operador de almacén" as an intentional actor. Reuses the container-owned board↔detail `useState` swap already proven in Task 4. |
| **Rejected — One-click auto-assign** | Lower effort (round-robin/first-available), but the operator never chooses a carrier — weaker demo and no reuse of the established picker convention. |

### D3 — Warehouse identity: IN-SCREEN selector (not fixed `WAREHOUSES[0]`)

| | |
|---|---|
| **Decision** | A radio-fieldset warehouse selector at the top of `operador-almacen.tsx` backed by local `useState<string>` defaulting to `WAREHOUSES[0].id`; the board filters orders by the selected `warehouseId`. |
| **Rationale** | Cheap, and extends the codebase's own "role simulated via UI navigation, not login" philosophy one level down (identity-within-screen picked via a local control). It materially enables the core demo of Pantalla 3 — warehouse-scoped filtering — letting a presenter show "as Almacén Este I only see my orders." No auth, no persistence, no new route. |
| **Rejected — Fixed `WAREHOUSES[0]`** | Zero UI, fastest, but the demo can never show scoped filtering working for the other warehouses — which is the entire point of this screen. |

### D4 — Enrich `Transportista` with `phone?` / `zona?` NOW (additive-optional)

| | |
|---|---|
| **Decision** | Add optional `phone?` and `zona?` fields to the `Transportista` type and seed them for the 3 carriers. |
| **Rationale** | Follows Task 4's `Gestor.phone` additive-optional precedent; makes the D2 picker a more convincing choice UI (carrier + zona). Being optional, it carries zero regression risk to existing fixtures or tests. Bundled with D2 because the picker is what consumes the richer data. |
| **Rejected — Defer enrichment** | Keeps the diff smaller, but leaves the picker showing bare names and would require a second additive pass later for no real saving. |

## Affected areas

| File | Change |
|---|---|
| `app/routes/operador-almacen.tsx` | Replace placeholder with the board↔detail container (mirrors `operador-gestores.tsx`): warehouse selector + filtered kanban + carrier-picker detail. |
| `app/store/seed-store.ts` | Add `assignTransportista` and `markDelivered` over the existing private `updateOrder` helper. |
| `app/components/tablero/kanban-board.tsx` | Add optional per-state action props + `visibleStates?: OrderState[]` (default = all 5). |
| `app/components/tablero/order-column.tsx` | Thread the new optional props through. |
| `app/components/tablero/order-card.tsx` | Render "Asignar transportista" on `verificado`, "Marcar entregado" on `transportando`, each guarded by state + callback. |
| `app/components/tablero/*` (new sibling detail) | Carrier-picker detail view for the assign action (radio-fieldset), analogous to `order-review.tsx`. |
| `app/domain/types.ts` | Add `phone?` / `zona?` to `Transportista` (D4). |
| `app/seed/constants.ts` | Seed `phone`/`zona` for `TRANSPORTISTAS`. |
| `app/routes/__tests__/routes.test.tsx` | No change expected — heading `/operador de almacén/i` must stay green. |

## Risks

- **Frozen-field immutability** — `assignTransportista`/`markDelivered` MUST NOT
  touch `exchangeRateSnapshot` / `totalMN` / `commissionMN`. Carry forward Task 4's
  immutability regression-test pattern for both new transitions.
- **Test-suite coupling** — the two most fragile existing assertions are
  `kanban-board.test.tsx` (exactly-5-columns) and `order-card.test.tsx`
  (no button on `transportando`). D1's default/optional-prop discipline is what
  keeps them valid; verify they stay green without edits.
- **AbortSignal gotcha (jsdom+undici)** — the container must keep the direct-render,
  `useState`-only, no-`<Form>`/no-loader/no-`useNavigate` pattern of
  `operador-gestores.tsx`; container tests `render(<Component/>)` directly.
- **Routes heading regression** — keep the `/operador de almacén/i` heading intact
  in the new container so `routes.test.tsx` stays green.
- **State-guard correctness** — the almacén board acts on `verificado` and
  `transportando`; guards must reject out-of-state calls exactly like `verifyOrder`.

## Testability note (for apply/verify — strict TDD is active)

- Store transitions are pure read-modify-write over `updateOrder`; test happy path,
  wrong-state guard rejection, and frozen-field immutability for each.
- Board extensions are covered by new card/column cases without rewriting Task-4 tests.
- Container test renders the component directly and asserts the warehouse filter,
  the picker confirm path, and the two view swaps.

## Next step

Proceed to `sdd-spec` (requirements/scenarios) and `sdd-design` (component/store
shapes) — they can run in parallel from this locked proposal.
