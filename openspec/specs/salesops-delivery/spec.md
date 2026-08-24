# Spec — salesops-delivery (NEW capability)

## Purpose

Fulfils the seam reserved by `packages/domain/src/sales/order.ts:13-17` and
`openspec/specs/salesops-ventas/spec.md`'s Order Delivery Mode requirement:
a carrier catalog, warehouse coverage, a `DeliveryAssignment` three-state
lifecycle for `deliveryMode='delivery'` orders, computed (never stored)
carrier capacity, and the `IOrderDeliveryGateway` bridge that drives `Order`
to `delivered` through Sales' own transition — without Delivery ever owning
`Order.status`. `OrderStatus` (4 states) is untouched. Carrier-rate API
integrations, geo/zone modelling, and stored capacity are explicitly out of
scope.

**Vocabulary link**: the owner's *transportista* is `Carrier`. *transportando*
is `DeliveryAssignmentStatus.in_transit`. "asignar transportista" creates a
`DeliveryAssignment`. "marcar entregado" is the assignment transition plus the
gateway call. Code identifiers, comments, tables and columns are English;
user-facing strings stay neutral Latin American Spanish.

## Requirements

### Requirement: Carrier Catalog as Tenant Master Data

The system MUST persist a `Carrier` as tenant-schema master data:

| Field | Type | Rule |
|---|---|---|
| id | UUID | PK |
| name | string | required, trimmed of surrounding whitespace on both create and update |
| phone | string | optional, trimmed of surrounding whitespace on both create and update |
| active | boolean | soft-delete, default `true` — never a hard `DELETE` |
| createdAt/updatedAt | datetime | audit |

`Carrier` MUST NOT carry a `zone` field of any kind, and MUST NOT carry any stored
capacity/`maxOrdersPerDay` field. Coverage is expressed exclusively by `CarrierWarehouse`
(see below); capacity is exclusively computed (see the Computed Capacity requirement).

`GET /delivery/carriers/:id` MUST return a soft-deleted (`active=false`) carrier exactly
as it returns an active one — the by-id read applies no `active` filter, mirroring
`GET /warehouses/:id`. Only the LIST read may filter by `active`.

(Previously: the table listed `name`/`phone` with no trimming rule, and the requirement
said nothing about whether `GET /delivery/carriers/:id` returns a soft-deleted carrier.
Superseded by this amendment's explicit trim rule and the explicit by-id read statement —
neither changes any field's type or the soft-delete-never-hard-delete guarantee.)

#### Scenario: Carrier is created with required name only

- GIVEN a create-carrier request with `name` and no `phone`
- WHEN the carrier is created
- THEN it persists with `phone` null and `active=true`

#### Scenario: Deleting a carrier soft-deletes it

- GIVEN an existing `Carrier`
- WHEN it is deleted
- THEN `active` flips to `false` and the row remains retrievable — no hard delete occurs

#### Scenario: No zone field exists on Carrier

- GIVEN the persisted `Carrier` schema
- WHEN inspected
- THEN no `zone` column or equivalent field exists anywhere on `Carrier`

#### Scenario: No capacity field exists on Carrier

- GIVEN the persisted `Carrier` schema
- WHEN inspected
- THEN no `capacity`/`maxOrdersPerDay` column or equivalent field exists anywhere on
  `Carrier`

#### Scenario: name and phone are trimmed on create

- GIVEN a create-carrier request with `name=" Acme Transport "` and `phone=" 555-0100 "`
- WHEN the carrier is created
- THEN it persists as `name="Acme Transport"` and `phone="555-0100"` — no leading or
  trailing whitespace is stored

#### Scenario: name and phone are trimmed on update

- GIVEN an existing carrier and an update request with `name=" New Name "`
- WHEN the update is applied
- THEN it persists as `name="New Name"` — trimmed the same way as on create

#### Scenario: Reading a soft-deleted carrier by id still returns it

- GIVEN a carrier with `active=false`
- WHEN `GET /delivery/carriers/:id` is called for it
- THEN the carrier is returned, with `active=false` visible in the response — the by-id
  read is never filtered

### Requirement: Carrier-Warehouse Coverage Is Expressed Only by the Join Table

Carrier coverage of warehouses MUST be expressed exclusively by a
`CarrierWarehouse` join table with `@@unique([carrierId, warehouseId])`,
never by a nullable FK on `Carrier` or `Warehouse`. This join table supports
0, 1, or N warehouses per carrier uniformly.

A carrier with ZERO `CarrierWarehouse` rows MUST be treated as NOT offered
for any warehouse — it MUST NOT be treated as "available everywhere". Coverage
is advisory (see the Coverage Is Advisory requirement below), but its
ABSENCE-means-NONE reading is not: the join table exists precisely so that an
absent row has one unambiguous meaning, and treating zero rows as "serves
everywhere" would reintroduce exactly the ambiguity a nullable FK would have
had.

#### Scenario: A carrier can cover multiple warehouses

- GIVEN a carrier with `CarrierWarehouse` rows for warehouses A and B
- WHEN coverage is queried for that carrier
- THEN both A and B are returned

#### Scenario: Zero coverage rows means the carrier serves no warehouse

- GIVEN a freshly-created carrier with zero `CarrierWarehouse` rows
- WHEN coverage is queried for that carrier, or the carrier list is filtered
  by warehouse
- THEN the carrier is reported as covering NO warehouse — it is NOT treated
  as covering every warehouse

#### Scenario: Coverage is added or removed without touching Carrier

- GIVEN an existing carrier
- WHEN a `CarrierWarehouse` row is added or removed for it
- THEN the `Carrier` row itself is not modified — coverage lives entirely in
  the join table

### Requirement: DeliveryAssignment Is a Three-State Bridge, Zero-Or-One Per Order

(RENAMED from "DeliveryAssignment Is a Two-State Bridge, Zero-Or-One Per Order" — the old
title is now a false statement of the enum's cardinality, not a stale-but-harmless one.
See `proposal.md`'s note to the archiver on how to merge this rename.)

The system MUST persist a `DeliveryAssignment` bridging an `Order` to a `Carrier`, with
`orderId String @unique` (0..1 assignment per order, mirroring `CommissionAccrual.orderId`'s
idempotency guarantee). `status` MUST be exactly three states: `in_transit | delivered |
cancelled`.

| Field | Type | Rule |
|---|---|---|
| id | UUID | PK |
| orderId | UUID FK | unique, `onDelete: Restrict` |
| carrierId | UUID FK | `onDelete: Restrict` |
| status | `in_transit \| delivered \| cancelled` | default `in_transit` on creation |
| assignedAt | datetime | required |
| deliveredAt | datetime | optional, set on transition to `delivered`; stays NULL for `cancelled` |
| createdAt/updatedAt | datetime | audit |

`cancelled` is set exactly once, when the assignment's order is cancelled (see the ADDED
requirement "A Cancelled Order Never Leaves an Open Assignment Behind" below for the
mechanism). It is a TERMINAL administrative outcome distinct from `delivered`: a cancelled
assignment counts as neither BUSY (`computeCarrierCapacity` only counts `in_transit`) nor
as a completed delivery (`computeCarrierThroughput` only counts `delivered`) — it is
excluded from both computations, not folded into either.

Assigning a carrier to an order MUST create the `DeliveryAssignment` in `in_transit`
atomically — carrier and initial state are set together, never in two separate writes —
and MUST re-validate the order's status under a `FOR UPDATE` row lock on the order inside
that same transaction: a concurrent cancel of the order (which takes the identical lock as
the first statement of its own transaction) MUST cause the assignment attempt to fail with
`409` rather than create an `in_transit` row against an order that is no longer `verified`.

Pickup-mode orders (`deliveryMode='pickup'`) MUST NEVER receive a `DeliveryAssignment` row
— the 0 case of the 0..1 cardinality is the modelled meaning for pickup orders, not an
anomaly to backfill.

(Previously: "The system MUST persist a `DeliveryAssignment` bridging an `Order` to a
`Carrier`, with `orderId String @unique` (0..1 assignment per order, mirroring
`CommissionAccrual.orderId`'s idempotency guarantee). `status` MUST be exactly two states:
`in_transit | delivered` — no third "assigned but not yet picked up" state exists." The
table listed only `in_transit | delivered` for `status`, with no `cancelled` case for
`deliveredAt`. The atomicity clause said nothing about a row lock or re-validation.
Superseded by this amendment's `cancelled` state and the accompanying create-time
concurrency guarantee — D3's original rationale, that there is no "assigned but not yet
picked up" phase, is untouched; `cancelled` is not that phase, it is a new terminal outcome
layered on top.)

#### Scenario: Assigning a carrier creates an in_transit assignment atomically

- GIVEN a `verified` order with `deliveryMode='delivery'` and no existing assignment
- WHEN a carrier is assigned to it
- THEN a `DeliveryAssignment` is created with `status='in_transit'`, carrier and status set
  in the same atomic write

#### Scenario: An order can have at most one assignment

- GIVEN an order that already has a `DeliveryAssignment`
- WHEN a second carrier-assignment is attempted for the same order
- THEN the system MUST reject it — `orderId` uniqueness is enforced

#### Scenario: Marking delivered transitions the assignment

- GIVEN a `DeliveryAssignment` in `in_transit`
- WHEN it is marked delivered
- THEN its status becomes `delivered` and `deliveredAt` is stamped

#### Scenario: A pickup order never has an assignment row

- GIVEN an order with `deliveryMode='pickup'`
- WHEN the system is inspected for a `DeliveryAssignment` referencing it
- THEN none exists — pickup orders are never assigned a carrier

#### Scenario: Exactly three assignment states exist

- GIVEN the `DeliveryAssignmentStatus` enum
- WHEN inspected
- THEN it defines exactly `in_transit`, `delivered` and `cancelled` — no fourth state

#### Scenario: A cancelled assignment keeps deliveredAt null

- GIVEN a `DeliveryAssignment` in `in_transit` whose order is then cancelled
- WHEN the assignment transitions to `cancelled`
- THEN `deliveredAt` remains NULL — cancellation is not a delivery and MUST NOT be
  stamped as one

#### Scenario: A cancelled assignment counts as neither busy nor delivered

- GIVEN a carrier whose only assignment is `cancelled`
- WHEN capacity is computed for that carrier
- THEN it is reported free (not busy), and the same assignment contributes zero to
  computed throughput (not counted as a delivery)

#### Scenario: Assigning a carrier to an order that is cancelled mid-request is rejected

- GIVEN a `verified` order with no existing assignment, and a concurrent request that
  cancels that same order
- WHEN the assignment attempt's `FOR UPDATE` re-validation runs after the cancel commits
- THEN the assignment attempt is rejected with `409` — no `in_transit` row is created
  against an order that is no longer `verified`

### Requirement: Carrier Capacity Is Computed, Never Stored

Carrier busy/free capacity MUST be derived by a pure function over live
`DeliveryAssignment` rows — no `capacity`/`maxOrdersPerDay` column MUST exist anywhere in
the schema. A carrier is BUSY when it has one or more assignments in `status='in_transit'`;
otherwise it is FREE. This computation MUST be re-derivable at any time from current
assignment state alone, with no cached or persisted capacity number to go stale.

The count of orders awaiting a carrier (`verified`, `deliveryMode='delivery'`, no
assignment yet) MUST be reported as an independent read — a count of ORDERS, not derivable
from carrier rows.

Computed throughput (`deliveredCount`, `status='delivered'` assignments) MUST be reported
over a bounded window. The LOWER bound (`from`) defaults to `DEFAULT_THROUGHPUT_WINDOW_DAYS`
(30 days) before the resolved upper bound whenever the caller does not supply `from` —
including a call that supplies `to` alone — so no request produces an unbounded scan by
accident. The UPPER bound (`to`) is left OPEN whenever the caller does not supply it; it is
NEVER defaulted to the current time. This is deliberate, not an omission: `deliveredAt` is
stamped by the DATABASE's clock (`now()` inside the closing transaction), not the app's, so
an app-clock upper bound would silently drop the newest deliveries under any clock skew — a
dashboard quietly under-reporting today's work, which is the hardest kind of wrong to
notice. The window actually applied MUST be reported back on the response
(`throughputWindow: { from, to }`, `to` reported `null` when left open) so a windowed number
can never be presented as an all-time total and an open upper bound is never mistaken for
"now". `in_transit`/busy counts remain DELIBERATELY UNBOUNDED — the open working set has no
natural window, and windowing it would hide currently-busy carriers whose assignment
predates the window. `GET /delivery/capacity` MUST reject `from > to` with `400`; `from ===
to` (a zero-width window) MUST be allowed.

(Previously: "Carrier busy/free capacity MUST be derived by a pure function over live
`DeliveryAssignment` rows — no `capacity`/`maxOrdersPerDay` column MUST exist anywhere in
the schema. A carrier is BUSY when it has one or more assignments in `status='in_transit'`;
otherwise it is FREE. This computation MUST be re-derivable at any time from current
assignment state alone, with no cached or persisted capacity number to go stale. The count
of orders awaiting a carrier (`verified`, `deliveryMode='delivery'`, no assignment yet)
MUST be reported as an independent read — a count of ORDERS, not derivable from carrier
rows." Said nothing about a throughput window, a default window, or `from`/`to`
validation — the capacity read had no window concept of any kind. Superseded by this
amendment's `throughputWindow` and validation rules; the busy/free derivation itself is
unchanged.)

#### Scenario: A carrier with an open in_transit assignment is busy

- GIVEN a carrier with one `DeliveryAssignment` in `in_transit`
- WHEN capacity is computed for that carrier
- THEN it is reported busy

#### Scenario: A carrier with no in_transit assignments is free

- GIVEN a carrier with zero assignments, or only `delivered`/`cancelled` assignments
- WHEN capacity is computed for that carrier
- THEN it is reported free

#### Scenario: Capacity recomputes correctly after delivery

- GIVEN a carrier busy due to one `in_transit` assignment
- WHEN that assignment transitions to `delivered`
- THEN capacity recomputed for that carrier reports it free — no stale stored value
  persists

#### Scenario: Orders awaiting a carrier is reported independently

- GIVEN two `verified`, `deliveryMode='delivery'` orders with no assignment, and one
  `verified` order that already has an assignment
- WHEN the "orders awaiting a carrier" read runs
- THEN it reports a count of 2 — a count of orders, not of carriers

#### Scenario: No from/to defaults to a 30-day window with an open upper bound

- GIVEN a `GET /delivery/capacity` call supplying neither `from` nor `to`
- WHEN the response is returned
- THEN `deliveredCount` is computed over the trailing 30 days ending now, and
  `throughputWindow` reports `from` resolved and `to: null` — never an all-time count
  silently, and never a `to` defaulted to the app's clock

#### Scenario: A to-only call still gets the 30-day default lower bound

- GIVEN a `GET /delivery/capacity` call supplying `to` but no `from`
- WHEN the response is returned
- THEN `from` defaults to 30 days before the supplied `to`, exactly as it would if `to` were
  also absent — supplying `to` alone MUST NOT produce an unbounded lower bound

#### Scenario: in_transit counts are never windowed

- GIVEN a carrier with an `in_transit` assignment older than any supplied `from` bound
- WHEN capacity is computed with an explicit `[from, to]` window
- THEN the carrier's `busy`/`inTransitCount` still includes that assignment — only
  `deliveredCount` is bounded by the window

#### Scenario: from after to is rejected

- GIVEN `GET /delivery/capacity?from=2026-02-01&to=2026-01-01`
- WHEN the request is made
- THEN it is rejected with `400` — `from` MUST NOT be after `to`

#### Scenario: from equal to to is allowed

- GIVEN `GET /delivery/capacity?from=2026-01-15&to=2026-01-15`
- WHEN the request is made
- THEN it succeeds with a zero-width window — a same-day window is not an error

### Requirement: Sales Remains the Sole Owner of Order.status

Delivery MUST NOT gain any column on `Order` beyond the inverse relation
`deliveryAssignment DeliveryAssignment?`. `Order.status` MUST continue to
transition exclusively through Sales' own `OrderService.deliver()`
(`salesops-ventas`). Delivery drives that transition by calling a port,
`IOrderDeliveryGateway`, that it DECLARES in its own domain folder; the
concrete adapter implementing that port MUST live in Sales' app folder
(`apps/api-salesops/src/sales/`) — mirroring where `ICommissionAccrualRecorder`
is implemented relative to where it is declared. No Delivery file MUST import
a Sales implementation, and no Sales file MUST import `DeliveryModule` — the
dependency runs one way: `DeliveryModule` imports `SalesModule`.

#### Scenario: Marking an assignment delivered drives the order via the gateway

- GIVEN a `DeliveryAssignment` in `in_transit` for a `verified` order
- WHEN it is marked delivered
- THEN Delivery calls `IOrderDeliveryGateway.markOrderDelivered(orderId)`,
  which internally invokes Sales' existing `OrderService.deliver()`, and the
  order transitions `verified → delivered` exactly as it does for pickup
  orders

#### Scenario: Order gains no scalar column for Delivery's concern

- GIVEN the persisted `Order` schema after this change
- WHEN inspected
- THEN it carries only the inverse relation `deliveryAssignment
  DeliveryAssignment?` — no new scalar column exists on `Order`

#### Scenario: No import cycle between Delivery and Sales

- GIVEN the module dependency graph after this change
- WHEN inspected
- THEN `DeliveryModule` imports `SalesModule`, and no Sales file imports
  anything from `DeliveryModule`

### Requirement: POST /orders/:id/deliver Is Unrestricted for Both Delivery Modes

`POST /orders/:id/deliver` MUST continue to work exactly as it did before this
change, for BOTH `deliveryMode` values, with no gating on `deliveryMode` and
no requirement that a `DeliveryAssignment` exist or be resolved first. This
capability MUST NOT introduce any restriction, precondition, or breaking
change to that endpoint's existing behavior.

#### Scenario: Direct deliver still works for a pickup order

- GIVEN a `verified` order with `deliveryMode='pickup'`
- WHEN `POST /orders/:id/deliver` is called
- THEN it transitions to `delivered` exactly as before this change

#### Scenario: Direct deliver still works for a delivery-mode order with no assignment

- GIVEN a `verified` order with `deliveryMode='delivery'` and no
  `DeliveryAssignment`
- WHEN `POST /orders/:id/deliver` is called
- THEN it transitions to `delivered` — the endpoint does not require or
  create a `DeliveryAssignment`

#### Scenario: Direct deliver still works for a delivery-mode order with an open assignment

- GIVEN a `verified` order with `deliveryMode='delivery'` and a
  `DeliveryAssignment` in `in_transit`
- WHEN `POST /orders/:id/deliver` is called
- THEN the order transitions to `delivered` exactly as it always has —
  the assignment reconciliation described below governs what happens to the
  assignment, but the order transition itself is unrestricted and unchanged

### Requirement: A Delivered Order Never Leaves an Open Assignment Behind

Because `POST /orders/:id/deliver` remains callable regardless of whether a
`DeliveryAssignment` exists or is still `in_transit`, an order MUST NOT be
allowed to reach `delivered` while a `DeliveryAssignment` referencing it
remains `in_transit`. When an order transitions to `delivered` through Sales,
any open (`in_transit`) `DeliveryAssignment` for that order MUST be closed to
`delivered` as part of the same transition. This closes the reconciliation
gap that would otherwise permanently poison computed capacity (an `in_transit`
row surviving behind a `delivered` order would keep reporting its carrier
busy forever).

Mechanism: Delivery declares a reconciler port that Sales calls from
`OrderService.deliver()`, mirroring exactly how Sales already calls
`ICommissionAccrualRecorder.recordForDeliveredOrder()` at
`templates/apps/api-salesops/src/sales/order.service.ts:320`.

#### Scenario: Direct deliver on an order with an open assignment closes it too

- GIVEN a `verified` order with `deliveryMode='delivery'` and a
  `DeliveryAssignment` in `in_transit`
- WHEN `POST /orders/:id/deliver` transitions the order to `delivered`
- THEN the `DeliveryAssignment` is also closed to `delivered` in the same
  operation — no assignment is left `in_transit` behind a `delivered` order

#### Scenario: No orphaned in_transit assignment survives any delivery path

- GIVEN any order that reaches `delivered`, regardless of which endpoint or
  path drove that transition
- WHEN its `DeliveryAssignment` (if any) is inspected afterward
- THEN it is never found in `in_transit` — it is either `delivered` or does
  not exist

#### Scenario: An order with no assignment is unaffected by reconciliation

- GIVEN a `verified` order with `deliveryMode='delivery'` and no
  `DeliveryAssignment`
- WHEN it transitions to `delivered`
- THEN the reconciliation call is a no-op — no assignment is created or
  modified

#### Scenario: A pickup order is unaffected by reconciliation

- GIVEN a `verified` order with `deliveryMode='pickup'`
- WHEN it transitions to `delivered`
- THEN the reconciliation call is a no-op — pickup orders never have
  assignments to reconcile

### Requirement: Coverage Is Advisory, Not an Enforced Assignment Block

Carrier-to-warehouse coverage (`CarrierWarehouse`) MUST NOT be enforced as a
hard invariant when assigning a carrier to an order. Assigning a carrier whose
`CarrierWarehouse` rows do not include the order's warehouse MUST succeed —
coverage may be used to filter, sort, or warn in a picker UI, but it MUST NOT
reject the assignment.

This permissiveness is deliberate and MUST NOT be "fixed" into a hard block
without a new decision: in a small real operation, emergencies happen (the
usual carrier is unavailable, a warehouse is short-staffed), and a hard block
produces workarounds — reassigning through a different, incorrect record, or
bypassing the system entirely — that corrupt the data worse than the coverage
rule protects it. Tightening this later is additive; loosening an already
shipped hard block is not.

#### Scenario: Assigning an uncovering carrier succeeds

- GIVEN a carrier with `CarrierWarehouse` rows for warehouse A only, and an
  order whose warehouse is B
- WHEN that carrier is assigned to that order
- THEN the assignment succeeds — coverage mismatch does not block it

#### Scenario: Assigning a carrier with zero coverage rows succeeds

- GIVEN a freshly-created carrier with zero `CarrierWarehouse` rows (covers no
  warehouse per the coverage requirement above)
- WHEN that carrier is assigned to an order for any warehouse
- THEN the assignment succeeds — advisory coverage never blocks assignment

### Requirement: Carrier Catalog Roles Mirror Existing Master Data

Carrier catalog writes (`create`/`update`/soft-`delete`) MUST require `owner` or `admin`.
Carrier catalog reads MUST carry no `@Roles` restriction — open to any authenticated
tenant user — mirroring the verified convention on `product.controller.ts`,
`category.controller.ts`, and `warehouse.controller.ts`.

Carrier-warehouse coverage writes (`POST`/`DELETE /delivery/carriers/:id/warehouses`)
MUST require the SAME `owner`/`admin` roles as `create`/`update`/soft-`delete` — coverage
is master data about the carrier, not an operational action, and its role gate MUST NOT
diverge from the rest of the carrier catalog's write surface.

Assigning a carrier and marking an assignment delivered are OPERATIONS, not master-data
writes. They MUST follow the same roles as `POST /orders/:id/deliver`: `owner`, `admin`,
or `warehouse_operator`.

(Previously: identical text, but silent on the coverage-write endpoints' role
requirement — `POST`/`DELETE /delivery/carriers/:id/warehouses` were live and already
gated `owner`/`admin` in code with no requirement or scenario documenting it. This
amendment closes that documentation gap; it does not change the gate itself.)

#### Scenario: Only owner/admin can create a carrier

- GIVEN a caller holding only `warehouse_operator`
- WHEN they attempt to create a carrier
- THEN the request is denied

#### Scenario: Any authenticated tenant user can read carriers

- GIVEN a caller holding only `sales_agent`
- WHEN they request the carrier list
- THEN access is admitted — no role restriction applies to reads

#### Scenario: warehouse_operator can assign a carrier

- GIVEN a caller holding only `warehouse_operator`
- WHEN they assign a carrier to a `verified` delivery-mode order
- THEN the request is admitted

#### Scenario: warehouse_operator can mark an assignment delivered

- GIVEN a caller holding only `warehouse_operator`
- WHEN they mark a `DeliveryAssignment` delivered
- THEN the request is admitted

#### Scenario: A role with none of owner/admin/warehouse_operator cannot assign or mark delivered

- GIVEN a caller holding only `sales_agent`
- WHEN they attempt to assign a carrier or mark an assignment delivered
- THEN the request is denied

#### Scenario: Only owner/admin can declare or remove carrier-warehouse coverage

- GIVEN a caller holding only `warehouse_operator`
- WHEN they attempt `POST` or `DELETE /delivery/carriers/:id/warehouses`
- THEN the request is denied — coverage writes require the same roles as the rest of
  the carrier catalog

### Requirement: A Cancelled Order Never Leaves an Open Assignment Behind

Because a `verified` order with an `in_transit` `DeliveryAssignment` can be cancelled
(`salesops-ventas`'s Order Status Lifecycle allows `cancelled` from `verified`), an order
MUST NOT be allowed to reach `cancelled` while a `DeliveryAssignment` referencing it
remains `in_transit`. When an order transitions to `cancelled`, any open (`in_transit`)
`DeliveryAssignment` for that order MUST be closed to `cancelled` — never to `delivered` —
in the SAME transaction as the order's own status update. `deliveredAt` MUST stay NULL: a
cancellation is not a delivery, and closing it as `delivered` would make computed
throughput count a delivery that never happened.

This is the cancel-side mirror of the promoted spec's "A Delivered Order Never Leaves an
Open Assignment Behind" requirement — that requirement covers the `deliver` edge, this one
covers the `cancel` edge. Before this amendment, `cancel` had no closer at all: an assigned
order that got cancelled left a permanently `in_transit` row, reporting its carrier BUSY
forever, invisible to "orders awaiting a carrier" (already assigned) and unrecoverable
through any API path (`markDelivered` on a cancelled order is rejected as an invalid
transition) — the only recovery was manual SQL.

Mechanism: closing the assignment is a guarded conditional `UPDATE ... WHERE order_id = $1
AND status = 'in_transit'`, invoked inside `OrderService.cancel()`'s already-open
transaction, after the order's own `FOR UPDATE` row lock is taken. Zero rows affected is
the NORMAL outcome for a pickup order (never has a row), an unassigned delivery order, or
a re-application — never treated as an error.

#### Scenario: Cancelling an order with an open assignment closes it to cancelled

- GIVEN a `verified` order with `deliveryMode='delivery'` and a `DeliveryAssignment` in
  `in_transit`
- WHEN the order is cancelled
- THEN the `DeliveryAssignment` transitions to `cancelled` in the same operation — no
  assignment is left `in_transit` behind a `cancelled` order

#### Scenario: The closed assignment is never marked delivered

- GIVEN a `verified` order with an open assignment that is then cancelled
- WHEN the resulting `DeliveryAssignment` is inspected
- THEN its status is `cancelled`, never `delivered`, and `deliveredAt` is NULL

#### Scenario: An order with no assignment is unaffected by cancel reconciliation

- GIVEN a `verified` order with `deliveryMode='delivery'` and no `DeliveryAssignment`
- WHEN it is cancelled
- THEN the reconciliation is a no-op — no assignment is created or modified

#### Scenario: A pickup order is unaffected by cancel reconciliation

- GIVEN a `verified` order with `deliveryMode='pickup'`
- WHEN it is cancelled
- THEN the reconciliation is a no-op — pickup orders never have assignments to reconcile

#### Scenario: Cancelling an order in created status is unaffected

- GIVEN an order in `created` status (never `verified`, so it can never have an
  assignment)
- WHEN it is cancelled
- THEN the reconciliation is a no-op

### Requirement: Delivery Assignment and Capacity Reads Are Role-Gated and Warehouse-Scoped

`GET /delivery/assignments`, `GET /delivery/assignments/by-order/:orderId`, and
`GET /delivery/capacity` MUST require `owner`, `admin`, `sales_operator`, or
`warehouse_operator`. A caller whose only role is `sales_agent` MUST be denied with `403`.
This is separate from, and MUST NOT be confused with, the Carrier catalog's own reads
(`GET /delivery/carriers[/:id]`), which remain open to any authenticated tenant user
per the Carrier Catalog Roles Mirror Existing Master Data requirement, unchanged by this
amendment.

For a caller whose access comes SOLELY from `warehouse_operator` (the same "solely"
qualifier `salesops-ventas`'s agent/operator scoping already uses): `GET
/delivery/assignments` MUST be filtered to assignments whose order belongs to that
caller's own warehouse, pushed into the query through the assignment→order relation — not
read unfiltered and then filtered in application code. `GET
/delivery/assignments/by-order/:orderId` MUST reject with `403` when the named order
belongs to a different warehouse — AND, identically, `403` when no order with that id
exists at all. A scoped `warehouse_operator` MUST NOT be able to distinguish "this order
belongs to another warehouse" from "this order does not exist" by response code: an unknown
order id resolves to a sentinel warehouse no real warehouse can hold, so the SAME scope
check that rejects a foreign order also rejects a missing one, with the identical `403` —
never a `404`. Without this, the endpoint would work as an order-existence oracle for
exactly the role its scope exists to restrict.

`GET /delivery/capacity` MUST NOT be warehouse-scoped, even for a scoped
`warehouse_operator` — this is DELIBERATE, not an oversight: the endpoint reports only
per-carrier aggregate counts, naming no order id, so there is nothing warehouse-specific
to leak. Scoping it would additionally misrepresent a carrier's TRUE company-wide
busy/free state as a warehouse-local one, which the underlying computation does not
support.

Warehouse-scope denial across all three reads is the domain `WarehouseScopeViolationError`
(`packages/domain/src/users/errors.ts`), never a controller-local exception — each
controller maps it to `403`. `salesops-ventas`'s `OrderController` maps the SAME error to
`403` for the equivalent order-side scoping, so a scoped `warehouse_operator` gets
identical treatment whichever door (`/orders/...` or `/delivery/...`) they use.

#### Scenario: sales_agent is denied on every delivery read

- GIVEN a caller holding only `sales_agent`
- WHEN they call `GET /delivery/assignments`, `GET /delivery/assignments/by-order/:orderId`,
  or `GET /delivery/capacity`
- THEN each request is denied with `403`

#### Scenario: owner/admin/sales_operator/warehouse_operator can read assignments and capacity

- GIVEN a caller holding any one of `owner`, `admin`, `sales_operator`, or
  `warehouse_operator`
- WHEN they call any of the three reads above
- THEN access is admitted

#### Scenario: A scoped warehouse_operator's assignment list is filtered by their warehouse

- GIVEN a caller whose only role is `warehouse_operator`, scoped to warehouse `W1`, and
  `DeliveryAssignment` rows exist for orders in both `W1` and `W2`
- WHEN they call `GET /delivery/assignments`
- THEN only assignments whose order belongs to `W1` are returned, filtered by the
  database query itself

#### Scenario: A scoped warehouse_operator reading a cross-warehouse assignment by order is denied

- GIVEN a caller whose only role is `warehouse_operator`, scoped to warehouse `W1`, and a
  `DeliveryAssignment` for an order in `W2`
- WHEN they call `GET /delivery/assignments/by-order/:orderId` for that order
- THEN the request is denied with `403`

#### Scenario: A scoped warehouse_operator reading an unknown order by id gets the same 403, never a 404

- GIVEN a caller whose only role is `warehouse_operator`, scoped to warehouse `W1`, and an
  `orderId` that matches no order at all
- WHEN they call `GET /delivery/assignments/by-order/:orderId` for that id
- THEN the request is denied with `403` — identical to the cross-warehouse case, so the
  response never reveals whether the order exists somewhere else or not at all

#### Scenario: Capacity is role-gated but not warehouse-scoped

- GIVEN a caller whose only role is `warehouse_operator`, scoped to warehouse `W1`
- WHEN they call `GET /delivery/capacity`
- THEN the response reports company-wide carrier capacity, not filtered to `W1` — the
  endpoint names no order id, so there is nothing to scope

### Requirement: Carrier Deactivation Is Guarded and Atomic Against Concurrent Assignment

Deactivating a carrier — via `PATCH /delivery/carriers/:id {"active": false}` or via
soft-`DELETE /delivery/carriers/:id` — MUST be rejected with `409`
(`CarrierHasOpenAssignmentsError`) when that carrier holds one or more `in_transit`
`DeliveryAssignment` rows. Both writers of `active` MUST share ONE guard: deactivating a
carrier that still has in-flight orders would hide those orders from every operational
read at once (`getCarrierCapacity` sources only `active` carriers, and "orders awaiting a
carrier" cannot re-offer an order that already has an assignment), with no API path left
to recover them.

The guard MUST be atomic against a concurrent assignment: it takes a `FOR UPDATE` row lock
on the carrier before counting open assignments and writing, inside one transaction.
Creating a `DeliveryAssignment` (see the DeliveryAssignment requirement) takes the SAME
`FOR UPDATE` lock on the carrier row before inserting, so the two operations serialize —
whichever runs first wins honestly: a deactivation that commits first sees the carrier
inactive and 404s any later assignment attempt; an assignment that commits first is
counted by a later deactivation attempt and blocks it with 409. Neither ordering can leave
an assignment orphaned behind a deactivated carrier.

#### Scenario: Deactivating a carrier with an open assignment is rejected

- GIVEN an active carrier with one `DeliveryAssignment` in `in_transit`
- WHEN `PATCH /delivery/carriers/:id {"active": false}` is called
- THEN the request is rejected with `409`

#### Scenario: Deactivating a carrier with only closed assignments succeeds

- GIVEN an active carrier whose only assignments are `delivered` or `cancelled`
- WHEN it is deactivated
- THEN the request succeeds

#### Scenario: Soft-delete and the active:false PATCH share the same guard

- GIVEN an active carrier with an `in_transit` assignment
- WHEN `DELETE /delivery/carriers/:id` is called instead of the `PATCH`
- THEN it is rejected with the SAME `409` — both writers of `active` funnel through one
  guard

#### Scenario: Assigning to a carrier deactivated concurrently is rejected, not stranded

- GIVEN an active carrier with no open assignment, and a concurrent request that
  deactivates it
- WHEN an assignment attempt's `FOR UPDATE` re-validation runs after the deactivation
  commits
- THEN the assignment attempt is rejected with `404` — no `in_transit` row is created
  against a carrier that is no longer active

### Requirement: Delivery Endpoints Validate Identifiers and Fail Loud, Never With a 500

Every path, query, or body parameter that names a resource id in the Delivery module's
endpoints MUST be validated as a well-formed UUID before any database query runs. A
malformed value MUST be rejected with `400` — it MUST NEVER reach the database and
surface as an unhandled `500`.

A well-formed but unknown carrier id on `PATCH`/`DELETE /delivery/carriers/:id` MUST be
rejected with `404` (`CarrierNotFoundError`), never surface as an unhandled `500`.

Declaring carrier-warehouse coverage (`POST /delivery/carriers/:id/warehouses`) against a
carrier that exists but is INACTIVE (`active=false`) MUST be rejected with `404` — an
inactive carrier is treated as not-found for the purpose of declaring new coverage, the
same way it is excluded from assignment.

#### Scenario: A malformed uuid anywhere is rejected with 400

- GIVEN a request to any Delivery endpoint carrying a path, query, or body value that is
  not a well-formed UUID where a resource id is expected
- WHEN the request is made
- THEN it is rejected with `400` — no query is issued

#### Scenario: PATCH on a well-formed unknown carrier id is rejected with 404

- GIVEN a syntactically valid UUID that does not match any `Carrier` row
- WHEN `PATCH /delivery/carriers/:id` is called with that id
- THEN it is rejected with `404`, never a `500`

#### Scenario: DELETE on a well-formed unknown carrier id is rejected with 404

- GIVEN a syntactically valid UUID that does not match any `Carrier` row
- WHEN `DELETE /delivery/carriers/:id` is called with that id
- THEN it is rejected with `404`, never a `500`

#### Scenario: Declaring coverage for an inactive carrier is rejected with 404

- GIVEN an existing carrier with `active=false`
- WHEN `POST /delivery/carriers/:id/warehouses` is called for it
- THEN it is rejected with `404` — coverage cannot be declared for a retired carrier

