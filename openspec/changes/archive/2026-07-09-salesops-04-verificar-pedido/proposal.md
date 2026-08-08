# Proposal — Pantalla 2: Operador de gestores verifica pedidos (salesops-04-verificar-pedido)

Add the second interactive screen of the Sales Ops cockpit: a read-only kanban board
(no drag & drop) of ALL orders across the 5 lifecycle columns, plus the two operator
actions that advance an order — **Aceptar** (`creado → verificado`, freezing the
exchange rate and computing the MN/commission totals) and **Marcar comisión pagada**
(`entregado → comision_pagada`). It replaces the `operador-gestores` placeholder and
gives the demo its first order state transitions. Frontend-only, localStorage-backed.

## Intent

| Question | Answer |
|----------|--------|
| What problem | Task 3 can create orders in `creado`, but nothing can advance them. There is no verify path, so the rate is never frozen and `totalMN`/`commissionMN` never get computed for user-created orders. The operador de gestores has no screen. |
| Why now | Task 4 of the MVP. Verification is the pivot of the whole lifecycle: it is where the rate freezes (plan §72, §94). Pantalla 3 (almacén) has nothing to act on until orders reach `verificado`. |
| Success looks like | The operador opens the board, sees every order laid out in 5 columns by state, **Revisa** a `creado` order (all data + gestor contact + informational warehouse availability), clicks **Aceptar** → the order moves to `verificado` with the current rate frozen into `exchangeRateSnapshot` and `totalMN`/`commissionMN` stuck on. An `entregado` order can be marked `comision_pagada`. Frozen totals never recompute afterward. |

## Scope

### In scope (Task 4 only)
- Replace the `operador-gestores` placeholder with a kanban board: 5 columns
  (`creado → verificado → transportando → entregado → comision_pagada`), all orders shown.
- **Revisar** a `creado` order: review view showing items, client/delivery/payment,
  gestor contact (name + phone), and warehouse availability (INFORMATIONAL re-display only).
- **Aceptar** action → `verifyOrder(id)`: `creado → verificado`, freezes current
  `SeedState.exchangeRates.usdToMn` into `exchangeRateSnapshot`, sets `totalMN` and
  `commissionMN` (reusing `sumOrderCommission`), stamps `verifiedAt`.
- **Marcar comisión pagada** action → `markCommissionPaid(id)`: `entregado → comision_pagada`,
  stamps `commissionPaidAt`. Never touches frozen rate/totals.
- New store write APIs `verifyOrder` / `markCommissionPaid` (over a shared private
  read-modify-write helper), matching the `createOrder` precedent.
- Additive `Gestor.phone?` field + phone literals on `GESTORES` (needed for Revisar contact).
- New PURE domain helper to build the verified totals from an order + current rate.
- Tests: verify helper (unit), store APIs (state transition + freeze immutability),
  board/review components (direct render, no RR7 nav).

### Out of scope
- `verificado → transportando → entregado` transitions (Pantalla 3 / later task) — the
  board DISPLAYS those columns read-only but performs NO such transition here.
- **Any inventory mutation.** Aceptar does NOT decrement or reserve stock; availability at
  verify time is purely informational (engram decision #780). This is a flow demo, not a WMS.
- Rate editing (Pantalla 4), inventory dashboard (Pantalla 5), finance dashboards.
- Auth / operator selector (no session identity anywhere in the app).
- RR7 nested routes / URL-per-column / loaders / actions.

## Approach and rationale (locked decisions)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Board shape | Single flat route + local `useState` (selected order for Revisar) | Matches existing flat registration; sidesteps the jsdom+undici `AbortSignal` gotcha; testable with plain `render()` + `fireEvent`. NO drag & drop (plan §90). |
| Verify write path | `verifyOrder(id, now?)` in `seed-store.ts` over a shared private read-modify-write helper | No transition API exists today. Load → find order → apply transition + freeze → persist. Mirrors `createOrder`. |
| Rate freeze | On `creado → verificado`: snapshot `exchangeRates.usdToMn`, `commissionMN = sumOrderCommission(items)`, `totalMN = round(totalUSD * snapshot)` | Reuses the seed's own precedent (`generate.ts:181-187`) so seeded and user-verified orders are computed identically. |
| Freeze immutability | Once set, NO code path recomputes/mutates `exchangeRateSnapshot`/`totalMN`/`commissionMN` | Hard rule from plan §111 (editing rates must not recalc verified orders). `markCommissionPaid` only stamps a date. |
| Inventory at verify | Informational re-display, never mutated | Engram decision #780 — MVP flow-first; avoids the "insufficient stock at verify" edge case. |
| Gestor contact | Additive OPTIONAL `Gestor.phone?` + literals on `GESTORES` | Same additive pattern as Task 3's `Client` extension; keeps Task 2's frozen seed/tests valid. |
| Verify calc | New PURE helper (e.g. `domain/verify.ts`) | Extract freeze math as unit-testable pure fn; precedent `eligibleWarehouses`, `cartTotalUSD`. |
| Action result | In-place re-render of the board | Zero router involvement → fully render-testable; re-avoids the gotcha. |

### Additive type change (`domain/types.ts`)

```
Gestor { id, name, phone?: string }   // NEW — optional, keeps GESTORES literals valid
```

`Order` already carries `exchangeRateSnapshot`, `totalMN`, `commissionMN`, `verifiedAt`,
`commissionPaidAt` — no new `Order` fields needed.

### New store APIs (`store/seed-store.ts`)

- `verifyOrder(id, now?)`: guards `state === 'creado'`; freezes rate + computes totals;
  sets `state='verificado'`, `verifiedAt=now`. Returns the updated order.
- `markCommissionPaid(id, now?)`: guards `state === 'entregado'`; sets
  `state='comision_pagada'`, `commissionPaidAt=now`. Never touches frozen fields.
- Both over a shared private `updateOrder(id, mutator)` read-modify-write helper.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/domain/types.ts` | Modified | Additive optional `Gestor.phone` |
| `app/seed/constants.ts` | Modified | Phone literals on `GESTORES` |
| `app/domain/verify.ts` | New | Pure verify-totals helper |
| `app/store/seed-store.ts` | Modified | `verifyOrder`, `markCommissionPaid`, shared update helper |
| `app/routes/operador-gestores.tsx` | Modified | Replace placeholder with kanban board + Revisar |
| `app/components/tablero/*` | New | Board / column / card / review presentational components |

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `salesops-mvp`: adds the Pantalla 2 verification requirement — the kanban board, the
  `creado → verificado` rate-freeze transition, and the `entregado → comision_pagada`
  transition, plus the additive `Gestor.phone` contract.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Frozen totals accidentally recomputed by a later path (rate edit, mark-paid) | High | Freeze ONLY in `verifyOrder`; `markCommissionPaid` and future rate edits must never touch snapshot/totalMN/commissionMN. Add a store test asserting immutability after a subsequent action. |
| Additive `Gestor.phone` breaks Task 2's frozen seed/determinism | Med | Optional field only; verify `GESTORES` literals + `generate.ts` still typecheck and seed tests still pass. |
| jsdom/RR7 `AbortSignal` gotcha | Med | No RR7 `<Form>`/action/loader nav; plain `onClick`, in-place re-render. |
| Transition guards mis-scoped (e.g. verifying a non-`creado` order) | Med | `verifyOrder` guards `creado`; `markCommissionPaid` guards `entregado`; board only surfaces the action on the matching column. |
| Doing too much — creeping into Pantalla 3 transitions | Low | Explicitly out of scope; board shows those columns read-only. |

## Rollback Plan

Revert the change folder's commits. Additive `Gestor.phone` is optional so nothing else
breaks; `VERSION` unchanged; user orders live in the same localStorage key and are
discarded by `resetDemo()`. Removing the new store APIs and restoring the placeholder
route fully reverts behavior.

## Dependencies

- Task 3 (`createOrder`, `cartTotalUSD`, additive-field pattern) — archived/merged.
- Task 2 seed (`sumOrderCommission`, `GESTORES`, `exchangeRates`) — frozen; extend additively only.

## Success Criteria

- [ ] `operador-gestores` renders a 5-column kanban board (no drag & drop) with ALL orders.
- [ ] Revisar a `creado` order shows items, client/delivery/payment, gestor name + phone,
      and warehouse availability (informational, no stock mutation).
- [ ] Aceptar moves `creado → verificado`, freezes `exchangeRateSnapshot` from current rate,
      sets `totalMN` and `commissionMN` (via `sumOrderCommission`), stamps `verifiedAt`.
- [ ] A subsequent action never recomputes/mutates the frozen rate/totalMN/commissionMN.
- [ ] Marcar comisión pagada moves `entregado → comision_pagada`, stamps `commissionPaidAt`.
- [ ] `Gestor.phone` added additively; Task 2 seed generator + tests still pass.
- [ ] Pure verify helper + `verifyOrder`/`markCommissionPaid` unit-tested; board tested via
      direct render (no RR7 navigation).

## Next step

Run `sdd-spec` and `sdd-design` in parallel (both read this proposal): spec formalizes the
acceptance criteria as scenarios (transitions, freeze, guards); design details the
`verifyOrder`/`markCommissionPaid` contracts, the shared update helper, the pure verify
signature, and the board component decomposition.
