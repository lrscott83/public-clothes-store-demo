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

`Order` MUST carry a required `deliveryMode: 'pickup' | 'delivery'` field. This slice
(Sales) implements only the `pickup` fulfillment path — `verified → delivered` direct.
When `deliveryMode='delivery'`, fulfillment continues through a FUTURE Delivery module
(out of scope for this slice) that inserts `verified → despachando → transportando →
delivered`; Sales itself never models `despachando`/`transportando` and only ever
implements the direct `verified → delivered` edge regardless of `deliveryMode`.

#### Scenario: deliveryMode is required on creation

- GIVEN an order payload with no `deliveryMode`
- WHEN the order is created
- THEN the system MUST reject it with `InvalidOrderError`

#### Scenario: pickup orders transition directly to delivered

- GIVEN a `verified` order with `deliveryMode='pickup'`
- WHEN it is marked delivered
- THEN it transitions directly to `delivered`

#### Scenario: delivery orders still use the direct Sales edge

- GIVEN a `verified` order with `deliveryMode='delivery'`
- WHEN inspected under this slice (Delivery module not yet built)
- THEN Sales exposes only the direct `verified → delivered` transition — no
  `despachando`/`transportando` state exists on `Order` in this slice

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
