# Delta for salesops-customers

## MODIFIED Requirements

### Requirement: Customer Master-Data Entity

The system MUST persist a `Customer` entity as flat master data (a single `fullName`
field, optional contact fields, no address hierarchy). Only `fullName` is required; it
MUST NOT be empty or whitespace-only. `Customer` MUST NOT store any monetary field
(`creditLimit`, `balance`, `debt`) — a customer's debt is derived from `SaleCredit` in a
future change, never stored here. Every `Customer` MUST reference exactly one `User` via
a REQUIRED, UNIQUE `userId` FK (1:1) — a `Customer` cannot exist without a corresponding
`User` (login identity).

| Field | Type | Constraint |
|---|---|---|
| id | UUID | PK |
| userId | UUID | FK → User, REQUIRED, UNIQUE (1:1) |
| fullName | string | required, non-empty / non-whitespace |
| documentId | string \| null | optional; unique when present |
| cellPhone | string \| null | optional |
| email | string \| null | optional |
| address | string \| null | optional, flat single string |
| note | string \| null | optional (legacy `description` vocabulary) |
| active | boolean | soft-delete, default `true` |
| createdAt / updatedAt | datetime | audit |

CRUD MUST be supported.

(Previously: `Customer` had no `userId` field and existed as standalone master data
with no link to an identity/login.)

#### Scenario: Customer created with only a full name and its User

- GIVEN a valid non-empty `fullName`, no contact fields, and an existing `User`
- WHEN the customer is created referencing that `User`'s id as `userId`
- THEN it persists with `active=true` by default and every contact field
  (`documentId`, `cellPhone`, `email`, `address`, `note`) resolves to `null`

#### Scenario: Empty full name rejected

- GIVEN a `fullName` that is empty or whitespace-only
- WHEN a customer is created
- THEN the system MUST reject it with `InvalidCustomerError` — it never silently
  accepts a blank name

#### Scenario: All contact fields are optional

- GIVEN a customer payload carrying only `fullName` and a valid `userId`
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

#### Scenario: Customer creation without an existing User is rejected

- GIVEN a customer-creation payload whose `userId` does not reference an existing
  `User`
- WHEN the customer is created
- THEN the system MUST reject it — a `Customer` can never be created without a
  corresponding `User`

#### Scenario: userId is unique — one User has at most one Customer

- GIVEN a `User` that already has a `Customer` referencing it via `userId`
- WHEN a second `Customer` is created with that same `userId`
- THEN the system MUST reject it — the 1:1 relationship never allows two `Customer`
  rows for one `User`

## ADDED Requirements

### Requirement: Pre-Existing Customers Are Backfilled with a User

Every `Customer` that existed before this change MUST be assigned a corresponding
`User` so the `userId` FK can become required — no `Customer` row may be left without
a `User` after this change is applied. This is an invariant on the resulting data, not
a prescription of the migration mechanics.

#### Scenario: No orphan Customer rows after the change

- GIVEN the full set of `Customer` rows after this change is applied
- WHEN each row is inspected
- THEN every row carries a non-null `userId` referencing an existing `User` — none are
  left without one

### Requirement: Self-Service Buyer Authentication Flow

> **DEFERRED — descoped from `backend-users-roles` on 2026-08-06 by owner decision.**
>
> This requirement was never carried into the merged `openspec/specs/salesops-customers/spec.md`,
> and neither `proposal.md`, `design.md`, nor `tasks.md` ever covered it — it entered this
> change's delta spec as scope creep during the spec phase and no phase caught it.
>
> **Why deferred, not implemented:** the flow it describes is storefront + checkout territory
> (`apps/static-store`, `packages/storefront`), which is frozen as LEGACY and must not be
> touched. There is no payment step anywhere in the backend for authentication to gate.
>
> It is NOT part of this change's contract and does NOT block archive. Reinstating it means
> opening a new change once a live checkout exists.

Anonymous browsing and cart interaction MUST be allowed without authentication.
Authentication MUST be required only at the payment step. The buyer's `Customer`
(together with its linked `User`) MUST be created at that point — not before.

#### Scenario: Browsing and cart do not require authentication

- GIVEN an anonymous visitor with no session
- WHEN they browse products and add items to a cart
- THEN no authentication is required and no `Customer`/`User` exists yet for them

#### Scenario: Authentication is required to pay

- GIVEN an anonymous visitor with items in their cart
- WHEN they attempt to proceed to payment
- THEN the system MUST require authentication (login or registration) before the
  payment step can proceed

#### Scenario: Customer and its User are created together at checkout

- GIVEN a visitor who authenticates (registers) at the payment step
- WHEN the checkout completes registration
- THEN a `User` is created and a `Customer` is created referencing it via `userId` in
  the same flow — never a `Customer` without its `User`
