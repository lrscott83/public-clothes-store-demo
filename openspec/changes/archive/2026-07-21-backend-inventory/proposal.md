# Proposal: Almacenes + Inventario Module — stock master-data slice

## Intent

Almacenes + Inventario is the second **CAPA BASE** module of the salesops backend
(`docs/plans/estrategia-backend-por-modulos.md`, map line 226), landing right after the
shipped Products slice. Today stock is invisible: `catalog.json` products carry no
warehouse or on-hand data, so Ventas has nothing to reserve or decrement against and
the owner cannot answer "¿cuánto tengo y dónde?". This change ships the first stock
vertical slice — `Warehouse`, `StockLevel` (product × warehouse) and an append-only
`StockMovement` log — as pure domain entities behind ports, persisted via Prisma and
exposed through thin NestJS CRUD, mirroring the shipped Product and Currency modules
end-to-end. The model is owner-LOCKED (engram `sdd/backend-inventory/model`, #1340);
this proposal formalizes exactly that model with no scope creep.

## Scope

### In Scope
- **Domain** (`@store-mgmt/domain/src/inventory`): flat per-concept files + ports,
  mirroring `product/` and `currency/`.
  - `Warehouse` `{ id: UUID, name, active, createdAt, updatedAt }`.
  - `StockLevel` `{ id, productId, warehouseId, onHand, reserved, audit }` with
    `available = onHand − reserved` **DERIVED, never stored**; guards throw on any
    negative `onHand`/`reserved`; `UNIQUE(productId, warehouseId)`.
  - `StockMovement` (append-only) `{ id, productId, warehouseId, type, reason, quantity, createdAt, createdBy? }`
    where `type` is a closed TS union `purchase_in | sale_out | transfer_in | transfer_out | adjustment_in | adjustment_out`,
    `reason: string | null` (default null, free text), `quantity` is a POSITIVE
    magnitude (type implies direction — no signed delta).
  - Ports: `IWarehouseRepository`, `IStockLevelRepository`, `IStockMovementRepository`.
    Inventory only **READS** Product via the existing `IProductRepository.findById`
    to validate the referenced product exists.
- **Persistence** (`infra-db`): Prisma `Warehouse`, `StockLevel`, `StockMovement`
  models (integer quantity columns; decimals-as-strings discipline where applicable);
  Prisma repos implementing the ports; seed **3 warehouses**.
- **Delivery** (`api-salesops`): `WarehouseModule` CRUD + `StockModule` endpoints for
  StockLevel reads and StockMovement recording, decimals/quantities serialized as
  strings, mirroring `ProductModule`/`CurrencyModule`.
- **Seam docs** (not built): `IStockReservationProvider` for Ventas and
  `purchase-cost-seam.md` (`IPurchaseCostUpdater`) for a future Compras module,
  authored using `product/commission-seam.md` as the template.

### Out of Scope (YAGNI — strategy doc "qué NO copiamos", line 166)
- Location hierarchy, bins, sub-locations, address/geo on Warehouse (flat only).
- Routes / push-pull / multi-step logistics; lots, serials, expiry.
- Incoming / expected / forecasted quantity; stock valuation engine.
- **Compras / purchasing module** — documented seam only, built later.
- **Ventas reservation implementation** — reserve/release/decrement is the Ventas
  seam's job; only the port is named here.
- Per-warehouse reorder points, low-stock alerts/config, transfer workflow UI.

## Capabilities

### New Capabilities
- `salesops-inventory`: `Warehouse` master data, `StockLevel` (product × warehouse
  on-hand/reserved with derived availability) and append-only `StockMovement` log,
  behind repository ports with Prisma persistence and HTTP CRUD. Distinct from
  `salesops-products`, `salesops-currency`, `salesops-backend`, `salesops-mvp`.

### Modified Capabilities
- None. Product carries **zero** inventory fields — the FK is one-directional
  (`StockLevel.productId → Product`, read-only, exactly like `Product.categoryId`).

## Decided Architectural Boundaries (LOCKED — do not re-open)

- **Movement type = closed TS union + nullable free-text `reason`**, NOT an
  extensible lookup entity. Even Odoo/ERPNext keep semantic direction closed; salesops
  has no manufacturing/lots/routes. `reason` captures the why (rotura, robo, conteo).
- **Quantity is positive magnitude**; `type` implies direction — no signed delta,
  avoiding sign/type contradiction.
- **Reservation/release are NOT StockMovements** — they only adjust
  `StockLevel.reserved` through the Ventas seam. StockMovement logs physical `onHand`
  changes only; `sale_out` is created at fulfillment, not at reservation.
- **`available` is derived, never persisted** — same anti-contradiction discipline as
  Product pricing. Negative stock is impossible (guards throw).
- **Product relationship is read-only FK by `productId`.** Inventory READS Product to
  validate existence; Product stays inventory-free (verify `rg -i "stock|warehouse"`
  under `product/` = 0). Per-product (Product has no variants).
- **Availability-for-sale (`active AND available > 0`) is the VENTAS seam's concern**,
  documented there — NOT built in Inventario.

## Documented Seams (named, NOT built)

| Seam | Owner (future) | Contract sketch |
|------|----------------|-----------------|
| `IStockReservationProvider` | Ventas | `reserve/release(productId, warehouseId, qty)` adjust `StockLevel.reserved`; `decrement` at fulfillment creates a `sale_out` movement |
| `IPurchaseCostUpdater` (`purchase-cost-seam.md`) | future Compras module | `applyReceipt(line)` creates a `purchase_in` movement AND recomputes real `Product.cost` via weighted-average — the real source that replaces today's synthetic `price*0.6` |

## Open Decisions — carry into spec/owner

| # | Decision | Recommendation (needs confirmation) |
|---|----------|-------------------------------------|
| 1 | **Seed StockLevels**: pre-create the 11×3 product×warehouse rows at seed, or create lazily on first stock-in? | Seed the **3 warehouses** always. For StockLevels, recommend **lazy creation on first movement** (a missing row means zero stock, `available = 0`) to avoid 33 zero rows that misrepresent "stocked"; optionally seed a small non-zero starter set for demo realism. Confirm. |
| 2 | **Movement required for every onHand change?** | Yes — `onHand` mutates ONLY through a recorded `StockMovement` (single source of truth / auditability). `adjustment_in/out` covers manual corrections. Confirm. |
| 3 | **`createdBy` source** (no auth module yet) | Nullable now; populate when Usuarios/Roles lands. Confirm. |

## Migration / Seed Notes

- Additive only: three new Prisma models + one migration; no existing table altered.
- Seed inserts **3 warehouses** (data, not enum). StockLevel seeding gated by open
  decision #1. No `catalog.json` changes — Product remains the master-data source.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/domain/src/inventory/` | New | `Warehouse`, `StockLevel`, `StockMovement` entities, invariants, 3 ports, 2 seam docs |
| `packages/infra-db/prisma/schema.prisma` | Modified | `Warehouse`, `StockLevel`, `StockMovement` models + `UNIQUE(productId, warehouseId)` |
| `packages/infra-db/src/inventory/` | New | Prisma repos + seed (3 warehouses) |
| `apps/api-salesops/src/inventory/` | New | `WarehouseModule` + `StockModule` (CRUD + movement recording) + DTOs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Negative stock via concurrent movements | Med | Domain guards throw; enforce onHand recompute inside a single transaction per movement |
| Reservation semantics leak into Inventario | Med | Boundary is explicit — reserved is a field, reservation logic is the Ventas seam; only the port is named |
| Seeding 33 zero StockLevels misrepresents stock | Low | Open decision #1 defaults to lazy creation |
| Boundary leak (domain → infra) | Low | `backend-boundaries` lint `--max-warnings 0`, mirroring Product/Currency |
| Movement `type` union proves too narrow | Low | Closed union is reversible/extendable; `adjustment_in/out` + free-text `reason` absorb edge cases |

## Rollback Plan

Self-contained: revert the feature branch. All three Prisma models are additive — drop
the migration. Untouched Product, Currency, Category modules, `salesops-mvp` SPA and
`@store-mgmt/domain` exports remain intact.

## Dependencies

- Shipped Product slice (`IProductRepository.findById` for FK validation; reference
  hexagonal impl): `packages/domain/src/product/*`, `packages/infra-db/src/product/*`,
  `apps/api-salesops/src/product/*`.
- Backend base scaffold (`api-salesops`, `infra-db`, docker Postgres).
- Owner confirmation on open decisions #1–#3 before spec finalizes the schema.

## Success Criteria

- [ ] `Warehouse`, `StockLevel`, `StockMovement` domain entities with derived
      `available`, positive-quantity + closed-union movements, negative-stock guards —
      all passing TDD.
- [ ] Prisma models + repos persist/read against Postgres; `UNIQUE(productId, warehouseId)` enforced; seed creates 3 warehouses.
- [ ] `WarehouseModule` CRUD + `StockModule` endpoints serialize quantities/decimals as strings.
- [ ] Inventory READS Product only via the port; Product carries zero inventory fields (`rg` verified).
- [ ] Domain imports ports, never Prisma; `backend-boundaries` lint green.
- [ ] Both seams (`IStockReservationProvider`, `purchase-cost-seam.md`) documented, not implemented.
