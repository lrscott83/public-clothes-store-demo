# Design — Ventas Module (Order aggregate: multi-currency + split payments)

Fifth **CAPA BASE** vertical slice, after Currency → Products → Inventario → Clientes.
Unlike the flat single-entity modules before it, Ventas is the first **true aggregate**:
one root `Order` owning a collection of `OrderLine`, a collection of `OrderPayment`, and
a `0..1 SaleCredit`, referencing Customer/Product/Warehouse **by id + snapshot**. It
reuses the shipped Currency machinery (`convertir`, `resolverTasa`, `finalPrice`) and the
Inventario stock ports — and **EXTENDS the shipped inventory module** with a `reserve`/
`release` operation it does not have today (INFRA GAP, decision #7). This DECIDES the
implementation-level questions the locked model left open (aggregate persistence, the two
conversion tweaks, freeze mechanics, the reserve-and-consume stock bridge); it does NOT
re-open the model.

> Authoritative business model is owner-LOCKED field-by-field in engram
> `sdd/backend-ventas/domain-model` (#1393) and the proposal
> `sdd/backend-ventas/proposal` (#1396). Those LOCK: derived order currency, split
> `OrderPayment` collection, snapshots-not-joins, freeze-at-`verificado`, stock-only-via-
> the-inventory-ports (reserve & consume, Option A), no `createdBy`, `active` soft-delete,
> Money VO everywhere. This document
> decides the HOW. Tasks come next.

## Quick path (what gets built)

1. `packages/domain/src/ventas/` — `order.ts` (`Order` interface + `createOrder` factory,
   the aggregate guardian), `order-line.ts`, `order-payment.ts`, `sale-credit.ts`,
   `order-repository.port.ts`, `errors.ts`, `index.ts`. Pure, zero I/O.
2. `packages/domain/src/currency/rate-resolver.ts` — the two locked conversion tweaks
   (same-currency soft-resolve + channel-less `convertirEntreMonedas`).
3. **`packages/domain/src/inventory/` (EXTEND, not rewrite)** — grow the read-only
   `IStockLevelRepository` with `reserve`/`release` write methods + `InsufficientStockError`
   (decision #7). The shipped read methods and specs are untouched.
4. `packages/infra-db/` — four Prisma models (+ additive migration), `PrismaOrderRepository`
   (aggregate persistence + `confirm`/`deliver`/`cancel` transactions), two infra-only shared
   stock helpers (`applyStockMovementTx` for `onHand`, `applyReservationTx` for `reserved`),
   the extended `PrismaStockLevelRepository`, seed.
5. `apps/api-salesops/src/ventas/` — `VentasModule` (module/service/controller/DTOs) + e2e.
6. Tests across the three native runners: domain=vitest, infra-db=jest, api=jest + e2e.

## Central decision #1 — the aggregate is ONE transaction

`Order` + its `OrderLine[]` + `OrderPayment[]` + optional `SaleCredit` persist and load as
a SINGLE unit. `PrismaOrderRepository.create` runs ONE `prisma.$transaction`: insert the
`order` row, `createMany` the child `order_line` / `order_payment` rows (FK `order_id`),
insert `sale_credit` when present. `findById` uses a single `include: { lines, payments,
saleCredit }` and maps rows → the domain aggregate. Children carry `onDelete: Cascade` as
defense-in-depth; we never hard-delete (soft-delete via `Order.active`), so cascade only
guards accidental removal. The domain factory `createOrder` builds and validates the whole
aggregate in memory FIRST (mirrors `WarehouseService` calling `createWarehouse` before the
repo — C1/W1 pattern); the repository is a dumb persister of an already-valid aggregate.

## Central decision #2 — Order currency is DERIVED in the factory; totals frozen at `verificado`

`createOrder(input, rates, at)` is the single invariant guardian and runs in this order:

1. **Derive currency (pure, no rates):** scan the lines' product-native currencies — any
   `USD` line → `Order.currency = USD`; else `MN`. `EUR` NEVER becomes the order currency
   (an EUR line in an MN order converts EUR→MN). Requires ≥1 line.
2. **Per line:** `unitFinalPrice = finalPrice(...)` (reuse `product/pricing.ts`, native
   currency); `lineTotalNative = unitFinalPrice × quantity` (native); then
   `lineTotalOrder = convertirEntreMonedas(rates, lineTotalNative, Order.currency, at)`,
   stamping `rateApplied` + `rateEffectiveFrom`.
3. **Order totals (Money in `Order.currency`):** `subtotal`, `discountTotal`, `total`
   summed from the converted line values; invariant `total === subtotal − discountTotal`.
4. **Payments:** each `amountInOrderCurrency = convertir(rates, amount, channel,
   Order.currency, at)`; invariant `Σ amountInOrderCurrency === Order.total`.

**Freeze mechanics.** Conversion is computed eagerly in the factory, but the stamped
snapshot (`rateApplied`, `rateEffectiveFrom`, `lineTotalOrder`, `amountInOrderCurrency`,
and the three order-currency Money totals) becomes IMMUTABLE at the `creado → verificado`
transition: `verifiedAt` is set and the service REFUSES to recompute a `verificado` order.
A later `appendRate` never moves a verified total — the stored snapshot is the source of
truth, read-only. `creado` orders may be edited/recomputed; verified orders may not.
The freeze stamps ONLY **rate + totals** — there is NO commission field anywhere in this
slice. Commission accrual is a SEPARATE entity owned by the future **Gestores+Comisiones**
module (its own `creada → pagada` lifecycle); Ventas never accrues or stamps commission.
"Tasas RESUELVE, Ventas CONGELA."

## Central decision #3 — the two locked Currency tweaks (guard the green suite)

Both live in `currency/rate-resolver.ts`, behind the existing green currency suite; new
scenarios cover the new branches.

**(a) Same-currency must consult a rate first, else 1×1 — without regressing.** Today
`convertir` calls `resolverTasa` UNCONDITIONALLY (line 114) BEFORE the same-currency
check (line 116), so `MN→MN` with no MN rate THROWS `RateNotFoundError` instead of falling
back to identity. Fix = a **new branch**, not a new parameter (a param would ripple through
every shipped `convertir` caller): move the same-currency check to the top and soft-resolve.

```ts
if (origen.currency === monedaDestino) {
  const soft = tryResolverTasa(rates, channel, at);      // returns undefined instead of throwing
  return { money: origen, rateApplied: soft?.source ?? syntheticIdentity(channel, at) };
}
```

Existing same-currency tests always had a rate present → they still stamp the real rate →
no regression. The new branch adds the "no-rate → synthetic 1×1" case. `syntheticIdentity`
reuses the existing USD-pivot pattern (`id: undefined` marks it non-persisted).

**(b) Channel-less line conversion helper.** Line conversion (product-native →
order-currency) has NO `PaymentChannel`. Add:

```ts
export function convertirEntreMonedas(
  rates: ExchangeRate[], origen: Money, monedaDestino: Currency, at: Date,
): ConversionResult
```

Same-currency → soft-resolve/1×1 (as above). Cross-currency → resolve BOTH sides via the
existing internal `resolveRateForCurrency` (which already throws `RateNotFoundError` when a
non-USD rate is missing → STOPS the sale), then the same single-`divRoundHalfUp` pivot math
as `convertir`, minus the `CHANNEL_CURRENCY` validation. `rateApplied` stamped = the
**origen-side** (product-native) rate — the rate that priced the foreign line.

## Central decision #4 — Order↔Inventory: reserve-and-consume (Option A), three atomic tx

Owner-LOCKED (#1393) stock bridge is **Option A — reserve & consume**, NOT immediate
deduction. Stock crosses the Order/Inventory aggregate boundary at THREE state transitions,
each its own single `prisma.$transaction`:

| Transition | Per-line stock effect | One `$transaction` contains |
|-----------|-----------------------|------------------------------|
| `creado → verificado` (`confirm`) | **RESERVE**: `reserved += qty` | freeze rate+totals + set `verifiedAt` + reserve per line |
| `verificado → entregado` (`deliver`) | **CONSUME**: release then `sale_out` | release per line (`reserved -= qty`) **then** `sale_out` (`onHand -= qty`) + stamp `deliveredAt` |
| `verificado → cancelado` (`cancel`) | **RELEASE**: `reserved -= qty` | release per line + set `status = cancelado` |
| `creado → cancelado` (`cancel`) | none (nothing was reserved) | set `status = cancelado` only |

`creado` has NO stock effect. Invariant `available = onHand − reserved` stays consistent at
every step. `Order` NEVER writes stock rows directly (cross-aggregate).

**INFRA GAP — the shipped inventory module cannot do this today.** `IStockLevelRepository`
is READ-ONLY; nothing mutates `StockLevel.reserved`; `record()` only moves `onHand`. Option A
REQUIRES a new reservation operation. Decision #7 designs that extension.

**Ordering at `deliver` is load-bearing:** RELEASE precedes `sale_out`. Consuming a fully
reserved level (`onHand === reserved === qty`) by lowering `onHand` first would transiently
leave `reserved > onHand` (available < 0); releasing first keeps every intermediate
statement invariant-clean (matters if a `reserved <= on_hand` CHECK is added).

**Prisma-free port (same pattern as the shipped `record` extraction).** A Prisma `tx` type
can NEVER enter a domain interface (`domain → infra` forbidden), yet reserve/release must run
INSIDE the order's `$transaction` for atomicity. So each guarded mutation is extracted into an
infra-only tx-aware helper: `applyStockMovementTx(tx, input)` (from `record`, for `sale_out`)
and `applyReservationTx(tx, {productId, warehouseId, quantity}, dir)` (for `reserved`). The
standalone `IStockLevelRepository.reserve/release` impl wraps the reservation helper in its
OWN `$transaction`; `PrismaOrderRepository.confirm/deliver/cancel` call the SAME helpers
INSIDE the order `$transaction`.

**Failure semantics.** `confirm`: any line whose available cannot cover `qty` → the guarded
`UPDATE ... WHERE on_hand - (reserved + qty) >= 0` affects 0 rows → `InsufficientStockError`
→ the WHOLE tx rolls back (order stays `creado`, no reservation persists). `deliver`: an
`onHand` shortfall → `sale_out` guard affects 0 rows → `NegativeStockError` → rollback
(order stays `verificado`). All-or-nothing per transition; no partial reservation/deduction,
no compensation logic.

## Status lifecycle (closed state machine) + module boundary

`OrderStatus = creado | verificado | entregado | cancelado` (EXACTLY 4). Initial state is
`creado`. `entregado` is TERMINAL and **is a Ventas state** — per
`docs/plans/estrategia-backend-por-modulos.md` (lines 76-78) every sale ends with goods to
the client, so delivery-of-goods closure belongs to Ventas, NOT to the Delivery module.

**Module BOUNDARY (owner-locked #1393, per the estrategia doc).** The MVP's 5-state
monolith (`creado/verificado/transportando/entregado/comision_pagada`) is DECOMPOSED across
modules. This slice implements ONLY the Ventas sale lifecycle:

- **Ventas (this slice):** `creado → verificado → entregado`, plus `cancelado` from `creado`
  OR `verificado`. `verificado → entregado` is the DIRECT pickup path (`deliveryMode =
  'recogida'`, or `domicilio` before the Delivery module exists).
- **Delivery (FUTURE module — NOT here):** when `deliveryMode = 'domicilio'`, inserts
  `verificado → despachando → transportando → entregado`. `despachando`/`transportando` are
  Delivery states and are intentionally ABSENT from this enum.
- **Gestores+Comisiones (FUTURE module — NOT here):** commission is a SEPARATE entity with
  its own `creada → pagada` lifecycle. `comision_pagada` is REMOVED from order states;
  Ventas freezes only rate + totals, never commission.

**State-transition table (guards mirror the MVP `seed-store.ts` style — reject invalid
source states with an explicit error).**

| From | To | Trigger / method | Guard (reject if source ≠) | Side effects |
|------|----|------------------|----------------------------|--------------|
| — | `creado` | `createOrder` / `create` | (initial) | build + validate aggregate; NO stock, NO freeze |
| `creado` | `verificado` | `confirm(id)` | must be `creado` | FREEZE rate+totals (decision #2), **RESERVE per line** (`reserved += qty`, decision #4/#7), set `verifiedAt` |
| `verificado` | `entregado` | `deliver(id)` | must be `verificado` | **CONSUME per line**: RELEASE (`reserved -= qty`) then `sale_out` (`onHand -= qty`); stamp `deliveredAt` |
| `creado` | `cancelado` | `cancel(id)` | must be `creado` OR `verificado` | no stock touched (nothing was reserved at `creado`) |
| `verificado` | `cancelado` | `cancel(id)` | must be `creado` OR `verificado` | **RELEASE per line** (`reserved -= qty`); `onHand` untouched — reservation returned |
| `entregado` | — | (none) | TERMINAL | cancel-after = return/refund (devolución), DEFERRED — see note |

Guard shape (each transition is a read-modify-write that throws on a wrong source state, per
`seed-store.ts` `transitionOrder`):

```ts
if (order.status !== 'creado') {
  throw new InvalidOrderStateError(id, 'creado', order.status); // reject invalid source
}
```

`active=false` (soft-delete) is orthogonal to `status`. The domain port therefore grows
`confirm`, `deliver`, and `cancel` alongside CRUD (see port table).

## Layer mapping (screaming architecture)

Dependency direction unchanged: `api-salesops → { domain, infra-db }`, `infra-db →
domain`, `domain → nothing`, enforced by `backend-boundaries` at `--max-warnings 0`.

### `packages/domain/src/ventas/` — pure core (vitest)

| File | Contract |
|------|----------|
| `order.ts` | `interface Order { id; customerId; customerName; warehouseId; deliveryMode: 'recogida'\|'domicilio'; currency: 'USD'\|'MN'; status: OrderStatus; subtotal; discountTotal; total: Money; orderDate; verifiedAt?: Date\|null; deliveredAt?: Date\|null; active; createdAt; updatedAt; lines: OrderLine[]; payments: OrderPayment[]; saleCredit?: SaleCredit\|null }` + `type OrderStatus = 'creado'\|'verificado'\|'entregado'\|'cancelado'` + `createOrder(input, rates, at)` (decision #2: derive currency, recompute lines, sum totals, payment-sum invariant; `deliveryMode` is a REQUIRED input; initial `status='creado'`). Throws `InvalidOrderError`, `RateNotFoundError`. Pure transition guards `confirmOrder`/`deliverOrder`/`cancelOrder` throw `InvalidOrderStateError` on a wrong source state. |
| `order-line.ts` | `interface OrderLine { productId; productName; categoryName; price: Money; percentDiscountPrice: bigint; discountPrice: bigint; quantity: number; unitFinalPrice: Money; lineTotalNative: Money; rateApplied: bigint; rateEffectiveFrom: Date; lineTotalOrder: Money }` + `buildOrderLine` helper (reuses `finalPrice`). |
| `order-payment.ts` | `interface OrderPayment { channel: PaymentChannel; amount: Money; rateApplied: bigint; rateEffectiveFrom: Date; amountInOrderCurrency: Money }`. |
| `sale-credit.ts` | `interface SaleCredit { id; orderId; customerId; total: Money; paid: Money; isPaid: boolean (derived paid>=total); paidDate?; paidType? }` + pure `isSaleCreditPaid`. |
| `order-repository.port.ts` | `IOrderRepository { create; update; softDelete; findById; list(filter?); confirm(id); deliver(id); cancel(id) }` + `OrderListFilter { includeInactive?; customerId?; status? }` + `const ORDER_REPOSITORY = Symbol('IOrderRepository')`. Port stays Prisma-free (decision #7). |
| `errors.ts` | `InvalidOrderError`, `InvalidOrderStateError(id, expected, actual)` (state-machine guard); re-export `RateNotFoundError` (already defined in `currency/errors.ts` — no duplicate). |
| `index.ts` | Barrel; re-exported from `packages/domain/src/index.ts` after the `customer` line. |

### `packages/domain/src/inventory/` — EXTENDED, not rewritten (vitest) — decision #7

| File | Change |
|------|--------|
| `stock-level-repository.port.ts` | **Modify**: `IStockLevelRepository` grows two WRITE methods — `reserve(input: ReserveStockInput): Promise<StockLevel>` and `release(input: ReserveStockInput): Promise<StockLevel>`, where `interface ReserveStockInput { productId: string; warehouseId: string; quantity: number /* positive magnitude */ }`. Existing `findById`/`findByProductAndWarehouse`/`list` UNCHANGED; the "read-only" doc comment is amended to "reads + reservation writes". Port stays Prisma-free (no `tx`). |
| `errors.ts` | **Modify**: add `InsufficientStockError` (reserve would push `available` negative, i.e. `reserved > onHand`). `NegativeStockError` (onHand < 0, for `sale_out`) already exists — reused. |
| `index.ts` | **Modify**: export `ReserveStockInput` + `InsufficientStockError`. |

The shipped inventory vitest suite MUST stay green — these are additive. This is a
**load-bearing extension of shipped code**, not a rewrite.

### `packages/infra-db/` — adapter (jest + real Postgres)

| File | Contract |
|------|----------|
| `prisma/schema.prisma` | Append `Order`/`OrderLine`/`OrderPayment`/`SaleCredit` + `OrderStatus` (4-state) + `DeliveryMode` enums + inverse relations on `Customer`/`Warehouse`/`Product` + migration. |
| `src/inventory/apply-stock-movement.ts` | Extract infra-only `applyStockMovementTx(tx, input)` from `record` (`onHand` guarded UPDATE, for `sale_out`); `record` now delegates. |
| `src/inventory/apply-reservation.ts` | **New** infra-only `applyReservationTx(tx, {productId, warehouseId, quantity}, dir: 'reserve'\|'release')`. `upsert` level; guarded `UPDATE`: reserve → `SET reserved = reserved + q WHERE id=? AND on_hand - (reserved + q) >= 0` (0 rows → `InsufficientStockError`); release → `SET reserved = reserved - q WHERE id=? AND reserved - q >= 0` (0 rows → over-release error). Shared by the level-repo `reserve`/`release` (own `$transaction`) AND `PrismaOrderRepository` (inside the order tx). |
| `src/inventory/prisma-stock-level.repository.ts` | **Modify**: implement `reserve`/`release` by wrapping `applyReservationTx` in its own `prisma.$transaction` and returning the mapped `StockLevel`. Read methods untouched. |
| `src/ventas/prisma-order.repository.ts` | `@Injectable() PrismaOrderRepository implements IOrderRepository`. Aggregate `create`/`findById` in one `$transaction`/`include`; `confirm` (`creado→verificado`) = one `$transaction` (guard source=`creado` + freeze stamp + `applyReservationTx('reserve')` per line); `deliver` (`verificado→entregado`) = one `$transaction` (guard + `applyReservationTx('release')` **then** `applyStockMovementTx(sale_out)` per line + stamp `deliveredAt`); `cancel` (`creado`/`verificado`→`cancelado`) = one `$transaction` (guard + `applyReservationTx('release')` per line only when source=`verificado`); `softDelete` flips `active`. Each transition re-checks source status and throws `InvalidOrderStateError`. |
| `src/ventas/seed.ts` | Idempotent demo orders (single-currency, mixed USD/MN, one split-payment, one credit sale) keyed on a stable natural key. |
| `src/index.ts` | Export `PrismaOrderRepository`. |

### `apps/api-salesops/src/ventas/` — delivery (jest)

| File | Contract |
|------|----------|
| `ventas.module.ts` | `imports:[InfraDbModule]`; provide `ORDER_REPOSITORY → PrismaOrderRepository`; declare `VentasController` + `VentasService`. Mirror `warehouse.module.ts`. |
| `ventas.service.ts` | Holds `ORDER_REPOSITORY` (+ `CURRENCY_REPOSITORY` to load `rates` for `createOrder`); runs `createOrder` before persist; maps aggregate → response (Money → decimal strings, dates → ISO). Refuses recompute on `verificado`. |
| `ventas.controller.ts` | REST CRUD + `POST /:id/confirm` + `POST /:id/deliver` + `POST /:id/cancel`; `withDomainErrorMapping`: `InvalidOrderError → 400`, `InvalidOrderStateError → 409`, `RateNotFoundError → 409`, `InsufficientStockError → 409` (reserve at confirm), `NegativeStockError → 409` (`sale_out` at deliver); unknown id → 404; `DELETE` soft-deletes. |
| `dto/*.ts` | Money amounts as strings (mirror `MoneyAmountDto`); `channel` validated against the closed union; `deliveryMode` validated against `'recogida'\|'domicilio'` (REQUIRED); nested line/payment DTOs. |

No `createdBy`/audit-user field — the locked model has none; the transversal `@CurrentUser`
is the future Usuarios module's job. Do NOT build a guard/stub here.

## Prisma schema (append to baseline)

```prisma
enum OrderStatus { creado  verificado  entregado  cancelado }   // 4-state Ventas machine
enum DeliveryMode { recogida  domicilio }                        // fulfillment switch

model Order {
  id            String       @id @default(uuid()) @db.Uuid
  customerId    String       @db.Uuid @map("customer_id")
  customerName  String       @map("customer_name")          // snapshot
  warehouseId   String       @db.Uuid @map("warehouse_id")
  deliveryMode  DeliveryMode @map("delivery_mode")          // REQUIRED; domicilio engages future Delivery
  currency      String                                       // derived USD|MN
  status        OrderStatus  @default(creado)
  subtotal      Decimal      @db.Decimal(18, 2)             // Money in `currency`
  discountTotal Decimal      @db.Decimal(18, 2) @map("discount_total")
  total         Decimal      @db.Decimal(18, 2)
  orderDate     DateTime     @map("order_date")
  verifiedAt    DateTime?    @map("verified_at")            // freeze stamp (rate+totals, NO commission)
  deliveredAt   DateTime?    @map("delivered_at")           // stamped at verificado->entregado
  active        Boolean      @default(true)
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  customer   Customer       @relation(fields: [customerId], references: [id])
  warehouse  Warehouse      @relation(fields: [warehouseId], references: [id])
  lines      OrderLine[]
  payments   OrderPayment[]
  saleCredit SaleCredit?

  @@index([customerId])
  @@map("sales_order")   // "order" is a SQL reserved word
}

model OrderLine {
  id                   String   @id @default(uuid()) @db.Uuid
  orderId              String   @db.Uuid @map("order_id")
  productId            String   @db.Uuid @map("product_id")
  productName          String   @map("product_name")        // snapshot
  categoryName         String   @map("category_name")       // snapshot
  price                Decimal  @db.Decimal(18, 2)          // native
  priceCurrency        String   @map("price_currency")      // native currency
  percentDiscountPrice Decimal  @default(0) @db.Decimal(5, 2) @map("percent_discount_price")
  discountPrice        Decimal  @default(0) @db.Decimal(18, 2) @map("discount_price")
  quantity             Int
  unitFinalPrice       Decimal  @db.Decimal(18, 2) @map("unit_final_price")   // native
  lineTotalNative      Decimal  @db.Decimal(18, 2) @map("line_total_native")  // native
  rateApplied          Decimal  @db.Decimal(18, 6) @map("rate_applied")       // scale-6
  rateEffectiveFrom    DateTime @map("rate_effective_from")
  lineTotalOrder       Decimal  @db.Decimal(18, 2) @map("line_total_order")   // in Order.currency, frozen
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  order   Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id])

  @@index([orderId])
  @@map("order_line")
}

model OrderPayment {
  id                    String         @id @default(uuid()) @db.Uuid
  orderId               String         @db.Uuid @map("order_id")
  channel               PaymentChannel
  amount                Decimal        @db.Decimal(18, 2)   // in CHANNEL_CURRENCY[channel]
  rateApplied           Decimal        @db.Decimal(18, 6) @map("rate_applied")
  rateEffectiveFrom     DateTime       @map("rate_effective_from")
  amountInOrderCurrency Decimal        @db.Decimal(18, 2) @map("amount_in_order_currency")  // Order.currency
  createdAt             DateTime       @default(now()) @map("created_at")

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@map("order_payment")
}

model SaleCredit {
  id         String   @id @default(uuid()) @db.Uuid
  orderId    String   @unique @db.Uuid @map("order_id")     // 0..1
  customerId String   @db.Uuid @map("customer_id")          // FK, replaces legacy `client: string`
  total      Decimal  @db.Decimal(18, 2)                    // Order.currency
  paid       Decimal  @default(0) @db.Decimal(18, 2)        // Order.currency
  paidDate   DateTime? @map("paid_date")
  paidType   String?   @map("paid_type")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  order    Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  customer Customer @relation(fields: [customerId], references: [id])

  @@map("sale_credit")
}
```

`Customer` gains `orders Order[]` + `saleCredits SaleCredit[]`; `Warehouse` gains `orders
Order[]`; `Product` gains `orderLines OrderLine[]` — inverse relation fields only, no
scalar Ventas columns leak into those master-data models. **Money currency columns:** every
Money that can differ from `Order.currency` carries its own `*Currency` column
(`OrderLine.priceCurrency`); Moneys that are BY INVARIANT always `Order.currency`
(`subtotal`/`discountTotal`/`total`, `lineTotalOrder`, `amountInOrderCurrency`,
`SaleCredit.total`/`paid`) reuse the single `Order.currency` — storing a redundant currency
column there would invite contradiction with the derived order currency (anti-contradiction
discipline, same reasoning as `StockLevel.available`). `OrderPayment.amount`'s currency is
`CHANNEL_CURRENCY[channel]`, fully derivable from the enum — no column. **Migration:**
single additive `prisma migrate dev --name add_ventas_module`; rollback = drop it.
Customer/Product/Currency untouched. **Inventory tables:** no column change — `reserved`
already exists and the `reserve`/`release` guarded UPDATEs need no schema migration; the
`WHERE on_hand - (reserved + q) >= 0` guard is the race-free authority (mirroring `record`).
OPTIONAL defense-in-depth: a `CHECK (reserved <= on_hand)` on `stock_level` — if added it
MUST be `DEFERRABLE` (or rely on release-before-`sale_out` ordering, decision #4) so no
intermediate statement inside `deliver` trips it.

## Architecture decisions (ADR-style)

| # | Decision | Rejected alternative | Rationale |
|---|----------|----------------------|-----------|
| 1 | `Order` + lines + payments + saleCredit persist/load as ONE aggregate in a single `$transaction`/`include` | per-entity repos, N round-trips | An aggregate has one consistency boundary; children are meaningless without the root. Mirrors DDD aggregate persistence. |
| 2 | `Order.currency` DERIVED in `createOrder` from line composition (any USD→USD else MN; EUR never order currency) | user-selected currency column | Locked #1393; anti-contradiction — currency is a function of lines, not an independent input. |
| 3 | `createOrder(input, rates, at)` is the single guardian; totals/payment-sum validated there | validate in the service or controller | Mirrors `createWarehouse`/`createCustomer` C1/W1 — pure factory screams, repo is a dumb persister. |
| 4 | Conversion computed eagerly; snapshot IMMUTABLE at `verificado` (`verifiedAt` set, service refuses recompute) | recompute on every read; freeze in a separate stamping pass | "Tasas RESUELVE, Ventas CONGELA"; a later `appendRate` must never move a verified total. |
| 5 | Same-currency `convertir` fix = new soft-resolve BRANCH (reordered before `resolverTasa`) | add a boolean param | A param ripples through every shipped caller; a branch is internal, guarded by the green suite. |
| 6 | `convertirEntreMonedas(rates, origen, monedaDestino, at)` channel-less helper for line conversion; stamps origen-side rate | overload `convertir` with a nullable channel | Line conversion has no channel; a nullable-channel `convertir` muddies the channel-currency invariant. Reuses `resolveRateForCurrency`. |
| 7 | **Stock bridge = Option A (reserve & consume), owner-locked.** Add `reserve`/`release` WRITE methods to **`IStockLevelRepository`** (the port that OWNS `reserved`), NOT to `IStockMovementRepository`. Signatures `reserve/release(input: ReserveStockInput): Promise<StockLevel>`. Guarded Prisma UPDATE lives in a new infra-only `applyReservationTx(tx, input, dir)` shared by the level-repo impl (own tx) AND `PrismaOrderRepository` (inside the order tx). Reserve guard `WHERE on_hand - (reserved + q) >= 0` → `InsufficientStockError`; release guard `WHERE reserved - q >= 0`. | (a) reserve/release on `IStockMovementRepository`; (b) a new `sale_out` at `verificado` (immediate deduction); (c) a Prisma `tx` inside the domain port | Reservations mutate `reserved`, not `onHand`, and create NO `StockMovement` audit row — they belong on the level port, not the append-only movement log. Prisma-free port + shared tx helper (same proven pattern as the `record` extraction) gives atomicity without leaking `tx` into domain. Option A (reserve at `verificado`, consume at `entregado`) is owner-LOCKED #1393 over immediate deduction. |
| 8 | **Three atomic stock transitions**, each one `$transaction`: `confirm`=reserve+freeze+persist; `deliver`=release-then-`sale_out`+stamp; `cancel-from-verificado`=release+status. `deliver` releases BEFORE `sale_out` (invariant-clean intermediate). Any guard failure → whole tx rolls back, order keeps its source state. | deduct-at-`verificado` + compensate on cancel; `sale_out`-before-release at deliver | All-or-nothing per transition; no compensation logic. Release-first keeps `available >= 0` at every statement. `cancel-from-verificado` RELEASES (closes the old "reversal deferred" gap); `cancel-from-creado` is a no-op (nothing reserved). |
| 9 | Every Money → `Decimal(18,2)` + native `*Currency` column; rates → `Decimal(18,6)` (scale-6); no floats | float/number columns | Mirrors `Product.price`/`ExchangeRate.rate`; Money VO discipline end-to-end. |
| 10 | Order-currency Moneys reuse `Order.currency` (no redundant currency columns) | a `*Currency` column per Money | They are structurally always the order currency; a second column invites contradiction. |
| 11 | `OrderStatus = creado\|verificado\|entregado\|cancelado` (EXACTLY 4); initial `creado`; `entregado` TERMINAL and IS a Ventas state; cancel from `creado`/`verificado`; guards reject invalid source states (seed-store.ts style) | keep MVP 5-state monolith (`borrador`/`transportando`/`comision_pagada`); free-text status | Owner-locked #1393 + estrategia-backend-por-modulos.md: the MVP monolith is DECOMPOSED — Delivery owns `despachando`/`transportando`, Gestores owns commission (`creada`/`pagada`). Ventas owns only the sale lifecycle; every sale ends `entregado` (goods to client, doc lines 76-78). Closed enum for DB integrity (mirrors `PaymentChannel`). |
| 15 | `deliveryMode = recogida\|domicilio` REQUIRED, stored as a Prisma `DeliveryMode` enum on `Order` | put it on `Customer` (MVP location); store as `String` | Locked #1393 moved it from Client to Order (it drives fulfillment per-sale). Enum mirrors the `PaymentChannel`/`OrderStatus` discriminator convention (`String` is reserved for the cross-cutting Money `*Currency` columns, per `Product.priceCurrency`). `domicilio` is the switch that engages the future Delivery module (`verificado→despachando→transportando`); in this slice both modes take the direct `verificado→entregado` path. |
| 16 | Freeze at `verificado` stamps ONLY rate + totals — NO commission field anywhere | stamp commission at verificado (MVP `comision_pagada`) | Commission is a SEPARATE entity in the future Gestores+Comisiones module with its own `creada→pagada` lifecycle; folding it into the order would couple two module boundaries and contradict the locked decomposition. |
| 12 | Snapshots (`customerName`/`productName`/`categoryName`/prices/rates) frozen on the order | live joins to master data | Locked; a master-data edit must never mutate a historical sale. |
| 13 | `SaleCredit.customerId` FK (replaces legacy `client: string`); `isPaid` derived | store `isPaid` boolean; keep free-text client | Anti-contradiction (derive from `paid>=total`); real FK to the shipped `Customer`. |
| 14 | No `createdBy`; `active` soft-delete, `Order` table mapped `sales_order` | audit user now; hard delete; table `order` | Auth is the future Usuarios module's job; soft-delete protects child FKs; `order` is a SQL reserved word. |

## Testing / TDD strategy (three runners)

Strict TDD is active. Each test targets its package's native runner.

| Test | Package / runner |
|------|------------------|
| `createOrder` derives currency: any USD line → USD; all-MN → MN; EUR line never sets order currency | domain / **vitest** |
| `createOrder` recomputes `unitFinalPrice` via `finalPrice`; `lineTotalNative`/`lineTotalOrder` correct; `total===subtotal−discountTotal` | domain / vitest |
| Payment-sum invariant: `Σ amountInOrderCurrency === total` (mixed channels) else `InvalidOrderError` | domain / vitest |
| Cross-currency line/payment with NO rate → `RateNotFoundError` (STOPS); same-currency with no rate → 1×1 identity | domain / vitest |
| `convertirEntreMonedas`: same-currency soft-resolve; cross-currency pivot math; stamps origen-side rate | domain / vitest |
| Existing currency suite stays green after the `convertir` same-currency branch reorder | domain / vitest |
| Aggregate `create`/`findById` round-trip (lines+payments+saleCredit) against real Postgres; FK both sides | infra-db / **jest** |
| Inventory extension: `IStockLevelRepository.reserve` raises `reserved` (available drops); `release` lowers it; reserve beyond `available` → `InsufficientStockError`; over-release → error; shipped stock-level/stock-movement specs stay green | infra-db / jest |
| `confirm`: freeze stamp + `reserved += qty` per line (NO `onHand`/`sale_out` change), atomic; `verifiedAt` set | infra-db / jest |
| `confirm` reserve beyond available on one line → `InsufficientStockError`, whole tx rolls back (order still `creado`, `reserved` unchanged) | infra-db / jest |
| `deliver`: per line `reserved -= qty` (release) then `onHand -= qty` (`sale_out`), atomic; release precedes `sale_out`; `deliveredAt` set; `onHand` shortfall → `NegativeStockError` rolls back (order still `verificado`) | infra-db / jest |
| `cancel` from `verificado`: `reserved -= qty` per line (release), `onHand` untouched, status `cancelado`; `cancel` from `creado`: no stock touched | infra-db / jest |
| State machine: `confirm` rejects non-`creado`; `deliver` rejects non-`verificado`; `cancel` accepts `creado`/`verificado`, rejects `entregado` → `InvalidOrderStateError`; `entregado` terminal | domain + infra-db / vitest + jest |
| `deliveryMode` REQUIRED: missing/invalid value → `InvalidOrderError` (domain) / 400 (api); both `recogida` and `domicilio` take the direct `verificado→entregado` path in this slice | domain / vitest + api / jest |
| Later `appendRate` does NOT move a `verificado` order's total (freeze) | infra-db / jest |
| Seed idempotency: run twice → demo orders exist exactly once | infra-db / jest |
| CRUD + `POST /:id/confirm`/`/deliver`/`/cancel`; `InvalidOrderError`→400, `InvalidOrderStateError`/`RateNotFoundError`/`InsufficientStockError`/`NegativeStockError`→409; `DELETE` soft-deletes; unknown→404 | api-salesops / **jest** + e2e |

- infra-db + api jest runs need `NODE_OPTIONS=--experimental-vm-modules` (Prisma WASM).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Reserve/consume leaves partial stock state across a transition | Med | Each transition is ONE `$transaction` sharing the infra tx helpers (decision #7/#8); any guard failure rolls back all reservations/`sale_out` + order state |
| Extending shipped inventory (`IStockLevelRepository` write methods) regresses the inventory suite | Med | Additive only — read methods + shipped specs untouched; new reserve/release specs added; boundary `--max-warnings 0` still enforced (port stays Prisma-free) |
| `deliver` trips an invariant by consuming `onHand` before releasing `reserved` | Low | Ordering ADR (decision #4): release ALWAYS precedes `sale_out`; test asserts intermediate `available >= 0` |
| Cross-currency sale silently uses 1×1 when a rate is missing | Med | `convertirEntreMonedas` cross-currency path throws `RateNotFoundError` → STOPS; domain + e2e scenario |
| Same-currency `convertir` reorder regresses the green suite | Med | New branch only; existing tests keep a rate present; new scenario for the no-rate 1×1 case |
| EUR line in an MN order needs two rates; single `rateApplied` per line | Med | Frozen `lineTotalOrder` is authoritative; `rateApplied` stamps origen-side provenance (documented) |
| Rate change recomputes a verified order | Low | Freeze-at-`verificado`; snapshot read-only; test asserts a later rate append does not move the total |
| Split-payment sum drifts from `Order.total` | Med | Factory invariant `Σ amountInOrderCurrency === total`; mixed-channel test |
| `Order` writes stock rows directly (cross-aggregate leak) | Low | Only via `applyStockMovementTx`/`applyReservationTx`/inventory ports; `rg` guard asserts no direct `stock_level`/`stock_movement` writes in `ventas/` |
| Boundary leak (domain → infra) | Low | `backend-boundaries` `--max-warnings 0`; the Prisma `tx` never enters a domain port (decision #7) |
| Scope creep (Delivery states / commission / refunds / tax / gateways / reservation-expiry) | Med | Explicit module boundary (ADR #11/#16): Delivery owns `despachando`/`transportando`, Gestores owns commission; `entregado` terminal; reserve/consume IN scope but **devolución (return/refund after `entregado`) DEFERRED**; no reservation-expiry timer |

## Open questions

- [x] Aggregate persistence boundary? → **one `$transaction`/`include`** (decision #1).
- [x] Same-currency `convertir` fix — branch or param? → **new branch** (decision #5).
- [x] Line conversion helper signature? → **`convertirEntreMonedas(rates, origen, monedaDestino, at)`** (decision #6).
- [x] Stock bridge model? → **Option A reserve & consume, owner-locked** (decision #4).
- [x] Where do reserve/release live, Prisma-free? → **`IStockLevelRepository` write methods + infra-only `applyReservationTx` shared tx helper** (decision #7).
- [x] Stock reversal on `cancel` from `verificado`? → **RELEASE the reservation** (`reserved -= qty`); no longer deferred (decision #8).
- [ ] Seed shape/count — recommend 4 demo orders (single-currency, mixed USD/MN, one split-payment, one credit sale); owner may adjust (non-blocking).
- [ ] `deliver` (`verificado → entregado`) consumes stock (release + `sale_out`) and stamps `deliveredAt`; when Delivery ships, `domicilio` orders route through `despachando`/`transportando` first. Confirm the direct pickup path is acceptable for both modes now (non-blocking).

## Deferred: devolución (return/refund after `entregado`)

`entregado` is TERMINAL this slice. Cancelling an ALREADY-delivered order (compensating
`onHand += qty` movement + money refund of payments/`SaleCredit` at the frozen rates) is
**out of scope** — designed separately in `docs/plans/ventas-devoluciones-flujo-diferido.md`.
Reserve/consume (Option A) covers `creado→verificado→entregado` and both cancel paths; the
return flow is a distinct future transition off the terminal state.

## Next step

`sdd-tasks` once the spec is also ready — break this into ordered, testable work units
(domain entities + `createOrder` + port + errors → currency tweaks → **inventory extension:
`IStockLevelRepository.reserve`/`release` + `InsufficientStockError`** → barrel → schema/
migration + `applyStockMovementTx` extraction + `applyReservationTx` + extended
`PrismaStockLevelRepository` + `PrismaOrderRepository` (create/find/confirm/deliver/cancel)
+ seed → `VentasModule`/endpoints (confirm/deliver/cancel) + e2e → cross-cutting
`rg`/boundary verification), respecting the three-runner TDD map.
