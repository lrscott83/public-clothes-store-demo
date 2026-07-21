# Spec — salesops-products

## Purpose

Define the testable contract for the `salesops-products` capability: the catalog master-data vertical slice providing a `Product` entity and a flat `Category` entity, decimal-safe USD pricing via the `Money` value object with a derived `finalPrice`/`isOffer` (never stored), soft-delete with no orphaned references, a commission-free Product boundary (commission owned by a future Gestores/Comisiones add-on through a port), and an idempotent catalog seed of the 11 category slugs — all persisted behind hexagonal repository ports and exposed as CRUD HTTP endpoints that serialize decimals as strings.

## Requirements

### Requirement: Product Master-Data Entity

The system MUST persist a `Product` entity as master data referenced by Ventas, Inventario and Finanzas.

| Field | Type | Constraint |
|---|---|---|
| id | UUID | PK |
| name | string | required |
| description | string | — |
| sku | string | nullable |
| barcode | string | nullable |
| price | Money(USD) | required, > 0 |
| percentDiscountPrice | number | 0–100, default 0 |
| discountPrice | Money(USD) | ≥ 0, default 0 |
| costoUSD | Money(USD) | supplier cost |
| categoryId | FK → Category.id | required |
| image | string | — |
| isNew | boolean | default false |
| order | int | display order |
| active | boolean | soft-delete |
| createdAt / updatedAt | datetime | audit |

#### Scenario: Product created with required fields

- GIVEN a valid `name`, `price > 0`, and an existing `categoryId`
- WHEN the product is created
- THEN it persists with `sku`/`barcode` nullable and `percentDiscountPrice`/`discountPrice` defaulted to 0

#### Scenario: Product rejected without category

- GIVEN a product payload with no `categoryId` or a `categoryId` that does not exist
- WHEN creation is attempted
- THEN the system MUST reject it — `categoryId` is a required FK, never optional

### Requirement: Category Master-Data Entity

The system MUST persist a flat (non-hierarchical) `Category` entity.

| Field | Type | Constraint |
|---|---|---|
| id | UUID | PK |
| name | string | required |
| slug | string | UNIQUE |
| image | string | nullable, default null |
| icon | string | nullable, default null |
| order | int | display order |
| active | boolean | soft-delete |
| createdAt / updatedAt | datetime | audit |

#### Scenario: Category has no parent/child relationship

- GIVEN the Category schema
- WHEN inspected
- THEN it MUST NOT contain a `parentId` or any hierarchy field

#### Scenario: Duplicate slug rejected

- GIVEN an existing category with slug `cafeteras`
- WHEN a new category is created with the same slug
- THEN the system MUST reject it — `slug` is unique

### Requirement: Derived Final-Price Computation

The system MUST derive `finalPrice` and `isOffer` at read time — never store them. `finalPrice = max(0, price − (percentDiscountPrice/100 × price) − discountPrice)`. A term whose value is 0 contributes nothing to the subtraction. `isOffer = percentDiscountPrice > 0 || discountPrice > 0`.

#### Scenario: Percent and fixed discount stack

- GIVEN `price=100`, `percentDiscountPrice=20`, `discountPrice=5`
- WHEN `finalPrice` is computed
- THEN it equals `75`

#### Scenario: 100% discount is free

- GIVEN `price=50`, `percentDiscountPrice=100`, `discountPrice=0`
- WHEN `finalPrice` is computed
- THEN it equals `0`

#### Scenario: Over-discount clamps at zero

- GIVEN `price=10`, `percentDiscountPrice=50`, `discountPrice=20`
- WHEN `finalPrice` is computed
- THEN it equals `0`, never negative

#### Scenario: No discount defaults to base price

- GIVEN `percentDiscountPrice=0` and `discountPrice=0` (defaults)
- WHEN `finalPrice` is computed
- THEN `finalPrice == price` and `isOffer == false`

### Requirement: Decimal-Safe Money for Price and Cost

`price`, `discountPrice`, and `costoUSD` MUST be the existing `Money` VO from `@store-mgmt/domain` currency, denominated in USD. `finalPrice` computation MUST use the Money VO's HALF-UP rounding at scale 2 applied once, never intermediate float arithmetic.

#### Scenario: Pricing math never uses float

- GIVEN a `finalPrice` computation with a fractional intermediate result
- WHEN the value is rounded
- THEN it rounds HALF-UP at scale 2 exactly once, matching the Currency module's rounding contract

#### Scenario: Mono-currency deploy is valid

- GIVEN an empty exchange-rate table
- WHEN a `Product` with `price` in USD is read
- THEN the system resolves it without requiring any rate row, since USD is the pivot currency

### Requirement: Soft-Delete and No Orphan Products

Both `Product` and `Category` MUST use an `active` flag for soft-delete; neither table permits hard-delete of rows referenced elsewhere.

#### Scenario: Deactivated category keeps its products intact

- GIVEN a `Category` with `active=false` and existing products referencing it
- WHEN the category is queried
- THEN its `id` remains valid and referencing products are NOT orphaned or cascaded-deleted

#### Scenario: Deactivated product excluded from active listings

- GIVEN a `Product` with `active=false`
- WHEN the default product listing is queried
- THEN it MUST be excluded, while remaining retrievable by direct id for historical references (e.g. past orders)

### Requirement: Commission-Free Product Boundary

`Product` MUST NOT carry any commission-related field. A commission reference, when needed, MUST be owned by a separate future Gestores/Comisiones module and read only through a port, never embedded in core Product data.

#### Scenario: Product schema has no commission field

- GIVEN the `Product` entity fields
- WHEN inspected
- THEN no `commission`, `comisionMN`, or equivalent field exists

#### Scenario: Commission absent when add-on module disabled

- GIVEN the Gestores/Comisiones module is not enabled
- WHEN a caller needs a product's commission
- THEN the value MUST resolve to absent/0 rather than reading a Product field directly

### Requirement: Category Catalog Seed Load

The system MUST seed exactly the 11 existing catalog slugs as `Category` rows: `cafeteras`, `climatizacion`, `cocinas`, `energia-solar`, `freidoras`, `lavadoras`, `licuadoras`, `ollas`, `refrigeracion`, `tv-y-audio`, `utiles`. The seed MUST be idempotent — re-running it upserts (Category by unique `slug`, Product by a deterministic id) and never duplicates rows.

#### Scenario: Seed produces 11 active categories

- GIVEN a fresh database
- WHEN the seed runs
- THEN exactly 11 `Category` rows exist, one per catalog slug, all `active=true`

#### Scenario: Seeded products reference a valid category

- GIVEN seeded `Product` rows sourced from `catalog.json`
- WHEN each product is created
- THEN its `categoryId` MUST resolve to one of the 11 seeded categories, never a dangling reference

#### Scenario: Re-running the seed does not duplicate

- GIVEN a database already seeded once
- WHEN the seed runs a second time
- THEN there are still exactly 11 active categories and the same product count, with stable ids and no duplicates
