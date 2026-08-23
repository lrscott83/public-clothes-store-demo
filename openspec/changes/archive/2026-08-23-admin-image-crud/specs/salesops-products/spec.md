# salesops-products Delta

> Part of the `admin-image-crud` change. The change shipped as design + tasks
> only (no proposal/specs at authoring time); this delta records its one
> master-spec-visible contract change so `sdd-archive` can merge it: the
> domain/Prisma `Product.image` field became NULLABLE with default null
> (commits 3a72e37, 6dae64d), so a product MAY exist without an image until
> one is uploaded or replaced via the admin image endpoints.

## MODIFIED Requirements

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
| image | string | nullable, default null |
| isNew | boolean | default false |
| order | int | display order |
| active | boolean | soft-delete |
| createdAt / updatedAt | datetime | audit |

`price.currency` and `cost.currency` are each chosen independently by the caller and MAY DIFFER (e.g. bought in one currency, sold in another) — the system MUST NOT force either to a fixed currency.

#### Scenario: Product created with required fields

- GIVEN a valid `name`, `price > 0`, and an existing `categoryId`
- WHEN the product is created
- THEN it persists with `sku`/`barcode`/`image` nullable and `percentDiscountPrice`/`discountPrice` defaulted to 0
