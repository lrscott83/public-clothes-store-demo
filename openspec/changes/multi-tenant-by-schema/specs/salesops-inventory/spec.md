# Delta for salesops-inventory

## ADDED Requirements

### Requirement: WarehouseOperator FKs Tenant CompanyUser, Not Master User

`WarehouseOperator` MUST live in the tenant schema. Its identity link MUST be
`companyUserId` (PK AND FK, `@relation` to the tenant `CompanyUser.id`),
replacing the prior `userId @id @relation` to the master `User`
(`schema.prisma:509`) — Prisma forbids a cross-schema `@relation`. The
1:1-with-identity, non-unique-`warehouseId` shape is preserved; only the
relation's target changes. The role-scoping behavior itself
(`salesops-identity`'s "OperadorAlmacen Warehouse Scope") is unaffected by
this reshape.

#### Scenario: WarehouseOperator.companyUserId is the PK

- GIVEN the tenant `WarehouseOperator` schema after this change
- WHEN inspected
- THEN `companyUserId` is both PK and FK, `@relation`s to the tenant
  `CompanyUser`, and no `userId` field or relation to the master `User`
  exists

#### Scenario: warehouseId remains non-unique

- GIVEN two `WarehouseOperator` rows for the same `warehouseId`, each with a
  different `companyUserId`
- WHEN both are persisted
- THEN both succeed — a warehouse MAY still have many operators
