# Delta for salesops-mvp

Scope: domain model + deterministic seed generator only (Task 2). No UI, no interactive
state transitions — those are later tasks and remain out of scope here.

## ADDED Requirements

### Requirement: Enriched Product Model

The system MUST assign every catalog product an explicit `commissionMN: number > 0`
and `costUSD: number`, computed at seed-build time and frozen into the generated
product array — not resolved by a runtime matcher at render time.

#### Scenario: All products carry commission and cost

- GIVEN the 99-product catalog is enriched by the seed generator
- WHEN the resulting `SeededProduct[]` is inspected
- THEN every product has `commissionMN > 0` and `costUSD = round(price * 0.60)`

#### Scenario: Bundle SKU commission sums segments

- GIVEN a product name contains `" + "` joining two appliance segments
- WHEN the commission derivation runs
- THEN `commissionMN` equals the sum of each segment's own resolved commission

### Requirement: Order Commission Aggregation

The system MUST expose a helper computing an order's total commission as the sum
of `item.commissionMN × item.quantity` across its cart, ignoring combo/quantity tiers.

#### Scenario: Multi-item order commission sums per-item commission

- GIVEN an order with items `{qty:1, commissionMN:4000}` and `{qty:2, commissionMN:1000}`
- WHEN the commission-sum helper runs
- THEN it returns `4000 + 1000*2 = 6000`
- AND combo-by-quantity tiers do not alter the result

### Requirement: Deterministic Seed Generation

The generator MUST produce byte-identical `SeedState` output across repeated runs,
using a fixed embedded mulberry32 seed and a fixed anchor-date constant — never
`Date.now()` or `Math.random()`.

#### Scenario: Two generations are byte-identical

- GIVEN the generator is invoked twice in the same process with no shared external state
- WHEN both outputs are serialized to JSON
- THEN the two JSON strings are identical, including all timestamps

#### Scenario: Anchor date regression guard

- GIVEN the generator module source uses a hardcoded anchor-date constant
- WHEN a test inspects the generated orders' date range
- THEN every order date falls within `[anchor - 19d, anchor]`, independent of the
  actual system date at test time

### Requirement: Inventory Coverage

The system MUST seed exactly one `InventoryEntry` per `(product, warehouse)` pair
across 3 warehouses and 99 products.

#### Scenario: Inventory has 297 rows

- GIVEN the generator has run
- WHEN `SeedState.inventory` is inspected
- THEN it contains exactly 297 entries, each with a unique `(productId, warehouseId)`
  pair and `quantity >= 0`

### Requirement: Historical Order State Machine Consistency

Every generated historical order MUST occupy a valid state in
`creado → verificado → transportando → entregado → comision_pagada` and MUST have
had every cart item available in a single warehouse at generation time.

#### Scenario: Order state is one of the defined states

- GIVEN any order in `SeedState.orders`
- WHEN its `state` field is inspected
- THEN it is one of `creado, verificado, transportando, entregado, comision_pagada`
- AND its populated per-state timestamps are chronologically non-decreasing

#### Scenario: Cart fulfilled from a single warehouse

- GIVEN an order references one `warehouseId` and a list of items
- WHEN inventory is checked at generation time, before decrement
- THEN every item's quantity was available in that same warehouse
- AND the generator decremented that warehouse's stock accordingly

### Requirement: Verified+ Orders Carry Rate Snapshot and Totals

Orders in state `verificado` or later MUST carry a frozen `exchangeRateSnapshot`,
`totalMN`, and `commissionMN`; orders in `creado` MUST NOT carry any of them.

#### Scenario: Verified order has snapshot fields populated

- GIVEN an order with state `verificado` or later
- WHEN its fields are inspected
- THEN `exchangeRateSnapshot`, `totalMN`, and `commissionMN` are all defined
- AND `commissionMN` matches the order-commission-sum helper's output for its items

#### Scenario: Un-verified order has no snapshot

- GIVEN an order with state `creado`
- WHEN its fields are inspected
- THEN `exchangeRateSnapshot`, `totalMN`, and `commissionMN` are all `undefined`

### Requirement: localStorage Persistence Round-Trip

The system MUST persist the full `SeedState` under a single namespaced+versioned
localStorage key, and MUST support load and reset.

#### Scenario: Save then load returns identical state

- GIVEN a generated `SeedState` is saved to the versioned key
- WHEN the app reloads and reads the key
- THEN the loaded `SeedState` deep-equals the saved one

#### Scenario: Missing or version-mismatched key triggers regeneration

- GIVEN the localStorage key is absent, or its `version` differs from the current one
- WHEN the app initializes
- THEN the generator runs and persists a fresh `SeedState` under the current version

#### Scenario: Reset restores identical state

- GIVEN "Reiniciar demo" is invoked
- WHEN the key is cleared and the generator re-runs
- THEN the resulting `SeedState` is byte-identical to the original first-run output

### Requirement: Reviewable Commission Assignment Output

The apply phase MUST produce a product → commission review artifact listing id,
name, category, `commissionMN`, `costUSD`, and which rule fired (keyword /
category-default / catch-all / bundle-sum), with category-default and catch-all
rows visibly flagged for human review.

#### Scenario: Review table covers all products

- GIVEN the commission derivation has run over all 99 products
- WHEN the review table is generated
- THEN it has exactly 99 rows, one per product, each naming the rule that fired

#### Scenario: Fallback rows are flagged

- GIVEN a product's derivation fell through to category-default or the 1000 catch-all
- WHEN the review table is generated
- THEN that row is visibly marked as a fallback, not a direct keyword match
