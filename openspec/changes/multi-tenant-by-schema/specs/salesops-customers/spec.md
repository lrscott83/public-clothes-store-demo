# Delta for salesops-customers

## ADDED Requirements

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
