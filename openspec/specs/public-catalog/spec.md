# Public Catalog Specification

## Purpose

Anonymous, tenant-scoped read API (`api-public`) and SSR storefront
(`web-catalog`): browse one store's live catalog — search, filter, sort,
pagination — through a DTO that hides internal business data. Depends on
`salesops-tenancy`'s new anonymous subdomain tenant resolution (see that
capability's delta) to determine which company is served.

## Requirements

### Requirement: Server-Side Search, Filter, Sort, Pagination
Search, category filter, sort, and pagination MUST run server-side — never
an unfiltered/unsorted/unpaginated list shipped to the client. Search MUST
be case-insensitive (`ILIKE`) over `name` + `description`. Sort options:
featured (`Product.order` asc, default), price asc, price desc, name A-Z.

#### Scenario: Case-insensitive search matches name and description
- GIVEN a product "Camisa Azul" / "algodón premium"
- WHEN searched for "AZUL" or "PREMIUM"
- THEN it is returned for both

#### Scenario: Default sort is featured order
- GIVEN products with different `Product.order`
- WHEN listed with no sort parameter
- THEN they are ordered by `Product.order` ascending

#### Scenario: Category filter excludes other categories
- GIVEN products across category A and B
- WHEN filtered to A
- THEN no B product appears

### Requirement: Price Sort Uses finalPrice, Sorted Before Pagination
Price sort MUST order by `finalPrice` from
`packages/domain/src/product/pricing.ts` — never recomputed in SQL or the
browser — applied to the FULL filtered result set before slicing the page.

#### Scenario: Sorts by finalPrice, not list price
- GIVEN X: price 100, 50% off (finalPrice 50); Y: price 60, no discount (finalPrice 60)
- WHEN sorted price ascending
- THEN X precedes Y

#### Scenario: Page 2 reflects the global sort, not a per-page re-sort
- GIVEN 13 products sorted price-ascending, page size 12
- WHEN page 2 is requested
- THEN it contains exactly the 13th-ranked product by `finalPrice`

### Requirement: Inactive and Soft-Deleted Products Never Returned
Every public path (list, detail, image) MUST exclude `active=false`
products. `includeInactive` MUST NEVER be honored on any public endpoint.

#### Scenario: Inactive product excluded from listing
- GIVEN a product with `active=false`
- WHEN the public list is called
- THEN it is absent

#### Scenario: includeInactive param is ignored
- GIVEN a request with `includeInactive=true`
- WHEN processed
- THEN inactive products stay excluded

### Requirement: Public DTO Excludes Internal Business Data
`api-public` MUST own a dedicated DTO, never reuse or extend
`api-salesops`'s `ProductResponseDto`.

| Field | Public response |
|---|---|
| `cost` (amount or currency) | MUST NOT appear |
| `sku` | MUST NOT appear |
| `barcode` | MUST NOT appear |
| `id, name, description, image, categoryId, price, finalPrice, isOffer, percentDiscountPrice, discountPrice, isNew` | MUST appear |

#### Scenario: cost/sku/barcode absent even when set
- GIVEN a product with non-null `cost`, `sku`, `barcode`
- WHEN read via the public API
- THEN none of those keys appear anywhere in the response

### Requirement: Offer and Badge Data Surfaced Independently
Both discount mechanisms MAY be non-zero at once; the DTO MUST surface
`percentDiscountPrice` and `discountPrice` independently — never collapsed
into one derived "effective percentage". Both fields MUST travel as decimal
strings, never JSON numbers — the same discipline `MoneyAmountDto.amount`
documents ("a decimal string, never a JSON number, decimal fidelity
preserved end-to-end").

#### Scenario: Both discounts returned uncollapsed, as decimal strings
- GIVEN `percentDiscountPrice=20`, `discountPrice=5` on one product
- WHEN read via the public API
- THEN the response has both `percentDiscountPrice: "20.00"` and
  `discountPrice: "5.00"` — decimal strings, never JSON numbers

### Requirement: Money Formatting Supports Non-ISO Currencies
`web-catalog` MUST own its formatter for `USD`/`EUR`/`MN`. `MN` is not ISO
4217 — native `Intl.NumberFormat({currency:'MN'})` throws `RangeError`.
Formatting `MN` MUST render a value, never throw.

#### Scenario: MN formats without throwing
- GIVEN a price with `currency="MN"`
- WHEN formatted
- THEN a string is returned, no exception thrown

#### Scenario: USD/EUR format normally
- GIVEN `currency="USD"` or `"EUR"`
- WHEN formatted
- THEN standard `Intl.NumberFormat` currency output is returned

### Requirement: Public Image Serving Respects Active State and Tenant Ownership
The image GET endpoint MUST be unauthenticated but MUST NOT serve a file for
an `active=false` product, and MUST NOT serve a file whose owning company
differs from the subdomain-resolved company, even if the file exists on
disk. Responses MUST carry a long-lived, immutable public cache header.

#### Scenario: Inactive product's image not served
- GIVEN an `active=false` product with a stored image
- WHEN its image URL is requested
- THEN the file is not returned

#### Scenario: Cross-tenant file never served
- GIVEN company A's image path requested while the subdomain resolves to
  company B
- WHEN processed
- THEN the file is not returned

#### Scenario: Active product's image served with a public immutable cache header
- GIVEN an active product's own-tenant image request
- WHEN processed
- THEN the file is returned with a long-lived, immutable, public
  `Cache-Control` header

## Known Limitations

- **Mixed currencies per store are not normalized** — price sort compares
  raw `finalPrice` values without conversion; deferred by the owner.
- **Exact cache/serving mechanics** beyond "long-lived, immutable, public"
  are a design-phase decision.
