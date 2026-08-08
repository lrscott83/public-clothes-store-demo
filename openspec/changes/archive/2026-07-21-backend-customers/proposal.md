# Proposal: Clientes Module — customer master-data slice

## Intent

Clientes is the next **CAPA BASE** module of the salesops backend
(`docs/plans/estrategia-backend-por-modulos.md`), landing after the shipped
Currency → Products → Inventario slices. Today the customer in Ventas is **free text**:
`packages/domain/src/models/sale-credit.ts` carries `client: string` and `Order` has no
`customerId`. A free-text client is unqueryable, un-deduplicable and can never accrue a
debt history — exactly the problem the Category promotion solved when 11 flat slug
strings became a referenced `Category` entity. This change promotes that free-text
reference into a real referenced master-data entity: it ships `Customer` as a pure
domain entity behind a port, persisted via Prisma, exposed through thin NestJS CRUD and
seeded — mirroring the shipped Product / Warehouse modules end-to-end. The model is
owner-LOCKED (field-by-field, this proposal); no scope creep.

`Customer` is structurally the **simplest** base module so far: a single flat entity,
one repository, no derived values, no movements, no cross-table transaction. It is the
Warehouse pattern with more optional contact fields.

## Scope

### In Scope
- **Domain** (`@store-mgmt/domain/src/customer`): flat per-concept files + one port,
  mirroring `product/` and `inventory/warehouse.ts`.
  - `Customer` `{ id: UUID, fullName, documentId?, cellPhone?, email?, address?, note?, active, createdAt, updatedAt }`.
    Only `fullName` is required (non-empty / non-whitespace invariant, factory throws
    `InvalidCustomerError`). ALL contact fields optional — NO "at least one contact"
    rule.
  - Port `ICustomerRepository` (`create / update / softDelete / findById / list(filter?)`)
    + `CUSTOMER_REPOSITORY` Symbol + `CustomerListFilter { includeInactive? }` +
    `CustomerUpdateInput = Partial<Omit<Customer,'id'|'createdAt'>>`. Mirrors
    `IWarehouseRepository` / `IProductRepository` exactly.
  - Named errors `InvalidCustomerError` (empty `fullName`) and
    `DuplicateCustomerDocumentError` (a `documentId` collision).
- **Persistence** (`infra-db`): Prisma `Customer` model (`documentId` `@unique`, nullable
  → many NULLs allowed, uniqueness enforced only on present values); `PrismaCustomerRepository`
  implementing the port and translating the Prisma unique-violation (P2002) into
  `DuplicateCustomerDocumentError`; seed of a small demo customer set.
- **Delivery** (`api-salesops`): `CustomerModule` REST CRUD mirroring `WarehouseModule`
  /`CategoryModule` — `InvalidCustomerError → 400`, `DuplicateCustomerDocumentError → 409`,
  `DELETE` always soft-deletes.

### Out of Scope (YAGNI — strategy doc "qué NO copiamos")
- **Ventas FK rewiring**: `SaleCredit.client: string → customerId` and `Order.customerId`
  belong to a **future Ventas change**. This change ships the `Customer` entity + repo +
  REST + seed ONLY; `sale-credit.ts` / `order.ts` are NOT touched.
- **Debt / balance / creditLimit**: `Customer` is PURE master data. Debt is DERIVED from
  `SaleCredit` at read time in a future change — NEVER stored here (same discipline as
  `Product.finalPrice` / `StockLevel.available`).
- Address hierarchy / geo (flat single `address` string, like `Store.address`).
- Customer groups / tags / segments / tiers / loyalty; per-customer pricelists.
- Contact-channel entities (multiple phones/emails), document-type taxonomy, contact
  validation (email/phone format) — `documentId`/`email`/`cellPhone` are free strings.
- Merge/dedupe tooling; import/export.

## Capabilities

### New Capabilities
- `salesops-customers`: `Customer` flat master-data (required `fullName`, optional
  `documentId`/`cellPhone`/`email`/`address`/`note`, `active` soft-delete) behind a
  repository port with Prisma persistence, `documentId` uniqueness, HTTP CRUD and a demo
  seed. Distinct from `salesops-inventory`, `salesops-products`, `salesops-currency`,
  `salesops-backend`, `salesops-mvp`.

### Modified Capabilities
- None. `SaleCredit` keeps its free-text `client` field in this change; the FK is
  introduced later by Ventas. The move is intentionally one entity at a time.

## Decided Architectural Boundaries (LOCKED — do not re-open)

- **`fullName` is a SINGLE field** (not `firstName` + `lastName`) and the ONLY required
  field. Matches the legacy free-text `client` string and the `Owner.fullName` /
  `User.fullName` vocabulary already in `models/store.ts`.
- **ALL contact fields optional**, NO "at least one contact" invariant. A walk-in cash
  customer with only a name is valid master data.
- **`documentId` OPTIONAL, UNIQUE WHEN PRESENT.** A plain Postgres `@unique` on a
  nullable column already permits many NULL rows while rejecting duplicate non-null
  values — no partial-index gymnastics (decided in `design.md`). Collisions surface as
  `DuplicateCustomerDocumentError`.
- **`note` maps to the legacy `description` vocabulary** — a single free-text field, not
  structured notes.
- **`active` is a SOFT-DELETE flag** (default true), never a hard DELETE — a future
  Ventas `SaleCredit`/`Order` FK would orphan history, exactly like `Warehouse` /
  `Product` / `Category`.
- **`Customer` stores NO money**: no `creditLimit`, no `balance`, no `debt`. Debt is
  derived from `SaleCredit` in a future read model. Same anti-contradiction discipline as
  Product pricing and `StockLevel.available`.

## Documented Seam (named, NOT built)

| Seam | Owner (future) | Contract sketch |
|------|----------------|-----------------|
| Ventas customer FK | future Ventas change | `SaleCredit.client: string → customerId: string` (+ `Order.customerId`), validated through `ICustomerRepository.findById`; a `CustomerDebtView` derives outstanding balance by summing that customer's unpaid `SaleCredit` rows — NEVER a stored column |

## Open Decisions — carry into spec/owner

| # | Decision | Recommendation (needs confirmation) |
|---|----------|-------------------------------------|
| 1 | **`documentId` uniqueness scope**: reject a duplicate against ALL rows (incl. soft-deleted) or only ACTIVE rows? | A government document ID identifies a real person globally; recommend a plain `@unique` across ALL rows (simplest, strictest, no partial index). Consequence: a soft-deleted customer's `documentId` cannot be re-used by a new active row — accept as correct. A `WHERE active` partial index is the documented escape hatch if the owner later wants reuse-after-deactivation. Confirm. |
| 2 | **Seed customer set**: how many, and idempotency key? | Seed a small demo set (recommend 5) sourced from `CLIENT_NAME_POOL` (`apps/salesops-mvp/app/seed/constants.ts`), `documentId` left null (no fabricated government IDs), idempotent on `fullName` (mirrors the Warehouse `find-by-name-then-upsert` seed — `fullName` has no DB unique constraint). Confirm count. |
| 3 | **`createdBy` / audit user** | Out of scope — `Customer` has no audit-user field in the locked model; a transversal `@CurrentUser` is the future Usuarios module's job, retrofitted uniformly. Do NOT add a stub. |

## Migration / Seed Notes

- Additive only: one new Prisma model (`Customer`) + one migration; no existing table
  altered. No FK added to `SaleCredit`/`Order` in this change.
- Seed inserts a small demo customer set (open decision #2). No `catalog.json` changes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/domain/src/customer/` | New | `Customer` entity + factory, `ICustomerRepository` port, `InvalidCustomerError` + `DuplicateCustomerDocumentError`, tests, barrel |
| `packages/domain/src/index.ts` | Modified | Add `export * from './customer/index.js';` after the `inventory` line |
| `packages/infra-db/prisma/schema.prisma` | Modified | Add `model Customer` (`documentId` `@unique`); additive migration |
| `packages/infra-db/src/customer/` | New | `PrismaCustomerRepository` (P2002 → `DuplicateCustomerDocumentError`) + seed |
| `apps/api-salesops/src/customer/` | New | `CustomerModule` REST CRUD + DTOs + e2e |
| `packages/domain/src/models/sale-credit.ts` | **Untouched** | `client: string` stays free text — FK rewiring is a future Ventas change |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `@unique` on nullable `documentId` unexpectedly rejects multiple NULLs | Low | Postgres treats NULLs as distinct under a plain unique index; a spec scenario + a real-Postgres test assert many null-document customers coexist |
| Duplicate `documentId` surfaces as a raw 500 instead of a named error | Med | `PrismaCustomerRepository` catches Prisma P2002 and throws `DuplicateCustomerDocumentError` → mapped to 409 |
| Scope creep into Ventas FK rewiring | Med | Explicit out-of-scope; a Phase-5 guard `rg` asserts `sale-credit.ts` still has `client: string` and no `customerId` |
| Storing debt/balance on `Customer` | Low | Locked boundary: money is derived from `SaleCredit`, never stored — no such column exists |
| Boundary leak (domain → infra) | Low | `backend-boundaries` lint `--max-warnings 0`, mirroring Product/Warehouse |

## Rollback Plan

Self-contained: revert the feature branch. The single `Customer` Prisma model is additive
— drop the migration. Untouched Product, Currency, Inventory, Category modules,
`sale-credit.ts` free-text client, `salesops-mvp` SPA and `@store-mgmt/domain` exports
remain intact.

## Dependencies

- Shipped Warehouse slice as the reference flat-master-data hexagonal impl:
  `packages/domain/src/inventory/warehouse.ts`, `packages/infra-db/src/inventory/*`,
  `apps/api-salesops/src/warehouse/*`.
- Backend base scaffold (`api-salesops`, `infra-db`, docker Postgres).
- Owner confirmation on open decisions #1–#2 before spec finalizes the schema/seed.

## Success Criteria

- [ ] `Customer` domain entity with required `fullName` invariant (`InvalidCustomerError`)
      and all-optional contacts — passing TDD.
- [ ] Prisma `Customer` model + repo persist/read against Postgres; `documentId` `@unique`
      enforced on non-null values, many nulls allowed; P2002 → `DuplicateCustomerDocumentError`.
- [ ] `CustomerModule` REST CRUD: `InvalidCustomerError → 400`, `DuplicateCustomerDocumentError → 409`,
      `DELETE` soft-deletes (row survives).
- [ ] Seed creates the demo customer set idempotently.
- [ ] Domain imports the port, never Prisma; `backend-boundaries` lint green.
- [ ] `sale-credit.ts` still carries free-text `client: string` — no FK rewiring (`rg` verified).
