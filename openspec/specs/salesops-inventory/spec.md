# Spec — salesops-inventory

## Purpose

Define the testable contract for the `salesops-inventory` capability: `Warehouse` master-data, per-`(product, warehouse)` `StockLevel` with a derived `available` (`onHand − reserved`, never stored and never negative), and an append-only `StockMovement` log where `onHand` mutates ONLY through a recorded movement. All entities live behind hexagonal repository ports, reference `Product` read-only by `productId`, and keep `Product` free of any inventory field. Reservation/release and purchasing are deferred to documented future seams (`IStockReservationProvider` for Ventas, `IPurchaseCostUpdater` for Compras) — this capability persists the fields those seams write, but does not implement the seams itself.

## Requirements

### Requirement: Warehouse Master-Data Entity

The system MUST persist a `Warehouse` entity as flat master data (no location hierarchy or address fields).

| Field | Type | Constraint |
|---|---|---|
| id | UUID | PK |
| name | string | required |
| active | boolean | soft-delete |
| createdAt / updatedAt | datetime | audit |

CRUD MUST be supported. The system MUST seed exactly 3 `Warehouse` rows.

#### Scenario: Warehouse created with required fields

- GIVEN a valid `name`
- WHEN the warehouse is created
- THEN it persists with `active=true` by default and no location/address fields exist on the entity

#### Scenario: Seed produces 3 active warehouses

- GIVEN a fresh database
- WHEN the seed runs
- THEN exactly 3 `Warehouse` rows exist, all `active=true`

#### Scenario: Deactivated warehouse is not hard-deleted

- GIVEN a `Warehouse` with `active=false`
- WHEN the warehouse is queried by id
- THEN the row still exists and remains retrievable

### Requirement: StockLevel Entity (Product × Warehouse)

The system MUST persist a `StockLevel` entity keyed by the unique pair `(productId, warehouseId)`, tracking `onHand` and `reserved` quantities. `available` MUST be derived at read time as `onHand − reserved` and MUST NEVER be stored. Neither `onHand` nor `reserved` MUST ever go negative.

| Field | Type | Constraint |
|---|---|---|
| id | UUID | PK |
| productId | UUID | FK → Product, required |
| warehouseId | UUID | FK → Warehouse, required |
| onHand | number | ≥ 0 |
| reserved | number | ≥ 0 |
| createdAt / updatedAt | datetime | audit |

UNIQUE constraint on `(productId, warehouseId)`.

#### Scenario: Available is derived, never stored

- GIVEN a `StockLevel` with `onHand=10` and `reserved=3`
- WHEN `available` is read
- THEN it equals `7`, computed on the fly and not persisted as a column

#### Scenario: Negative onHand rejected

- GIVEN a `StockLevel` with `onHand=2`
- WHEN an operation would reduce `onHand` below `0`
- THEN the system MUST reject it — negative `onHand` is impossible

#### Scenario: Negative reserved rejected

- GIVEN a `StockLevel` with `reserved=1`
- WHEN an operation would reduce `reserved` below `0`
- THEN the system MUST reject it — negative `reserved` is impossible

#### Scenario: Missing StockLevel means zero stock

- GIVEN no `StockLevel` row exists for a given `(productId, warehouseId)` pair
- WHEN stock is queried for that pair
- THEN `onHand`, `reserved`, and `available` MUST all resolve to `0` without requiring a persisted row

#### Scenario: Duplicate product-warehouse pair rejected

- GIVEN an existing `StockLevel` for `(productId=P, warehouseId=W)`
- WHEN a second `StockLevel` is created for the same `(P, W)` pair
- THEN the system MUST reject it — the pair is unique

#### Scenario: No StockLevel rows are seeded

- GIVEN a fresh database after seeding
- WHEN `StockLevel` rows are counted
- THEN the count MUST be `0` — only the 3 warehouses are seeded; StockLevel rows are created lazily on first movement

### Requirement: StockMovement Append-Only Audit Log

The system MUST persist `StockMovement` as an append-only log of every physical `onHand` change. Each movement MUST carry a positive `quantity` magnitude; the movement `type` (a closed set) implies direction — never a signed delta.

| Field | Type | Constraint |
|---|---|---|
| id | UUID | PK |
| productId | UUID | FK → Product, required |
| warehouseId | UUID | FK → Warehouse, required |
| type | enum | closed set: `purchase_in \| sale_out \| transfer_in \| transfer_out \| adjustment_in \| adjustment_out` |
| reason | string \| null | optional free text, default null |
| quantity | number | > 0, positive magnitude |
| createdAt | datetime | audit |
| createdBy | string \| null | optional, nullable — no auth module yet |

#### Scenario: Movement quantity is a positive magnitude

- GIVEN a `StockMovement` with `type=sale_out`
- WHEN `quantity` is set to a negative or zero value
- THEN the system MUST reject it — `quantity` MUST always be a positive magnitude; direction comes from `type`, never from the sign

#### Scenario: Movement referencing an unknown product is rejected

- GIVEN a `StockMovement` payload whose `productId` does not resolve via `IProductRepository`
- WHEN the movement is recorded
- THEN the system MUST reject it — every movement's product reference MUST be validated against Product

#### Scenario: adjustment_in/out records manual corrections

- GIVEN a physical stock count reveals a discrepancy
- WHEN an `adjustment_in` or `adjustment_out` movement is recorded with a `reason`
- THEN it persists as a normal append-only movement like any other type

#### Scenario: createdBy is nullable

- GIVEN no authentication mechanism exists in this change
- WHEN a `StockMovement` is recorded without a `createdBy`
- THEN the system MUST accept it with `createdBy=null` — populating it is deferred to a future transversal `@CurrentUser` guard owned by the Usuarios module

### Requirement: WarehouseOperator FKs Tenant CompanyUser, Not Master User

`WarehouseOperator` MUST live in the tenant schema. Its identity link MUST be
`companyUserId` (PK AND FK, `@relation` to the tenant `CompanyUser.id`),
replacing the prior `userId @id @relation` to the master `User`
(`schema.prisma:509`) — Prisma forbids a cross-schema `@relation`. The
1:1-with-identity, non-unique-`warehouseId` shape is preserved; only the
relation's target changes. The role-scoping behavior itself
(`salesops-identity`'s "OperadorAlmacen Warehouse Scope") is unaffected by
this reshape.

#### Scenario: WarehouseOperator.companyUserId is the PK

- GIVEN the tenant `WarehouseOperator` schema after this change
- WHEN inspected
- THEN `companyUserId` is both PK and FK, `@relation`s to the tenant
  `CompanyUser`, and no `userId` field or relation to the master `User`
  exists

#### Scenario: warehouseId remains non-unique

- GIVEN two `WarehouseOperator` rows for the same `warehouseId`, each with a
  different `companyUserId`
- WHEN both are persisted
- THEN both succeed — a warehouse MAY still have many operators

### Requirement: onHand Mutates Only Through a Recorded Movement

`StockLevel.onHand` MUST change ONLY as the result of persisting a corresponding `StockMovement`. There MUST be no code path that mutates `onHand` directly without an audit trail entry.

#### Scenario: Recording a movement updates onHand

- GIVEN a `StockLevel` with `onHand=5` for `(productId=P, warehouseId=W)`
- WHEN a `purchase_in` movement of `quantity=10` is recorded for `(P, W)`
- THEN `onHand` becomes `15` and a `StockMovement` row exists documenting the change

#### Scenario: Direct onHand change without a movement is impossible

- GIVEN the system's public operations for stock
- WHEN inspected
- THEN no operation MUST exist that sets `onHand` without also creating a `StockMovement`

### Requirement: Reservation and Release Adjust reserved Without a Movement

> **Deferred to the Ventas seam.** This requirement defines the CONTRACT that `IStockReservationProvider` (owned by the future Ventas module) MUST honor. The `salesops-inventory` capability persists the `reserved` field and derives `available` to support it, but does NOT itself expose reserve/release/fulfill operations in this change — they arrive with Ventas.

Reserving or releasing stock MUST adjust `StockLevel.reserved` directly and MUST NOT create a `StockMovement` — reservations do not move physical stock. The physical decrement MUST happen at fulfillment via a `sale_out` movement.

#### Scenario: Reservation adjusts reserved only

- GIVEN a `StockLevel` with `onHand=10`, `reserved=0`
- WHEN `3` units are reserved (via the future Ventas seam)
- THEN `reserved` becomes `3`, `onHand` stays `10`, `available` becomes `7`, and no `StockMovement` row is created

#### Scenario: Release restores reserved without a movement

- GIVEN a `StockLevel` with `onHand=10`, `reserved=3`
- WHEN the `3` reserved units are released (via the future Ventas seam)
- THEN `reserved` becomes `0` and no `StockMovement` row is created

#### Scenario: Fulfillment decrements physical stock via sale_out

- GIVEN a `StockLevel` with reserved units awaiting fulfillment
- WHEN the sale is fulfilled (via the future Ventas seam)
- THEN a `sale_out` `StockMovement` MUST be recorded and `onHand` MUST decrease accordingly — this is distinct from the earlier reservation step

### Requirement: Read-Only Product Relationship, Zero Inventory Fields on Product

`StockLevel` and `StockMovement` MUST reference `Product` only by `productId`, a read-only foreign key validated through `IProductRepository`. `Product` MUST NOT carry any inventory-related field (no `onHand`, `stock`, `warehouseId`, etc.).

#### Scenario: Product schema has no inventory fields

- GIVEN the `Product` entity fields
- WHEN inspected
- THEN no `stock`, `onHand`, `warehouseId`, or equivalent field exists

#### Scenario: Inventory validates product existence via the port

- GIVEN a `StockLevel` or `StockMovement` create request
- WHEN the referenced `productId` is validated
- THEN validation MUST go through `IProductRepository`, never a direct table join or duplicated product data

### Requirement: Availability-for-Sale Is Out of Scope Here

Combining `active` and `available > 0` into an "available-for-sale" decision is NOT part of this capability. It MUST be documented as the responsibility of the future Ventas seam.

#### Scenario: Inventario does not expose an availability-for-sale flag

- GIVEN the `salesops-inventory` capability's public surface
- WHEN inspected
- THEN no combined "available-for-sale" (`active AND available>0`) computation exists — Ventas MUST compute this itself using `Product.active` and `StockLevel.available`

### Requirement: Documented Seams for Future Modules

The system MUST document, but MUST NOT implement, `IStockReservationProvider` (owned by a future Ventas module) and `IPurchaseCostUpdater` (owned by a future Compras module, in `purchase-cost-seam.md`).

#### Scenario: Reservation seam is documented, not implemented

- GIVEN the Inventario capability
- WHEN searched for a reservation-decrement implementation
- THEN none exists — only the `IStockReservationProvider` contract is documented for the future Ventas module

#### Scenario: Purchase-cost seam is documented, not implemented

- GIVEN the Inventario capability
- WHEN searched for a weighted-average cost recomputation
- THEN none exists — only the `IPurchaseCostUpdater` contract is documented in `purchase-cost-seam.md` for a future Compras module
