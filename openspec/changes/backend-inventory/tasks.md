# Tasks: Almacenes + Inventario Module

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1450-1700 (domain ~480 incl. 3 entities+ports+errors+tests, infra-db ~420 incl. schema+migration+3 repos+seed+concurrency test, api ~650 incl. 2 modules+DTOs+tests, seam docs ~100; human-authored, excludes generated Prisma client/migration SQL) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (structurally splittable into 5 units below) |
| Suggested split | Unit 1 (domain: Warehouse+StockLevel+StockMovement+ports+errors) → Unit 2 (infra-db: schema+migration+3 repos+seed incl. atomic `record`) → Unit 3 (api: WarehouseModule+StockModule) → Unit 4 (cross-cutting: boundary+seam docs+full verification) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

Delivery is `single-pr`: orchestrator must record `size:exception` before `sdd-apply` runs. Work units below apply as **commit** boundaries inside the single PR, each independently revertible.

### Suggested Work Units

| Unit | Goal | Scope (single PR, commit-level) | Depends on |
|------|------|-----------|-----------|
| 1 | Domain: Warehouse, StockLevel, StockMovement + 3 ports + errors | Phase 1 | none |
| 2 | infra-db: Prisma schema+migration, 3 repos incl. atomic `record`, seed (3 warehouses) | Phase 2 | Unit 1 (port types) |
| 3 | api-salesops: WarehouseModule + StockModule | Phase 3 | Unit 2 (repositories) |
| 4 | Boundary lint + full three-runner verification + 2 seam docs | Phase 4 | Units 1-3 |

## Phase 1: Domain — Warehouse, StockLevel, StockMovement (vitest, `pnpm --filter @store-mgmt/domain test`)

- [x] 1.1 [RED] `domain/src/inventory/warehouse.test.ts`: `createWarehouse` rejects empty/whitespace `name`; defaults `active=true`; produced `Warehouse` has no address/location field.
- [x] 1.2 [GREEN] `domain/src/inventory/errors.ts` (`InvalidWarehouseError`, `InvalidStockLevelError`, `InvalidStockMovementError`, `NegativeStockError`) + `domain/src/inventory/warehouse.ts` (`interface Warehouse { id; name; active; createdAt; updatedAt }` + `createWarehouse(input)`) to pass 1.1.
- [x] 1.3 [RED] `domain/src/inventory/stock-level.test.ts`: `createStockLevel` rejects negative/non-integer `onHand`/`reserved`; `availableStock(level)` derives `onHand - reserved` (e.g. `10,3 → 7`), never stored.
- [x] 1.4 [GREEN] `domain/src/inventory/stock-level.ts`: `interface StockLevel { id; productId; warehouseId; onHand; reserved; createdAt; updatedAt }` + `createStockLevel(input)` + pure `availableStock(level)` to pass 1.3.
- [x] 1.5 [RED] `domain/src/inventory/stock-movement.test.ts`: `StockMovementType` union covers the 6 closed values; `movementDirection` returns `-1` for `*_out`, `1` for `*_in`; `createStockMovement` rejects `quantity <= 0` or non-integer; defaults `reason`/`createdBy` to `null`.
- [x] 1.6 [GREEN] `domain/src/inventory/stock-movement.ts`: `interface StockMovement { id; productId; warehouseId; type; reason; quantity; createdAt; createdBy? }` + `StockMovementType` + `movementDirection` + `createStockMovement(input)` to pass 1.5.
- [x] 1.7 [RED] `domain/src/inventory/stock-level.test.ts` (additional cases): `applyMovement(level, type, qty)` — `_in` adds, `_out` subtracts, throws `NegativeStockError` when result would be `< 0`.
- [x] 1.8 [GREEN] Implement pure `applyMovement` in `domain/src/inventory/stock-level.ts` to pass 1.7 (per `design.md`'s exact formula, reused later inside the transaction).
- [x] 1.9 `domain/src/inventory/warehouse-repository.port.ts`: `IWarehouseRepository { create; update; softDelete; findById; list }` + `WAREHOUSE_REPOSITORY` Symbol.
- [x] 1.10 `domain/src/inventory/stock-level-repository.port.ts`: `IStockLevelRepository { findById; findByProductAndWarehouse; list(filter?) }` + `STOCK_LEVEL_REPOSITORY` Symbol.
- [x] 1.11 `domain/src/inventory/stock-movement-repository.port.ts`: `IStockMovementRepository { record(input): Promise<{movement; stockLevel}>; list(filter?) }` + `STOCK_MOVEMENT_REPOSITORY` Symbol.
- [x] 1.12 `domain/src/inventory/index.ts` barrel (re-export all inventory files); add `export * from './inventory/index.js';` to `domain/src/index.ts` after the `product` line.
- [x] 1.13 Run `pnpm --filter @store-mgmt/domain test` full-green (inventory + existing product/currency suites untouched).

## Phase 2: infra-db — Prisma adapter (jest + real Postgres, `pnpm --filter @store-mgmt/infra-db test`)

- [x] 2.1 Append `model Warehouse`, `model StockLevel`, `model StockMovement` + `enum StockMovementType` (exact shapes from `design.md`) to `templates/packages/infra-db/prisma/schema.prisma`; add `Product.stockLevels`/`Product.movements` inverse relations ONLY (no scalar fields) — additive-only, after the Product/Category models.
- [x] 2.2 Generate migration `add_inventory_module` (`pnpm --filter @store-mgmt/infra-db prisma:migrate`); append raw-SQL `CHECK (on_hand >= 0 AND reserved >= 0)` to `stock_level`; confirm additive-only, `product`/`category`/`exchange_rate` tables untouched.
- [x] 2.3 [RED] `infra-db/src/inventory/prisma-warehouse.repository.spec.ts`: `create()` persists with real UUID; `softDelete()` flips `active=false`, row still `findById`-able; `list()` behavior.
- [x] 2.4 [GREEN] `infra-db/src/inventory/prisma-warehouse.repository.ts`: `PrismaWarehouseRepository implements IWarehouseRepository` to pass 2.3.
- [x] 2.5 [RED] `infra-db/src/inventory/prisma-stock-level.repository.spec.ts`: `findByProductAndWarehouse` on a missing pair resolves to `null`/zero (no row required); `UNIQUE(productId,warehouseId)` enforced (duplicate insert rejected).
- [x] 2.6 [GREEN] `infra-db/src/inventory/prisma-stock-level.repository.ts`: `PrismaStockLevelRepository implements IStockLevelRepository`, read-only, maps rows → domain, to pass 2.5.
- [x] 2.7 [RED] `infra-db/src/inventory/prisma-stock-movement.repository.spec.ts`: `record()` lazily creates a `StockLevel` on first movement, adjusts `onHand` by `movementDirection`, appends a `StockMovement` row, all atomic; a `sale_out` exceeding `onHand` throws `NegativeStockError` and persists NEITHER the level change NOR the movement.
- [x] 2.8 [GREEN] `infra-db/src/inventory/prisma-stock-movement.repository.ts`: `PrismaStockMovementRepository.record()` running `prisma.$transaction` (upsert level → guarded conditional `UPDATE ... WHERE on_hand+dir*qty >= 0` → insert movement) per `design.md`'s transactional flow, to pass 2.7.
- [x] 2.9 [RED] `infra-db/src/inventory/prisma-stock-movement.repository.spec.ts` (concurrency case): fire 2 concurrent `sale_out` movements that would jointly overdraw `onHand` — assert exactly ONE succeeds and the other throws `NegativeStockError`, final `onHand` never negative (REAL concurrent DB test, not mocked).
- [x] 2.10 [GREEN] Confirm 2.9 passes against the guarded conditional UPDATE from 2.8 (no additional locking code expected); adjust only if the race is not race-free as designed.
- [x] 2.11 [RED] `infra-db/src/inventory/prisma-stock-movement.repository.spec.ts` (parity case): assert every `StockMovementType` TS union value has an identical-string counterpart in the Prisma enum (parity test, catches casing drift).
- [x] 2.12 [GREEN] Fix schema/enum values if 2.11 fails (should already pass given lowercase identity mapping in 2.1).
- [x] 2.13 Export `PrismaWarehouseRepository`, `PrismaStockLevelRepository`, `PrismaStockMovementRepository` from `infra-db/src/index.ts`.
- [x] 2.14 [RED] `infra-db/src/inventory/seed.spec.ts`: running the seed against a fresh DB produces exactly 3 `Warehouse` rows (`Pinar del Río`, `Consolación del Sur`, `Herradura`, all `active=true`) and ZERO `StockLevel` rows; running it twice does not duplicate (idempotent upsert on `name`).
- [x] 2.15 [GREEN] `infra-db/src/inventory/seed.ts`: idempotent upsert-on-`name` seed of the 3 warehouses ONLY (source values from `templates/apps/salesops-mvp/app/seed/constants.ts` `WAREHOUSES`); wire into the shared seed entrypoint alongside the product/category seed, to pass 2.14.
- [x] 2.16 Run `pnpm --filter @store-mgmt/infra-db test` full-green (existing currency/product suites + new inventory suites); `lint`/`typecheck`/`build` green.

## Phase 3: api-salesops — WarehouseModule + StockModule (jest, `pnpm --filter @store-mgmt/api-salesops test`)

- [x] 3.1 `apps/api-salesops/src/warehouse/dto/*.ts`: `create-warehouse.dto.ts`, `update-warehouse.dto.ts`, `warehouse-response.dto.ts`, `dto/index.ts` (mirror `category` DTOs — no location/address fields).
- [x] 3.2 [RED] `warehouse.service.spec.ts`: with mocked `WAREHOUSE_REPOSITORY`, service creates/updates/soft-deletes/lists/finds-by-id and maps to response DTOs.
- [x] 3.3 [GREEN] `apps/api-salesops/src/warehouse/warehouse.service.ts` to pass 3.2.
- [x] 3.4 [RED] `warehouse.controller.spec.ts`: `POST /warehouses` → 201; `GET /warehouses` → active-only list by default; `GET /warehouses/:id` → 200/404; `PATCH /warehouses/:id` → 200; `DELETE /warehouses/:id` → soft-delete, not hard; empty `name` → 400.
- [x] 3.5 [GREEN] `apps/api-salesops/src/warehouse/warehouse.controller.ts` to pass 3.4, mapping `InvalidWarehouseError` → 400.
- [x] 3.6 `apps/api-salesops/src/warehouse/warehouse.module.ts`: `imports: [InfraDbModule]`; providers `WarehouseService`, `{provide: WAREHOUSE_REPOSITORY, useClass: PrismaWarehouseRepository}`; declares `WarehouseController`.
- [x] 3.7 `apps/api-salesops/src/stock/dto/*.ts`: `stock-level-response.dto.ts` (`onHand`/`reserved`/`available` as strings, `available` derived via `availableStock`), `record-movement.dto.ts` (`productId`, `warehouseId`, `type` validated against the union, `quantity` string, `reason?`), `movement-response.dto.ts`, `dto/index.ts`.
- [x] 3.8 [RED] `stock.service.spec.ts`: with mocked `PRODUCT_REPOSITORY`/`STOCK_LEVEL_REPOSITORY`/`STOCK_MOVEMENT_REPOSITORY`, `getLevel` returns `onHand`/`reserved`/derived `available` as strings; `recordMovement` validates `productId` exists via `IProductRepository` BEFORE calling `record`, rejects unknown product with a typed 400-mappable error, passes `createdBy: null`.
- [x] 3.9 [GREEN] `apps/api-salesops/src/stock/stock.service.ts` to pass 3.8, per `design.md`'s "Product-existence validation lives in StockService" decision.
- [x] 3.10 [RED] `stock.controller.spec.ts`: `GET /stock?productId=&warehouseId=` → 200 with string `available`; `POST /stock/movements` → 201 with movement + resulting level; unknown `productId` → 400; negative-stock movement → 400/409 mapping `NegativeStockError`; non-positive `quantity` → 400.
- [x] 3.11 [GREEN] `apps/api-salesops/src/stock/stock.controller.ts` to pass 3.10, mapping `InvalidStockMovementError`/`NegativeStockError` → 400.
- [x] 3.12 `apps/api-salesops/src/stock/stock.module.ts`: `imports: [InfraDbModule]`; providers `StockService`, `{provide: STOCK_LEVEL_REPOSITORY, useClass: PrismaStockLevelRepository}`, `{provide: STOCK_MOVEMENT_REPOSITORY, useClass: PrismaStockMovementRepository}`, `{provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository}`; declares `StockController`.
- [x] 3.13 Wire `WarehouseModule` + `StockModule` into `apps/api-salesops/src/app.module.ts` imports, alongside existing modules.
- [x] 3.14 Run `pnpm --filter @store-mgmt/api-salesops test` full-green (existing suites + new warehouse/stock suites); `typecheck`/`build` exit 0.

## Phase 4: Cross-cutting Verification & Seam Docs

- [x] 4.1 `pnpm --filter @store-mgmt/domain lint && pnpm --filter @store-mgmt/infra-db lint && pnpm --filter @store-mgmt/api-salesops lint` — `backend-boundaries --max-warnings 0` stays green; `domain → infra` edge remains forbidden.
- [x] 4.2 `rg -i "stock|warehouse" templates/packages/domain/src/product/ templates/packages/infra-db/src/product/ templates/apps/api-salesops/src/product/` returns 0 matches — Product carries zero inventory fields.
- [x] 4.3 Run all three suites together (domain vitest, infra-db jest w/ real Postgres, api-salesops jest); confirm every scenario in `openspec/changes/backend-inventory/specs/salesops-inventory/spec.md` is covered by at least one test.
- [x] 4.4 Author `templates/packages/domain/src/inventory/stock-reservation-seam.md` documenting `IStockReservationProvider` (Ventas, future) exactly per `design.md` — doc only, NOT implemented, NOT exported from the barrel.
- [x] 4.5 Author `templates/packages/domain/src/inventory/purchase-cost-seam.md` documenting `IPurchaseCostUpdater` (Compras, future) exactly per `design.md` — doc only, NOT implemented, NOT exported from the barrel.
- [x] 4.6 Confirm `typecheck`/`build` green for all three packages together (domain rebuilt first so consumers see the new `inventory/` barrel exports).

## Out of Scope (unchanged from design.md)

Reservation/release/decrement logic (Ventas seam only) · purchase-cost weighted-average recompute (Compras seam only) · `@CurrentUser` auth guard (`createdBy` stays nullable) · availability-for-sale combined flag · location hierarchy on Warehouse · variants/pricelists/uom (Product concerns, untouched).
