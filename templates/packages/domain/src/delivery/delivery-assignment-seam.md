# Delivery <-> Sales seam — two-way, two mechanisms (documented AND implemented)

`Delivery` (this change) and `Sales` (`order.service.ts` /
`prisma-order.repository.ts`) have a relationship that runs **both ways**,
and the two directions are implemented by **two different mechanisms on
purpose** (design.md §2, ADR-1). That asymmetry is what keeps the NestJS
module graph a DAG. Unlike `stock-reservation-seam.md`/`commission-seam.md`,
which document a seam left for a FUTURE module, this seam is fully
implemented today — this file exists so the half of it that is invisible in
the app layer stays discoverable.

## Why two mechanisms, not one

A single NestJS port in each direction would need `SalesModule` to import
`DeliveryModule` AND `DeliveryModule` to import `SalesModule` — a real
cycle, forcing `forwardRef` on both sides. Using one NestJS port per
direction only works if one direction uses a mechanism that never touches
NestJS's DI graph at all. Direction A (below) already needs a port — Delivery
must ASK Sales to run the one true delivery transition. Direction B is the
one that had to give up being a port.

## Direction A · Delivery -> Sales (drive the order to `delivered`)

A domain port + NestJS DI, mirroring `ICommissionAccrualRecorder` with the
import direction reversed:

- Port: `packages/domain/src/delivery/order-delivery-gateway.port.ts` —
  `IOrderDeliveryGateway`, token `ORDER_DELIVERY_GATEWAY`.
- Adapter: `apps/api-salesops/src/sales/order-delivery-gateway.adapter.ts` —
  lives in **Sales' own app folder** (Sales knows HOW), delegates to the
  existing `OrderService.deliver(orderId)` so commission accrual keeps
  firing through the one existing path.
- Wiring: `SalesModule` exports `ORDER_DELIVERY_GATEWAY`; `DeliveryModule`
  imports `SalesModule`.

(Adapter + wiring ship in Phase 6 — the port itself already exists from
Phase 1.)

## Direction B · Sales -> Delivery (close the open assignment)

**NOT** a NestJS port, and there is deliberately no DI token for it. An
infra-db transactional helper, invoked INSIDE
`PrismaOrderRepository.deliver`'s already-open `$transaction`:

```ts
// packages/infra-db/src/delivery/close-assignment-on-delivery.ts
export async function closeAssignmentOnDeliveryTx(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void>
```

It runs a guarded conditional `UPDATE ... WHERE order_id = $1 AND status =
'in_transit'`, exactly the same shape as `applyReservationTx`
(`packages/infra-db/src/inventory/apply-reservation.ts`) — which
`PrismaOrderRepository.deliver` already calls for the SAME reason: a write
that must be atomic with the order transition, expressed as a shared `*Tx`
helper living in the concept that owns the table being written, not a
second transaction and not an event.

**A transaction, not Commission's try/catch** (design.md ADR-2). Commission's
try/catch is right for Commission — accrual is an independently-true
financial fact with a (manual) recovery path. An assignment is not: "order
delivered but the carrier still has it" is not a meaningful state, `delivered`
is terminal so `deliver()` can never be retried to fix it, and a stranded
`in_transit` row would poison every capacity read forever (capacity is
computed live from exactly that field). If the close fails, the WHOLE
`deliver()` transaction rolls back — order stays `verified`, stock untouched,
assignment still `in_transit`, caller gets an error and can retry.

**0 rows affected is NOT an error.** Pickup orders never have an assignment
row; an assignment that was already closed produces a no-op re-application.
Never `findUniqueOrThrow` here — see the helper's own doc comment.

## Cost of the choice, and the three mitigations that pay for it

Direction B is invisible as a DI token — reading `OrderService.deliver` or
`PrismaOrderRepository.deliver`'s signature gives no hint that an assignment
gets closed. Three things compensate, and per design.md §2 they shipped in
the SAME commit as the helper, not "later":

1. The postcondition on `IOrderRepository.deliver`'s doc comment
   (`packages/domain/src/sales/order-repository.port.ts`).
2. This file.
3. An eslint boundary rule forbidding `apps/api-salesops/src/sales/**` from
   importing `../delivery/**` (`packages/eslint-config/backend-boundaries.config.js`,
   wired into `apps/api-salesops/eslint.config.mjs`) — a boundary documented
   only in a doc breaks on its own.

## Consequence: `markDelivered` is thin

Because Sales' `deliver()` closes the assignment for **every** door Delivery
never writes the assignment itself in `markDelivered` — it guards the
source status, calls the Direction-A gateway, and re-reads. One writer
(`closeAssignmentOnDeliveryTx`), one path, identical outcome whichever
endpoint drove the transition.

## Verification

- `packages/infra-db/src/delivery/close-assignment-on-delivery.spec.ts` — the
  helper in isolation (in_transit -> delivered, idempotent already-delivered,
  0-row no-assignment case).
- `packages/infra-db/src/sales/prisma-order.repository.spec.ts` — the
  wired, whole-transaction rollback case: a later failure inside `deliver()`
  undoes the assignment close too.
- `apps/api-salesops/test/order.e2e-spec.ts` — the D5 door: `POST
  /orders/:id/deliver` on a `delivery`-mode order with an `in_transit`
  assignment closes it in the same call.
- `rg -n "delivery" apps/api-salesops/src/sales/` (excluding this file's own
  mentions elsewhere) resolves to no import of `../delivery/**` — enforced
  by the eslint rule above, not just this sentence.
