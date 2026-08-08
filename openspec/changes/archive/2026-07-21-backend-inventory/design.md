# Design — Almacenes + Inventario Module

Second **CAPA BASE** vertical slice after Products, mirroring the shipped Product +
Currency modules end-to-end. Three flat domain entities — `Warehouse`, `StockLevel`
(product × warehouse, with a DERIVED `available = onHand − reserved`, never stored) and
an append-only `StockMovement` log — behind three repository ports, persisted via
Prisma, exposed through a thin `WarehouseModule` (CRUD) + `StockModule` (level reads +
movement recording). This DECIDES the implementation-level questions the locked model
left open; it does NOT re-open the model.

> Authoritative business model comes from engram `sdd/backend-inventory/model` (#1340,
> owner-LOCKED), the audit-user nullable convention (#1343) and the proposal
> `sdd/backend-inventory/proposal` (#1341). Those LOCK the fields, the closed movement
> union, positive-magnitude quantities and the read-only Product FK. This document
> decides the HOW at architecture level. Tasks come next.

## Quick path (what gets built)

1. `packages/domain/src/inventory/` — `Warehouse`, `StockLevel`, `StockMovement`
   entities + invariants, the pure `available` derivation, the pure `applyMovement`
   guard, the `StockMovementType` union, three ports, named errors, two seam docs.
   Flat per-concept files mirroring `product/`. Zero framework, zero I/O.
2. `packages/infra-db/` — `Warehouse`, `StockLevel`, `StockMovement` Prisma models
   (+ additive migration) and three Prisma repositories implementing the ports. Seed =
   **3 warehouses only**, NO StockLevels.
3. `apps/api-salesops/src/inventory/` — `WarehouseModule` (CRUD) + `StockModule`
   (StockLevel reads with derived `available` exposed; a movement-recording endpoint
   that runs the transactional onHand-mutation flow). Quantities serialized as strings.
4. Tests across the three native runners: domain=vitest, infra-db=jest, api=jest.

## The central decision — the onHand-mutation invariant (single transaction)

**`onHand` mutates ONLY through a recorded `StockMovement`.** There is no direct
"set onHand" write anywhere. Recording a movement is one atomic operation that (a)
validates the Product exists, (b) lazily gets-or-creates the `StockLevel` row, (c)
adjusts `onHand` by the movement's signed direction, (d) throws `NegativeStockError`
if the result would be negative — all inside ONE Prisma transaction.

**Placement**: the read-modify-write of `StockLevel` + the append of `StockMovement`
must be atomic across two tables, so the transaction MUST live in infra-db behind a
port method — the api `StockService` only holds ports and cannot open a Prisma
transaction. Product-existence validation lives in `StockService` (mirrors how
`ProductService` validates `categoryId` before create); the cross-table mutation lives
in `IStockMovementRepository.record`, implemented with `prisma.$transaction`.

The direction and the negative guard are PURE domain, reused inside the transaction:

```ts
// domain/src/inventory/stock-movement.ts
export type StockMovementType =
  | 'purchase_in' | 'sale_out'
  | 'transfer_in' | 'transfer_out'
  | 'adjustment_in' | 'adjustment_out';

/** `_in` types add, `_out` types subtract. quantity is always a positive magnitude. */
export function movementDirection(type: StockMovementType): 1 | -1 {
  return type.endsWith('_out') ? -1 : 1;
}

// domain/src/inventory/stock-level.ts
export function availableStock(level: StockLevel): number {
  return level.onHand - level.reserved; // DERIVED, never stored
}

/** Pure: computes the resulting onHand; throws NegativeStockError if it would go < 0. */
export function applyMovement(level: StockLevel, type: StockMovementType, quantity: number): StockLevel {
  const nextOnHand = level.onHand + movementDirection(type) * quantity;
  if (nextOnHand < 0) {
    throw new NegativeStockError(
      `Movement ${type} of ${quantity} would drive onHand negative (have ${level.onHand})`,
    );
  }
  return { ...level, onHand: nextOnHand, updatedAt: new Date() };
}
```

### Transactional flow (`PrismaStockMovementRepository.record`)

```
StockService.recordMovement(dto)
  │  1. IProductRepository.findById(productId)  ── null → InvalidStockMovementError (400)
  ▼
IStockMovementRepository.record(input)
  └─ prisma.$transaction(tx =>):
       2. upsert StockLevel (productId,warehouseId)  ── lazy create {onHand:0,reserved:0} if absent
       3. GUARDED UPDATE: set on_hand = on_hand + dir*qty WHERE id=? AND on_hand + dir*qty >= 0
            └─ 0 rows affected → throw NegativeStockError  (atomic, race-free)
       4. INSERT StockMovement (append-only; type, quantity, reason, createdBy)
       returns { movement, stockLevel }
```

**Concurrency**: the guard is a single conditional `UPDATE ... WHERE on_hand + dir*qty
>= 0` inside the transaction — race-free without explicit row locks (two concurrent
`sale_out`s cannot both pass; the loser gets 0 rows → `NegativeStockError`). A DB
`CHECK (on_hand >= 0 AND reserved >= 0)` constraint is defense-in-depth. The pure
`applyMovement` gives the friendly domain error in the common (uncontended) path and is
unit-tested in isolation.

## Layer mapping (screaming architecture)

Dependency direction unchanged: `api-salesops → { domain, infra-db }`, `infra-db →
domain`, `domain → nothing`. The `domain → infra` edge is FORBIDDEN, enforced by
`backend-boundaries` ESLint at `--max-warnings 0` across all three packages.

### `packages/domain/src/inventory/` — pure core (vitest)

| File | Contract |
|------|----------|
| `warehouse.ts` | `interface Warehouse { id; name; active; createdAt; updatedAt }` + `createWarehouse(input)` (non-empty `name`; `active` defaults true). Throws `InvalidWarehouseError`. |
| `stock-level.ts` | `interface StockLevel { id; productId; warehouseId; onHand: number; reserved: number; createdAt; updatedAt }` + `createStockLevel` (guards `onHand >= 0`, `reserved >= 0`, both integers). Pure `availableStock(level)` derivation + pure `applyMovement(level,type,qty)` guard. Throws `InvalidStockLevelError` / `NegativeStockError`. |
| `stock-movement.ts` | `interface StockMovement { id; productId; warehouseId; type: StockMovementType; reason: string \| null; quantity: number; createdAt; createdBy?: string \| null }` + `StockMovementType` union + `movementDirection` + `createStockMovement` (guards `quantity > 0` integer, `reason` defaults null, `createdBy` defaults null). Throws `InvalidStockMovementError`. |
| `warehouse-repository.port.ts` | `IWarehouseRepository { create; update; softDelete; findById; list }` + `const WAREHOUSE_REPOSITORY = Symbol('IWarehouseRepository')`. |
| `stock-level-repository.port.ts` | `IStockLevelRepository { findById; findByProductAndWarehouse(productId,warehouseId); list(filter?) }` (read-only from delivery; writes happen only via the movement transaction) + `const STOCK_LEVEL_REPOSITORY = Symbol('IStockLevelRepository')`. |
| `stock-movement-repository.port.ts` | `IStockMovementRepository { record(input): Promise<{ movement; stockLevel }>; list(filter?) }` + `const STOCK_MOVEMENT_REPOSITORY = Symbol('IStockMovementRepository')`. `record` is the transactional onHand mutation. |
| `errors.ts` | `InvalidWarehouseError`, `InvalidStockLevelError`, `InvalidStockMovementError`, `NegativeStockError` (grita, no adivina). |
| `index.ts` | Barrel; re-exported from `packages/domain/src/index.ts`. |

`Warehouse.softDelete` (set `active = false`), never hard delete — StockLevel/Movement
FKs would orphan history, exactly like `Product.softDelete`.

### `packages/infra-db/` — adapters (jest + real Postgres)

| File | Contract |
|------|----------|
| `prisma/schema.prisma` | Append `Warehouse`, `StockLevel`, `StockMovement` + `StockMovementType` enum + migration. |
| `src/inventory/prisma-warehouse.repository.ts` | `@Injectable() PrismaWarehouseRepository implements IWarehouseRepository`. |
| `src/inventory/prisma-stock-level.repository.ts` | `@Injectable() PrismaStockLevelRepository implements IStockLevelRepository`. Read side; maps rows → domain. |
| `src/inventory/prisma-stock-movement.repository.ts` | `@Injectable() PrismaStockMovementRepository implements IStockMovementRepository`. `record()` runs `prisma.$transaction` (upsert level → guarded update → insert movement). |
| `src/inventory/seed.ts` | Seeds **3 warehouses** (idempotent upsert on `name`), NO StockLevels. |
| `src/index.ts` | Export the three repositories (mirror the product export lines). |

### `apps/api-salesops/src/inventory/` — delivery (jest)

| File | Contract |
|------|----------|
| `warehouse/warehouse.module.ts` | `imports:[InfraDbModule]`; provide `WAREHOUSE_REPOSITORY → PrismaWarehouseRepository`; `WarehouseController` + `WarehouseService`. Mirror `product.module.ts`. |
| `warehouse/*` | REST CRUD; `InvalidWarehouseError → 400`. |
| `stock/stock.module.ts` | provide `STOCK_LEVEL_REPOSITORY`, `STOCK_MOVEMENT_REPOSITORY`, `PRODUCT_REPOSITORY` (for existence check). |
| `stock/stock.service.ts` | `GET` levels (response exposes `onHand`, `reserved` and derived `available` as strings via `availableStock`); `POST` movement validates product exists, calls `record`, returns movement + resulting level. `createdBy` left `null`. |
| `stock/dto/*.ts` | `onHand`/`reserved`/`available`/`quantity` serialized as strings (mirror `MoneyAmountDto` string discipline); `type` validated against the union; `reason` optional. |

`createdBy` is passed `null` — no auth yet. The future Usuarios/Roles module ships a
transversal `@CurrentUser()` that all modules (retroactively Inventario) read from
(#1343). Do NOT build any guard/stub here.

## Prisma schema (append to baseline)

```prisma
enum StockMovementType {
  purchase_in
  sale_out
  transfer_in
  transfer_out
  adjustment_in
  adjustment_out
}

model Warehouse {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  stockLevels StockLevel[]
  movements   StockMovement[]

  @@map("warehouse")
}

model StockLevel {
  id          String   @id @default(uuid()) @db.Uuid
  productId   String   @db.Uuid @map("product_id")
  warehouseId String   @db.Uuid @map("warehouse_id")
  onHand      Int      @default(0) @map("on_hand")
  reserved    Int      @default(0)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  product   Product   @relation(fields: [productId], references: [id])
  warehouse Warehouse @relation(fields: [warehouseId], references: [id])

  @@unique([productId, warehouseId])
  @@index([warehouseId])
  @@map("stock_level")
  // DB backstop (raw SQL in migration): CHECK (on_hand >= 0 AND reserved >= 0)
}

model StockMovement {
  id          String            @id @default(uuid()) @db.Uuid
  productId   String            @db.Uuid @map("product_id")
  warehouseId String            @db.Uuid @map("warehouse_id")
  type        StockMovementType
  quantity    Int               // positive magnitude; type implies direction
  reason      String?
  createdBy   String?           @map("created_by")
  createdAt   DateTime          @default(now()) @map("created_at")

  product   Product   @relation(fields: [productId], references: [id])
  warehouse Warehouse @relation(fields: [warehouseId], references: [id])

  @@index([productId, warehouseId])
  @@map("stock_movement")
}
```

Product gains only the inverse relation fields (`stockLevels StockLevel[]`,
`movements StockMovement[]`) required by Prisma for the FK — NO scalar inventory
columns. `rg -i "stock|warehouse"` under `product/` stays 0.

- **Quantities as `Int`, not Decimal**: units are whole (no fractional stock in this
  catalog). `onHand`/`reserved`/`quantity` are all `Int`. This deliberately differs
  from Product's `Decimal` money columns because these are counts, not money.
- **`type` as a Prisma `enum`, lowercase values matching the TS union verbatim** →
  repo mapping is identity (no translation table). Mirrors the closed `PaymentChannel`
  / `Currency` enums. (Product's `priceCurrency` used `String` because the currency is
  a per-row caller choice carried by the `Money` VO; movement `type` is a fixed
  taxonomy needing DB-level integrity — enum is the right tool.)
- **`StockMovement` is append-only** → `created_at` only, no `updated_at`, no
  soft-delete (mirrors `ExchangeRate`). `StockLevel`/`Warehouse` are mutable master
  data → both timestamps.
- **Migration**: single additive `prisma migrate dev --name add_inventory_module`
  (append the `CHECK` constraint via raw SQL in the generated migration). Rollback =
  drop the migration; Product/Category/Currency untouched.

## Seam docs (authored, NOT built)

### `inventory/stock-reservation-seam.md` — `IStockReservationProvider` (Ventas)

Reservation/release/decrement is the **Ventas** module's job; Inventario only NAMES the
port so `reserved` has a documented owner. Ventas would inject:

```ts
/** Owned by the future Ventas module — NOT this change. */
interface IStockReservationProvider {
  reserve(productId: string, warehouseId: string, qty: number): Promise<void>;
  release(productId: string, warehouseId: string, qty: number): Promise<void>;
  /** At fulfillment: decrements onHand by creating a `sale_out` StockMovement. */
  decrement(productId: string, warehouseId: string, qty: number): Promise<void>;
}
```

`reserve`/`release` adjust `StockLevel.reserved` ONLY (never a StockMovement).
`decrement` is the ONLY reservation operation that records a movement (`sale_out`) via
`IStockMovementRepository.record`. Availability-for-sale (`Product.active AND
availableStock > 0`) is also Ventas' concern, documented there.

### `inventory/purchase-cost-seam.md` — `IPurchaseCostUpdater` (Compras)

A future **Compras** module owns purchase receipts (header + lines). Per received line
it would:

```ts
/** Owned by the future Compras module — NOT this change. */
interface IPurchaseCostUpdater {
  applyReceipt(line: {
    productId: string; warehouseId: string; quantity: number; unitCost: Money;
  }): Promise<void>;
}
```

`applyReceipt` (a) creates a `purchase_in` StockMovement via
`IStockMovementRepository.record` AND (b) recomputes the real `Product.cost` by
weighted average — the real source that replaces today's synthetic `price * 0.6`
placeholder. Inventario exposes the movement seam it needs; the cost recompute is
Compras' concern, never built here.

## Seed plan

- **Seed 3 warehouses only** (idempotent upsert keyed on `name`), e.g. `Almacén
  Central`, `Almacén Habana`, `Almacén Santiago`. Data, not enum.
- **NO StockLevels seeded** (open decision #1 → lazy creation on first movement). A
  missing row means zero stock (`available = 0`); pre-seeding 33 zero rows would
  misrepresent "stocked". `seed.spec.ts` proves idempotency (run twice → exactly 3
  warehouses, no duplicates).
- No `catalog.json` changes — Product stays the master-data source.

## Architecture decisions (ADR-style)

| # | Decision | Rejected alternative | Rationale |
|---|----------|----------------------|-----------|
| 1 | `available = onHand − reserved` DERIVED by pure `availableStock`, never stored | stored `available` column | Anti-contradiction discipline (locked #1340), same as `Product.finalPrice`. |
| 2 | `onHand` mutates ONLY via recorded `StockMovement` | direct `setOnHand` writes | Single source of truth + full audit trail; `adjustment_in/out` covers manual corrections. |
| 3 | Transactional `record` lives in `IStockMovementRepository` (infra), NOT the api service | orchestrate read-modify-write in `StockService` | Cross-table atomicity needs Prisma `$transaction`; api layer holds ports only. Domain guard stays pure and reused inside. |
| 4 | Negative guard = conditional `UPDATE ... WHERE on_hand+dir*qty >= 0` + DB `CHECK` | app-level read-then-write; explicit row locks | Race-free without locks; DB CHECK is defense-in-depth. Pure `applyMovement` gives friendly errors uncontended. |
| 5 | `quantity` = positive magnitude; `type` implies direction (`movementDirection`) | signed delta | Avoids sign/type contradiction (locked #1340). |
| 6 | `type` = Prisma `enum` (lowercase, identity-mapped to TS union) | `String` column; lookup entity | Closed taxonomy needs DB integrity; mirrors `PaymentChannel`/`Currency` enums; no manufacturing/lots need extensibility. |
| 7 | Quantities as `Int` | `Decimal` | Whole units; counts are not money. |
| 8 | StockLevel lazy-created on first movement; seed = 3 warehouses only | pre-seed 11×3 zero rows | Zero rows misrepresent "stocked"; lazy keeps DB honest (open decision #1). |
| 9 | `StockMovement` append-only (`created_at` only, no soft-delete) | mutable/updatable movements | Audit log integrity; mirrors `ExchangeRate`. |
| 10 | Product FK read-only (`productId`), no inventory fields on Product | inventory columns on Product | One-directional FK like `Product.categoryId`; Product stays CAPA BASE (#1340). |
| 11 | `createdBy` nullable, no auth built | stub guard | Auth is the transversal Usuarios module's job (#1343); a stub risks becoming de-facto auth in the wrong place. |
| 12 | Flat per-concept files under `inventory/`, three separate ports | one god-repository | Mirrors `product/`/`currency/`; one port per aggregate. |

## Testing / TDD strategy (three runners)

Strict TDD is active. Each test targets the runner native to its package.

| Test | Package / runner |
|------|------------------|
| `availableStock` derivation; `movementDirection` per type | domain / **vitest** |
| `applyMovement`: in adds, out subtracts, throws `NegativeStockError` at boundary | domain / vitest |
| Invariant guards: `quantity > 0` integer, `onHand`/`reserved` >= 0, non-empty name | domain / vitest |
| Warehouse CRUD + soft-delete flips `active` | infra-db / **jest** (real Postgres) |
| `record`: lazy-creates StockLevel, adjusts onHand, appends movement, all atomic | infra-db / jest |
| `record` concurrency: two racing `sale_out`s — one succeeds, one throws negative | infra-db / jest |
| `UNIQUE(productId, warehouseId)` enforced; FK to Product/Warehouse | infra-db / jest |
| Warehouse CRUD endpoints; movement endpoint runs the flow; `available` string in reads; 400 on bad input | api-salesops / **jest** |

- infra-db + api jest runs need `NODE_OPTIONS=--experimental-vm-modules` (Prisma WASM).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Negative stock via concurrent movements | Med | Conditional guarded `UPDATE` inside the transaction + DB `CHECK`; loser throws `NegativeStockError` (decision #4) |
| Lazy StockLevel create races on first movement (two movements, no row yet) | Med | `upsert` on the `UNIQUE(productId,warehouseId)` inside the transaction is atomic; second waits/reuses |
| Reservation semantics leak into Inventario | Med | `reserved` is a plain field; reservation logic is the Ventas seam — only the port is named |
| Movement `type` union proves too narrow | Low | Closed enum is additive-migratable; `adjustment_in/out` + free-text `reason` absorb edge cases |
| Boundary leak (domain → infra) | Low | `backend-boundaries` lint `--max-warnings 0` across all three packages |
| Prisma enum value casing drift vs TS union | Low | Enum values are lowercase, identical to the union → identity map; a mapping test asserts parity |

## Open questions

- [x] Seed StockLevels or lazy-create? → **Lazy** (decision #8). 3 warehouses seeded.
- [x] Every onHand change requires a movement? → **Yes** (decision #2).
- [x] `createdBy` source with no auth? → **Nullable now** (decision #11, #1343).
- [ ] Warehouse seed names — placeholder Cuban city names used; owner may rename (non-blocking).

## Next step

`sdd-tasks` once the spec is also ready — break this design into ordered, testable
work units (entities + pure guards → ports → schema/migration + CHECK → repositories
(incl. transactional `record`) → modules/endpoints → seed → seam docs), respecting the
three-runner TDD map.
