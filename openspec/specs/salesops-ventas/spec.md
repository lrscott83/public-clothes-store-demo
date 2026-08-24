# Spec — salesops-ventas

## Purpose

Define the testable contract for the `salesops-ventas` capability: a backend vertical slice providing an Order aggregate root with multi-currency and split-payment semantics, inventory reserve/release stock bridge, order status lifecycle with rate/total freeze at verification, and HTTP endpoints for order creation/verification/delivery — all persisted behind hexagonal repository ports and exposed as JSON endpoints with decimal-safe Money amounts.

## Requirements

### Requirement: Order Aggregate Root

The system MUST persist an `Order` aggregate root referencing `Customer`/`Warehouse` by id
plus a `customerName` snapshot. `Order.currency` MUST be DERIVED, never selected:

| Field | Type | Rule |
|---|---|---|
| id | UUID | PK |
| customerId + customerName | FK + snapshot | required |
| warehouseId | FK | required |
| deliveryMode | `pickup \| delivery` | required — see Order Delivery Mode requirement |
| currency | `USD \| MN` | derived: any line native `price.currency === USD` → `USD`, else `MN`. EUR never becomes order currency |
| status | `created \| verified \| delivered \| cancelled` | see lifecycle requirement |
| subtotal/discountTotal/total | Money, order currency | derived from `OrderLine`s, never stored input |
| orderDate | Date | required |
| active | boolean | soft-delete, default `true` |
| createdAt/updatedAt | datetime | audit |

#### Scenario: Any USD line forces order currency to USD

- GIVEN an order with one MN line and one USD line
- WHEN the order is created
- THEN `Order.currency` is `USD`

#### Scenario: All-MN/EUR lines derive MN

- GIVEN an order with only MN and EUR lines (no USD line)
- WHEN the order is created
- THEN `Order.currency` is `MN`

#### Scenario: Totals are derived, not accepted as input

- GIVEN an order payload carrying an explicit `total`
- WHEN the order is created
- THEN the system MUST ignore any supplied total and recompute it from `OrderLine`s

#### Scenario: Soft-delete never removes the row

- GIVEN an existing `Order`
- WHEN it is deleted
- THEN `active` flips to `false` and the row, its `OrderLine`s, `OrderPayment`s, and
  `SaleCredit` remain retrievable

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

### Requirement: Order Status Lifecycle with Freeze at Verified

`OrderStatus` MUST be exactly 4 states: `created | verified | delivered | cancelled`.
Sales-owned transitions: `created → verified` (FREEZES rate + totals — `channel`,
`rateApplied`, `effectiveFrom`, and resulting Money are stamped onto every
`OrderLine`/`OrderPayment` and never recomputed after a later rate append),
`verified → delivered` (direct — `pickup`, see Order Delivery Mode
requirement), and `cancelled` reachable ONLY from `created` or `verified`. `delivered` is
TERMINAL: no further transition (cancel, re-verify, or anything else) is valid once an
order reaches it.

Note (boundary, not implemented in this slice): commission is NOT an Order concern. Sales
freezes ONLY `rate + totals` at `verified`; commission accrual is a separate future
Gestores-module entity with its own `creada → pagada` lifecycle, not an order field or
status.

#### Scenario: created to verified freezes rate and totals

- GIVEN a `created` order
- WHEN it transitions to `verified`
- THEN `channel`, `rateApplied`, `effectiveFrom`, and resulting Money are stamped onto
  every `OrderLine`/`OrderPayment` and a later rate append MUST NOT change them

#### Scenario: verified to delivered direct transition

- GIVEN a `verified` order
- WHEN it is marked delivered
- THEN it transitions directly to `delivered` with no intermediate state

#### Scenario: cancel succeeds from created

- GIVEN an order in `created`
- WHEN it is cancelled
- THEN the status becomes `cancelled`

#### Scenario: cancel succeeds from verified

- GIVEN an order in `verified`
- WHEN it is cancelled
- THEN the status becomes `cancelled`

#### Scenario: delivered is terminal

- GIVEN an order in `delivered`
- WHEN any transition is attempted
- THEN the system MUST reject it — `delivered` has no outgoing transition

#### Scenario: cancel after delivered rejected

- GIVEN an order in `delivered`
- WHEN a cancel is attempted
- THEN the system MUST reject it with `InvalidOrderError` — cancellation is only valid
  from `created` or `verified`

#### Scenario: double-verify rejected

- GIVEN an order already in `verified`
- WHEN a transition to `verified` is attempted again
- THEN the system MUST reject it with `InvalidOrderError` — `verified` is reachable
  only from `created`

### Requirement: OrderLine Price Snapshot and Recompute

Each `OrderLine` (owned by `Order`) MUST snapshot pricing at creation time and recompute
`unitFinalPrice` via the existing `product/pricing.ts` `finalPrice` formula:

| Field | Type |
|---|---|
| productId, productName, categoryName | FK + snapshot |
| price | Money, product-native currency |
| percentDiscountPrice, discountPrice | bigint scale-2 snapshot |
| quantity | integer > 0 |
| unitFinalPrice | Money, `max(0, price − pctDiscount − discountPrice)` |
| lineTotalNative | Money, native currency |
| rateApplied (scale-6) + rateEffectiveFrom | snapshot |
| lineTotalOrder | Money, `Order.currency`, frozen at `verified` |

#### Scenario: unitFinalPrice recomputed via pricing.ts

- GIVEN a line with `price=100`, `percentDiscountPrice=20%`, `discountPrice=5`
- WHEN the line is priced
- THEN `unitFinalPrice` is `75` per `finalPrice`, never a stored raw discount

#### Scenario: lineTotalOrder frozen after verified

- GIVEN a `verified` line with `lineTotalOrder` computed at a given rate
- WHEN a later rate is appended
- THEN `lineTotalOrder` MUST NOT be recomputed

### Requirement: OrderPayment Split Multi-Channel Collection

`OrderPayment` MUST be a collection (0..N per order). Each entry carries `channel`,
`amount` in `CHANNEL_CURRENCY[channel]`, a frozen `rateApplied`+`effectiveFrom`, and derived
`amountInOrderCurrency`. Invariant: `Σ amountInOrderCurrency === Order.total`.

#### Scenario: Split payment across two channels sums to total

- GIVEN an order with `total=100 USD` paid via `ZELLE=60` and `MN_CASH` equivalent `40`
- WHEN payments are recorded
- THEN `Σ amountInOrderCurrency === Order.total`

#### Scenario: Payment sum mismatch rejected

- GIVEN payments whose `Σ amountInOrderCurrency` is less than `Order.total`
- WHEN the order is verified (`verified`)
- THEN the system MUST reject it with `InvalidOrderError`

### Requirement: SaleCredit for Credit-Only Sales

`SaleCredit` (0..1 per order, credit sales only) MUST reference `orderId` and `customerId`
as foreign keys — NEVER a free-text `client: string`. `total`/`paid` are Money in
`Order.currency`; `isPaid` is derived `paid >= total`; rates are frozen.

**Deferred this slice — credit-only order creation:** the `SaleCredit` entity shape
(FKs, `isPaid`) IS delivered, but CREATING an order that is *fully* on credit (a
`SaleCredit` with no balancing upfront payment) is NOT supported this slice. `createOrder`
enforces `Σ payment amountInOrderCurrency === total` unconditionally, so a credit-only
order (`total > 0`, empty payments) raises `InvalidOrderError`. Enabling the credit-only
path (relaxing the payment-sum invariant so `SaleCredit` covers the unpaid remainder) is
deferred — the entity is ready, the aggregate invariant is not yet loosened for it.

#### Scenario: SaleCredit references customerId, not free text

- GIVEN a credit sale
- WHEN `SaleCredit` is created
- THEN it carries `orderId` + `customerId` as FKs — no `client: string` field exists

#### Scenario: isPaid derived from paid vs total

- GIVEN a `SaleCredit` with `paid < total`
- WHEN inspected
- THEN `isPaid` is `false`; once `paid >= total`, `isPaid` becomes `true`

#### Scenario: Credit-only order creation is deferred this slice

- GIVEN an order with `total > 0` and no upfront payments (fully on credit)
- WHEN `createOrder` runs
- THEN it raises `InvalidOrderError` (payment-sum invariant) — the credit-only creation
  path is deferred; the `SaleCredit` entity is delivered but the aggregate invariant is
  not yet relaxed to admit it

### Requirement: Currency Conversion Rules for a Sale

Same-currency conversion MUST use a rate if one exists for that channel/currency, else
default to 1×1 identity. Cross-currency conversion MUST require a rate; if none exists the
system MUST STOP the sale, raise `RateNotFoundError`, and notify + log — NEVER fall back to
1×1 for cross-currency.

#### Scenario: Same-currency with an existing rate uses it

- GIVEN a payment in MN via `MN_CASH` on an MN order, with a channel rate on file
- WHEN the payment converts
- THEN it uses that resolved rate, not a blind passthrough

#### Scenario: Same-currency with no rate defaults to 1×1

- GIVEN no rate exists for the channel/currency
- WHEN a same-currency payment converts
- THEN it uses 1×1 identity

#### Scenario: Cross-currency with no rate stops the sale

- GIVEN a EUR line on an MN order with no EUR→MN (or EUR→USD) rate on file
- WHEN the sale attempts to transition to `verified`
- THEN it MUST raise `RateNotFoundError`, STOP the sale (no partial commit), and log/notify
  — it MUST NEVER apply 1×1

### Requirement: Stock Bridge — Reserve & Consume (Option A)

Sales MUST bridge to the Inventario module via reserve/consume/release operations behind
the existing stock ports — `Order` MUST NEVER write stock rows directly. Per-line stock
effects follow status transitions (this is the sole, owner-locked stock bridge semantics
for this slice — it REPLACES any prior "one `sale_out` at `verified`" model):

| Transition | Stock effect |
|---|---|
| `created` | none |
| `created → verified` | RESERVE each line: `reserved += line.quantity` |
| `verified → delivered` | CONSUME each line: emit `StockMovement(type=sale_out)` (`onHand -= line.quantity`) AND release the reservation (`reserved -= line.quantity`) |
| `verified → cancelled` | RELEASE the reservation only: `reserved -= line.quantity` (no `onHand` change) |
| `created → cancelled` | none — nothing was reserved |

Invariant: at all times, `available = onHand - reserved` MUST remain consistent with the
sum of active reservations and recorded movements. The concrete mechanism (new
reserve/release port operations on the inventory module) is a design/implementation
concern, not part of this spec — this requirement expresses the BEHAVIOR only.

#### Scenario: created has no stock effect

- GIVEN a new order in `created`
- WHEN it is created
- THEN no `StockLevel.reserved` or `onHand` mutation occurs

#### Scenario: verified reserves each line

- GIVEN a `created` order with 3 lines
- WHEN it transitions to `verified`
- THEN `reserved` increases by each line's `quantity`, once per line, and no `onHand`
  mutation occurs yet

#### Scenario: delivered consumes and releases

- GIVEN a `verified` order whose lines are already reserved
- WHEN it transitions to `delivered`
- THEN, per line, a `sale_out` `StockMovement` is recorded (`onHand -= quantity`) AND the
  matching reservation is released (`reserved -= quantity`)

#### Scenario: cancel from verified releases the reservation

- GIVEN a `verified` order with reserved stock
- WHEN it is cancelled
- THEN each line's reservation is released (`reserved -= quantity`) and `onHand` is
  untouched

#### Scenario: cancel from created has no stock effect

- GIVEN a `created` order (never reserved)
- WHEN it is cancelled
- THEN no `reserved`/`onHand` mutation occurs

#### Scenario: reserving more than available fails the verify

- GIVEN a line whose `quantity` exceeds the current `available` stock (`onHand - reserved`)
  for its warehouse/product
- WHEN the order attempts to transition `created → verified`
- THEN the system MUST reject the transition using the existing insufficient-stock /
  negative-stock error semantics — no partial reservation is committed, and the `Order`
  remains in `created`

#### Scenario: Order never writes stock rows directly

- GIVEN the `Order` aggregate implementation
- WHEN inspected
- THEN it holds no direct Prisma stock-table write — all reserve/consume/release mutation
  flows through the inventory ports (`IStockMovementRepository.record` for `onHand`, plus
  the reserve/release operation for `reserved`)

### Requirement: Devolución (Return) Flow Is Out of Scope This Slice

`delivered` remains fully TERMINAL in this slice (see Order Status Lifecycle requirement):
cancelling, reversing, or returning an already-`delivered` order — a "devolución", which
would require an `onHand +=` compensating movement plus a money refund against
frozen-rate payments/`SaleCredit` — is NOT supported. The deferred design lives in
`docs/plans/ventas-devoluciones-flujo-diferido.md`.

#### Scenario: Devolución is not implemented this slice

- GIVEN a `delivered` order
- WHEN a return/refund is attempted
- THEN the system MUST reject it (same terminal-state rejection as any other
  post-`delivered` transition) — no compensating stock or payment reversal exists in this
  slice; see `docs/plans/ventas-devoluciones-flujo-diferido.md` for the deferred design

### Requirement: Invariants Enforced via Named Errors and Factory

All `Order` invariants (derived currency, deliveryMode required, payment-sum, line
recompute, status transitions) MUST be enforced by the `createOrder` factory and raise
named errors (`InvalidOrderError`, `RateNotFoundError`), never silent defaults.
Persistence/service code MUST route creation through the factory, never construct an
`Order` directly.

#### Scenario: Invalid input rejected with a named error

- GIVEN an order payload violating an invariant (e.g. empty lines)
- WHEN `createOrder` runs
- THEN it throws `InvalidOrderError`, not a generic error or silent default

#### Scenario: Service always routes through the factory

- GIVEN the persistence/service layer creating an `Order`
- WHEN implemented
- THEN it calls `createOrder` before any repository write — it never bypasses factory
  invariants

### Requirement: Whole-Basket Single-Warehouse Availability Invariant at Creation

Order creation MUST validate, for the WHOLE basket against the target
warehouse, that every line's quantity is coverable by that warehouse's
available stock for that product — products AND quantities, not presence
alone (D4). A warehouse that does not fully cover every line MUST NOT be
accepted. If NO warehouse can fully cover the basket, order creation MUST be
REJECTED (mirrors the retired MVP rule,
`openspec/changes/archive/2026-07-09-salesops-03-crear-pedido/spec.md:98-105`).

#### Scenario: Warehouse fully covering the basket is accepted

- GIVEN a basket whose every line's quantity is ≤ the target warehouse's
  available stock for that product
- WHEN the order is created against that warehouse
- THEN creation succeeds

#### Scenario: Warehouse short on any single line is rejected

- GIVEN a basket where one line's quantity exceeds the target warehouse's
  available stock for that product
- WHEN the order is created against that warehouse
- THEN creation MUST be rejected with a named error — no partial order exists

#### Scenario: Zero eligible warehouses blocks creation entirely

- GIVEN a basket that no warehouse can fully cover
- WHEN order creation is attempted against any warehouse
- THEN it MUST be rejected regardless of which warehouse was chosen

### Requirement: Every Order Line Is a Snapshot OF THE CATALOG

An order line's `productName`, `categoryName`, `price`, `percentDiscountPrice`
and `discountPrice` MUST be resolved from the product catalog at creation
time. They MUST NOT be accepted from the request. The caller supplies only
WHICH product and HOW MANY. `customerName` MUST likewise be snapshot from the
`Customer` record, never accepted from the request.

A price accepted from the caller flows into the line total, the order total,
the payment sum and the credit balance — a caller could name its own price for
a real product. This is the same rule the capability already applies to
`total` and `currency`: derived, never accepted as input. "Snapshot" means a
frozen copy of something authoritative, not a copy of the request.

The referenced product MUST exist and be active, and its category MUST
resolve; the referenced customer MUST exist and be active. Each failure is an
invalid REQUEST, reported distinctly from a stock shortage.

#### Scenario: A price supplied by the caller is ignored

- GIVEN a create request whose line carries a `price` differing from the
  catalog price
- WHEN the order is created
- THEN the persisted line, and every total derived from it, use the CATALOG
  price — the supplied value has no effect

#### Scenario: Product name and category come from the catalog

- GIVEN a create request whose line carries a `productName`/`categoryName`
  that do not match the catalog
- WHEN the order is created
- THEN the persisted line carries the catalog's values

#### Scenario: customerName comes from the customer record

- GIVEN a create request carrying a `customerName` that differs from the
  stored customer's name
- WHEN the order is created
- THEN the persisted order carries the stored customer's name

#### Scenario: Unknown or inactive product is rejected

- GIVEN a line referencing a product that does not exist, or one that is
  soft-deleted
- WHEN order creation is attempted
- THEN it MUST be rejected as an invalid request and no order row is written

#### Scenario: Unknown or inactive customer is rejected

- GIVEN a create request referencing a customer that does not exist, or one
  that is soft-deleted
- WHEN order creation is attempted
- THEN it MUST be rejected as an invalid request and no order row is written

### Requirement: The Target Warehouse Must Be a Real, Active Warehouse

Order creation, and any change of an order's warehouse, MUST reject a
`warehouseId` that does not exist or that names a soft-deleted
(`active=false`) warehouse — BEFORE and INDEPENDENTLY of any stock check.
Holding stock MUST NOT make an inactive warehouse acceptable.

This is a DIFFERENT failure from a stock shortage and MUST be reported as
one: a shortage says the world cannot satisfy the request right now, whereas
an unknown or retired warehouse means the request itself names an invalid
target and no change in stock would ever make it succeed. Reporting a
shortage for a warehouse that does not exist blames the stock for a typo.
A database foreign key MUST NOT be what catches this.

The eligibility query lists ACTIVE warehouses only, so without this
requirement order creation would accept precisely what that query says does
not qualify.

#### Scenario: Unknown warehouse is rejected as an invalid request

- GIVEN a `warehouseId` that matches no warehouse
- WHEN order creation is attempted
- THEN it MUST be rejected as an invalid request, distinctly from a stock
  shortage, and no order row is written

#### Scenario: Soft-deleted warehouse is rejected even when it holds stock

- GIVEN a warehouse with `active=false` that still has ample stock for the
  whole basket
- WHEN order creation is attempted against it
- THEN it MUST be rejected — stock does not resurrect a retired warehouse

#### Scenario: Moving an order to an invalid warehouse is rejected

- GIVEN an order in `created` status
- WHEN its `warehouseId` is changed to one that is unknown or inactive
- THEN the change MUST be rejected and the order's warehouse is unchanged

### Requirement: Warehouse Change on a Created Order Re-Validates Availability

A `PATCH` that changes `warehouseId` on a `created` order MUST re-run the
same whole-basket availability check against the NEW warehouse before
applying the change.

#### Scenario: Changing to a non-covering warehouse is rejected

- GIVEN a `created` order and a candidate warehouse that cannot cover one of
  its lines
- WHEN `warehouseId` is patched to that warehouse
- THEN the update MUST be rejected — `warehouseId` remains unchanged

#### Scenario: Changing to a covering warehouse succeeds

- GIVEN a `created` order and a candidate warehouse that fully covers every
  line
- WHEN `warehouseId` is patched to that warehouse
- THEN the update succeeds

### Requirement: Creation-Time Availability Is a Fast-Fail Read, Not a Reservation

The creation-time availability check MUST be a read-only, point-in-time
assertion — it MUST NOT reserve, hold, or otherwise mutate stock. `verified`
remains the sole transition that reserves stock (existing Stock Bridge
requirement) and MUST still reject with `InsufficientStockError` if
availability changed between creation and verification.

#### Scenario: Creation performs no stock mutation

- GIVEN an order that passes the creation-time availability check
- WHEN it is created
- THEN no `StockLevel.reserved`/`onHand` mutation occurs

#### Scenario: Stock consumed between creation and verify still 409s at verify

- GIVEN an order created when stock was sufficient, and another order
  consuming that same stock before this order verifies
- WHEN this order attempts `created → verified`
- THEN it MUST still be rejected with the existing insufficient-stock error
  at verification — the creation-time check is NOT a substitute for the
  reservation check; this race is accepted, not remediated by a hold/TTL
  mechanism

### Requirement: Cross-Warehouse Basket Eligibility Query

The system MUST expose a way to determine, for an arbitrary basket (products
+ quantities), which warehouses can fully cover it — independent of any
caller's own warehouse scope (D2, D3).

#### Scenario: Eligibility query returns only fully-covering warehouses

- GIVEN warehouses W1 (covers the basket) and W2 (short on one line)
- WHEN the eligibility query runs for that basket
- THEN only `W1` is returned

#### Scenario: Query is not restricted to any warehouse scope

- GIVEN a caller with no warehouse assignment
- WHEN the eligibility query runs
- THEN it evaluates ALL warehouses — no scope filter is applied

### Requirement: Order Creation Attribution to the Authenticated Actor

Order creation MUST stamp the authenticated `CompanyUser` performing the
request as the order's attributed creator — sourced from the request's
resolved identity, NEVER from client-supplied input (D1). This attribution
is the sole input to commission accrual (`salesops-commissions`).

#### Scenario: Attribution ignores any client-supplied agent field

- GIVEN a create-order request whose payload includes a client-supplied
  agent/user id
- WHEN the order is created
- THEN the persisted attribution is the AUTHENTICATED caller — the
  client-supplied value is ignored

#### Scenario: Attribution is stamped exactly once, at creation

- GIVEN a created order
- WHEN it later transitions through `verified`/`delivered`
- THEN its attributed creator never changes

#### Scenario: A non-active CompanyUser cannot attribute a sale

- GIVEN a `CompanyUser` holding `sales_agent` with a non-active `status`
- WHEN they attempt to create an order
- THEN the request is denied before order creation runs — the same failure
  class as any non-active `CompanyUser` (`salesops-companies`); no order is
  ever attributed to an inactive account

### Requirement: A Sales Agent Reads Only Their Own Attributed Orders

A caller whose access to the order endpoints comes SOLELY from `sales_agent`
MUST see and modify only the orders attributed to them. `GET /orders` MUST be
filtered to their own attributions, and `GET /orders/:id` and
`PATCH /orders/:id` MUST deny an order attributed to anyone else.

The scope covers the write path and not only the read path. An order's lines
are the sole input to commission accrual, so an agent able to edit a
colleague's order is an agent able to change what that colleague gets paid.

This mirrors the existing `warehouse_operator` scoping rule and its
"solely" qualifier: a caller who ALSO holds `owner`, `admin` or
`sales_operator` is not scoped, because those roles supervise agents and
must see the whole book. A sale carries what the customer bought, at what
price, on what credit terms — an agent has no business reading a colleague's.

This closes design Q1.

#### Scenario: The list is filtered to the caller's own attributions

- GIVEN a caller whose only role is `sales_agent`
- AND orders exist attributed to them AND to another agent
- WHEN they request `GET /orders`
- THEN only the orders attributed to them are returned

#### Scenario: Reading another agent's order is denied

- GIVEN a caller whose only role is `sales_agent`
- WHEN they request `GET /orders/:id` for an order attributed to a different
  `CompanyUser`
- THEN the request is denied

#### Scenario: Editing another agent's order is denied and writes nothing

- GIVEN a caller whose only role is `sales_agent`
- WHEN they send `PATCH /orders/:id` for an order attributed to a different
  `CompanyUser`
- THEN the request is denied AND the order is left unchanged

#### Scenario: A supervising role is never scoped

- GIVEN a caller holding `sales_agent` AND `sales_operator`
- WHEN they request `GET /orders`
- THEN every order is returned, unfiltered

#### Scenario: A legacy unattributed order is invisible to every agent

- GIVEN an order created before attribution existed, carrying no attributed
  `CompanyUser`
- WHEN a caller whose only role is `sales_agent` requests `GET /orders`
- THEN that order is NOT returned — an absent attribution matches nobody,
  rather than matching everybody

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
