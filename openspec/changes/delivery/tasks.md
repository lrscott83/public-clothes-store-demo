# Tasks: delivery

> Realizes `design.md` (ADR-1/2/3 locked, not re-derived) against specs
> `salesops-delivery` (new, 9 requirements) and `salesops-ventas` (amendment
> delta). Proposal's Scope section locks the delivery model: **sequential
> verified slices on ONE branch, work-unit commits, push at the end, NO pull
> request** — same model `sales-agents-commissions` used. Size budget
> intentionally exceeded (migration/rollback/mitigation detail is the point of
> this artifact), matching that precedent.

**Delivery model (owner-locked, from `proposal.md` Scope)**: branch cut from
`main` after `backend-users-roles`'s archive commit (`d84a97e`), sequential
phases, each independently verified before the next starts, no PR mechanism.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~4,300-4,900 total across 7 work units (Phase 1-7; see per-unit table) |
| 400-line budget risk | High — 5 of 7 units individually exceed 400 lines |
| Chained PRs recommended | No — owner-locked single-branch, no-PR model overrides chaining (proposal.md Scope) |
| Suggested split | 7 sequential work-unit commits: 1 → 2 → 3 → 4 → 5 → 6 → 7 |
| Delivery strategy | owner-locked (sequential slices, one branch, no PR) |
| Chain strategy | N/A — no chaining; sequential verified commits instead |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: N/A (owner-locked single-branch, no-PR)
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Est. lines | Risk | Notes |
|---|---|---|---|---|
| 1 | Domain concept + 4 ports + 2 pure functions (Slice A1) | ~750-950 | High | No schema; TDD doubles the file count |
| 2 | Prisma schema + migration (Slice A2) | ~250-350 | Medium | Migration risk isolated to its own commit; additive only |
| 3 | Persistence adapters (Slice B1, real-Postgres specs) | ~850-1050 | High | 3 repos incl. the anti-join; heaviest infra unit |
| 4 | Read surface — carriers/assignments/capacity (Slice B2) | ~650-850 | High | Reads only; `DeliveryModule` still imports only `InfraDbModule` |
| 5 | Sales bridge: `closeAssignmentOnDeliveryTx` + its 3 mandatory mitigations (Slice C1) | ~450-560 | Medium-High | Doc comment + seam doc + eslint rule + rollback/0-row tests + e2e D5 test ALL ship together — none may slip later |
| 6 | Carrier CRUD + assign/markDelivered + gateway adapter + wiring (Slice C2) | ~1000-1150 | High | `SalesModule` starts exporting `ORDER_DELIVERY_GATEWAY`; `DeliveryModule` gains `SalesModule` import here |
| 7 | `salesops-ventas` amendment verification + final cross-cutting checks + push | ~0-50 | Low | Verification only, no new code |

---

## Phase 0: Branch + Environment Setup

- [x] 0.1 **BASE CORRECTED 2026-08-06 — do NOT cut from `d84a97e`, and it is NOT on `main`.** Verified with `git log`/`git branch --contains`: `main` is at `f014296`, far behind — none of the multi-tenant work has been merged there. `d84a97e` is an ancestor on `salesops-multi-tenant-by-schema`, and `d755713` sits on top of it, on that branch only. `d755713` is the commit that repaired `openspec/specs/salesops-identity/spec.md` and merged the missing `salesops-customers` requirements. Cutting from `d84a97e` would branch off a spec tree that is still broken — and this change amends `salesops-ventas`, which lives in exactly that tree. **Cut `salesops-delivery` from `d755713`, the tip of `salesops-multi-tenant-by-schema`.** ~~Resolve the currently-uncommitted `openspec/specs/salesops-identity/spec.md` (git status) — land or discard before cutting, per `proposal.md` Dependencies.~~ **RETRACTED 2026-08-06 — never true; do NOT stop on it.** Verified: `git diff HEAD -- openspec/specs/salesops-identity/spec.md` is empty and the tree is clean apart from this change's own untracked folder. That spec was rebuilt and committed in `d755713` (pushed). See the retraction in `proposal.md` Dependencies.
- [x] 0.2 Resolve `store_mgmt_test` URL: `node -e "process.loadEnvFile('<abs>/packages/infra-db/.env'); process.stdout.write(process.env.TEST_URL ?? '')"`. Guard every destructive DB command with a check that the resolved URL contains `store_mgmt_test`. NEVER run migrate/reset against `store_mgmt`. **DONE 2026-08-06**: resolved `postgresql://postgres:postgres@172.17.0.1:5432/store_mgmt_test?schema=public` — contains `store_mgmt_test`, confirmed.
- [x] 0.3 Baseline gate: `pnpm -r build` clean; record current suite counts (domain, infra-db, api-salesops unit+e2e) as the reference every later phase's exit criteria diffs against. **DONE 2026-08-06**: `pnpm -r build` clean (all packages+apps). Baseline: domain 25 files/294 tests; infra-db 36 suites/299 tests; api-salesops unit 21 suites/318 tests; api-salesops e2e 9 suites/85 tests. All green.
- [x] 0.4 Run `packages/infra-db/scripts/tenant-migrate.ts` in `check` mode — every live tenant MUST report in-sync BEFORE the schema edit lands (design §11 precondition; a pre-existing drift must not be attributed to this change). **DONE 2026-08-06**: `node scripts/tenant-migrate.ts --check` → 1 tenant (`store_mgmt_tenant_459ae1f5_cf42_4054_8ee0_569116b170a5`) reported `in-sync`. 0 behind, 0 errored. No pre-existing drift.

## Phase 1: Domain Concept + Ports (Slice A1 — `packages/domain/src/delivery/`, no schema)

- [x] 1.1 RED `carrier.test.ts`: required `name`; `phone` optional → `null`; `active` defaults `true`; soft-delete flips `active` without mutating identity. **DONE 2026-08-06**: written first, confirmed RED (`Cannot find module './carrier.js'`).
- [x] 1.2 GREEN `carrier.ts`: `Carrier` entity + `createCarrier()` factory. **DONE**: 4/4 tests passing. NOTE: no `InvalidCarrierError` added — spec's Carrier Catalog requirement defines no rejection scenario, and task 1.7's errors.ts list does not include one; `name` is required only at the TYPE level, matching the task list literally rather than inventing untested validation.
- [x] 1.3 RED `carrier-warehouse.test.ts`: factory pairs `carrierId`+`warehouseId`; structural assertion — no `zone` field exists anywhere (D2). **DONE**: confirmed RED (`Cannot find module './carrier-warehouse.js'`).
- [x] 1.4 GREEN `carrier-warehouse.ts`: `CarrierWarehouse` entity + factory. **DONE**: 4/4 tests passing.
- [x] 1.5 RED `delivery-assignment.test.ts`: `assignCarrier()` sets carrier+`status='in_transit'`+`assignedAt` in one atomic factory call; `markAssignmentDelivered()` pure guard transitions `in_transit→delivered` stamping `deliveredAt`, rejects an already-`delivered` input with `InvalidAssignmentStateError`. **DONE**: confirmed RED (`Cannot find module './delivery-assignment.js'`).
- [x] 1.6 GREEN `delivery-assignment.ts`: `DeliveryAssignment`, `DeliveryAssignmentStatus`, `assignCarrier()`, `markAssignmentDelivered()`. **DONE**: 4/4 tests passing (written together with 1.7's errors.ts, which it depends on).
- [x] 1.7 GREEN `errors.ts`: `InvalidAssignmentStateError`, `CarrierNotFoundError`, `OrderAlreadyAssignedError`. **DONE**: shipped alongside 1.6 (delivery-assignment.ts imports InvalidAssignmentStateError).
- [x] 1.8 RED `compute-carrier-capacity.test.ts`: carrier with ≥1 `in_transit` assignment → busy; zero or only-`delivered` → free; `busyCount`/`freeCount` totals correct across a mixed list. **DONE**: confirmed RED (`Cannot find module './compute-carrier-capacity.js'`).
- [x] 1.9 GREEN `compute-carrier-capacity.ts`: pure `computeCarrierCapacity(carriers, openAssignments)` (ADR-3). **DONE**: 4/4 tests passing, incl. mixed-list triangulation.
- [x] 1.10 RED `compute-carrier-throughput.test.ts`: pure fold counting `delivered` assignments per carrier over an optional `[from,to]` window. **DONE**: confirmed RED (`Cannot find module './compute-carrier-throughput.js'`).
- [x] 1.11 GREEN `compute-carrier-throughput.ts`. **DONE**: 4/4 tests passing. Returns `ReadonlyMap<string, number>` (carrierId → deliveredCount) — no explicit return-type signature was pinned in design §6, this shape supports the read surface's per-carrier lookup in Phase 4.
- [x] 1.12 GREEN 4 ports: `carrier-repository.port.ts` (`ICarrierRepository`+`CARRIER_REPOSITORY`), `carrier-warehouse-repository.port.ts`, `delivery-assignment-repository.port.ts` (`IDeliveryAssignmentRepository` incl. `countOrdersAwaitingCarrier()` — deliberately NO `markDelivered` method, per design §8; `IOrderRepository`/`OrderListFilter` are NOT touched anywhere in this change), `order-delivery-gateway.port.ts` (`IOrderDeliveryGateway`+`ORDER_DELIVERY_GATEWAY`, doc comment verbatim from design §8). **DONE 2026-08-06**: structural, no RED test per task list; all 4 written and typechecked via `pnpm -r build`.
- [x] 1.13 GREEN `packages/domain/src/delivery/index.ts`: wildcard re-exports. **DONE**.
- [x] 1.14 Modify `packages/domain/src/index.ts`: barrel export 8 → 9 concept modules. **DONE**: `export * from './delivery/index.js';` added after `commission`.

**Exit criteria**: all new domain delivery tests green; `pnpm --filter @store-mgmt/domain test` full suite green; `pnpm -r build` clean. Commit.

**PHASE 1 EXIT CRITERIA MET 2026-08-06**: domain suite 30 files/314 tests, all green (25→30 files, 294→314 tests, +5 new files/+20 new tests). `pnpm -r build` clean across all packages/apps. Committed as `feat(delivery): add domain concept + ports (Slice A1)`.

## Phase 2: Schema + Migration (Slice A2 — carries the migration risk)

**Gate to enter**: Phase 0.4's `check` confirms no pre-existing drift; Phase 1 exit criteria met.

- [x] 2.1 Author `packages/infra-db/prisma/tenant/schema.prisma`: `Carrier`, `CarrierWarehouse`, `DeliveryAssignment`, `DeliveryAssignmentStatus` enum; `Order.deliveryAssignment DeliveryAssignment?` and `Warehouse.carriers CarrierWarehouse[]` inverse relations, each commented with which module added them (mirrors `commissionAccrual`). **DONE 2026-08-06**: added as an "Eighth domain module: Delivery" section; both inverse relations carry a comment naming the Delivery module.
- [x] 2.2 Regenerate `packages/infra-db/prisma/tenant-schema.sql` via `node scripts/generate-tenant-schema-sql.ts` (no DB connection). Confirm the diff is purely additive (3 `CREATE TABLE`, 1 `CREATE TYPE`, FKs, indexes; no column on an existing table). **If the tool demands a destructive-override flag, STOP — that is a signal something is wrong with the diff, not something to pass through.** **DONE 2026-08-06**: regenerated (485 lines). Diffed against the pre-change SQL — exactly 1 `CREATE TYPE "DeliveryAssignmentStatus"`, 3 `CREATE TABLE` (carrier, carrier_warehouse, delivery_assignment), 5 `CREATE INDEX`, 4 `AddForeignKey`. Zero changes to any existing table. No destructive-override flag was ever requested.
- [x] 2.3 `pnpm --filter @store-mgmt/infra-db prisma:generate`. **DONE**: package-root `prisma:generate` only targets the master schema (per `prisma.config.ts`); ran `pnpm exec prisma generate --config prisma/tenant/prisma.config.ts` for the tenant client — regenerated `generated/tenant/*` (gitignored) with `Carrier`/`CarrierWarehouse`/`DeliveryAssignment` types confirmed present.
- [x] 2.4 GATE: round-trip forward + hand-authored rollback (`DROP TABLE delivery_assignment, carrier_warehouse, carrier; DROP TYPE "DeliveryAssignmentStatus";`) on a throwaway clone of `store_mgmt_test`. Confirm clean revert BEFORE applying forward for real. **DONE 2026-08-06**: created throwaway DB `store_mgmt_test_rollback_clone` (name contains `store_mgmt_test`, guard satisfied), applied the pre-change tenant DDL as a baseline (18 tables) into a scratch schema, applied the additive delta forward (confirmed: 3 tables, 1 enum, 4 FKs present), then ran the exact rollback DDL — post-rollback table set matched the pre-forward 18-table baseline byte-for-byte (table-name-set comparison), enum removed. Clone DB dropped after.
- [x] 2.5 Apply forward via `tenant-migrate.ts` in `migrate` mode against `store_mgmt_test`, using the guarded URL check from 0.2. Never touch dev `store_mgmt`. **DONE 2026-08-06**: `DATABASE_URL=$TEST_URL node scripts/tenant-migrate.ts` (guarded — shell case-check confirmed `store_mgmt_test` substring before running). Result: "Migrated 0 tenant(s)" — `store_mgmt_test` currently holds zero live tenant schemas (each `infra-db` spec provisions+tears down its own ephemeral schema per test, confirmed via direct query), so there was nothing to migrate. No destructive-override flag was requested. Phase 3's real-Postgres specs exercise the new tables directly via freshly provisioned schemas built from the regenerated `tenant-schema.sql`.
- [x] 2.6 Re-run `tenant-migrate.ts` in `check` mode — all tenants in-sync post-migration. **DONE**: `DATABASE_URL=$TEST_URL node scripts/tenant-migrate.ts --check` → "Checked 0 tenant(s)" — 0 in sync, 0 behind, 0 errored. Consistent with 2.5 (no live tenants in `store_mgmt_test` at this time).

**Exit criteria**: schema + regenerated SQL committed; migration applied and structurally verified (3 tables, 1 enum, FKs, indexes present) on `store_mgmt_test`. `pnpm -r build` clean. Commit.

**PHASE 2 EXIT CRITERIA MET 2026-08-06**: schema.prisma + tenant-schema.sql changes staged for commit. Structural verification (3 tables, 1 enum, FKs, indexes) proven via the throwaway-clone forward+rollback rehearsal (task 2.4) — `store_mgmt_test` itself currently has no live tenant to inspect directly, and will get its first one under the new schema in Phase 3's specs. `pnpm -r build` clean across all packages/apps, including `@store-mgmt/infra-db` standalone. Committed as `feat(delivery): add Carrier/CarrierWarehouse/DeliveryAssignment tenant schema (Slice A2)`.

## Phase 3: Persistence Adapters (Slice B1 — `packages/infra-db/src/delivery/`)

- [x] 3.1 RED `prisma-carrier.repository.spec.ts` (real Postgres): create/findById/list(`activeOnly`)/soft-delete round-trip. **DONE 2026-08-06**: written first, confirmed RED (`Could not locate module ./prisma-carrier.repository.js`).
- [x] 3.2 GREEN `prisma-carrier.repository.ts`. **DONE**: 7/7 passing. NOTE (deviation, documented in the adapter's own doc comment rather than editing the already-shipped Phase 1 port file): the domain port's `activeOnly` doc comment is ambiguous ("When omitted or `false`, `active: false` carriers are excluded") — read literally it leaves no case where `true` differs from the default. Implemented the standard boolean-flag reading instead: `activeOnly: true` restricts to `active: true`; omitted/`false` returns every carrier (active or not). No spec scenario pins this down either way, so this is a resolved ambiguity, not a violated one — flagged here for verify.
- [x] 3.3 RED `prisma-carrier-warehouse.repository.spec.ts`: add/remove a coverage row; `@@unique([carrierId,warehouseId])` enforced; `listByCarrier` returns 0/1/N rows. **DONE**: confirmed RED (module not found).
- [x] 3.4 GREEN `prisma-carrier-warehouse.repository.ts`. **DONE**: 6/6 passing, incl. the unique-violation-on-duplicate-add case and the no-op-remove case.
- [x] 3.5 RED `prisma-delivery-assignment.repository.spec.ts`: `create` rejects a duplicate `orderId` (unique index IS the guarantee); `findByOrderId` returns `null` for pickup/no-assignment orders — never throws; `list(filter)` by carrierId/status/date range; `countOrdersAwaitingCarrier()` anti-join counts only verified+`deliveryMode='delivery'`+no-assignment orders. **DONE**: confirmed RED (module not found).
- [x] 3.6 GREEN `prisma-delivery-assignment.repository.ts` — anti-join/raw SQL MUST reference table `sales_order`, never `order` (reserved word, design §9). **DONE**: 7/7 passing, incl. the anti-join test (2 counted, 3 correctly excluded: already-assigned, pickup-mode, not-yet-verified). Raw SQL via `$queryRaw`/`Prisma.sql` against `"sales_order"` LEFT JOIN `"delivery_assignment"` — no schema qualification needed, `TenantPrismaFactory` sets `search_path` on the connection itself (design §4), same precedent as `applyReservationTx`'s raw `$executeRaw`.
- [x] 3.7 RED+GREEN `seed.ts` + `delivery-fixtures.spec-helper.ts`: deterministic carrier/coverage/assignment fixtures for downstream specs. **DONE**: `delivery-fixtures.spec-helper.ts` (raw-insert base graph + arbitrary-status/mode order fixture + full wipe, mirrors `commission-fixtures.spec-helper.ts`) backs tasks 3.1/3.3/3.5's specs. `seed.ts` exports `seedCarriers` — an idempotent DEMO carrier catalog (2 carriers, one with coverage over 2 warehouses, one with zero coverage rows on purpose so a fresh tenant exercises the "zero rows = no coverage" reading with no manual setup), mirroring `inventory/seed.ts`'s `seedWarehouses` shape; `seed.spec.ts` (2/2 passing) covers creation counts + idempotency. NOT wired into `prisma/seed.js` — no task in this phase (or any later one in this file) calls for that wiring, so it stays an available, tested, unwired seed function; flagged here rather than silently added or silently skipped.
- [x] 3.8 Modify `packages/infra-db/src/index.ts`: export the three adapters. **DONE**: also exports `seedCarriers`.
- [x] 3.9 Add `src/delivery/prisma-*.repository.ts` to `tenantRepoBoundaryRule`'s `files` glob in `packages/eslint-config/backend-boundaries.config.js` — closes the same tenant-Prisma-client boundary the other 6 concepts already enforce. **DONE**.

**Exit criteria**: `packages/infra-db/src/delivery/*.spec.ts` green against real Postgres (`pnpm --filter @store-mgmt/infra-db test`, `maxWorkers:1`). `pnpm -r build` clean. Commit.

**PHASE 3 EXIT CRITERIA MET 2026-08-06**: infra-db suite 36→40 files, 299→321 tests, all green (`pnpm test` — real Postgres, `maxWorkers:1`). `pnpm -r build` clean across every package/app.

## Phase 4: Read Surface (Slice B2 — `apps/api-salesops/src/delivery/`, reads only)

- [ ] 4.1 RED `delivery.service.spec.ts`: `listCarriers({warehouseId})` returns every active carrier with `coversWarehouse: boolean`, UNFILTERED (ADR-4); zero coverage rows → `coversWarehouse:false` for every warehouse, carrier still listed.
- [ ] 4.2 RED same file: `getCarrierCapacity()` returns `computeCarrierCapacity` output + `ordersAwaitingCarrier` (from `countOrdersAwaitingCarrier()`) + `deliveredCount`/throughput, all-time default with optional `?from=&to=`.
- [ ] 4.3 GREEN `apps/api-salesops/src/delivery/delivery.service.ts` (read methods only) + `dto/index.ts`.
- [ ] 4.4 RED `carrier.controller.spec.ts`: `GET /delivery/carriers[?warehouseId]`, `GET /delivery/carriers/:id` — no `@Roles`, any authenticated tenant user admitted (D7).
- [ ] 4.5 RED `delivery-assignment.controller.spec.ts`: `GET /delivery/assignments?status=&carrierId=`, `GET /delivery/assignments/by-order/:orderId` (nullable, never 404), `GET /delivery/capacity` — no `@Roles`.
- [ ] 4.6 GREEN `carrier.controller.ts` + `delivery-assignment.controller.ts` (read handlers only).
- [ ] 4.7 GREEN `apps/api-salesops/src/delivery/delivery.module.ts`: `imports: [InfraDbModule]` (`SalesModule` import deferred to Phase 6).

**Exit criteria**: read-surface specs green. `pnpm --filter api-salesops test` green, `pnpm -r build` clean. Commit.

## Phase 5: Sales Bridge — `closeAssignmentOnDeliveryTx` + Its 3 Mandatory Mitigations (Slice C1)

All items below ship in this ONE work unit — design §2 is explicit that none may slip to "later", since that is exactly what would let a future `SalesModule → DeliveryModule` import make the dependency cycle real.

- [ ] 5.1 RED `packages/infra-db/src/delivery/close-assignment-on-delivery.spec.ts` (real Postgres, inside a `$transaction`): an `in_transit` assignment for `orderId` closes to `delivered` with `deliveredAt` stamped; an already-`delivered` assignment is untouched (idempotent 0-row update, not an error); an order with NO assignment row (pickup, or pre-existing legacy `delivered`) affects 0 rows and returns without throwing — **never `findUniqueOrThrow`**.
- [ ] 5.2 GREEN `packages/infra-db/src/delivery/close-assignment-on-delivery.ts`: `closeAssignmentOnDeliveryTx(tx, orderId)` — a guarded `UPDATE ... WHERE order_id=$1 AND status='in_transit'`, mirroring `applyReservationTx`'s style.
- [ ] 5.3 RED `packages/infra-db/src/sales/prisma-order.repository.spec.ts`: rollback case — force a failure inside `deliver()`'s transaction AFTER `closeAssignmentOnDeliveryTx` runs; assert the order is still `verified`, stock untouched, AND the assignment is still `in_transit` (whole transaction rolled back, no partial state).
- [ ] 5.4 GREEN: wire one call to `closeAssignmentOnDeliveryTx(tx, orderId)` inside `PrismaOrderRepository.deliver`'s existing `$transaction` (`prisma-order.repository.ts` ~372-405), alongside the existing `applyReservationTx`/`applyStockMovementTx` calls.
- [ ] 5.5 Extend the doc comment on `IOrderRepository.deliver` (`packages/domain/src/sales/order-repository.port.ts:41`) with the postcondition: "also closes any open `DeliveryAssignment` for the order, in the same transaction."
- [ ] 5.6 Create `packages/domain/src/delivery/delivery-assignment-seam.md` documenting the two-way relationship, mirroring `stock-reservation-seam.md`/`commission-seam.md`'s structure.
- [ ] 5.7 Add a boundary rule to `packages/eslint-config/backend-boundaries.config.js` forbidding `apps/api-salesops/src/sales/**` from importing `../delivery/**`; wire it into `apps/api-salesops/eslint.config.mjs`.
- [ ] 5.8 RED (e2e) `apps/api-salesops/test/order.e2e-spec.ts`: the D5 door — `POST /orders/:id/deliver` on a `deliveryMode='delivery'` order with an `in_transit` assignment closes that assignment to `delivered` in the same call; existing pickup and no-assignment cases still pass unchanged.
- [ ] 5.9 GREEN: confirm 5.8 passes off 5.4's wiring alone (no new controller code expected).

**Exit criteria**: 5.1/5.3/5.8 green. `pnpm --filter @store-mgmt/infra-db test` green. `pnpm --filter api-salesops test:e2e` green (rebuild domain+infra-db dist first: `pnpm --filter @store-mgmt/domain build && pnpm --filter @store-mgmt/infra-db build`). Lint `--max-warnings 0` on `api-salesops` (confirms 5.7's new rule itself reports zero violations). `pnpm -r build` clean. Commit.

## Phase 6: Carrier CRUD + Assign/MarkDelivered + Gateway Adapter (Slice C2)

- [ ] 6.1 RED `carrier.controller.spec.ts`: `POST`/`PATCH`/soft-`DELETE` require `owner`/`admin`; `warehouse_operator`/`sales_agent` denied (D7).
- [ ] 6.2 GREEN `carrier.controller.ts` write handlers + `delivery.service.ts` `createCarrier`/`updateCarrier`/`deactivateCarrier`.
- [ ] 6.3 RED `delivery-assignment.controller.spec.ts`: `POST /delivery/assignments {orderId,carrierId}` — 404 unknown/inactive carrier; 409 if the order already has an assignment; 201 + `status='in_transit'` on success; succeeds even with zero/mismatched `CarrierWarehouse` coverage for the order's warehouse (ADR-4, advisory coverage) — **no `warning` field** in the response.
- [ ] 6.4 GREEN `DeliveryService.assign`: `ICarrierRepository.findById` → 404/inactive → `IDeliveryAssignmentRepository.findByOrderId` → 409 if present → `assignCarrier()` [pure] → `create()`.
- [ ] 6.5 RED `delivery-assignment.controller.spec.ts`: `POST /delivery/assignments/:id/deliver` — 404 unknown assignment; 409 `InvalidAssignmentStateError` if not `in_transit`; success calls `IOrderDeliveryGateway.markOrderDelivered` and re-reads the assignment (design §2A — no assignment write here; Phase 5's helper closes it via the gateway's own Sales-side transaction).
- [ ] 6.6 GREEN `DeliveryService.markDelivered`: guard `in_transit`, call gateway, re-read. Confirm `IDeliveryAssignmentRepository` gains no `markDelivered` method — that absence stays intentional.
- [ ] 6.7 RED `apps/api-salesops/src/sales/order-delivery-gateway.adapter.spec.ts`: `markOrderDelivered(orderId)` delegates to the existing `OrderService.deliver(orderId)` — NOT to `IOrderRepository` directly — so commission accrual keeps firing through the one existing path and no second accrual trigger is introduced.
- [ ] 6.8 GREEN `apps/api-salesops/src/sales/order-delivery-gateway.adapter.ts` implementing `IOrderDeliveryGateway`.
- [ ] 6.9 Modify `apps/api-salesops/src/sales/sales.module.ts`: provide the adapter, `exports: [ORDER_DELIVERY_GATEWAY]`.
- [ ] 6.10 Modify `apps/api-salesops/src/delivery/delivery.module.ts`: `imports: [InfraDbModule, SalesModule]`.
- [ ] 6.11 Modify `apps/api-salesops/src/app.module.ts`: register `DeliveryModule`.
- [ ] 6.12 Modify `packages/domain/src/sales/order.ts:13-17` comment: the seam is fulfilled, not future.
- [ ] 6.13 RED+GREEN roles: assign/markDelivered admit `owner`/`admin`/`warehouse_operator`, deny `sales_agent` (derived convention, mirrors `POST /orders/:id/deliver`).

**Exit criteria**: all delivery unit specs + gateway adapter spec green. `pnpm --filter api-salesops test` and `test:e2e` (rebuild domain+infra-db dist first) green. Confirm zero violations of 5.7's boundary rule (no Sales file imports `DeliveryModule`, no Delivery file imports a Sales implementation). `pnpm -r build` clean, lint `--max-warnings 0` on every touched package. Commit.

## Phase 7: `salesops-ventas` Amendment Verification + Final Cross-Cutting Checks + Push

- [ ] 7.1 Confirm `openspec/changes/delivery/specs/salesops-ventas/spec.md` (already authored by `sdd-spec`) correctly supersedes `openspec/specs/salesops-ventas/spec.md:56-59` and `:73-78` — no residual prose anywhere in this change's own artifacts still claims Delivery inserts `despachando`/`transportando` into `Order`. This delta is ready for `sdd-archive` to merge into the promoted spec; merging the promoted file itself is `sdd-archive`'s job, not this task's.
- [ ] 7.2 `rg -i "despachando|transportando"` across `packages/` and `apps/api-salesops/` (excluding `apps/salesops-mvp`, frozen legacy) — confirm zero matches modeling either as an `Order` state; only `DeliveryAssignmentStatus.in_transit` exists.
- [ ] 7.3 Full-repo re-run from `templates/`: `pnpm -r build`; `pnpm --filter @store-mgmt/domain test`; `pnpm --filter @store-mgmt/infra-db test` (fresh `store_mgmt_test` if prior seed runs left non-empty state); `pnpm --filter api-salesops test` / `test:e2e`; lint `--max-warnings 0` on every touched package.
- [ ] 7.4 Reconcile final suite counts against the Phase 0 baseline — no unexplained pass/fail drift.
- [ ] 7.5 Confirm `POST /orders/:id/deliver` e2e passes unchanged for BOTH `deliveryMode` values (design §12's explicit exit bar).
- [ ] 7.6 Push branch `salesops-delivery`. No pull request (owner-locked delivery model, per `proposal.md` Scope).

---

## Scope confirmation (non-negotiable, unchanged by any task above)

- `apps/static-store` and `packages/storefront` — LEGACY, frozen. No task touches them.
- `apps/salesops-mvp` — Phase D (wiring to the real API) is OUT OF SCOPE. No task there.
- No carrier-rate API integrations anywhere in this task list.
