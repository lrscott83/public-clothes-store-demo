# salesops-product-import Specification

## Purpose

Idempotent bulk product import for owner/admin users: upload a UTF-8 CSV
(`categoria;nombre;precio;moneda;barcode;sku;descripcion`, `;`-separated) via the
admin console or `POST /products/import`, and receive a per-row report
(creadas / actualizadas / fallidas con motivo, in Spanish). Re-running the same
file MUST NOT create duplicates. Bulk operations are out of scope for
`catalog-admin`; this spec owns them.

## Requirements

### Requirement: CSV File Grammar

The system SHALL accept only CSV files whose header row is exactly
`categoria;nombre;precio;moneda;barcode;sku;descripcion` (in that order),
encoded as UTF-8 with or without BOM, with CRLF or LF line endings. Fields
containing `;`, quotes, or embedded newlines MUST be quoted per RFC-4180 style.
A file exceeding 1000 data rows or 5MB SHALL be rejected entirely. A missing,
wrong, or malformed header SHALL reject the entire file — no rows processed.

#### Scenario: Valid file with BOM, CRLF, and quoted fields parses

- GIVEN a UTF-8 BOM file using `\r\n` endings where one field is quoted because it contains `;`
- WHEN the file is uploaded
- THEN every row parses correctly and none fail due to encoding, line endings, or quoting

#### Scenario: Wrong header rejects the whole file

- GIVEN a CSV whose header is missing a column or misspells one
- WHEN the file is uploaded
- THEN nothing is imported and the response reports whole-file rejection with a reason naming the expected header

#### Scenario: Row or size cap exceeded rejects the whole file

- GIVEN a valid-header CSV with 1001 data rows, or any file larger than 5MB
- WHEN the file is uploaded
- THEN nothing is imported and the rejection reason states which cap was exceeded

### Requirement: Field Normalization and Validation

For each row: `moneda` empty → `MN`; any other value not in {USD, EUR, MN} →
row error. `precio` is required and MUST parse to a positive decimal amount
(scale ≤ 2); zero or negative → row error (mirrors existing product-create
price rules). Empty `descripcion` is allowed (stored as empty string).
`categoria` and `nombre` are stored Camel Case (first letter of every word
capitalized) on BOTH create and update. Empty `nombre` → row error.

#### Scenario: Currency default and invalid currency

- GIVEN two rows: one with empty `moneda` and one with moneda `GBP`
- WHEN imported
- THEN the first row's price persists as MN and the second fails with a reason listing valid currencies

#### Scenario: Invalid price fails the row only

- GIVEN a row with precio `0` (or `-5`, or non-numeric)
- WHEN imported
- THEN that row fails with a Spanish reason and other rows are unaffected

#### Scenario: Names are Camel Cased on create and update

- GIVEN an existing product named "ipHONE case" updated by a CSV row with nombre "iphone case"
- WHEN imported
- THEN the stored name becomes "Iphone Case" on update, and a created category "ropa interior" stores as "Ropa Interior"

### Requirement: Category Resolution by Case-Insensitive Name

Category names are matched case-insensitively (accents significant) against
existing tenant categories. Found → reuse; missing → created with slug derived
from the Camel Case name (lowercase, accents stripped, hyphenated; collision
resolved with numeric suffix verified against existing slugs). Two rows
resolving to the same category within one batch share the single instance.

#### Scenario: Missing category is created once and shared by later rows

- GIVEN a CSV with three rows all naming categoria "Calzado" which does not exist
- WHEN imported
- THEN exactly one category is created (slug like `calzado`) and all three products belong to it

#### Scenario: Accent-differentiated names stay distinct

- GIVEN existing categories "Climatización" and a row naming categoria "Climatizacion"
- WHEN imported
- THEN a NEW distinct category is created (accent-insensitive matching is forbidden)

### Requirement: Product Idempotency Keys

The idempotency key is `sku` (case-insensitive) when present, else
`(categoryId + lowercased name)`. If sku matches MORE THAN ONE existing
product, that row FAILS loudly — nothing is written. A unique match → UPDATE
ONLY these values: name (Camel Cased), description, barcode, sku, price amount
and currency, categoryId. Cost, order, discounts, image, isNew, active remain
untouched. No match → CREATE with cost `0.00` in the price's currency,
order = category's current max order + 1, active=true, discounts 0.

#### Scenario: Re-uploading the same file creates zero duplicates

- GIVEN a successfully imported CSV
- WHEN the identical file is uploaded again
- THEN every row reports "actualizada" and product/category counts are unchanged

#### Scenario: Update leaves non-CSV fields untouched

- GIVEN an existing product with cost 5.00 USD, isNew=true, and a 10% discount
- WHEN a row matches its sku with a new price
- THEN only name/description/barcode/sku/price change; cost, isNew, discounts, image, active, order persist

#### Scenario: Ambiguous sku fails without writing

- GIVEN two existing products sharing sku "X1"
- WHEN a row names sku "X1"
- THEN that row fails with an ambiguity reason and neither product is modified

#### Scenario: New product defaults

- GIVEN a row matching nothing, with no cost column semantics
- WHEN imported
- THEN the product is created with cost 0.00 in its price currency, active=true, zero discounts, ordered last within its category

### Requirement: Batch Semantics and Report

One row's failure MUST NOT affect any other row (no transactional abort). The
response SHALL report total rows plus each row's outcome:
created/updated/failed, failures carrying a reason in Spanish. Concurrent
writers may stale the in-memory snapshot mid-batch; this is accepted
admin-tool behavior — re-running the import is safe due to idempotency keys.

#### Scenario: Mixed outcomes never abort the batch

- GIVEN a CSV containing valid, duplicate-target, and invalid-currency rows
- WHEN imported
- THEN valid rows succeed, invalid ones fail with reasons, and the report lists every row's outcome

#### Scenario: Partial crash is recoverable

- GIVEN an import interrupted midway through processing
- WHEN the same file is re-uploaded after recovery
- THEN already-created rows resolve to updates (no duplicates) and remaining rows process normally

### Requirement: Authorization and Tenancy

`POST /products/import` MUST sit behind the same owner/admin guard chain
(JwtAuthGuard, TenantContextGuard, RolesGuard) as other product writes and be
tenant-scoped. Non-authorized callers get the same error contract as other
admin writes. Imported data MUST land only in the caller's resolved company.

#### Scenario: Unauthorized role cannot import

- GIVEN an authenticated user whose membership role is neither owner nor admin
- WHEN they call POST /products/import
- THEN the request is rejected exactly as other admin write endpoints would

#### Scenario: Import is scoped to the caller's tenant

- GIVEN an admin of company A importing a CSV
- WHEN processing completes
- THEN all products/categories were created/read exclusively in company A's schema

### Requirement: Admin Upload Console

`/admin/productos/importar` requires the tenant admin session (registered under
the `_auth` layout). The page offers a `.csv` file upload form. On success it
renders the report table (creadas/actualizadas/fallidas con razones en
español). Whole-file rejections (oversized, bad header, cap exceeded) render a
clear Spanish error message.

#### Scenario: Successful import renders the report table

- GIVEN an authenticated admin uploading a valid CSV
- WHEN the server responds with the batch report
- THEN the page shows total rows plus per-row outcome including Spanish failure reasons

#### Scenario: Rejected file shows a clear message

- GIVEN a CSV larger than 5MB (or with a wrong header)
- WHEN submitted from the console
- THEN the page renders a clear Spanish rejection message and no partial results table

#### Scenario: Route lives behind auth layout

- GIVEN an unauthenticated visitor requesting /admin/productos/importar
- WHEN the route resolves
- THEN they are redirected to login per the existing `_auth` layout behavior
