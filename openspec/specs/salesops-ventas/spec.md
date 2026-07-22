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
| deliveryMode | `recogida \| domicilio` | required — see Order Delivery Mode requirement |
| currency | `USD \| MN` | derived: any line native `price.currency === USD` → `USD`, else `MN`. EUR never becomes order currency |
| status | `creado \| verificado \| entregado \| cancelado` | see lifecycle requirement |
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

`Order` MUST carry a required `deliveryMode: 'recogida' | 'domicilio'` field. This slice
(Ventas) implements only the `recogida` fulfillment path — `verificado → entregado` direct.
When `deliveryMode='domicilio'`, fulfillment continues through a FUTURE Delivery module
(out of scope for this slice) that inserts `verificado → despachando → transportando →
entregado`; Ventas itself never models `despachando`/`transportando` and only ever
implements the direct `verificado → entregado` edge regardless of `deliveryMode`.

#### Scenario: deliveryMode is required on creation

- GIVEN an order payload with no `deliveryMode`
- WHEN the order is created
- THEN the system MUST reject it with `InvalidOrderError`

#### Scenario: recogida orders transition directly to entregado

- GIVEN a `verificado` order with `deliveryMode='recogida'`
- WHEN it is marked delivered
- THEN it transitions directly to `entregado`

#### Scenario: domicilio orders still use the direct Ventas edge

- GIVEN a `verificado` order with `deliveryMode='domicilio'`
- WHEN inspected under this slice (Delivery module not yet built)
- THEN Ventas exposes only the direct `verificado → entregado` transition — no
  `despachando`/`transportando` state exists on `Order` in this slice

### Requirement: Order Status Lifecycle with Freeze at Verificado

`OrderStatus` MUST be exactly 4 states: `creado | verificado | entregado | cancelado`.
Ventas-owned transitions: `creado → verificado` (FREEZES rate + totals — `channel`,
`rateApplied`, `effectiveFrom`, and resulting Money are stamped onto every
`OrderLine`/`OrderPayment` and never recomputed after a later rate append),
`verificado → entregado` (direct — pickup / `recogida`, see Order Delivery Mode
requirement), and `cancelado` reachable ONLY from `creado` or `verificado`. `entregado` is
TERMINAL: no further transition (cancel, re-verify, or anything else) is valid once an
order reaches it.

Note (boundary, not implemented in this slice): commission is NOT an Order concern. Ventas
freezes ONLY `rate + totals` at `verificado`; commission accrual is a separate future
Gestores-module entity with its own `creada → pagada` lifecycle, not an order field or
status.

#### Scenario: creado to verificado freezes rate and totals

- GIVEN a `creado` order
- WHEN it transitions to `verificado`
- THEN `channel`, `rateApplied`, `effectiveFrom`, and resulting Money are stamped onto
  every `OrderLine`/`OrderPayment` and a later rate append MUST NOT change them

#### Scenario: verificado to entregado direct transition

- GIVEN a `verificado` order
- WHEN it is marked delivered
- THEN it transitions directly to `entregado` with no intermediate state

#### Scenario: cancelar succeeds from creado

- GIVEN an order in `creado`
- WHEN it is cancelled
- THEN the status becomes `cancelado`

#### Scenario: cancelar succeeds from verificado

- GIVEN an order in `verificado`
- WHEN it is cancelled
- THEN the status becomes `cancelado`

#### Scenario: entregado is terminal

- GIVEN an order in `entregado`
- WHEN any transition is attempted
- THEN the system MUST reject it — `entregado` has no outgoing transition

#### Scenario: cancel after entregado rejected

- GIVEN an order in `entregado`
- WHEN a cancel is attempted
- THEN the system MUST reject it with `InvalidOrderError` — cancellation is only valid
  from `creado` or `verificado`

#### Scenario: double-verify rejected

- GIVEN an order already in `verificado`
- WHEN a transition to `verificado` is attempted again
- THEN the system MUST reject it with `InvalidOrderError` — `verificado` is reachable
  only from `creado`

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
| lineTotalOrder | Money, `Order.currency`, frozen at `verificado` |

#### Scenario: unitFinalPrice recomputed via pricing.ts

- GIVEN a line with `price=100`, `percentDiscountPrice=20%`, `discountPrice=5`
- WHEN the line is priced
- THEN `unitFinalPrice` is `75` per `finalPrice`, never a stored raw discount

#### Scenario: lineTotalOrder frozen after verificado

- GIVEN a `verificado` line with `lineTotalOrder` computed at a given rate
- WHEN a later rate is appended
- THEN `lineTotalOrder` MUST NOT be recomputed

### Requirement: OrderPayment Split Multi-Channel Collection

`OrderPayment` MUST be a collection (0..N per order). Each entry carries `channel`,
`amount` in `CHANNEL_CURRENCY[channel]`, a frozen `rateApplied`+`effectiveFrom`, and derived
`amountInOrderCurrency`. Invariant: `Σ amountInOrderCurrency === Order.total`.

#### Scenario: Split payment across two channels sums to total

- GIVEN an order with `total=100 USD` paid via `ZELLE=60` and `MN_EFECTIVO` equivalent `40`
- WHEN payments are recorded
- THEN `Σ amountInOrderCurrency === Order.total`

#### Scenario: Payment sum mismatch rejected

- GIVEN payments whose `Σ amountInOrderCurrency` is less than `Order.total`
- WHEN the order is verified (`verificado`)
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

- GIVEN a payment in MN via `MN_EFECTIVO` on an MN order, with a channel rate on file
- WHEN the payment converts
- THEN it uses that resolved rate, not a blind passthrough

#### Scenario: Same-currency with no rate defaults to 1×1

- GIVEN no rate exists for the channel/currency
- WHEN a same-currency payment converts
- THEN it uses 1×1 identity

#### Scenario: Cross-currency with no rate stops the sale

- GIVEN a EUR line on an MN order with no EUR→MN (or EUR→USD) rate on file
- WHEN the sale attempts to transition to `verificado`
- THEN it MUST raise `RateNotFoundError`, STOP the sale (no partial commit), and log/notify
  — it MUST NEVER apply 1×1

### Requirement: Stock Bridge — Reserve & Consume (Option A)

Ventas MUST bridge to the Inventario module via reserve/consume/release operations behind
the existing stock ports — `Order` MUST NEVER write stock rows directly. Per-line stock
effects follow status transitions (this is the sole, owner-locked stock bridge semantics
for this slice — it REPLACES any prior "one `sale_out` at `verificado`" model):

| Transition | Stock effect |
|---|---|
| `creado` (created) | none |
| `creado → verificado` | RESERVE each line: `reserved += line.quantity` |
| `verificado → entregado` | CONSUME each line: emit `StockMovement(type=sale_out)` (`onHand -= line.quantity`) AND release the reservation (`reserved -= line.quantity`) |
| `verificado → cancelado` | RELEASE the reservation only: `reserved -= line.quantity` (no `onHand` change) |
| `creado → cancelado` | none — nothing was reserved |

Invariant: at all times, `available = onHand - reserved` MUST remain consistent with the
sum of active reservations and recorded movements. The concrete mechanism (new
reserve/release port operations on the inventory module) is a design/implementation
concern, not part of this spec — this requirement expresses the BEHAVIOR only.

#### Scenario: creado has no stock effect

- GIVEN a new order in `creado`
- WHEN it is created
- THEN no `StockLevel.reserved` or `onHand` mutation occurs

#### Scenario: verificado reserves each line

- GIVEN a `creado` order with 3 lines
- WHEN it transitions to `verificado`
- THEN `reserved` increases by each line's `quantity`, once per line, and no `onHand`
  mutation occurs yet

#### Scenario: entregado consumes and releases

- GIVEN a `verificado` order whose lines are already reserved
- WHEN it transitions to `entregado`
- THEN, per line, a `sale_out` `StockMovement` is recorded (`onHand -= quantity`) AND the
  matching reservation is released (`reserved -= quantity`)

#### Scenario: cancel from verificado releases the reservation

- GIVEN a `verificado` order with reserved stock
- WHEN it is cancelled
- THEN each line's reservation is released (`reserved -= quantity`) and `onHand` is
  untouched

#### Scenario: cancel from creado has no stock effect

- GIVEN a `creado` order (never reserved)
- WHEN it is cancelled
- THEN no `reserved`/`onHand` mutation occurs

#### Scenario: reserving more than available fails the verify

- GIVEN a line whose `quantity` exceeds the current `available` stock (`onHand - reserved`)
  for its warehouse/product
- WHEN the order attempts to transition `creado → verificado`
- THEN the system MUST reject the transition using the existing insufficient-stock /
  negative-stock error semantics — no partial reservation is committed, and the `Order`
  remains in `creado`

#### Scenario: Order never writes stock rows directly

- GIVEN the `Order` aggregate implementation
- WHEN inspected
- THEN it holds no direct Prisma stock-table write — all reserve/consume/release mutation
  flows through the inventory ports (`IStockMovementRepository.record` for `onHand`, plus
  the reserve/release operation for `reserved`)

### Requirement: Devolución (Return) Flow Is Out of Scope This Slice

`entregado` remains fully TERMINAL in this slice (see Order Status Lifecycle requirement):
cancelling, reversing, or returning an already-`entregado` order — a "devolución", which
would require an `onHand +=` compensating movement plus a money refund against
frozen-rate payments/`SaleCredit` — is NOT supported. The deferred design lives in
`docs/plans/ventas-devoluciones-flujo-diferido.md`.

#### Scenario: Devolución is not implemented this slice

- GIVEN an `entregado` order
- WHEN a return/refund is attempted
- THEN the system MUST reject it (same terminal-state rejection as any other
  post-`entregado` transition) — no compensating stock or payment reversal exists in this
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
