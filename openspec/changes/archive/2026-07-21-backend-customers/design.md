# Design — Clientes Module

Next **CAPA BASE** vertical slice after Products / Inventario, mirroring the shipped
Warehouse module end-to-end. ONE flat domain entity — `Customer` — behind ONE repository
port, persisted via Prisma, exposed through a thin `CustomerModule` (REST CRUD). This is
the simplest base module yet: no derived values, no movements, no cross-table
transaction. This document DECIDES the implementation-level questions the locked model
left open (`documentId` uniqueness mechanics, the seed set); it does NOT re-open the
model.

> Authoritative business model is owner-LOCKED field-by-field in the proposal
> (`sdd/backend-customers/proposal`). It LOCKS: `fullName` as the single required field,
> all-optional contacts, `documentId` optional/unique-when-present, `note` = legacy
> `description`, `active` soft-delete, and NO stored money. This document decides the HOW
> at architecture level. Tasks come next.

## Quick path (what gets built)

1. `packages/domain/src/customer/` — `Customer` entity + `createCustomer` factory (the
   non-empty `fullName` invariant), the `ICustomerRepository` port, named errors
   (`InvalidCustomerError`, `DuplicateCustomerDocumentError`), a barrel. Flat per-concept
   files mirroring `inventory/warehouse.ts` + `inventory/warehouse-repository.port.ts`.
   Zero framework, zero I/O.
2. `packages/infra-db/` — one `Customer` Prisma model (+ additive migration) and
   `PrismaCustomerRepository` implementing the port, translating the Prisma unique
   violation into `DuplicateCustomerDocumentError`. Seed = a small demo customer set.
3. `apps/api-salesops/src/customer/` — `CustomerModule` REST CRUD mirroring
   `WarehouseModule`, mapping `InvalidCustomerError → 400` and
   `DuplicateCustomerDocumentError → 409`.
4. Tests across the three native runners: domain=vitest, infra-db=jest, api=jest + e2e.

## The central decision — documentId uniqueness (plain nullable `@unique`)

`documentId` is OPTIONAL and UNIQUE WHEN PRESENT. The mechanism is a **plain Prisma
`@unique` on the nullable column** — deliberately NOT a partial index, NOT an
application-level pre-check.

**Why a plain `@unique` is correct for a nullable column (PostgreSQL semantics).** Under
the SQL standard (and Postgres' default btree unique index), **two NULLs are never equal**,
so a unique index permits an unlimited number of rows with `document_id = NULL` while still
rejecting duplicate non-null values. This is exactly the "optional, unique when present"
requirement — no `WHERE document_id IS NOT NULL` partial-index gymnastics are needed.
(Postgres 15+ offers `NULLS NOT DISTINCT`; we rely on the DEFAULT `NULLS DISTINCT`
behaviour, which is what a bare `@unique` produces.) Mirrors `Category.slug @unique`,
adapted to a nullable column.

**Uniqueness scope — ALL rows, including soft-deleted (open decision #1).** Because
`active=false` rows are retained (soft-delete), a plain `@unique` enforces global
uniqueness on `documentId` across active AND inactive rows. This is STRICTER than
"active-only" and is the honest choice: a `documentId` (DNI/CUIT/RUC) identifies a real
person and must never be duplicated, even by a re-created record after deactivation. If
the owner later needs reuse-after-deactivation, the documented escape hatch is a partial
unique index `... WHERE active` (not built now).

**Where the named error is raised.** Set-level uniqueness cannot be enforced by a pure
factory (it needs the whole table), so — exactly like a DB constraint surfacing — the
adapter owns it: `PrismaCustomerRepository.create` / `.update` run inside a `try/catch`
that maps Prisma error code **P2002** on the `document_id` target to the domain
`DuplicateCustomerDocumentError`. The error type lives in `domain/src/customer/errors.ts`
(domain-owned vocabulary, thrown by the infra adapter — the same pattern as
`NegativeStockError` being a domain error thrown inside the inventory transaction). The
API maps it to `409 Conflict`.

```ts
// packages/infra-db/src/customer/prisma-customer.repository.ts (sketch)
try {
  const row = await this.prisma.customer.create({ data: { /* … */ } });
  return toDomain(row);
} catch (e) {
  if (isUniqueViolation(e, 'document_id')) {
    throw new DuplicateCustomerDocumentError(`documentId already in use`);
  }
  throw e;
}
```

There is deliberately NO application-level "find by documentId first" pre-check: it would
race under concurrency and duplicate the DB's job. The unique index is the single source
of truth; the catch translates it.

## Layer mapping (screaming architecture)

Dependency direction unchanged: `api-salesops → { domain, infra-db }`, `infra-db →
domain`, `domain → nothing`. The `domain → infra` edge is FORBIDDEN, enforced by
`backend-boundaries` ESLint at `--max-warnings 0` across all three packages.

### `packages/domain/src/customer/` — pure core (vitest)

| File | Contract |
|------|----------|
| `customer.ts` | `interface Customer { id; fullName; documentId?: string \| null; cellPhone?; email?; address?; note?; active; createdAt; updatedAt }` + `CreateCustomerInput` (optional `id`/`createdAt`/`updatedAt`) + `createCustomer(input)` — throws `InvalidCustomerError` on empty/whitespace `fullName`; defaults `active=true` and every absent contact field to `null`. Mirrors `createWarehouse`. |
| `customer-repository.port.ts` | `ICustomerRepository { create; update; softDelete; findById; list(filter?) }` + `CustomerListFilter { includeInactive?: boolean }` + `CustomerUpdateInput = Partial<Omit<Customer,'id'\|'createdAt'>>` + `const CUSTOMER_REPOSITORY = Symbol('ICustomerRepository')`. Mirrors `IWarehouseRepository` verbatim. |
| `errors.ts` | `InvalidCustomerError` (empty `fullName`), `DuplicateCustomerDocumentError` (`documentId` collision). "grita, no adivina". |
| `customer.test.ts` | Factory invariants (see TDD table). |
| `index.ts` | Barrel; re-exported from `packages/domain/src/index.ts` after the `inventory` line. |

`Customer.softDelete` (set `active=false`), never hard delete — a future Ventas
`SaleCredit`/`Order` FK would orphan history, exactly like `Warehouse` / `Product`.

### `packages/infra-db/` — adapter (jest + real Postgres)

| File | Contract |
|------|----------|
| `prisma/schema.prisma` | Append `model Customer` (`documentId` `@unique`, nullable) + migration. |
| `src/customer/prisma-customer.repository.ts` | `@Injectable() PrismaCustomerRepository implements ICustomerRepository`. `create()` never passes `id` (DB `@default(uuid())`); `create`/`update` catch P2002 on `document_id` → `DuplicateCustomerDocumentError`; `softDelete` flips `active`; `list` filters `active` unless `includeInactive`. Mirrors `PrismaWarehouseRepository`. |
| `src/customer/seed.ts` | Idempotent seed of the demo customer set (upsert-on-`fullName`, `documentId` null), NO fabricated document IDs. |
| `src/index.ts` | Export `PrismaCustomerRepository` (mirror the warehouse export line). |

### `apps/api-salesops/src/customer/` — delivery (jest)

| File | Contract |
|------|----------|
| `customer.module.ts` | `imports:[InfraDbModule]`; provide `CUSTOMER_REPOSITORY → PrismaCustomerRepository`; declares `CustomerController` + `CustomerService`. Mirror `warehouse.module.ts`. |
| `customer.service.ts` | Holds `CUSTOMER_REPOSITORY`; maps domain `Customer → CustomerResponseDto` (dates → ISO strings, nulls preserved). Mirror `WarehouseService`. |
| `customer.controller.ts` | REST CRUD; `withDomainErrorMapping` maps `InvalidCustomerError → 400`, `DuplicateCustomerDocumentError → 409`; `GET/:id` unknown → 404; `DELETE` soft-deletes. Mirror `WarehouseController`. |
| `dto/*.ts` | `create-customer.dto.ts` (`fullName!`, optional contacts), `update-customer.dto.ts` (all optional), `customer-response.dto.ts` (all fields, dates as strings), `dto/index.ts`. Mirror the warehouse DTOs. |

No `createdBy`/audit-user field — the locked model has none. A transversal `@CurrentUser`
is the future Usuarios module's job; do NOT build a guard/stub here.

## Prisma schema (append to baseline)

```prisma
// Fourth domain module: Clientes (SDD change backend-customers). Flat master
// data -> BOTH created_at + updated_at. Soft-delete via `active`, never a hard
// DELETE — a future Ventas SaleCredit/Order FK must never be orphaned.
// `documentId` is optional and unique-when-present: a plain @unique on a
// nullable column allows many NULLs (Postgres treats NULLs as distinct) while
// rejecting duplicate non-null values — no partial index needed (design.md).
model Customer {
  id         String   @id @default(uuid()) @db.Uuid
  fullName   String   @map("full_name")
  documentId String?  @unique @map("document_id")
  cellPhone  String?  @map("cell_phone")
  email      String?
  address    String?
  note       String?
  active     Boolean  @default(true)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@map("customer")
}
```

- **No relations in this change.** The Ventas FK (`SaleCredit.customerId → Customer`) is a
  future change; adding an inverse relation now would force touching `sale-credit.ts` /
  the `SaleCredit` Prisma model, which is out of scope. `Customer` ships relation-free.
- **`documentId` as a single nullable `String` `@unique`** — no document-TYPE column, no
  composite `(type, number)` key. The taxonomy of document kinds is YAGNI.
- **No money columns** — `creditLimit`/`balance`/`debt` are deliberately absent; debt is a
  future derived read model over `SaleCredit`.
- **Migration**: single additive `prisma migrate dev --name add_customer_module`. Rollback
  = drop the migration; Product/Category/Currency/Inventory untouched.

## Seam doc — Ventas customer FK (named, NOT built)

A future **Ventas** change owns the promotion of the free-text reference to a foreign key.
It would:

```ts
/** Owned by a future Ventas change — NOT this change. */
// SaleCredit.client: string   →   SaleCredit.customerId: string  (FK → Customer.id)
// Order gains customerId: string (FK → Customer.id)
// Both validated through ICustomerRepository.findById before persist.

/** Debt is DERIVED, never stored on Customer. */
interface CustomerDebtView {
  outstandingBalance(customerId: string): Promise<Money>; // Σ unpaid SaleCredit for the customer
}
```

`CustomerDebtView` sums the customer's unpaid `SaleCredit` rows at read time — the same
anti-contradiction discipline as `Product.finalPrice` and `StockLevel.available`. This
change NAMES the seam so `Customer` has a documented downstream owner; it builds none of
it and does NOT touch `sale-credit.ts` / `order.ts`.

## Seed plan

- **Seed a small demo customer set** (recommend 5, open decision #2), sourced from
  `CLIENT_NAME_POOL` (`apps/salesops-mvp/app/seed/constants.ts`) e.g. `Ana Torres`,
  `Luis Pérez`, `Marta Gómez`, `José Díaz`, `Yanet Cruz`. `documentId` left `null` (no
  fabricated government IDs); other contacts optional/empty. Data, not enum.
- **Idempotent upsert keyed on `fullName`** — `fullName` has no DB-level unique constraint
  (per the locked model), so idempotency is a find-first-by-`fullName`-then-create-or-update,
  exactly like `seedWarehouses`. Re-running never duplicates. `seed.spec.ts` proves it
  (run twice → the demo set exists exactly once).
- Wire into the shared seed entrypoint alongside the product/category/warehouse seed.

## Architecture decisions (ADR-style)

| # | Decision | Rejected alternative | Rationale |
|---|----------|----------------------|-----------|
| 1 | `documentId` = plain nullable `@unique` | partial index `WHERE document_id IS NOT NULL`; app-level pre-check | Postgres treats NULLs as distinct → many nulls allowed, non-nulls unique, with zero gymnastics; mirrors `Category.slug`. |
| 2 | Uniqueness scope = ALL rows (incl. soft-deleted) | active-only partial index | A government document ID is globally unique to a person; strictest + simplest. `WHERE active` is the documented escape hatch (decision #1 in proposal). |
| 3 | `DuplicateCustomerDocumentError` raised in the repo via P2002 catch | validate uniqueness in a pure factory; return null/boolean | Set-level uniqueness needs the whole table; a pre-check races. The DB index is the source of truth; the adapter translates its violation. Error TYPE stays domain-owned. |
| 4 | `fullName` single required field | `firstName` + `lastName` | Matches legacy free-text `client` + `Owner.fullName`/`User.fullName` vocabulary; splitting is a UI concern, not master-data. |
| 5 | All contact fields optional, NO "at least one contact" | require ≥1 contact | A walk-in cash customer with only a name is valid master data (locked). |
| 6 | NO money on `Customer` (`creditLimit`/`balance`/`debt`) | store a running balance | Anti-contradiction discipline: debt is derived from `SaleCredit` in a future read model, same as `Product.finalPrice`/`StockLevel.available`. |
| 7 | `active` soft-delete, never hard DELETE | hard delete | A future Ventas FK would orphan history; mirrors `Warehouse`/`Product`/`Category`. |
| 8 | `Customer` ships relation-free (no inverse FK to SaleCredit) | add the Ventas FK now | The FK rewiring belongs to a future Ventas change; adding it now forces touching out-of-scope `sale-credit.ts`. |
| 9 | `note` = single free-text string (legacy `description`) | structured/multiple notes | YAGNI; matches the existing `description` vocabulary. |
| 10 | Flat per-concept files under `customer/`, one port | god-repository / split ports | Mirrors `inventory/warehouse.*`; one port per aggregate. |

## Testing / TDD strategy (three runners)

Strict TDD is active. Each test targets the runner native to its package.

| Test | Package / runner |
|------|------------------|
| `createCustomer` rejects empty/whitespace `fullName` (`InvalidCustomerError`) | domain / **vitest** |
| `createCustomer` defaults `active=true` and absent contacts to `null`; single `fullName`, no `firstName`/`lastName`; no money field | domain / vitest |
| `create`/`findById`/`update`/`softDelete`/`list` round-trip against real Postgres | infra-db / **jest** |
| Many customers with null `documentId` coexist (nullable `@unique` allows many nulls) | infra-db / jest |
| Duplicate non-null `documentId` on create/update → `DuplicateCustomerDocumentError` (P2002 translated) | infra-db / jest |
| A customer updates while keeping its own `documentId` (no self-collision) | infra-db / jest |
| `softDelete` flips `active`, row still `findById`-able; `list` excludes inactive by default | infra-db / jest |
| Seed idempotency: run twice → demo set exists exactly once, all `active` | infra-db / jest |
| CRUD endpoints; `POST` 201; empty `fullName` → 400; duplicate `documentId` → 409; `DELETE` soft-deletes; unknown id → 404 | api-salesops / **jest** + e2e |

- infra-db + api jest runs need `NODE_OPTIONS=--experimental-vm-modules` (Prisma WASM).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `@unique` on nullable `documentId` rejects multiple NULLs (misread semantics) | Low | Real-Postgres test asserts many null-document customers coexist; relies on default `NULLS DISTINCT` |
| Duplicate `documentId` surfaces as raw 500, not 409 | Med | Adapter catches P2002 on `document_id` → `DuplicateCustomerDocumentError`; controller maps → 409; covered by an infra + an e2e test |
| Scope creep into Ventas FK rewiring | Med | `Customer` ships relation-free; Phase-5 `rg` guard asserts `sale-credit.ts` keeps `client: string`, no `customerId` |
| Storing debt/balance on `Customer` | Low | Locked: no money column exists; a spec scenario asserts absence |
| Boundary leak (domain → infra) | Low | `backend-boundaries` lint `--max-warnings 0` across all three packages |

## Open questions

- [x] `documentId` uniqueness mechanism? → **plain nullable `@unique`** (decision #1).
- [x] Uniqueness scope (active-only vs all)? → **all rows**, `WHERE active` documented as
      escape hatch (decision #2) — owner confirm on proposal open decision #1.
- [ ] Seed customer count (recommend 5) — owner may adjust (non-blocking, proposal open
      decision #2).

## Next step

`sdd-tasks` once the spec is also ready — break this design into ordered, testable work
units (entity + factory + port + errors → barrel wiring → schema/migration + repo (incl.
P2002 translation) + seed → module/endpoints + e2e → cross-cutting verification),
respecting the three-runner TDD map.
