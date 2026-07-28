# Delta for salesops-ventas

**Merge target**: `openspec/specs/salesops-ventas/spec.md` (already promoted).

## ADDED Requirements

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
