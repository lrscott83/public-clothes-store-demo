# Spec — salesops-products

## Purpose

Define the testable contract for the `salesops-products` capability: the catalog master-data vertical slice providing a `Product` entity and a flat `Category` entity, decimal-safe multi-currency pricing via the `Money` value object with a derived `finalPrice`/`isOffer` (never stored), soft-delete with no orphaned references, a commission-free Product boundary (commission owned by a future Gestores/Comisiones add-on through a port), and an idempotent catalog seed of the 11 category slugs — all persisted behind hexagonal repository ports and exposed as CRUD HTTP endpoints that serialize decimals as strings and money fields as `{ amount, currency }`.

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
| price | Money | required, amount > 0, currency required (USD/EUR/MN) |
| percentDiscountPrice | number | 0–100, default 0 |
| discountPrice | decimal | ≥ 0, default 0, no currency |
| cost | Money | required, amount ≥ 0, currency required (USD/EUR/MN); MAY differ from `price`'s currency |
| categoryId | FK → Category.id | required |
| image | string | — |
| isNew | boolean | default false |
| order | int | display order |
| active | boolean | soft-delete |
| createdAt / updatedAt | datetime | audit |

`price.currency` and `cost.currency` are each chosen independently by the caller and MAY DIFFER (e.g. bought in one currency, sold in another) — the system MUST NOT force either to a fixed currency.

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

`price` and `cost` MUST be the existing `Money` VO from `@store-mgmt/domain` currency — each carries its own required `currency` (USD/EUR/MN), chosen by the caller, never forced to a fixed currency, and `price.currency` MAY DIFFER from `cost.currency`. `discountPrice` MUST be a bare decimal-safe scaled value (no currency attached), reusing the same scaled-decimal discipline as `percentDiscountPrice`. `finalPrice` computation MUST use the Money VO's HALF-UP rounding at scale 2 applied once, never intermediate float arithmetic, and resolves in `price.currency`.

#### Scenario: Pricing math never uses float

- GIVEN a `finalPrice` computation with a fractional intermediate result
- WHEN the value is rounded
- THEN it rounds HALF-UP at scale 2 exactly once, matching the Currency module's rounding contract

#### Scenario: Mono-currency deploy is valid

- GIVEN an empty exchange-rate table
- WHEN a `Product` with `price` in USD is read
- THEN the system resolves it without requiring any rate row, since USD is the pivot currency

#### Scenario: price and cost currencies may differ

- GIVEN a `Product` created with `price` denominated in EUR and `cost` denominated in MN
- WHEN the product is persisted and read back
- THEN both currencies round-trip independently — the system MUST NOT force `price` and `cost` to share a currency

### Requirement: API Requires an Explicit Currency per Money Field

Every HTTP request/response `Money`-backed field (`price`, `cost`, derived `finalPrice`) MUST be represented as `{ amount: string, currency: string }`, with `currency` REQUIRED and validated against the supported `Currency` set (USD/EUR/MN). `discountPrice` and `percentDiscountPrice` remain plain decimal strings (no currency).

#### Scenario: Missing or unknown currency rejected

- GIVEN a `POST /products` or `PATCH /products/:id` payload where `price.currency` or `cost.currency` is missing or not one of USD/EUR/MN
- WHEN the request is submitted
- THEN the system MUST reject it with 400, never silently defaulting to a currency

#### Scenario: Response currency reflects the persisted choice

- GIVEN a `Product` persisted with `price` in EUR and `cost` in MN
- WHEN it is read via the API
- THEN the response's `price.currency` is `"EUR"`, `cost.currency` is `"MN"`, and `finalPrice.currency` equals `price.currency`

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

The system MUST seed exactly the 11 existing catalog slugs as MASTER
`TemplateCategory`/`TemplateProduct` rows once. Every provisioned tenant
MUST receive its OWN copy of those rows, written into its own
`Category`/`Product` tables at provisioning time (see `salesops-tenancy`'s
provisioning saga) — never a live reference to the master templates. The
seed MUST remain idempotent at the master-template level; the per-tenant
copy step MUST also be idempotent for the seed path that provisions the demo
tenant.

#### Scenario: Master templates seed once

- GIVEN a fresh master schema
- WHEN the seed runs
- THEN exactly 11 `TemplateCategory` rows exist, sourced from the same 11
  slugs as before

#### Scenario: Each tenant gets its own physical copy

- GIVEN two provisioned tenants, A and B
- WHEN each tenant's `Category`/`Product` tables are inspected
- THEN each holds its own rows, copied independently from the master
  templates — neither references the other's or the master's rows at
  runtime

#### Scenario: Re-provisioning path stays idempotent

- GIVEN the demo tenant is provisioned and seeded twice via `pnpm seed`
- WHEN its `Category`/`Product` rows are counted
- THEN the count is unchanged between runs — no duplicates

### Requirement: Tenant Catalog Is Independently Editable

Editing a `Product` or `Category` in one tenant's schema MUST NOT affect any
other tenant's rows, even though both originated from the same master
templates.

#### Scenario: An edit in tenant A does not leak into tenant B

- GIVEN tenant A and tenant B, both provisioned from the same master
  templates
- WHEN a `Product` price is edited in tenant A
- THEN the corresponding `Product` in tenant B is unchanged
