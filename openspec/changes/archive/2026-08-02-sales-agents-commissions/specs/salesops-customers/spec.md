# Delta for salesops-customers (D10 — landed after the rest of this change's specs)

**Merge target**: `openspec/changes/backend-users-roles/specs/salesops-customers/spec.md`.
That spec was never promoted to `openspec/specs/` — it remains a delta owned
by the `backend-users-roles` change (which already carries the analogous
"Customer and its `User` are created together at checkout" self-service
path). This document AMENDS/ADDS to that delta file directly. It does NOT
modify or archive the `backend-users-roles` change itself.

**Why this file, not `salesops-identity`**: the trigger and the whole
behavior live inside `POST /customers` — the endpoint this capability owns —
and this capability's own delta already documents the identical shape
("Customer and its User created together" at checkout). The
privilege-escalation guardrails below are business rules of THIS creation
flow, independently testable end-to-end against it, not an abstract identity
rule disconnected from its trigger. `salesops-identity` retains only the
generic role-grant statement (`sales_agent` MAY call `POST /customers`) and
now points here for the contract.

## ADDED Requirements

### Requirement: sales_agent May Create a Customer for a New Identity

A `sales_agent` MUST be permitted to create a `Customer` for a person with NO
existing `User` — unlike the existing owner/admin/`sales_operator` path,
which requires an existing `userId`, the `sales_agent` path MUST NOT require
one. The system MUST create a new `User` and the `Customer` together, in the
same operation, satisfying the existing REQUIRED/UNIQUE `userId` 1:1
invariant — exactly the shape already specified for the buyer self-service
checkout path. This is an ADDITIONAL creation mode: the existing
existing-`userId` path remains unchanged for owner/admin/`sales_operator`.

A `sales_agent` MUST NOT be able to bind a new `Customer` to an
ALREADY-EXISTING identity. Supplying an existing `userId` would let an agent
attach a customer record to any identity in the system, the owner's included.
The agent's creation path MUST therefore mint the identity itself and MUST
NOT honour a caller-supplied `userId` — mirroring the role guardrail below,
where a caller-supplied role is likewise never honoured.

#### Scenario: sales_agent creates a customer with no existing userId

- GIVEN a `sales_agent` submitting a customer-creation payload with no
  `userId`
- WHEN the request is processed
- THEN a new `User` is created AND a `Customer` is created referencing it via
  `userId` in the same flow — never a `Customer` without its `User`

#### Scenario: A caller-supplied userId is never honoured for a sales_agent

- GIVEN a `sales_agent` submitting a customer-creation payload that DOES carry
  a `userId` pointing at an existing identity — the owner's, for instance
- WHEN the request is processed
- THEN that `userId` has no effect: either the request is rejected, or a fresh
  identity is minted and used. The new `Customer` is NEVER bound to the
  supplied identity.

#### Scenario: The existing existing-userId path is unaffected

- GIVEN an `owner`/`admin`/`sales_operator` submitting a customer-creation
  payload with an existing `userId`
- WHEN the request is processed
- THEN behavior is exactly as before this change — this is an additional
  mode, not a replacement

### Requirement: Identity Created via Agent-Assisted Customer Creation Receives the user Bit ONLY

The `User` created as a side effect of a `sales_agent`'s customer creation
MUST receive a `CompanyUser` with the `user` bit ONLY — the same shape
`AuthService.signup` and `infra-db/src/customer/seed.ts` already produce. A
`sales_agent` MUST NOT be able to choose, pass, or otherwise influence the
role assigned to the identity it creates. This is a privilege-escalation
surface, not a detail: without this guard, "agent creates customer" silently
becomes "agent mints privileged accounts."

#### Scenario: Created identity receives user bit only

- GIVEN a `sales_agent` creating a customer with no existing `userId`
- WHEN the resulting `CompanyUser` is inspected
- THEN its role is exactly the `user` bit — nothing else

#### Scenario: A caller-supplied roles field is never honoured (NEGATIVE)

- GIVEN a `sales_agent`'s create-customer payload that ALSO includes a
  `roles`/bitmask field (e.g. attempting to pass `owner` or `admin`)
- WHEN the customer and its identity are created
- THEN the supplied roles field MUST be ignored entirely — the resulting
  `CompanyUser` still holds the `user` bit only, exactly as if no such field
  had been supplied

### Requirement: Agent-Created Identity's CompanyUser Is Scoped to the Caller's Company

The `CompanyUser` row created for an identity minted via agent-assisted
customer creation MUST be scoped to the CALLING `sales_agent`'s own
`companyId` — consistent with `UsersService.create`'s company-scoping
behavior — never a different or derived company.

#### Scenario: New CompanyUser is scoped to the agent's own company

- GIVEN a `sales_agent` belonging to `companyId=C1` creating a customer with
  no existing `userId`
- WHEN the resulting `CompanyUser` is inspected
- THEN its `companyId` is `C1`

### Requirement: Agent-Assisted Customer Creation Is Attributable

Creating a `Customer` (and its transitively-created `User`) via this path
MUST record which `CompanyUser` performed the creation — auditable, never
anonymous.

#### Scenario: Each agent-created customer traces to its creating agent

- GIVEN two different `sales_agent`s, each creating one customer with no
  existing `userId`
- WHEN the two resulting customers/identities are inspected
- THEN each is attributable to its own specific creating agent — neither is
  anonymous nor conflated with the other

### Requirement: Rejected Alternative Recorded — Loginless Customers

Relaxing `Customer.userId` to nullable — permitting customers WITHOUT any
login identity, the retired MVP model — was considered and explicitly
REJECTED by the owner as part of D10. It is NOT implemented by this change.
Should it ever be reconsidered, it is a change to the `Customer` model
itself and MUST be its own change, sequenced BEFORE any change that depends
on it — never smuggled into this one.

#### Scenario: Customer.userId remains required and unique after this change

- GIVEN the persisted `Customer` schema after this change
- WHEN inspected
- THEN `userId` is still REQUIRED and UNIQUE — no nullable-`userId` code
  path exists anywhere in the diff
