# Tasks: Clientes Module

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700-850 (domain ~180 incl. entity+port+errors+tests, infra-db ~260 incl. schema+migration+repo+seed+specs, api ~330 incl. module+DTOs+service+controller+specs+e2e, seam doc inline in design; human-authored, excludes generated Prisma client/migration SQL) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No — `single-pr`, `size:exception` PRE-AUTHORIZED by owner |
| Suggested split | Optional commit boundaries (below), NOT separate PRs: Unit 1 (domain) → Unit 2 (barrel wiring) → Unit 3 (infra-db schema+repo+seed) → Unit 4 (api CustomerModule + e2e) → Unit 5 (cross-cutting verification) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

Delivery is `single-pr` with `size:exception` PRE-AUTHORIZED by the owner — do NOT stop to
ask about splitting. Work units below apply as **commit** boundaries inside the single PR,
each independently revertible. Strict TDD is ACTIVE: follow RED → GREEN with the runner
native to each package — domain = `vitest run`, infra-db = `jest` against the real shared
Postgres (NO mocks), api-salesops = `jest` + `test:e2e`.

### Suggested Work Units (commit boundaries, single PR)

| Unit | Goal | Scope | Depends on |
|------|------|-------|-----------|
| 1 | Domain: `Customer` entity + factory + port + errors | Phase 1 | none |
| 2 | Domain barrel wiring + Ventas-untouched guard | Phase 2 | Unit 1 |
| 3 | infra-db: Prisma `Customer` + migration + repo + seed | Phase 3 | Unit 2 (port types) |
| 4 | api-salesops: `CustomerModule` REST + e2e | Phase 4 | Unit 3 (repository) |
| 5 | Boundary lint + three-runner verification + scope guards | Phase 5 | Units 1-4 |

## Phase 1: Domain — Customer (vitest, `pnpm --filter @store-mgmt/domain test`)

- [x] 1.1 [RED] `domain/src/customer/customer.test.ts`: `createCustomer` rejects empty
      `fullName`; rejects whitespace-only `fullName`; accepts a valid `fullName` and
      defaults `active=true`; absent contacts (`documentId`/`cellPhone`/`email`/`address`/`note`)
      resolve to `null`; produced `Customer` has a single `fullName` (no `firstName`/`lastName`)
      and no money field (`creditLimit`/`balance`/`debt`).
- [x] 1.2 [GREEN] `domain/src/customer/errors.ts` (`InvalidCustomerError`,
      `DuplicateCustomerDocumentError`) + `domain/src/customer/customer.ts`
      (`interface Customer { id; fullName; documentId?; cellPhone?; email?; address?; note?; active; createdAt; updatedAt }`
      + `CreateCustomerInput` + `createCustomer(input)`) to pass 1.1. Mirror
      `inventory/warehouse.ts` + `inventory/errors.ts`.
- [x] 1.3 `domain/src/customer/customer-repository.port.ts`:
      `ICustomerRepository { create; update; softDelete; findById; list(filter?) }` +
      `CustomerListFilter { includeInactive?: boolean }` +
      `CustomerUpdateInput = Partial<Omit<Customer,'id'|'createdAt'>>` +
      `CUSTOMER_REPOSITORY = Symbol('ICustomerRepository')`. Mirror
      `warehouse-repository.port.ts` verbatim.
- [x] 1.4 Run `pnpm --filter @store-mgmt/domain test` full-green (new customer suite +
      existing product/currency/inventory suites untouched).

## Phase 2: Domain wiring & scope guard (vitest + build)

- [x] 2.1 `domain/src/customer/index.ts` barrel (re-export `customer.ts`,
      `customer-repository.port.ts`, `errors.ts`); add
      `export * from './customer/index.js';` to `domain/src/index.ts` AFTER the
      `inventory` line.
- [x] 2.2 `pnpm --filter @store-mgmt/domain build` green so consumers (`infra-db`,
      `api-salesops`) see the new `customer/` barrel exports.
- [x] 2.3 [GUARD] `rg -n "client: string" templates/packages/domain/src/models/sale-credit.ts`
      still matches AND `rg -n "customerId" templates/packages/domain/src/models/sale-credit.ts templates/packages/domain/src/models/order.ts` returns 0 — the Ventas FK rewiring is NOT part of this change; `sale-credit.ts` / `order.ts` stay untouched.

## Phase 3: infra-db — Prisma adapter (jest + real Postgres, `pnpm --filter @store-mgmt/infra-db test`)

- [x] 3.1 Append `model Customer` (exact shape from `design.md`: `documentId String? @unique @map("document_id")`, `fullName @map("full_name")`, `cellPhone @map("cell_phone")`, optional `email`/`address`/`note`, `active` default true, both timestamps, `@@map("customer")`) to `templates/packages/infra-db/prisma/schema.prisma` — additive-only, after the inventory models; NO relations, NO changes to `SaleCredit`/`Order`/`Product`.
- [x] 3.2 Generate migration `add_customer_module`
      (`pnpm --filter @store-mgmt/infra-db prisma:migrate`); confirm additive-only —
      `product`/`category`/`exchange_rate`/`warehouse`/`stock_*` tables untouched.
- [x] 3.3 [RED] `infra-db/src/customer/prisma-customer.repository.spec.ts`: `create()`
      persists with a real UUID and null contacts; `findById` round-trips; `update()`
      patches a field; `softDelete()` flips `active=false`, row still `findById`-able;
      `list()` excludes inactive by default, includes them with `includeInactive`.
- [x] 3.4 [GREEN] `infra-db/src/customer/prisma-customer.repository.ts`:
      `PrismaCustomerRepository implements ICustomerRepository` (mirror
      `PrismaWarehouseRepository`; `create` never passes `id`; `list` filters `active`) to
      pass 3.3.
- [x] 3.5 [RED] `prisma-customer.repository.spec.ts` (uniqueness cases): many customers
      with null `documentId` all persist (nullable `@unique` allows many nulls); a second
      customer with a duplicate non-null `documentId` throws
      `DuplicateCustomerDocumentError` on `create`; updating customer B to an existing
      `documentId` throws it; updating a customer while KEEPING its own `documentId`
      succeeds (no self-collision).
- [x] 3.6 [GREEN] Add P2002 translation to `PrismaCustomerRepository.create`/`.update`:
      catch the Prisma unique-violation on `document_id` and throw
      `DuplicateCustomerDocumentError` (per `design.md`'s central decision) to pass 3.5.
- [x] 3.7 Export `PrismaCustomerRepository` from `infra-db/src/index.ts` (mirror the
      warehouse export line).
- [x] 3.8 [RED] `infra-db/src/customer/seed.spec.ts`: running the seed against a fresh DB
      produces exactly the demo customer set (5 names from `CLIENT_NAME_POOL`, all
      `active=true`, `documentId=null`); running it twice does not duplicate (idempotent
      upsert on `fullName`).
- [x] 3.9 [GREEN] `infra-db/src/customer/seed.ts`: idempotent find-first-by-`fullName`-then-create-or-update
      seed of the 5 demo customers ONLY (source names from
      `templates/apps/salesops-mvp/app/seed/constants.ts` `CLIENT_NAME_POOL`); wire into
      the shared seed entrypoint alongside the product/category/warehouse seed, to pass 3.8.
- [x] 3.10 Run `pnpm --filter @store-mgmt/infra-db test` full-green (existing
      currency/product/inventory suites + new customer suites); `lint`/`typecheck`/`build`
      green.

## Phase 4: api-salesops — CustomerModule REST (jest + e2e, `pnpm --filter @store-mgmt/api-salesops test`)

- [x] 4.1 `apps/api-salesops/src/customer/dto/*.ts`: `create-customer.dto.ts`
      (`fullName!`, optional `documentId`/`cellPhone`/`email`/`address`/`note`),
      `update-customer.dto.ts` (all optional incl. `active`), `customer-response.dto.ts`
      (all fields, dates as ISO strings, nulls preserved), `dto/index.ts`. Mirror the
      warehouse DTOs — no money fields.
- [x] 4.2 [RED] `customer.service.spec.ts`: with a mocked `CUSTOMER_REPOSITORY`, the
      service creates/updates/soft-deletes/lists/finds-by-id and maps domain `Customer` →
      `CustomerResponseDto` (dates → strings, nulls kept).
- [x] 4.3 [GREEN] `apps/api-salesops/src/customer/customer.service.ts` to pass 4.2 (mirror
      `WarehouseService`).
- [x] 4.4 [RED] `customer.controller.spec.ts`: `POST /customers` → 201; empty `fullName` →
      400; duplicate `documentId` → 409 (mapping `DuplicateCustomerDocumentError`);
      `GET /customers` → active-only by default; `GET /customers/:id` → 200/404;
      `PATCH /customers/:id` → 200; `DELETE /customers/:id` → soft-delete (not hard).
- [x] 4.5 [GREEN] `apps/api-salesops/src/customer/customer.controller.ts` to pass 4.4,
      mapping `InvalidCustomerError → 400` and `DuplicateCustomerDocumentError → 409` via a
      `withDomainErrorMapping` helper (mirror `WarehouseController`).
      **Real-coverage note (post-verify fix, C1)**: 4.2/4.4 as originally written only
      exercised a MOCKED `InvalidCustomerError` rejection — the real `create`/`update`
      path never called the domain factory `createCustomer()`, so an empty/whitespace
      `fullName` was actually persisted with HTTP 201/200 in the live system (found by
      `sdd-verify`, `sdd/backend-customers/verify-report` C1). Fixed:
      `CustomerService.create`/`.update` (`apps/api-salesops/src/customer/customer.service.ts`)
      now call `createCustomer(...)` to validate before delegating to the repository.
      Added real coverage: `customer.e2e-spec.ts` (real Postgres) now asserts
      empty/whitespace `fullName` on create → 400 and clearing `fullName` on update → 400,
      with a DB-row assertion that nothing was persisted; `customer.service.spec.ts` now
      asserts `InvalidCustomerError` is thrown and `repo.create`/`repo.update` are NEVER
      called, without mocking the repository to reject.
- [x] 4.6 `apps/api-salesops/src/customer/customer.module.ts`: `imports: [InfraDbModule]`;
      providers `CustomerService`, `{ provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepository }`;
      declares `CustomerController`.
- [x] 4.7 Wire `CustomerModule` into `apps/api-salesops/src/app.module.ts` imports,
      alongside the existing modules.
- [x] 4.8 [RED] `customer.e2e-spec.ts` (`test:e2e`, real Postgres): full HTTP lifecycle —
      create → 201; create with same `documentId` → 409; get by id → 200; list → active
      only; delete → soft-delete then still retrievable by id with `active=false`; unknown
      id → 404.
- [x] 4.9 [GREEN] Confirm 4.8 passes end-to-end; adjust wiring only if needed.
- [x] 4.10 Run `pnpm --filter @store-mgmt/api-salesops test` + `test:e2e` full-green
      (existing suites + new customer suites); `typecheck`/`build` exit 0.

## Phase 5: Cross-cutting Verification & Scope Guards

- [x] 5.1 `pnpm --filter @store-mgmt/domain lint && pnpm --filter @store-mgmt/infra-db lint && pnpm --filter @store-mgmt/api-salesops lint`
      — `backend-boundaries --max-warnings 0` stays green; `domain → infra` edge remains
      forbidden.
- [x] 5.2 [GUARD] `rg -n "creditLimit|balance|debt" templates/packages/domain/src/customer/`
      returns 0 — `Customer` stores no money (debt is derived from `SaleCredit` in a future
      change). NOTE: the literal command has non-zero hits because
      `customer.ts`'s docstring and `customer.test.ts`'s assertions deliberately
      mention these words to DOCUMENT/ASSERT their absence as fields; a stricter
      check for an actual `readonly (creditLimit|balance|debt)` property
      (`rg -n "readonly (creditLimit|balance|debt)" customer.ts schema.prisma`)
      returns 0 matches — no such field exists on the entity or the Prisma model.
- [x] 5.3 [GUARD] `rg -n "client: string" templates/packages/domain/src/models/sale-credit.ts`
      still matches AND no `customerId` FK exists on `SaleCredit`/`Order` — Ventas rewiring
      untouched (re-confirm 2.3 after all phases).
- [x] 5.4 Run all three suites together (domain vitest, infra-db jest w/ real Postgres,
      api-salesops jest + e2e); confirm every scenario in
      `openspec/changes/backend-customers/specs/salesops-customers/spec.md` is covered by at
      least one test.
- [x] 5.5 Confirm `typecheck`/`build` green for all three packages together (domain rebuilt
      first so consumers see the new `customer/` barrel exports).

## Out of Scope (unchanged from design.md)

Ventas FK rewiring (`SaleCredit.client → customerId`, `Order.customerId`) · derived debt /
balance / `creditLimit` (future read model over `SaleCredit`) · document-type taxonomy ·
contact-format validation · address hierarchy / geo · customer groups / tags / loyalty ·
`@CurrentUser` audit user (no such field in the locked model).
