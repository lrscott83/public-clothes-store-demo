# Spec — salesops-delivery (NEW capability)

## Purpose

Fulfils the seam reserved by `packages/domain/src/sales/order.ts:13-17` and
`openspec/specs/salesops-ventas/spec.md`'s Order Delivery Mode requirement:
a carrier catalog, warehouse coverage, a `DeliveryAssignment` two-state
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
| name | string | required |
| phone | string | optional |
| active | boolean | soft-delete, default `true` — never a hard `DELETE` |
| createdAt/updatedAt | datetime | audit |

`Carrier` MUST NOT carry a `zone` field of any kind, and MUST NOT carry any
stored capacity/`maxOrdersPerDay` field. Coverage is expressed exclusively by
`CarrierWarehouse` (see below); capacity is exclusively computed (see the
Computed Capacity requirement).

#### Scenario: Carrier is created with required name only

- GIVEN a create-carrier request with `name` and no `phone`
- WHEN the carrier is created
- THEN it persists with `phone` null and `active=true`

#### Scenario: Deleting a carrier soft-deletes it

- GIVEN an existing `Carrier`
- WHEN it is deleted
- THEN `active` flips to `false` and the row remains retrievable — no hard
  delete occurs

#### Scenario: No zone field exists on Carrier

- GIVEN the persisted `Carrier` schema
- WHEN inspected
- THEN no `zone` column or equivalent field exists anywhere on `Carrier`

#### Scenario: No capacity field exists on Carrier

- GIVEN the persisted `Carrier` schema
- WHEN inspected
- THEN no `capacity`/`maxOrdersPerDay` column or equivalent field exists
  anywhere on `Carrier`

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

### Requirement: DeliveryAssignment Is a Two-State Bridge, Zero-Or-One Per Order

The system MUST persist a `DeliveryAssignment` bridging an `Order` to a
`Carrier`, with `orderId String @unique` (0..1 assignment per order, mirroring
`CommissionAccrual.orderId`'s idempotency guarantee). `status` MUST be exactly
two states: `in_transit | delivered` — no third "assigned but not yet picked
up" state exists.

| Field | Type | Rule |
|---|---|---|
| id | UUID | PK |
| orderId | UUID FK | unique, `onDelete: Restrict` |
| carrierId | UUID FK | `onDelete: Restrict` |
| status | `in_transit \| delivered` | default `in_transit` on creation |
| assignedAt | datetime | required |
| deliveredAt | datetime | optional, set on transition to `delivered` |
| createdAt/updatedAt | datetime | audit |

Assigning a carrier to an order MUST create the `DeliveryAssignment` in
`in_transit` atomically — carrier and initial state are set together, never
in two separate writes.

Pickup-mode orders (`deliveryMode='pickup'`) MUST NEVER receive a
`DeliveryAssignment` row — the 0 case of the 0..1 cardinality is the modelled
meaning for pickup orders, not an anomaly to backfill.

#### Scenario: Assigning a carrier creates an in_transit assignment atomically

- GIVEN a `verified` order with `deliveryMode='delivery'` and no existing
  assignment
- WHEN a carrier is assigned to it
- THEN a `DeliveryAssignment` is created with `status='in_transit'`, carrier
  and status set in the same atomic write

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

#### Scenario: Only two assignment states exist

- GIVEN the `DeliveryAssignmentStatus` enum
- WHEN inspected
- THEN it defines exactly `in_transit` and `delivered` — no third state

### Requirement: Carrier Capacity Is Computed, Never Stored

Carrier busy/free capacity MUST be derived by a pure function over live
`DeliveryAssignment` rows — no `capacity`/`maxOrdersPerDay` column MUST exist
anywhere in the schema. A carrier is BUSY when it has one or more assignments
in `status='in_transit'`; otherwise it is FREE. This computation MUST be
re-derivable at any time from current assignment state alone, with no cached
or persisted capacity number to go stale.

The count of orders awaiting a carrier (`verified`, `deliveryMode='delivery'`,
no assignment yet) MUST be reported as an independent read — a count of
ORDERS, not derivable from carrier rows.

#### Scenario: A carrier with an open in_transit assignment is busy

- GIVEN a carrier with one `DeliveryAssignment` in `in_transit`
- WHEN capacity is computed for that carrier
- THEN it is reported busy

#### Scenario: A carrier with no in_transit assignments is free

- GIVEN a carrier with zero assignments, or only `delivered` assignments
- WHEN capacity is computed for that carrier
- THEN it is reported free

#### Scenario: Capacity recomputes correctly after delivery

- GIVEN a carrier busy due to one `in_transit` assignment
- WHEN that assignment transitions to `delivered`
- THEN capacity recomputed for that carrier reports it free — no stale stored
  value persists

#### Scenario: Orders awaiting a carrier is reported independently

- GIVEN two `verified`, `deliveryMode='delivery'` orders with no assignment,
  and one `verified` order that already has an assignment
- WHEN the "orders awaiting a carrier" read runs
- THEN it reports a count of 2 — a count of orders, not of carriers

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

Carrier catalog writes (`create`/`update`/soft-`delete`) MUST require
`owner` or `admin`. Carrier catalog reads MUST carry no `@Roles` restriction —
open to any authenticated tenant user — mirroring the verified convention on
`product.controller.ts`, `category.controller.ts`, and
`warehouse.controller.ts`.

Assigning a carrier and marking an assignment delivered are OPERATIONS, not
master-data writes. They MUST follow the same roles as
`POST /orders/:id/deliver`: `owner`, `admin`, or `warehouse_operator`.

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
