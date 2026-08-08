# Spec — salesops-commissions (NEW capability)

## Purpose

Fulfils the seam reserved by `openspec/specs/salesops-ventas/spec.md:91-94` and
documented at `packages/domain/src/product/commission-seam.md`: commission
reference data per product, accrual for a `delivered` order attributed to the
`CompanyUser` that created it, and settlement via an independent
`CommissionPayment` record. `Order`'s 4-state machine (D7) is untouched. Combo
brackets (D6) are explicitly deferred. Credit sales (D9) are out of scope.

## Requirements

### Requirement: Commission Reference Resolution Never Defaults to Zero

The system MUST resolve a product's commission amount via
`ICommissionReferenceProvider.commissionFor(productId): Promise<Money |
undefined>`. An unconfigured or unmatched product MUST resolve to
`undefined`. No layer MUST coerce an unresolved reference to `0`.

#### Scenario: Configured product resolves its flat MN amount

- GIVEN a product with a commission reference of `500 MN`
- WHEN `commissionFor(productId)` is called
- THEN it resolves `500 MN`

#### Scenario: Unconfigured product resolves undefined, never zero

- GIVEN a product with no commission reference row
- WHEN `commissionFor(productId)` is called
- THEN it resolves `undefined` — never `0`

### Requirement: Order Creation Is Never Blocked by Missing Commission Data

Commission resolvability MUST NOT be an order-creation invariant — only stock
availability is (`salesops-ventas`). An order MUST be creatable even when a
line references a product with no commission configured.

#### Scenario: Order creates normally despite an unresolvable commission product

- GIVEN a basket line for a product with no commission reference
- WHEN the order is created
- THEN creation succeeds — commission resolvability plays no part in the
  creation invariant

### Requirement: Commission Accrual Sums Only Resolved Lines

At `delivered`, the system MUST compute an order's commission accrual as
Σ(resolved commission MN × line quantity) across only the lines whose product
resolved a commission reference. A line whose product resolved `undefined`
MUST be excluded from the sum and MUST be flagged as unresolved on the
accrual record — never counted as a `0 MN` contribution.

#### Scenario: All lines resolved sums correctly

- GIVEN a delivered order with two lines, resolving `300 MN`×`2` and
  `200 MN`×`1`
- WHEN commission accrues
- THEN the accrual total is `800 MN`

#### Scenario: One unresolved line is excluded and flagged, not zeroed

- GIVEN a delivered order with one resolved line (`300 MN`×`2`) and one line
  whose product has no commission reference
- WHEN commission accrues
- THEN the total is `600 MN` and the accrual record flags the unresolved
  product — never silently a `0 MN` contribution

### Requirement: Cancelled Orders Never Accrue Commission

An order in `cancelled` MUST NOT produce or retain a commission accrual,
regardless of any prior state.

#### Scenario: Cancelling before delivered leaves no accrual

- GIVEN an order cancelled from `created` or `verified`
- WHEN commission accrual is queried for that order
- THEN no accrual record exists

### Requirement: Attribution From the Authenticated Actor

Commission accrual MUST attribute to the `CompanyUser` stamped as the order's
creator at creation time (`salesops-ventas` attribution requirement) — never
a client-supplied or accrual-time-read agent id.

#### Scenario: Accrual attributes to the order's stamped creator

- GIVEN a delivered order created by `CompanyUser A`
- WHEN commission accrues
- THEN the accrual attributes to `A`, independent of who triggers `delivered`

### Requirement: Independent CommissionPayment Settlement

`CommissionPayment` MUST be a record independent of `OrderStatus` — settling
a commission MUST NOT alter `Order.status`, which MUST remain exactly
`created | verified | delivered | cancelled`. A commission becomes payable
only once its order reaches `delivered`.

#### Scenario: Settling commission does not change Order.status

- GIVEN a delivered order with an accrued, unpaid commission
- WHEN a `CommissionPayment` is recorded against it
- THEN `Order.status` remains `delivered`

#### Scenario: Commission is not payable before delivered

- GIVEN an order still `created` or `verified`
- WHEN a `CommissionPayment` is attempted against it
- THEN the system MUST reject it

### Requirement: Combo Brackets Are Not Implemented

Order-level combo-bracket commission rules MUST NOT be implemented by this
capability — only the flat per-product×quantity rule (D5).

#### Scenario: No combo-bracket computation exists

- GIVEN the `salesops-commissions` capability's public surface
- WHEN inspected
- THEN no order-level equipment-count bracket computation exists

### Requirement: Commission Trigger Independent of Payment/Credit State

Commission accrual MUST depend only on `Order.status` reaching `delivered`,
never on `SaleCredit` or payment-collection state.

#### Scenario: Delivered orders accrue identically regardless of payment/credit state

- GIVEN two delivered orders, one fully paid upfront and one with any
  payment/credit state
- WHEN each reaches `delivered`
- THEN both accrue commission identically

### Requirement: Per-Agent Commission Reporting Includes Inherited Roles

Per-agent commission reporting MUST group accruals by the attributed
`CompanyUser`, including an `owner` who registered sales — `owner`'s
inherited `sales_agent` bit (D8) MUST NOT be filtered out of reports.

#### Scenario: An owner who registers a sale appears in their own report

- GIVEN an `owner` `CompanyUser` who created and delivered an order
- WHEN per-agent commission reporting is generated
- THEN that `owner` appears with their accrued commission — not excluded
