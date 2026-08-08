# Delta for salesops-ventas (AMENDMENT, not append)

**Merge target**: `openspec/specs/salesops-ventas/spec.md` (promoted). This document AMENDS
that spec's "Order Delivery Mode" requirement in place — its reference to
`DeliveryAssignment.status` as a two-value enum is now false, `salesops-delivery`'s
promoted spec having gained a third `cancelled` state — and ADDS four requirements
covering concurrency, read-shape, and error-mechanism changes shipped alongside it. It does
not touch any other requirement in the promoted spec.

## MODIFIED Requirements

### Requirement: Order Delivery Mode

`Order` MUST carry a required `deliveryMode: 'pickup' | 'delivery'` field. Sales implements
exactly ONE fulfillment edge for `Order.status`, used by BOTH delivery modes: `verified →
delivered`, direct, with no intermediate state on `Order`. `OrderStatus` remains exactly 4
states (`created | verified | delivered | cancelled`) regardless of `deliveryMode`.

For `deliveryMode='delivery'` orders, the in-transit lifecycle between `verified` and
`delivered` is modelled entirely by `salesops-delivery`'s `DeliveryAssignment.status`
(`in_transit | delivered | cancelled`) — a SEPARATE record bridging the order to a carrier,
never a state or column on `Order` itself. Sales never models
`despachando`/`transportando` as an `Order` state; Delivery drives `Order.status` to
`delivered` by calling into Sales' own `OrderService.deliver()` through a port Delivery
declares (`IOrderDeliveryGateway`), which Sales implements — Sales remains the sole owner
of `Order.status` in every case.

(Historical footnote, carried forward unchanged from the `2026-08-07-delivery` amendment —
not touched by this amendment: "Previously: 'When `deliveryMode='delivery'`, fulfillment
continues through a FUTURE Delivery module (out of scope for this slice) that inserts
`verified → despachando → transportando → delivered`; Sales itself never models
`despachando`/`transportando` and only ever implements the direct `verified → delivered`
edge regardless of `deliveryMode`.' Superseded by `delivery`: the module is no longer
future/out of scope, and — critically — it does NOT insert `despachando`/`transportando`
into `Order` at all. That in-transit lifecycle lives exclusively on `DeliveryAssignment`, a
Delivery-owned record, never on `Order`.")

(Previously, in THIS amendment's scope — i.e. the one clause `delivery-hardening` changes:
the second paragraph's parenthetical read `(in_transit | delivered)`. That is now false:
`salesops-delivery`'s `delivery-hardening` amendment adds a third `cancelled` state to
`DeliveryAssignmentStatus`, set when the assignment's order is cancelled — the clause now
reads `(in_transit | delivered | cancelled)`. Nothing else in this requirement changes:
`Order.status`, its 4 states, and the gateway mechanism are all untouched, and the
historical footnote above is reproduced verbatim, not amended.)

#### Scenario: deliveryMode is required on creation

- GIVEN an order payload with no `deliveryMode`
- WHEN the order is created
- THEN the system MUST reject it with `InvalidOrderError`

#### Scenario: pickup orders transition directly to delivered

- GIVEN a `verified` order with `deliveryMode='pickup'`
- WHEN it is marked delivered
- THEN it transitions directly to `delivered`

#### Scenario: delivery orders use the same direct Sales edge, now with Delivery ships

- GIVEN a `verified` order with `deliveryMode='delivery'`
- WHEN it reaches `delivered`, whether via `POST /orders/:id/deliver` directly or via
  Delivery's `IOrderDeliveryGateway.markOrderDelivered` call after a `DeliveryAssignment`
  is marked delivered
- THEN `Order.status` transitions via the SAME direct `verified → delivered` edge Sales has
  always implemented — no `despachando`/`transportando` state exists on `Order`, ever, for
  either delivery mode

## ADDED Requirements

### Requirement: Sales Transitions Take a Row Lock Before Mutating

`OrderService.confirm()`, `OrderService.deliver()`, and `OrderService.cancel()` MUST each
take a `SELECT ... FOR UPDATE` row lock on the target order as the FIRST statement inside
their transaction, before any other read or write on that order.

This is a NEW, uniform concurrency contract applied identically to all three transitions,
chosen specifically to avoid a lock-ordering deadlock: if any two of the three transitions
were free to acquire locks in different relative orders, two concurrent callers could each
hold one lock while waiting on the other. Requiring "lock the order first, always,
regardless of which transition" on every one of them closes that window structurally
rather than by convention.

This lock is also the mechanism that makes `salesops-delivery`'s per-transition
`DeliveryAssignment` reconciliation (closing an open assignment on `deliver` or `cancel`)
atomic against a concurrent `POST /delivery/assignments`: assignment creation takes the
IDENTICAL `FOR UPDATE` lock on the order and re-validates its status before inserting, so
the two operations serialize rather than race.

#### Scenario: confirm locks the order first

- GIVEN a `created` order
- WHEN `OrderService.confirm()` runs
- THEN the row lock on that order is the first statement inside its transaction, before
  any rate-freeze write

#### Scenario: deliver locks the order first

- GIVEN a `verified` order
- WHEN `OrderService.deliver()` runs
- THEN the row lock on that order is the first statement inside its transaction, before
  any stock-consumption or assignment-closing write

#### Scenario: cancel locks the order first

- GIVEN a `created` or `verified` order
- WHEN `OrderService.cancel()` runs
- THEN the row lock on that order is the first statement inside its transaction, before
  any stock-release or assignment-closing write

#### Scenario: Concurrent transitions on the same order serialize instead of racing

- GIVEN two concurrent requests targeting the SAME order, each invoking one of
  `confirm`/`deliver`/`cancel`
- WHEN both run at once
- THEN one MUST wait for the other's transaction to commit or roll back before its own
  lock acquisition proceeds — no interleaved read-then-write race is possible

### Requirement: Delivery Reads Order Scope Through a Dedicated Projection, Not the Full Aggregate

`IOrderRepository` MUST expose `findScopeProjection(id: string): Promise<OrderScopeProjection
| null>`, returning only the handful of scalar fields (status, warehouseId, and the fields
needed to resolve delivery eligibility) required to answer "is this order eligible for /
does this order support a delivery action" — without loading `OrderLine`s, `OrderPayment`s,
or any other relation. `salesops-delivery`'s gateway adapter
(`order-delivery-gateway.adapter.ts`) MUST read order state through this projection, NOT
through `OrderService.findById()` or any path that hydrates the full `Order` aggregate.

This exists because the gateway's questions are narrow (a handful of scalars) while the
full aggregate load is not — pulling the whole `Order` with all its relations to answer a
narrow question is a wasted read repeated on every delivery-side check.

#### Scenario: findScopeProjection returns only scope-relevant fields

- GIVEN an existing order with lines, payments, and a delivery assignment
- WHEN `findScopeProjection(id)` is called for it
- THEN the result carries only the scope-relevant scalar fields — no `OrderLine`,
  `OrderPayment`, or other relation is loaded

#### Scenario: findScopeProjection returns null for an unknown order

- GIVEN an id that matches no `Order` row
- WHEN `findScopeProjection(id)` is called
- THEN it returns `null`

#### Scenario: The delivery gateway reads through the projection, not findById

- GIVEN `salesops-delivery`'s `IOrderDeliveryGateway` adapter resolving an order's state
- WHEN it needs to check that state
- THEN it calls `IOrderRepository.findScopeProjection`, never `OrderService.findById()` or
  an equivalent full-aggregate load

### Requirement: Cancel Tolerates an Un-Migrated Tenant When No Assignment Needs Closing

`POST /orders/:id/cancel` MUST NOT fail with `500` on a tenant whose schema has not yet
received the `DeliveryAssignmentStatus.cancelled` enum value (via
`node scripts/tenant-migrate.ts`), for any order that has no matching `in_transit`
`DeliveryAssignment` row to close — which includes every pickup order, every unassigned
delivery order, and every delivery order whose assignment was already closed.

Mechanism: the assignment-closing statement inside `cancel()`'s transaction casts the
target status through a bind parameter (`${'cancelled'}::text::"DeliveryAssignmentStatus"`)
rather than a literal enum cast. Postgres resolves a literal enum cast at PLAN time — which
raised `invalid input value for enum` on an un-migrated tenant regardless of whether any
row matched the `WHERE` clause, turning `cancel` into a `500` for EVERY order in that
tenant, delivery-related or not. A bind-parameter cast goes through `enum_in`, which the
planner cannot constant-fold, so the coercion only happens per matched row; with zero
matching rows it is never evaluated at all.

A tenant that is BOTH un-migrated AND genuinely holds an open assignment for the order
being cancelled still fails — there is no honest way to close that row without the enum
value existing. That residual case is exactly what `salesops-tenancy`'s boot-time schema
currency gate exists to turn into a deploy-time failure instead of a runtime surprise.

#### Scenario: Cancelling a pickup order succeeds on an un-migrated tenant

- GIVEN a tenant schema whose `DeliveryAssignmentStatus` enum has not yet received the
  `cancelled` value, and a `verified` pickup order (which never has an assignment)
- WHEN the order is cancelled
- THEN it succeeds — no `500` occurs

#### Scenario: Cancelling an unassigned delivery order succeeds on an un-migrated tenant

- GIVEN the same un-migrated tenant, and a `verified` delivery-mode order with no
  `DeliveryAssignment`
- WHEN the order is cancelled
- THEN it succeeds

#### Scenario: Cancelling an order with a genuinely open assignment still fails on an un-migrated tenant

- GIVEN the same un-migrated tenant, and a `verified` delivery-mode order that DOES have an
  `in_transit` `DeliveryAssignment`
- WHEN the order is cancelled
- THEN the cancellation fails — the enum value genuinely does not exist, and this is the
  residual case the boot-time schema currency gate is meant to prevent from ever being
  reached in production

### Requirement: Order Actions Enforce Warehouse Scope via the Shared Domain Error

`OrderController`'s warehouse-scope denial (a scoped `warehouse_operator` acting on an
order outside their own warehouse) MUST throw the SAME domain `WarehouseScopeViolationError`
(`packages/domain/src/users/errors.ts`) that `salesops-delivery`'s `CarrierController` and
`DeliveryAssignmentController` use, mapped to `403` by the controller rather than thrown as
a NestJS exception from deeper in the call stack. Observable behavior (status code,
"solely scoped" semantics) is UNCHANGED from before this amendment; what changes is that
the check is now the single shared assertion (`assertWarehouseScope`) rather than a
copy local to `OrderController`.

This matters beyond tidiness: `POST /orders/:id/deliver` and `POST
/delivery/assignments/:id/deliver` drive the exact SAME `Order.status` transition,
consuming the same stock and firing the same commission accrual. A warehouse-scope rule
duplicated across both doors, with only one copy updated when the rule is later widened or
narrowed, is not a narrower grant on the other door — it is a bypass. Sharing one
assertion closes that drift risk structurally.

#### Scenario: A scoped warehouse_operator acting outside their warehouse is denied via the shared error

- GIVEN a caller whose only role is `warehouse_operator`, scoped to warehouse `W1`, and an
  order belonging to warehouse `W2`
- WHEN they call `POST /orders/:id/confirm`, `/deliver`, or `/cancel` for that order
- THEN the request is denied with `403`, raised from the SAME `WarehouseScopeViolationError`
  that `salesops-delivery`'s controllers use

#### Scenario: The two deliver doors enforce identical warehouse scope

- GIVEN a caller whose only role is `warehouse_operator`, scoped to warehouse `W1`, and a
  `verified` delivery-mode order in `W2` with an `in_transit` assignment
- WHEN they call `POST /orders/:id/deliver` directly, and separately when they call
  `POST /delivery/assignments/:id/deliver` for the same order's assignment
- THEN BOTH are denied with `403` — neither door grants access the other denies
