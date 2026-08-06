# Spec — salesops-customers

## Purpose

Define the testable contract for the `salesops-customers` capability: `Customer` master-data, a flat single `fullName` entity with optional contact fields, no monetary storage, and soft-delete semantics behind a hexagonal repository port. Persisted via Prisma, exposed through thin NestJS CRUD, seeded with a demo set. Mirrors the shipped `salesops-inventory` and `salesops-products` capabilities end-to-end.

## Requirements

### Requirement: Customer Master-Data Entity

The system MUST persist a `Customer` entity in the tenant schema as flat master data 
(a single `fullName` field, optional contact fields, no address hierarchy). Only `fullName` 
is required; it MUST NOT be empty or whitespace-only. `Customer` MUST NOT store any monetary 
field (`creditLimit`, `balance`, `debt`) — a customer's debt is derived from `SaleCredit` in a
future change, never stored here.

| Field | Type | Constraint |
|---|---|---|
| id | UUID | PK |
| fullName | string | required, non-empty / non-whitespace |
| companyUserId | UUID | REQUIRED, UNIQUE, FK → tenant CompanyUser.id |
| documentId | string \| null | optional; unique when present |
| cellPhone | string \| null | optional |
| email | string \| null | optional |
| address | string \| null | optional, flat single string |
| note | string \| null | optional (legacy `description` vocabulary) |
| active | boolean | soft-delete, default `true` |
| createdAt / updatedAt | datetime | audit |

CRUD MUST be supported.

#### Scenario: Customer created with only a full name

- GIVEN a valid non-empty `fullName` and no contact fields
- WHEN the customer is created
- THEN it persists with `active=true` by default and every contact field
  (`documentId`, `cellPhone`, `email`, `address`, `note`) resolves to `null`

#### Scenario: Empty full name rejected

- GIVEN a `fullName` that is empty or whitespace-only
- WHEN a customer is created
- THEN the system MUST reject it with `InvalidCustomerError` — it never silently accepts
  a blank name

#### Scenario: All contact fields are optional

- GIVEN a customer payload carrying only `fullName`
- WHEN the customer is created
- THEN the system MUST accept it — there is NO "at least one contact" invariant

#### Scenario: No monetary field exists on the entity

- GIVEN the `Customer` entity fields
- WHEN inspected
- THEN no `creditLimit`, `balance`, or `debt` field exists — customer debt is derived
  from `SaleCredit` in a future change, never stored on `Customer`

#### Scenario: fullName is a single field

- GIVEN the `Customer` entity fields
- WHEN inspected
- THEN a single `fullName` exists and no `firstName` / `lastName` split exists

### Requirement: Customer FKs Tenant CompanyUser, Not Master User

`Customer` MUST live in the tenant schema. Its identity link MUST be
`companyUserId` (REQUIRED, UNIQUE, `@relation` to the tenant
`CompanyUser.id`), replacing the prior `userId @relation` to the master
`User` (`schema.prisma:192`) — Prisma forbids a cross-schema `@relation`, so
this reshape is required, not optional. The REQUIRED/UNIQUE invariant on the
identity link is preserved; only its target changes.

#### Scenario: Customer.companyUserId is required and unique

- GIVEN the tenant `Customer` schema after this change
- WHEN inspected
- THEN `companyUserId` is REQUIRED and UNIQUE, and `@relation`s to the
  tenant `CompanyUser`

#### Scenario: No relation to master User exists

- GIVEN the tenant `Customer` schema after this change
- WHEN inspected
- THEN no `userId` field or `@relation` to the master `User` model exists
  anywhere on `Customer`

#### Scenario: Agent-assisted customer creation still links through companyUserId

- GIVEN a `sales_agent` creating a customer together with a new identity
  (existing agent-assisted flow)
- WHEN the customer is persisted
- THEN it links to the newly created tenant `CompanyUser` via
  `companyUserId`, exactly as the pre-existing `userId` link did before the
  reshape

### Requirement: documentId Optional and Unique When Present

The system MUST treat `documentId` (DNI / CUIT / RUC) as optional. When present it MUST
be unique; when absent (`null`) an unlimited number of customers MAY coexist. A create or
update that would introduce a duplicate `documentId` MUST be rejected with a named
`DuplicateCustomerDocumentError`.

#### Scenario: Many customers without a documentId coexist

- GIVEN several customers, none carrying a `documentId`
- WHEN they are all persisted
- THEN the system MUST accept them all — a null `documentId` never collides with another
  null

#### Scenario: Duplicate documentId rejected on create

- GIVEN an existing customer with `documentId="D1"`
- WHEN a second customer is created with `documentId="D1"`
- THEN the system MUST reject it with `DuplicateCustomerDocumentError`

#### Scenario: Duplicate documentId rejected on update

- GIVEN customer A with `documentId="D1"` and customer B with no `documentId`
- WHEN customer B is updated to `documentId="D1"`
- THEN the system MUST reject it with `DuplicateCustomerDocumentError`

#### Scenario: A customer keeps its own documentId on update

- GIVEN a customer with `documentId="D1"`
- WHEN that same customer is updated (e.g. a new `cellPhone`) while keeping `documentId="D1"`
- THEN the update MUST succeed — a row never collides with itself

### Requirement: Soft-Delete, Never Hard-Delete

Deactivating a customer MUST flip `active` to `false` and MUST NOT remove the row — a
future Ventas `SaleCredit`/`Order` foreign key would otherwise orphan history. The default
listing MUST exclude inactive customers unless explicitly asked to include them.

#### Scenario: Deactivated customer is not hard-deleted

- GIVEN a `Customer` that is deactivated
- WHEN the customer is queried by id
- THEN the row still exists, is retrievable, and has `active=false`

#### Scenario: Default listing excludes inactive customers

- GIVEN one active and one inactive customer
- WHEN customers are listed without an include-inactive flag
- THEN only the active customer is returned

#### Scenario: Listing can include inactive customers

- GIVEN one active and one inactive customer
- WHEN customers are listed with the include-inactive flag set
- THEN both customers are returned

### Requirement: HTTP CRUD Delivery

The system MUST expose `Customer` CRUD over HTTP, mapping domain errors to status codes:
`InvalidCustomerError → 400`, `DuplicateCustomerDocumentError → 409`, and a missing id on
read/update to `404`. `DELETE` MUST perform a soft-delete.

#### Scenario: Create returns 201

- GIVEN a valid customer payload
- WHEN `POST /customers` is called
- THEN the response is `201` with the persisted customer, `active=true`

#### Scenario: Empty fullName returns 400

- GIVEN a payload with an empty `fullName`
- WHEN `POST /customers` is called
- THEN the response is `400`

#### Scenario: Duplicate documentId returns 409

- GIVEN an existing customer with `documentId="D1"`
- WHEN `POST /customers` is called with `documentId="D1"`
- THEN the response is `409`

#### Scenario: Delete soft-deletes

- GIVEN an existing customer
- WHEN `DELETE /customers/:id` is called
- THEN the customer is deactivated (`active=false`) and the row is NOT physically removed

#### Scenario: Read unknown id returns 404

- GIVEN an id that matches no customer
- WHEN `GET /customers/:id` is called
- THEN the response is `404`

### Requirement: Seeded Demo Customers

The system MUST seed a small set of demo customers idempotently — re-running the seed MUST
NOT duplicate rows. Seeded customers carry no fabricated `documentId`.

#### Scenario: Seed is idempotent

- GIVEN a fresh database
- WHEN the seed runs twice
- THEN the demo customer set exists exactly once — no duplicates — and all are `active=true`

### Requirement: Ventas Free-Text Client Left Untouched

This capability MUST NOT rewire the Ventas free-text reference. `SaleCredit.client` MUST
remain a `string` and `Order` MUST NOT gain a `customerId` in this change — promoting the
reference to a foreign key is a future Ventas change.

#### Scenario: SaleCredit still carries free-text client

- GIVEN the `SaleCredit` model after this change
- WHEN inspected
- THEN `client` is still a `string` and no `customerId` foreign key has been introduced on
  `SaleCredit` or `Order`
