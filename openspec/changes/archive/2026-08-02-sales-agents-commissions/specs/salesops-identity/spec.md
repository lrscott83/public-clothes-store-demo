# Delta for salesops-identity (AMENDMENT, not append)

**Merge target**: `openspec/changes/backend-users-roles/specs/salesops-identity/spec.md`.
That spec was never promoted to `openspec/specs/` — it remains a delta owned
by the `backend-users-roles` change. This document AMENDS that file's
requirements directly. It does NOT modify or archive the `backend-users-roles`
change itself, and does NOT target any `openspec/specs/salesops-identity/`
path (no such promoted file exists).

Three passages in that spec currently assert or enumerate the ABSENCE of a
`gestor`/`sales_agent` bit. All three are amended below, with the superseded
text quoted verbatim for audit.

## MODIFIED Requirements

### Requirement: Bitmask Multi-Role with Union Permissions

The effective role bitmask MUST support simultaneous multi-role membership:
`user | operador_almacen | operador_gestores | sales_agent | owner | admin`,
sourced from `CompanyUser.role`. Effective permissions MUST be the UNION of
all held bits. `admin` is the system super-root. `owner` holds full business
power and MUST implicitly hold `sales_agent` via `BUSINESS_ROLES_MASK` (D8)
— never as an explicit bit stored on `owner`'s own row, only through the
effective-roles union. A bitmask value of `0` MUST be a valid state meaning
zero permissions — not an error.

(Previously: enumeration was `user | operador_almacen | operador_gestores |
owner | admin`, with no `sales_agent` bit and no mention of its inheritance
by `owner`.)

#### Scenario: hasRole checks a single bit

- GIVEN a `CompanyUser.role` of `operador_almacen | owner`
- WHEN `hasRole(user, 'owner')` is evaluated
- THEN it returns `true`; `hasRole(user, 'admin')` returns `false`

#### Scenario: A user can hold multiple roles at once

- GIVEN a `CompanyUser` assigned both `operador_almacen` and
  `operador_gestores`
- WHEN roles are added via `addRole`
- THEN both bits are set on `CompanyUser.role` and `getRoles` returns both

#### Scenario: removeRole clears only the targeted bit

- GIVEN a `CompanyUser.role` of `operador_almacen | owner`
- WHEN `removeRole(user, 'operador_almacen')` runs
- THEN only that bit clears; `owner` remains held

#### Scenario: Effective permission is the union of held roles

- GIVEN a `CompanyUser.role` of `operador_almacen | operador_gestores`
- WHEN checked against any permission granted by either role
- THEN access is granted

#### Scenario: admin is super-root regardless of other bits

- GIVEN a `CompanyUser.role` of only `admin`
- WHEN checked against ANY role requirement
- THEN access is granted

#### Scenario: Role bitmask of 0 denies every specific check but is not an error

- GIVEN a `CompanyUser.role` of `0`
- WHEN any `hasRole` check runs
- THEN every check returns `false` and every `@Roles(...)`-guarded endpoint
  returns `403` — a valid zero-permission account, not a
  `MISSING_COMPANY_USER` failure

#### Scenario: owner implicitly holds sales_agent without an explicit bit

- GIVEN a `CompanyUser.role` of only `owner`
- WHEN `hasRole` is evaluated against the EFFECTIVE role mask
- THEN `sales_agent` resolves as held — without `sales_agent` ever being set
  as an explicit bit on that row

### Requirement: Deferred / Non-Goals

The following MUST NOT be implemented in this capability: fine-grained
owner-finance permissions (owner remains coarse full-business power), and
email verification. `Company`/`CompanyUser` tables NOW EXIST
(`backend-users-roles`' own scope) but `Membership`, tenant-context
resolution, and schema-routing machinery remain deferred to the
schema-per-tenant change.

(Previously, verbatim: "The following MUST NOT be implemented in this
capability: the `gestor` role, fine-grained owner-finance permissions (owner
remains coarse full-business power), and email verification." Superseded by
`sales-agents-commissions`, which implements the `sales_agent` bit.)

#### Scenario: Company/CompanyUser exist, tenant-context machinery does not

- GIVEN the persisted schema after this change
- WHEN inspected
- THEN `company` and `company_user` tables exist, but no `Membership` table,
  tenant-context service, or schema-routing exists

#### Scenario: sales_agent role bit exists and is enumerated

- GIVEN the roles bitmask enum after `sales-agents-commissions`
- WHEN inspected
- THEN a `sales_agent` bit IS defined, distinct from `owner`/`admin`/`user`/
  `operador_almacen`/`operador_gestores`

(Supersedes, verbatim: "GIVEN the roles bitmask enum / WHEN inspected / THEN
no `gestor` role bit is defined" — that scenario's assertion is now FALSE; a
`sales_agent` bit is the very deliverable this amendment introduces.)

## ADDED Requirements

### Requirement: sales_agent Role Grants

The `sales_agent` bit MUST grant READ access to customer records, CREATE
access to customer records, and READ access to cross-warehouse
stock/availability data (see `salesops-ventas`). It MUST NOT require or
create any warehouse-scope association for that user — the shape used by
`operador_almacen`/`warehouse_operator` MUST NOT be reused.

(Previously: this requirement denied `Customer` CREATE access to
`sales_agent` and deferred it to design. **D10** — owner decision landed
2026-07-28, engram `sdd/sales-agents-commissions/decisions-d10` — REVERSES
that deferral: the gestor's own definition, "usando un cliente registra una
venta," requires creating a customer on the spot for a brand-new buyer who
has no login yet. The full create-with-new-identity contract, and its three
mandatory privilege-escalation guardrails, are specified in the
`salesops-customers` delta — NOT here, since that behavior is triggered by,
and lives entirely within, the customer-creation flow that capability owns.)

#### Scenario: sales_agent can read customer records

- GIVEN a `CompanyUser` holding only `sales_agent`
- WHEN they call the customer READ endpoint
- THEN access is admitted

#### Scenario: sales_agent can create a customer together with its identity

- GIVEN a `CompanyUser` holding only `sales_agent`
- WHEN they call the create-customer-with-new-identity endpoint
- THEN access is admitted at the role-grant level — the resulting
  identity-creation and privilege-escalation contract is specified in the
  `salesops-customers` delta, not this one

#### Scenario: sales_agent is NOT granted the attach-to-existing-identity path

- GIVEN a `CompanyUser` holding only `sales_agent`
- WHEN they call the customer-creation endpoint that accepts an arbitrary
  existing `userId`
- THEN access is denied — that path can bind a customer record to ANY existing
  identity, including the owner's, so granting it would hand the agent an
  escalation vector the create-with-new-identity path structurally cannot have

#### Scenario: sales_agent can read cross-warehouse availability

- GIVEN a `CompanyUser` holding only `sales_agent`
- WHEN they query warehouse availability for a basket
- THEN access is admitted regardless of warehouse

#### Scenario: sales_agent holds no warehouse-scope row

- GIVEN a `CompanyUser` holding `sales_agent`
- WHEN checked for a warehouse-scope association (the shape used by
  `operador_almacen`)
- THEN no such scope row exists or is required
