# Proposal: Ventas Module — Order aggregate with multi-currency + split payments

## Intent

Ventas is the next **CAPA BASE** module of the salesops backend
(`docs/plans/estrategia-backend-por-modulos.md`), landing after the shipped
Currency → Products → Inventario → Clientes slices. Today the "sale" in the domain is
an **orphan scaffold**: `packages/domain/src/models/order.ts` + `sale-credit.ts` carry
`number`-money and `client: string`, reference nothing, and are DEAD CODE. That scaffold
cannot reference a real `Customer`/`Product`/`Warehouse` (all shipped), cannot express a
sale in more than one currency, and cannot record a real-world split payment.

This change promotes that scaffold into a real **`Order` aggregate root** built FRESH in
`packages/domain/src/ventas/`, referencing Customer/Product/Warehouse **by id + snapshot**,
supporting **multi-currency products** (USD/EUR/MN), a **derived order currency**, and
**combined multi-channel payments** with **frozen exchange-rate snapshots** — mirroring the
shipped Clientes/Inventario slices end-to-end (pure domain behind ports → Prisma → thin REST
→ seed). The domain model is owner-LOCKED (Engram `sdd/backend-ventas/domain-model`, #1393);
this proposal does not re-open it.

## Scope

### In Scope
- **Domain** (`@store-mgmt/domain/src/ventas`): fresh module mirroring `customer/`,
  `inventory/`, `product/`.
  - **`Order`** aggregate root: `id`, `customerId` + `customerName` (snapshot), `warehouseId`,
    `currency` (**DERIVED** — any USD line → USD, else MN; EUR never becomes order currency),
    `status`, derived `subtotal`/`discountTotal`/`total` (Money in order currency), `orderDate`,
    `active` (soft-delete), timestamps, and freeze fields stamped at `verificado`.
  - **`OrderLine`** (owned child): `productId`, `productName`+`categoryName` (snapshot),
    `price` (Money, product-native currency), `percentDiscountPrice`+`discountPrice` (bigint
    scale-2), `quantity`, `unitFinalPrice` (recompute via `product/pricing.ts` `finalPrice`),
    `lineTotalNative`, `rateApplied` (bigint scale-6)+`rateEffectiveFrom`, `lineTotalOrder`
    (Money in order currency, frozen).
  - **`OrderPayment`** (collection, split payment): `channel` (`PaymentChannel`), `amount`
    (Money in `CHANNEL_CURRENCY[channel]`), `rateApplied`+`rateEffectiveFrom` snapshot,
    `amountInOrderCurrency`. Invariant: `sum(amountInOrderCurrency) === Order.total`.
  - **`SaleCredit`** (0..1, credit sales only): `id`, `orderId` FK, `customerId` FK (replaces
    legacy `client: string`), `total`+`paid` (Money in order currency), derived `isPaid`,
    `paidDate`, `paidType`, frozen rates.
  - `createOrder` factory with invariants (derived currency, line recompute, payment-sum),
    port `IOrderRepository` + `ORDER_REPOSITORY` Symbol + list filter + named errors
    (incl. `RateNotFoundError`), barrel.
- **Conversion rules (LOCKED)**: same-currency (USD→USD etc.) = use a rate if one exists,
  else 1×1 identity; cross-currency = **must** have a rate, else STOP the sale + notify + log
  (`RateNotFoundError`), NEVER 1×1.
- **Freeze pattern** ("Tasas RESUELVE, Ventas CONGELA"): at status `verificado`, stamp
  `channel` + `rateApplied` + `effectiveFrom` + resulting Money; verified orders never recompute.
- **Stock effect**: at confirm, `Order` emits `StockMovement(type=sale_out)` per line via the
  existing `IStockMovementRepository.record` (atomic, race-free) — Order NEVER writes stock rows
  directly (cross-aggregate eventual consistency).
- **Persistence** (`infra-db`): Prisma `Order`/`OrderLine`/`OrderPayment`/`SaleCredit` models
  (FK relations both sides, soft-delete via `active`), `PrismaOrderRepository`, seed.
- **Delivery** (`api-salesops`): thin `VentasModule` REST CRUD mirroring `CustomerModule`;
  `InvalidOrderError → 400`, `RateNotFoundError → 409/422`, `DELETE` soft-deletes.
- **Money VO everywhere** (bigint minor units, never float/`number`).

### Out of Scope (DEFERRED)
- Payment **gateways** (payments-as-integration) — `OrderPayment` records a channel, does not call out.
- **Refunds / returns** workflow.
- **Tax** engine.
- **Promotions** engine (beyond the existing per-line percent/absolute discount).
- **Invoice / receipt** documents.
- **Stock reservation** lifecycle — MVP does **immediate deduction** at confirm.
- **Rewiring the orphan** `models/order.ts` / `sale-credit.ts` — superseded; we build fresh in
  `ventas/` and do NOT touch or import the orphans.

## Capabilities

### New Capabilities
- `salesops-ventas`: `Order` aggregate (root + owned `OrderLine` + `OrderPayment` collection +
  `SaleCredit` 0..1) with derived order currency, LOCKED conversion rules, freeze-at-`verificado`
  snapshots, split multi-channel payments, `sale_out` stock effect via the existing movement port,
  Prisma persistence, thin REST CRUD and a demo seed. Distinct from `salesops-customers`,
  `salesops-inventory`, `salesops-products`, `salesops-currency`, `salesops-mvp`.

### Modified Capabilities
- `salesops-currency`: two REQUIREMENT-level tweaks to the conversion machinery (see
  Decided Boundaries): `convertir` must consult a rate for same-currency before falling back to
  1×1, and a **channel-less currency→currency** helper (`convertirEntreMonedas`) is required for
  LINE conversion (product-currency → order-currency, no `PaymentChannel`). Confirm/finalize at spec.

## Decided Architectural Boundaries (LOCKED — do not re-open)

- **Products are multi-currency now** (price + selectable Currency USD/EUR/MN). `Product.price`
  is already a Money VO; the MVP doc "precio en USD" (`docs/plans/reference/05-exchange-rates.md`)
  is STALE — fix the doc, do not limit the model.
- **`Order.currency` is DERIVED, not selected**: any USD line → USD; else MN. EUR converts
  (to USD if a USD line exists, else to MN) and NEVER becomes the order currency.
- **Payment is COMBINED/split**: multiple `PaymentChannel` per order, modeled as an
  `OrderPayment` collection (NEW vs. legacy one-channel-per-order).
- **Snapshots, not live joins**: `customerName`, `productName`, `categoryName`, prices and rates
  are frozen onto the order; master-data edits never mutate historical orders.
- **`Order` never writes stock rows** — it emits `sale_out` movements through
  `IStockMovementRepository.record`; stock is an eventually-consistent sibling aggregate.
- **No `createdBy`** field until a future Usuarios module (only append-only logs carry it, null today).
- **Soft-delete** via `active` (never hard DELETE), to not orphan `OrderLine`/`Payment`/`SaleCredit` FKs.

## Open Technical Items — carry into spec/design

| # | Item | Recommendation (needs confirmation) |
|---|------|-------------------------------------|
| 1 | **Same-currency `convertir` short-circuit** | `currency/rate-resolver.ts` `convertir` currently returns pure 1×1 identity for same-currency WITHOUT consulting a rate. Per the LOCKED rule it must consult a rate first (use it if present, else 1×1). Adjust at spec/design time; guard existing currency tests. |
| 2 | **Channel-less line conversion helper** | `convertir` requires a `PaymentChannel`; LINE conversion (product-currency → order-currency) has none. `resolveRateForCurrency` exists internally — confirm/expose a `convertirEntreMonedas(rates, origen, monedaDestino, at)` for line freezing. |
| 3 | **Seed shape** | Seed a small set of demo orders (single-currency + mixed USD/MN, one split-payment, one credit sale) idempotent on a stable key. Confirm count/shape at spec. |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/domain/src/ventas/` | New | `Order`/`OrderLine`/`OrderPayment`/`SaleCredit` entities + `createOrder` factory + `IOrderRepository` port + errors (incl. `RateNotFoundError`) + tests + barrel |
| `packages/domain/src/index.ts` | Modified | Add `export * from './ventas/index.js';` after the `customer` line |
| `packages/domain/src/currency/rate-resolver.ts` | Modified | Same-currency consults a rate first; add/confirm channel-less `convertirEntreMonedas` |
| `packages/infra-db/prisma/schema.prisma` | Modified | Add `Order`/`OrderLine`/`OrderPayment`/`SaleCredit` models + additive migration |
| `packages/infra-db/src/ventas/` | New | `PrismaOrderRepository` + seed |
| `apps/api-salesops/src/ventas/` | New | `VentasModule` REST CRUD + DTOs + e2e |
| `packages/domain/src/models/order.ts`, `sale-credit.ts` | **Untouched** | Orphan scaffold stays dead — build fresh, do NOT rewire |
| `docs/plans/reference/05-exchange-rates.md` | Modified | Correct stale "precio en USD" to multi-currency |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cross-currency sale silently uses 1×1 when a rate is missing | Med | LOCKED rule + spec scenario + test: cross-currency with no rate throws `RateNotFoundError`, STOPS the sale, logs/notifies |
| Same-currency `convertir` tweak regresses existing currency tests | Med | Adjust `convertir` behind existing green currency suite; add scenario for same-currency-with-rate vs. 1×1 fallback |
| Rate change recomputes an already-verified order | Low | Freeze-at-`verificado`: stamped rate/Money is read-only; test asserts a later rate append does not move a verified total |
| `Order` writes stock rows directly (cross-aggregate leak) | Low | Stock effect only via `IStockMovementRepository.record`; `rg` guard asserts no Prisma stock writes in `ventas/` |
| Split-payment sum drifts from `Order.total` | Med | Factory invariant `sum(amountInOrderCurrency) === total`; test with mixed-channel payments |
| Scope creep into refunds/tax/gateways | Med | Explicit out-of-scope; deferred list is the guard |
| Boundary leak (domain → infra) | Low | `backend-boundaries` lint `--max-warnings 0`, mirroring Customer/Product |

## Rollback Plan

Self-contained on branch `salesops-ventas`: revert the branch. The `Order`/`OrderLine`/
`OrderPayment`/`SaleCredit` Prisma models are additive — drop the migration. The
`currency/rate-resolver.ts` tweak is the only edit to shipped code and is guarded by the existing
currency suite; revert it independently if needed. Untouched Customer, Product, Currency, Inventory
modules, the orphan scaffold, and `@store-mgmt/domain` exports remain intact.

## Dependencies

- Shipped Clientes/Inventario/Products/Currency slices as reference hexagonal impls and as the
  referenced aggregates (`ICustomerRepository`, `IProductRepository`, `IWarehouseRepository`,
  `IStockMovementRepository`, `ICurrencyRepository`/`convertir`).
- Backend base scaffold (`api-salesops`, `infra-db`, docker Postgres).
- Owner confirmation on Open Technical Items #1–#3 before spec finalizes conversion + seed.

## Success Criteria

- [ ] `Order` aggregate (root + `OrderLine` + `OrderPayment` + `SaleCredit`) with `createOrder`
      factory invariants — derived currency, line recompute, payment-sum — passing TDD (RED→GREEN).
- [ ] Conversion: same-currency consults a rate (else 1×1); cross-currency without a rate throws
      `RateNotFoundError` and STOPS the sale; channel-less line conversion helper in place.
- [ ] Freeze-at-`verificado`: rate/Money stamped; a later rate append does not recompute a verified order.
- [ ] Stock: confirm emits `sale_out` via `IStockMovementRepository.record`; no direct stock writes.
- [ ] Prisma models + `PrismaOrderRepository` persist/read against Postgres; FK both sides; soft-delete.
- [ ] `VentasModule` REST CRUD: invariant violation → 400, `RateNotFoundError` → 409/422, `DELETE` soft-deletes.
- [ ] Seed creates demo orders (single + mixed currency, split payment, credit sale) idempotently.
- [ ] Money VO everywhere (no float/`number`); domain imports ports, never Prisma; `backend-boundaries` green.
- [ ] Orphan `models/order.ts` / `sale-credit.ts` untouched (`rg` verified).
