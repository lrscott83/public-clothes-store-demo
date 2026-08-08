# Research: sales-agents-commissions (`gestor` + comisiones)

> **RESEARCH ONLY.** No design chosen, no proposal written. This document supersedes the
> framing of `explore.md`, which modelled the gestor as passive attribution data.
> Engram twin: `sdd/sales-agents-commissions/research`.

## 0. The owner's definition (ground truth)

> "El gestor es alguien que usando un cliente registra una venta en un almacén según la
> disponibilidad de los productos. El gestor no está atado a ningún almacén."

Decomposed into four testable consequences:

| # | Consequence | Status against the codebase |
|---|---|---|
| C1 | The gestor is an **actor that performs a write** (registers a sale) | No actor is recorded on `Order` today at all — `createdBy` was deliberately deferred |
| C2 | The gestor is **NOT scoped to a warehouse** | The exact inverse of `WarehouseOperator` (`userId` → one `warehouseId`) |
| C3 | The gestor **picks the warehouse by availability** | No cross-warehouse availability read exists over HTTP; `POST /orders` accepts `warehouseId` blind |
| C4 | The gestor acts **"using a customer"** | `Customer` requires a 1:1 `userId` — a customer is itself a login identity |

C3 is the finding with the widest blast radius and the one `explore.md` missed entirely.

---

# PART A — Internal sources

## A1. How stock/availability works today

**`StockLevel`** — `templates/packages/domain/src/inventory/stock-level.ts:12-20`

```ts
export interface StockLevel {
  readonly id: string; readonly productId: string; readonly warehouseId: string;
  readonly onHand: number; readonly reserved: number; ...
}
```

- Unique per `(productId, warehouseId)` (doc comment `stock-level.ts:5-11`; Prisma model at
  `templates/packages/infra-db/prisma/schema.prisma:128`).
- `available` is **never stored** — derived by the pure `availableStock(level) = onHand - reserved`
  (`stock-level.ts:71-73`). Same anti-contradictory-state discipline as `Product.finalPrice`.
- A missing `(productId, warehouseId)` row means **zero stock**, never an error
  (`stock-level-repository.port.ts:20-31`). Rows are lazily created on first movement, not seeded.
- DB invariant `CHECK (reserved <= on_hand)`, **immediate** (migration
  `20260723000000_stock_level_reserved_le_onhand`, documented at
  `docs/plans/ventas-follow-ups-pendientes.md:56-65`). Consequence: reserved stock can never be
  drained out-of-band by an `adjustment_out`.

**Does a "find me a warehouse that can fulfil this basket" query exist? NO — but the port already
supports half of it.**

`IStockLevelRepository.list(filter?: StockLevelListFilter)` where
`StockLevelListFilter = { productId?, warehouseId? }`
(`stock-level-repository.port.ts:3-7, 35`). Filtering by `productId` **alone** returns every
warehouse's row for that product — i.e. the cross-warehouse read is expressible at the port today.

It is **dead code at the application layer**: `rg -n "stockLevelRepository\.list"` over
`templates/` returns **zero call sites**. `StockService`
(`templates/apps/api-salesops/src/stock/stock.service.ts:44-50`) exposes only `getLevel(productId,
warehouseId)` — a single pair. There is no HTTP route that lists levels.

**Cost of the basket query.** With the existing port, `N` lines → `N` calls to `list({ productId })`,
then intersect the warehouse sets and compare `availableStock(level) >= line.quantity` per line.
That is `N` indexed queries; a single `IN (...)` variant would be one query but needs a new port
method. Neither is expensive — the gap is **surface, not performance**.

**What `createOrder` requires about the warehouse today: nothing but the id.**

- DTO: `warehouseId!: string` (`templates/apps/api-salesops/src/sales/dto/create-order.dto.ts:42`) —
  a plain required string, alongside `customerId`/`customerName`/`deliveryMode`/`lines`.
- Domain factory `createOrder` (`templates/packages/domain/src/sales/order.ts:92-167`) validates:
  at least one line (`:93-95`), a valid `deliveryMode` (`:96-100`), and the payment-sum invariant
  `Σ payments.amountInOrderCurrency === total` (`:137-145`). It **copies `input.warehouseId`
  straight through** (`:151`). It never sees a stock repository — it cannot, it is pure.
- `OrderService.create` (`order.service.ts:69-104`) loads exchange rates, builds the aggregate,
  persists. **No stock repository is injected into the Sales module at all.**

**Stock is first consulted at `confirm`, not at `create`.**
`PrismaOrderRepository.confirm` (`templates/packages/infra-db/src/sales/prisma-order.repository.ts:339-360`)
opens a transaction, loops the lines, and calls `applyReservationTx(..., 'reserve')` per line,
throwing `InsufficientStockError` (mapped to 409 by the controller,
`order.controller.ts:235-242`). `deliver` (`:362-395`) releases **before** `sale_out` —
load-bearing ordering. `cancel` from `verified` releases (`:397-420`).

**So: an order can be created today naming a warehouse that cannot fulfil it. It fails later, at
confirm, with a 409.** For a gestor who "picks the warehouse by availability", that is the
single most consequential gap.

## A2. The current order-creation flow, end to end

```
POST /orders
  └─ OrderController.create (order.controller.ts:95-106)
       @Controller('orders') @UseGuards(JwtAuthGuard, RolesGuard)
       @Roles(owner, admin, sales_operator)                       ← class-level, :87
       · assertCurrency() per line.price                          ← :98-100
       · assertChannel() + assertCurrency() per payment           ← :101-104
       └─ OrderService.create (order.service.ts:69-104)
            · fetchAllRates(at) over all 5 PaymentChannels        ← :160-165
            · map DTO → CreateOrderInput                          ← :73-97
            · createOrder(buildInput, rates, at)   [PURE DOMAIN]  ← :101
            · orderRepository.create(order)        [DUMB PERSIST] ← :102
```

- **Aggregate invariants** (`order.ts:92-167`): ≥1 line; valid `deliveryMode`; payment-sum equality.
  `currency` is **derived** (any USD line ⇒ `USD`, else `MN`, `order.ts:102-104`) — never accepted.
  `subtotal`/`discountTotal`/`total` are always recomputed from lines (`:111-128`); a client-supplied
  `total` is documented as IGNORED (`:60-64`).
- **Repository is a dumb persister** — explicitly, `order.service.ts:43-52`: "the repository is a
  dumb persister, never a second source of invariants".
- **Which actor is assumed to be creating it?** `sales_operator` — whose Spanish label is
  `'Operador de gestores'` (`roles.ts:28`), i.e. the *supervisor of gestores*, not a gestor. There is
  **no `createdBy`/actor field on `Order`** (`order.ts:39-58`; `schema.prisma:239-264`), deliberately:
  `openspec/changes/archive/2026-07-22-backend-ventas/proposal.md:96` — *"No `createdBy` field until a
  future Usuarios module"*.
- **Warehouse: supplied by the caller, never derived.** Contrast `currency`, which the same aggregate
  explicitly derives. `PATCH /orders/:id` can even *change* `warehouseId` while the order is still
  `created` (`order.service.ts:106-121`, `:115`) with no stock re-check.

## A3. What `WarehouseOperator` scoping actually does

**The entity** — `templates/packages/domain/src/users/warehouse-operator.ts:7-12`

```ts
export interface WarehouseOperator {
  readonly userId: string;     // PK and FK, 1:1 with User
  readonly warehouseId: string; // deliberately NOT unique — N operators per warehouse
  ...
}
```
Prisma model at `schema.prisma:389`. Factory has **no invariants beyond required fields**
(`warehouse-operator.ts:22-31`).

**The enforcement is entirely in controllers, per-route, hand-written.** There is no guard, no
interceptor, no repository-level filter.

`OrderController` (`order.controller.ts:188-226`):
- `isScopedWarehouseOperator(user)` (`:219-226`) is `true` **only** when the caller holds
  `warehouse_operator` and holds *none* of `owner`/`admin`/`sales_operator`. Owner/admin/sales_operator
  see everything unfiltered.
- `assertOrderWarehouseScope` (`:193-201`) → `findByUserId(user.id)`, compare `operator.warehouseId`
  to the order's, else `403 Not scoped to this warehouse`.
- `scopeToOperatorWarehouse` (`:204-216`) filters the **already-fetched** list in memory; no operator
  row ⇒ empty array.

`StockController` (`stock.controller.ts:53-103`) does the same via `assertWarehouseScope` (`:92-103`),
with a different short-circuit: owner/admin bypass; everyone else must match.

**What "the inverse" concretely means for a gestor.** Four distinct properties, and they are
independent — worth separating before designing:

| Property of `warehouse_operator` | Inverse for `sales_agent` |
|---|---|
| Has a `WarehouseOperator` scope row (`userId → warehouseId`) | Has **no** scope row of that kind |
| Reads are **narrowed** to one warehouse | Reads must be **widened** to all warehouses (for availability) |
| Writes act **on** a warehouse's floor (`deliver`) | Writes act **across** warehouses (`create` naming any) |
| `warehouseId` on the order is a **filter** | `warehouseId` on the order is a **choice the agent makes** |

Note the asymmetry: "not scoped" is not the same as "unrestricted". The gestor may still need to be
scoped along a *different* axis (e.g. their own orders) — nothing in the code or docs says so today.

## A4. Existing cross-warehouse reads and their authorization

**Backend: essentially none, and the one that exists is closed to `sales_operator`.**

| Surface | Cross-warehouse? | Roles |
|---|---|---|
| `GET /stock?productId&warehouseId` (`stock.controller.ts:63-71`) | **No** — one pair | `owner, admin, warehouse_operator` (`:55`) — **`sales_operator` is NOT on this list** |
| `POST /stock/movements` (`:73-84`) | No | same three |
| `GET /orders` (`order.controller.ts:108-113`) | Yes for owner/admin/`sales_operator`; filtered for a plain operator | `owner, admin, sales_operator, warehouse_operator` (`:109`) |
| `GET /orders/:id` (`:115-127`) | same | same (`:116`) |
| `GET /warehouses` (`warehouse.controller.ts`) | Lists warehouses, **no stock** | — |

So today: **`GET /orders` is cross-warehouse for the sales side; stock is not readable by the sales
side at all.** A `sales_operator` calling `GET /stock` gets 403 from `RolesGuard` before any scoping
logic runs. Whatever the gestor turns out to be, it needs a stock read surface that does not exist.

**MVP: yes, and it is the model.** `templates/apps/salesops-mvp/app/domain/availability.ts:14-27`:

```ts
export function eligibleWarehouses(cart, inventory, warehouses): Warehouse[] {
  return warehouses.filter((warehouse) =>
    cart.every((line) => {
      const entry = inventory.find(
        (item) => item.warehouseId === warehouse.id && item.productId === line.productId,
      );
      return entry !== undefined && entry.quantity >= line.quantity;
    }),
  );
}
```

Whole-basket, single-warehouse eligibility. Tested at `app/domain/__tests__/availability.test.ts`.
This is exactly C3, already written down and shipped in the prototype — and **`explore.md` never
mentions this file**.

The MVP had no authorization at all (`docs/plans/reference/06-mvp-requirements.md:7`: *"Sin
autenticación ni autorización."*), so it says nothing about who is allowed to run it.

## A5. What the MVP's gestor flow actually looked like

Route inventory (`app/routes.ts:1-16`): `/`, `/pedidos/nuevo`, `/operador-gestores`,
`/operador-almacen`, `/tasas`, `/inventario`, `/decisiones`, `/finanzas`, `/dev-commissions`.

**The gestor entity** — `app/domain/types.ts:14-18`: `Gestor = { id, name, phone? }`.
Seeded as 5 named individuals (`app/seed/constants.ts:22-28`). `Order.gestorId: string`
(`types.ts:61-67`) — one gestor per order, **order-level**, never line-level; `OrderItem`
(`types.ts:39-44`) has no gestor field.

**The order-creation wizard (`/pedidos/nuevo` → `routes/pedidos-nuevo.tsx`), step by step:**

1. **Identity**: hardcoded. `pedidos-nuevo.tsx:25-26`:
   `// MVP has no auth: the wizard header shows the fixed demo gestor persona.` /
   `const GESTOR = GESTORES[0];`. Header prints `Gestor: {GESTOR.name}` (`:158`); the id is passed to
   `createOrder(..., gestorId: GESTOR.id, ...)` (`:105`). **There is no gestor dropdown.** The gestor
   is the *operator of the wizard*, a persona — not a field someone selects. This is the strongest
   internal corroboration of C1.
2. **Step `carrito`** (`components/pedido/cart-step.tsx`): product grid + search over the **full
   catalog**, zero reference to inventory or warehouse. Stock is *not* consulted while adding items.
3. **Step `cliente`** (`components/pedido/client-step.tsx`):
   - `eligible = eligibleWarehouses(cart, inventory, warehouses)` (`pedidos-nuevo.tsx:58`).
   - Auto-selects the first eligible warehouse (`:129-133`).
   - Renders **only eligible warehouses** as buttons under the label "Almacén de despacho"
     (`client-step.tsx:55-83`); if `eligible.length === 0`, a red *"Ningún almacén tiene stock
     suficiente para cubrir este pedido."* and creation is blocked.
   - Customer: **synthesized fresh every time**, no lookup — `pedidos-nuevo.tsx:86-92` builds a
     `Client` with a timestamp id from name/phone/address/deliveryMode. There is no existing-customer
     picker.
4. `createOrder` (`store/seed-store.ts:86-115`) appends with `state: 'creado'`, freezes an exchange
   rate snapshot for non-USD payment; **`commissionMN` is deliberately left unset** (`:82-85`).

**`operador-gestores` route** — the *supervisor* board, not the gestor's. `routes/operador-gestores.tsx`
renders a kanban with `GestorOrderCard`
(`components/tablero/operador-gestores/gestor-order-card.tsx:69-111`):
- **Detalles** (always) → read-only popup.
- **Aceptar** (only `state === 'creado'`, `:83`) → `verifyOrder` (`seed-store.ts:142-155`):
  `creado → verificado`, freezes rate + totals **and** `commissionMN = sumOrderCommission(items)`.
- **Pagar Comisión** (only `state === 'entregado'`, `:97`) → `markCommissionPaid`
  (`seed-store.ts:199-208`): `entregado → comision_pagada`, stamps `commissionPaidAt`, and is
  documented to NOT touch `exchangeRateSnapshot`/`totalMN`/`commissionMN` (`:193-198`).

**MVP state machine** (`types.ts:59`): `'creado' | 'verificado' | 'transportando' | 'entregado' |
'comision_pagada'` — 5 states, linear, no cancel state. The backend's is 4 states with `delivered`
terminal and a `cancelled` branch (`order.ts:28`, `:187-205`). They are **not** the same machine;
`comision_pagada` and `transportando` have no backend counterpart, and `cancelled` has no MVP one.

**Commission calculation** (`app/seed/commission-map.ts`, resolution order at `deriveCommission:135-147`):
1. **bundle-sum** — product name containing `" + "` is split on the separator, each segment resolved
   independently, results summed (`:136-144`).
2. **keyword** — `KEYWORD_COMMISSIONS`, 41 ordered entries (`:36-93`); name normalized (NFD
   accent-fold, lowercase, punctuation→space, `:20-28`); **first** entry whose keyword is a substring
   wins. Order is load-bearing and the file says *"NEVER sort/reorder"* (`'lavadora semi'` must precede
   `'lavadora'`).
3. **category-default** — `CATEGORY_DEFAULTS` by `categoryId` (`:96-108`).
4. **catch-all** — `CATCH_ALL = 1000` (`:111`).

Resolved **once at seed-build time** onto `SeededProduct.commissionMN`
(`seed/enrich-products.ts:11-26`), copied onto each `OrderItem.commissionMN` when the cart is built
(`pedidos-nuevo.tsx:74-82`), summed by
`sumOrderCommission(items) = Σ item.commissionMN * item.quantity` (`enrich-products.ts:32-34`),
and **frozen onto `Order.commissionMN` at `verificado`**, never recomputed on read
(`domain/verify.ts:16-22`; dashboards read `order.commissionMN ?? 0`).

**Gestor-facing aggregations**, both gated by `orders.filter(o => o.state !== 'creado')`:
- `GestorRanking` (`components/decisiones/gestor-ranking.tsx`, data `domain/decisiones-dashboard.ts:204-217`):
  per gestor `revenueUSD`, `count`, `aovUSD`, `commissionEarnedMN`, `commissionPendingMN`.
- `GestorCommissionTable` (`components/finanzas/gestor-commission-table.tsx`, data
  `domain/finanzas-dashboard.ts:253-274`): `commissionPendingMN`, `commissionPaidMN`,
  `takeRatePercent`, `roi`.
- "Pending" predicate (`finanzas-dashboard.ts:24, 30-32`):
  `commissionPaidAt == null && state ∈ {verificado, transportando, entregado}`.
- **Neither joins a warehouse dimension.**

**Is the gestor ever tied to a warehouse in the MVP? No — and the asymmetry is deliberate.**
`Gestor` has no `warehouseId` (`types.ts:14-18`). In seed generation the warehouse
(`seed/generate.ts:149`) and the gestor (`:197`) are drawn from **independent** PRNG rolls with zero
correlation. By contrast `Transportista` **does** carry a region tie via `zona`
(`types.ts:20-25`, `seed/constants.ts:30-34`, e.g. `zona: 'Pinar del Río'` matching a warehouse name).
So the prototype scoped transportistas geographically and left gestores unscoped — direct
corroboration of C2.

## A6. Business reference docs

- `01-business-context.md:6` — the business *"vende a través de gestores de ventas"*, operates
  **3 warehouses**; `:19` *"Dan comisiones a los gestores por las ventas realizadas."*
- `02-sales-process.md:12` — manual step 8: *"Entregan la comisión al gestor."*
  `:25-29` — actors who can insert a sale: **gestores de ventas, los propios clientes, los usuarios
  del mismo almacén.** Three distinct actor classes; the gestor is one of them. This is the doc-level
  statement of C1, and it also names the customer as a *self-service* actor — a fourth thing the
  backend does not model.
  `:19-22` — what must be controlled includes *"El pago de comisiones a los gestores"*.
- `03-order-format.md:24-29` — the paper WhatsApp form's gestor block: **Tipo de venta, Nombre del
  gestor, Teléfono (del gestor), Comisión, Tarjeta.** Two unmodelled fields here: `Tipo de venta`
  (sale type) and `Tarjeta` (card). The gestor is captured **by name + phone**, matching the MVP's
  `{name, phone}` shape.
- `04-commissions.md` — the authoritative table: flat **MN** amounts, 3 sections (combos by equipment
  count `:9-13`; ~50 individual products `:17-68`; solar components `:72-80`; energy kits `:84-96`).
  Notable: `Cable | 50 por metro` (`:77`) is **per-unit-of-measure**, not per-item — the only entry
  that does not fit a flat-per-line model. Combos are keyed by *quantity of equipment*
  (1-2 → 3000, 3-5 → 4000, 6-7 → 5000) — a **tier**, which the MVP explicitly ignored
  (`openspec/specs/salesops-mvp/spec.md:116-117`: *"ignoring combo/quantity tiers"*).

## A7. Archived changes and specs — what is locked

**Commission is already specified as NOT an Order concern.** This is the single most important
constraint, and it is locked in three places:
- `openspec/specs/salesops-ventas/spec.md:91-94`: *"commission is NOT an Order concern. Sales freezes
  ONLY `rate + totals` at `verified`; commission accrual is a separate future Gestores-module entity
  with its own `creada → pagada` lifecycle, not an order field or status."*
- `openspec/changes/archive/2026-07-22-backend-ventas/design.md:381` (ADR-16): *"folding it into the
  order would couple two module boundaries and contradict the locked decomposition."*
- `openspec/specs/salesops-products/spec.md:154-156`: *"`Product` MUST NOT carry any commission-related
  field... owned by a separate future Gestores/Comisiones module and read only through a port."*
  Implemented as the documented seam `templates/packages/domain/src/product/commission-seam.md:23-38`,
  which pre-names `ICommissionReferenceProvider.commissionFor(productId): Promise<Money | undefined>`
  and insists on `undefined` (never a silent `0`) when the module is absent.

**Commission liability framing is locked owner→gestor.**
`openspec/changes/archive/2026-07-14-salesops-12-commission-liability/exploration.md:11-15`: *"The only
debt flows owner → gestor... becomes a payable (owner's liability) when the sale's delivery is
completed (`entregado`)."* And `spec.md:134-140`: *"The only liability the app MAY present is the
owner's commission payable to gestores."* Never a customer receivable.

**The `gestor` role is an explicit, tested non-goal today.**
`openspec/specs/salesops-identity/spec.md:287-289` lists it under *"MUST NOT be implemented"*, with a
scenario at `:216-220`: *"GIVEN the roles bitmask enum / WHEN inspected / THEN no `gestor` role bit is
defined."* **Adding the bit therefore requires amending an existing passing spec scenario**, not just
adding one. `openspec/changes/backend-users-roles/proposal.md:69` is where it was deferred:
*"`gestor` role → future Gestores+Comisiones module (additive bit later)."*

**Warehouse-operator scoping is spec'd as a hard denial of cross-warehouse reads.**
`openspec/specs/salesops-identity/spec.md:262-285`: *"Role-scoped reads/actions for that user MUST be
filtered to that `warehouseId`"*, scenario: *"only `W1` data is returned, never another warehouse's."*

**Availability at order creation was spec'd in the MVP and dropped in the backend.**
`openspec/changes/archive/2026-07-09-salesops-03-crear-pedido/spec.md:98-105`: *"The Almacén step MUST
list as selectable only warehouses that fully cover the cart... If zero warehouses qualify, order
creation MUST be blocked."*
Versus `openspec/specs/salesops-ventas/spec.md:11-25`, where `warehouseId` is a plain required FK with
no derivation rule, and the only availability check is at `created → verified` (`:300-307`).
**The requirement was not refuted — it was simply not carried across the rewrite.**

**`salesops-inventory` explicitly punts availability-for-sale to the caller.**
`openspec/specs/salesops-inventory/spec.md:186-195`: *"Combining `active` and `available > 0` into an
'available-for-sale' decision is NOT part of this capability... Ventas MUST compute this itself."*
So a cross-warehouse availability read has a pre-authorized home: the sales/gestor side, not Inventory.

**Authorization model (`company-user-roles-reframe`).** `CompanyUser.role` Int bitmask keyed
`(userId, companyId)` + `status` (`company-user.ts:19-27`; `schema.prisma:429`). `JwtStrategy.validate`
(`templates/packages/api-common/src/auth/jwt.strategy.ts:84-112`) re-fetches `User` fresh, loads the
ACTIVE `CompanyUser`, and 403s with a logged `MISSING_COMPANY_USER` rather than a silent `roles: 0`
(`:99-107`). `role: 0` is a *valid* zero-permission state (`company-user.ts:44-51`) — distinct from a
missing assignment. Its two recorded design gaps (commit `8340071`): seven `userToResponseDto` call
sites not six (login/refresh also carry `roles`), and role writes had to dual-write while
`app_user.roles` still existed.

**Deferred return flow.** `docs/plans/ventas-devoluciones-flujo-diferido.md:28-46` — a return from
`delivered` needs compensating stock movement, money reversal, and probably its own `devuelto` state.
It explicitly names *"junto con Delivery/Comisiones"* (`:33`) as where it might land. Whatever
commission reversal shape is chosen must not contradict that.

**Stale doc confirmed.** `docs/system/architecture.md:152` still says *"HTTP backend | Does not exist
(client-side SPA)"*, and `:148-150` still describes `salesops-mvp` domain as pending migration. Both
are wrong: `templates/apps/api-salesops`, `templates/apps/api-idp`, `templates/packages/infra-db`,
`templates/packages/api-common` all exist. The **"¿Dónde va X?" table (`:58-74`) is still valid** and
is the part that governs where a commission module goes.

---

# PART B — External research

Verdicts are against this codebase's actual size and vocabulary, not against best practice in the
abstract.

## B1. Sales-agent / commission data modelling in mature systems

**ERPNext / Frappe — the strongest precedent, and it is a two-entity split.**
- **Sales Person** — internal, hierarchical (tree), attached to a Sales Order through a child table
  called **Sales Team** carrying **Contribution (%)**. **Not** a `User`.
  <https://docs.frappe.io/erpnext/user/manual/en/sales-persons-in-the-sales-transactions> ·
  <https://docs.erpnext.com/docs/user/manual/en/sales-person>
- **Sales Partner** — *"an external reseller, dealer, agent, affiliate..."*, explicitly for
  **non-employees**. Fields: name, partner type, territory, **commission rate**, targets, referral
  code. **No warehouse or branch link exists on it at all.**
  <https://docs.frappe.io/erpnext/sales-partner>
- Community/doc guidance: *"Use a Sales Person for internal sales-team contribution... Use a Sales
  Partner when the relationship is external."* <https://discuss.frappe.io/t/solved-sales-partner-vs-sales-person/15775>
- **Verdict: FITS as the precedent for C2.** "Commission agent, not bound to a location" is a
  first-class, named concept in a mainstream ERP, and it is deliberately *not* a login user. It is a
  real answer to "is there precedent for an agent with no warehouse?" — yes, and the precedent makes
  it master data. But ERPNext's Sales Partner has a **commission *rate*** (percentage of net total),
  not a flat per-product amount — that half does not transfer. The tree hierarchy and item-group
  targets are ceremony here.
- **Caveat that matters for C1**: neither Sales Person nor Sales Partner is the actor *entering* the
  order in ERPNext — the logged-in `User` does that, and the Sales Person is attribution laid on top.
  ERPNext therefore does **not** precedent the owner's "gestor registra la venta" framing; it
  precedents the attribution half only.

**Odoo.** `sale.order.user_id` is the salesperson and **is a system user**. Commission lives in
**Commission Plans** (`commission.plan`) with targets/achievements, and the earned record lands in a
separate **Achievements** log linked back to the source document — **not a field on the order**.
Rules can target a specific product with a flat **amount** or a percentage.
<https://www.odoo.com/documentation/19.0/applications/sales/sales/commissions.html> ·
OCA suite splitting core/settlement/salesman concerns: <https://github.com/OCA/commission>
- **Verdict: the "separate achievement record, linked to the source document, never a field on the
  order" shape FITS** and independently corroborates what `salesops-ventas/spec.md:91-94` already
  locked. Plans/targets/frequencies/achievement-ratios are **ceremony** — this business has a flat
  table, not quotas.

**Salesforce.** Opportunity Owner is a single `User`; multi-rep credit uses **Opportunity Splits**,
typed as **Revenue Split** (must total 100%, drives comp) vs **Overlay Split** (extra credit on top).
Salesforce has **no native commission engine** — the market pattern is a bolt-on (Spiff, Xactly,
CaptivateIQ).
<https://help.salesforce.com/s/articleView?id=sales.teamselling_guidelines_opp_and_opp_prod_splits.htm> ·
<https://www.salesforceben.com/salesforce-commissions/>
- **Verdict: splits are CEREMONY** (no evidence of shared credit anywhere in this business). The
  *revenue vs overlay* distinction is however a useful sanity check for one open question: if a gestor
  and a `sales_operator` both touch an order, is that shared credit or just workflow? Evidence says
  just workflow.

**Dynamics 365 Business Central.** **Salesperson/Purchaser Code** is standalone master data (not a
`User`), selected on Customer and on sales documents, carried into posted ledger entries; a commission
% sits on the Salesperson Card but is widely described as minimal, with real logic delegated to
add-ons. <https://learn.microsoft.com/en-us/dynamics365/business-central/sales-how-setup-salespeople> ·
<https://docs.nav-x.com/en/business-central/Commissions/salesperson-setup.html>
- **Verdict: FITS the "salesperson is master data, not a User" pattern** — third independent
  confirmation. Also confirms *order-level*, not line-level, attribution as the default.

**Cross-system summary for attribution shape:** three of four systems model the salesperson as
**master data decoupled from the login user**; attribution is **order-level** by default; line-level
and split attribution exist only where multiple reps genuinely share credit.

## B2. Commission lifecycle: earned → accrued → payable → paid

- Standard accounting vocabulary: **accrued** (recognized as expense + liability in the period earned,
  per the matching principle, even if unpaid) → **payable** (a liability account, "Commissions
  Payable") → **paid** (liability debited, cash credited).
  <https://www.accountingtools.com/articles/commission-expense-accounting> ·
  <https://www.qobra.co/blog/accrued-commission>
- The **recognition trigger** (contract signed / invoiced / delivered / cash collected) is documented
  as an explicit business decision written into the plan, never a technical default.
  <https://www.qobra.co/blog/accrued-commission> ·
  <https://www.qcommission.com/blog/sales-commissions-and-revenue-recognition-why-timing-creates-confusion.html>
- Documented reasons for a **separate ledger rather than a field on the order**: audit trail, partial
  payouts, batching into payroll runs, period close and restatement without touching the sale record.
  <https://www.kennect.io/post/commission-expense-accounting>
- Honest gap: no vendor publishes a column-by-column commission-ledger schema; the shape below is
  inference from the vocabulary, not a cited schema.
- **Verdict: FITS, and it validates an already-locked local decision.** The "payable when delivered"
  language matches `salesops-12-commission-liability` almost word for word. A small entry table with
  an explicit state is proportionate. **Ceremony to avoid**: period-close mechanics, GL journal
  postings, payout batches, accrual reversal entries.

## B3. Commission on cancelled / returned / unpaid orders

- Standard clawback triggers: cancellation, refund, chargeback, early termination.
  <https://www.everstage.com/sales-commission/sales-commission-clawback> ·
  <https://www.captivateiq.com/blog/sales-commission-clawbacks>
- Mechanisms, in order of how commonly recommended: (1) **negative/compensating commission line** —
  *"statements are clearer... the canceled contract appears as a negative transaction"*;
  (2) retroactive adjustment of a closed period; (3) pro-rata clawback.
  <https://blog.salescookie.com/2021/03/09/3-easy-way-to-claw-back-commissions/>
- **Append, do not mutate** is the documented best practice, in both commission-specific and general
  ledger literature: *"past entries are never erased or modified; corrections are made by appending
  new, compensating entries."*
  <https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing> ·
  <https://blog.bemi.io/rethinking-event-sourcing/>
- **Verdict: FITS, strongly, and it is architecturally consistent with what this repo already does.**
  `StockMovement` and `ExchangeRate` are already append-only, and `Order` is already declared an
  *"evento transaccional inmutable"* that is never deleted
  (`docs/plans/ventas-follow-ups-pendientes.md:118-124`). A compensating commission entry is the same
  discipline, not a new one. Holdback reserves, clawback contract clauses and payout orchestration are
  **ceremony**.
- **Direct bearing on backlog item 5 (W5, 100%-credit orders).** If commission triggers on *cash
  collected*, W5 changes what "collected" means and the two changes are coupled. If it triggers on
  `delivered` (the MVP's and the liability spec's answer), they are independent. External sources are
  clear that cash-collected is the safest trigger where cancellation risk is real — which is a genuine
  tension with the locked local "payable at `entregado`" decision, and the owner should be told so.

## B4. Multi-warehouse availability — vocabulary and pitfalls

**Vocabulary.**
- **ATP (Available-to-Promise)** — availability answer from on-hand + supply − demand; *Gross* vs *Net*
  ATP. <https://en.wikipedia.org/wiki/Available-to-promise>
  **CTP (Capable-to-Promise)** adds production capacity. <https://archerpoint.com/available-to-promise-vs-capable-to-promise/>
- **Order sourcing** = "which node(s) can fulfil this order"; **allocation** = "how much inventory goes
  where" (network-level); **routing** = applying rules to assign the order; **DOM** = the orchestrating
  system. <https://www.shipium.com/en/blog/what-is-distributed-order-management> ·
  <https://www.ibm.com/docs/SSGTJF/productconcepts/c_SourcingRules.html>
- **Verdict on naming**: what this project needs is precisely **order sourcing**, single-decision-point.
  Not allocation, not routing rules, not DOM, not CTP. Using "sourcing" as the vocabulary and refusing
  the rest is the right calibration. ATP is the accurate name for the read.

**Field names in real systems — this codebase is already aligned.**
- Shopify `InventoryLevel`: `available` / `committed` / `on_hand` / `incoming`, per Location.
  *available*: *"the quantity that's available for sale... isn't committed to any orders"*;
  *committed*: *"the number of units that are part of a placed order but aren't yet fulfilled"*;
  *on_hand*: *"the total physical quantity at the location."*
  <https://help.shopify.com/en/manual/products/inventory/fundamentals/inventory-states> ·
  <https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryLevel>
- commercetools `InventoryEntry`: `quantityOnStock` and `availableQuantity` (= on stock − reserved).
  <https://docs.commercetools.com/api/projects/inventory>
- Magento MSI: **Source** (a location), **Source Item** (per-SKU row at a source), **Stock** (a group
  of sources), **Salable Quantity**, **Source Selection Algorithm**, **Reservation**.
  <https://github.com/magento/inventory/wiki/MSI-features-and-processes>
- **Verdict: FITS — no renaming needed.** `Warehouse` ≈ Source, `StockLevel` ≈ Source Item,
  `onHand`/`reserved`/derived `available` is exactly the tri-field model all three converge on. This
  codebase's `reserved` is Shopify's `committed`; worth noting the synonym but not worth renaming.

**Reservations: append-only vs mutable counter.** Magento's documented rationale for appending
reservation rows: *"Reservations are append-only operations and help us to prevent blocking operations
and race conditions at the time of checkout."*
<https://github.com/magento/inventory/wiki/Salable-Quantity-Calculation-and-Mechanism-of-Reservations>
- **Verdict: CEREMONY here.** This project's mutable `reserved` counter, guarded by an immediate
  `CHECK (reserved <= on_hand)` inside a Prisma transaction, is the proportionate answer at this scale.
  The append-only ledger solves a contention problem this app does not have.

**Manual location choice vs system routing — the pitfalls, which map directly onto C3.**
- **Stale availability between read and commit**: classic check-then-act. Two agents read the same
  `available = 1` and both commit. <https://www.zenventory.com/blog/how-to-prevent-overselling>
  — *In this codebase the window is unusually wide*: the gestor would read availability at
  **creation**, but the reservation only happens at **confirm**, potentially much later and by a
  different person. The eligibility answer can be stale by an arbitrary amount of time.
- Documented mitigations: **soft reservation with TTL** (typically minutes, needs a sweeper job)
  <https://preview.community.apse2.training.fluentcommerce.com/blog/fluent-oms-inventory-accuracy-soft-reservation-guide>;
  **optimistic concurrency / version compare-and-swap**; **suggested location with override + reason
  code** <https://organicax.com/2016/03/03/wms-allow-put-location-override/>.
  - **Verdict**: TTL soft-holds and a sweeper are **ceremony** at this scale. Re-validating at confirm
    already happens (that is what `InsufficientStockError` is). The genuinely cheap options are
    (a) validate at creation too, so the agent gets an immediate answer, and/or (b) surface
    "suggested/eligible warehouses" as a read and keep the choice explicit.
- **Cross-location availability reads are a standard, first-class API surface everywhere**: Shopify
  `InventoryLevel` per item across Locations; commercetools `InventoryEntry where sku=`; Magento
  `IsProductSalableForRequestedQtyInterface::execute(sku, stockId, requestedQty)` and
  `GetSalableQuantityDataBySku`.
  <https://github.com/magento/inventory/blob/1.2.4/InventorySalesApi/Api/IsProductSalableForRequestedQtyInterface.php>
  - **Verdict: FITS.** The absence of this read is the anomaly, not its addition. Magento's
    `IsProductSalableForRequestedQty(sku, stock, qty) → bool` is a good naming model: a **question**,
    not a data dump — which also happens to be the narrowest possible permission grant.

**Whole-basket single-location fulfilment.** Shopify names this exact rule **"Minimize split
fulfillments"**: *"if a location has enough inventory to fulfill an entire order, then the order is
assigned to that location. If no single location can fulfill the order, then it's split..."*
<https://help.shopify.com/en/manual/fulfillment/setup/order-routing>. The OMS/WMS term for holding an
order until it can ship in one piece is **"ship complete"**
<https://www.logimaxwms.com/glossary/ship-complete>. Systems relax single-sourcing only when no single
node covers the basket. <https://www.shipbob.com/blog/split-shipments/>
- **Verdict: FITS.** The MVP's `eligibleWarehouses` is Shopify's rule taken to its strict extreme
  (never split — block instead). Naming that constraint explicitly ("single-source", "whole basket")
  is worth doing; building split-shipment support is **ceremony** and is already implicitly out of
  scope since `Order` carries exactly one `warehouseId`.

---

# PART C — Synthesis

## C1. Vocabulary table

| Concept | What mature systems call it | Proposed identifier here | Notes |
|---|---|---|---|
| The field salesperson (external, unscoped) | ERPNext **Sales Partner**; BC **Salesperson**; Odoo `user_id` | `SalesAgent` (ES label *Gestor*) | Three of four systems make this master data, not a user. `sales_agent` is also the term already used in the backlog |
| Their supervisor | — (no direct analogue) | `sales_operator` **(already exists, bit 4)** | ES label already `'Operador de gestores'` (`roles.ts:28`). Do **not** rename |
| Attribution of an order to an agent | ERPNext `Sales Team` child table; SF Opportunity Owner | `Order.salesAgentId` (order-level) | Order-level is the cross-system default. Line-level/split is unevidenced |
| Shared credit between reps | SF **Revenue Split** / **Overlay Split**; ERPNext Contribution % | *(no name — not needed)* | Zero evidence anywhere in this business |
| One commission owed for one sale | Odoo **Achievement**; generic **commission entry** | `CommissionEntry` (or `Commission`) | Locked as a separate entity by `salesops-ventas/spec.md:91-94` |
| Its lifecycle | earned → accrued → **payable** → paid | `CommissionStatus` | Local docs already say "payable at `entregado`" |
| A reversal after cancel/return | **clawback**; negative/compensating line | an appended `CommissionEntry` with negative amount | Matches `StockMovement`/`ExchangeRate` append-only precedent |
| The reference table of amounts per product | Odoo commission rule; ERPNext commission rate | `ProductCommissionReference` + `ICommissionReferenceProvider` | **Already named** in `commission-seam.md:29-37`. Do not invent a new name |
| Paying a batch of commissions | **payout / settlement** | *(defer)* | Nothing in the business asks for batching yet |
| "Can this location cover this basket?" | **ATP**; Shopify *minimize split fulfillments*; Magento `IsProductSalableForRequestedQty` | `eligibleWarehouses` / `findFulfillingWarehouses` | `eligibleWarehouses` already exists in the MVP and already has tests |
| The act of choosing that location | **order sourcing** | *(a verb, not an entity)* | Explicitly **not** routing/allocation/DOM |
| The one-location-covers-everything rule | Shopify *minimize split fulfillments*; **ship complete**; single-sourcing | "single-source / whole-basket" constraint | Already structurally enforced: `Order` has exactly one `warehouseId` |
| Already-correct local names needing no change | Shopify `on_hand`/`committed`/`available`; Magento Source/Source Item | `Warehouse`, `StockLevel`, `onHand`, `reserved`, `availableStock()` | `reserved` = Shopify's `committed` |

## C2. Open questions that survive the research

Six. Ordered by how much of the design each one decides.

**Q1 — Is the gestor a login identity (a `CompanyUser` with a new role bit), or master data referenced
by the order, or both?**
The owner's definition says the gestor *performs a write against the API*. In this codebase a write
requires authentication: `JwtStrategy` 403s anyone without an ACTIVE `CompanyUser`
(`jwt.strategy.ts:99-107`). **If the gestor really calls `POST /orders`, they must be a `CompanyUser`
— there is no anonymous write path.** So this is no longer the open fork `explore.md` framed it as;
what remains genuinely open is narrower: *does the order additionally need a `SalesAgent` master-data
row (name, phone — the shape of both `03-order-format.md:26-27` and the MVP `Gestor`), for gestores who
do not log in but whose sales are still recorded by someone else?* External precedent (ERPNext, BC,
Odoo/OCA) says mature systems keep the attribution entity separate from the login user precisely for
that case.

**Q2 — Does the gestor pick the warehouse, or does the system pick it?**
The definition says *"registra una venta en un almacén según la disponibilidad"* — ambiguous between
"the agent chooses among eligible warehouses" (the MVP: auto-select first eligible, user may override,
`pedidos-nuevo.tsx:129-133` + `client-step.tsx:55-83`) and "the system sources it". This decides
whether `Order.warehouseId` stays a **required client input** or becomes **derived** like `currency`
already is. Both are defensible; the MVP shipped the first.

**Q3 — Is availability enforced at order creation, or only advisory there and enforced at confirm as
today?**
Making it an **invariant** at creation means the Sales module gains a stock dependency it deliberately
does not have (`OrderService` injects no stock repository) — a real architectural change. Making it an
**advisory read** (a separate "which warehouses can fulfil this basket" endpoint the client calls
first) leaves `createOrder` pure and keeps `InsufficientStockError` at confirm as the real guard. The
external sources treat the availability read as standard and the hard block as optional; the archived
MVP spec (`salesops-03-crear-pedido/spec.md:98-105`) required the hard block.

**Q4 — What triggers commission, given W5 is in flight?**
Locked local answer is `delivered` (`salesops-12-commission-liability/exploration.md:11-15`). External
practice says *cash collected* is safer where cancellation/credit risk is real — and W5 exists
precisely to allow 100%-credit orders with no upfront payment. If commission is payable at `delivered`
and the order was 100% credit, the owner pays the gestor before collecting a cent. **The owner should
decide this knowing that tension, not by defaulting to the MVP's behaviour.**

**Q5 — Flat MN per product, and how do the three irregular cases work?**
`04-commissions.md` is the only specified model, and the MVP implemented flat-per-line and explicitly
ignored tiers (`salesops-mvp/spec.md:116-117`). Three entries do not fit flat-per-line:
combos priced by **equipment count** (`04-commissions.md:9-13`), `Cable | 50 por metro` (`:77` —
per-metre), and kits (`:84-96` — a kit is presumably one product). Also: is the table still current?

**Q6 — Does `owner` inherit the new bit?**
`BUSINESS_ROLES_MASK` (`roles.ts:16-17`) is a hand-maintained union, not "everything except admin". A
new bit is silently **off** for `owner` unless added. One line, easy to get wrong.
Secondary but real: adding the bit **contradicts a currently-passing spec scenario**
(`salesops-identity/spec.md:216-220`: *"no `gestor` role bit is defined"*) and a MUST-NOT
(`:287-289`) — those must be amended, not just appended to.

## C3. Prior exploration — confirmed, refuted, missed

### CONFIRMED (verified directly, not inherited)

| Claim in `explore.md` | Verification |
|---|---|
| Role bits `user:1, warehouse_operator:2, sales_operator:4, owner:8, admin:16` (`:16-17`) | `roles.ts:5-11` ✓ |
| `BUSINESS_ROLES_MASK` is a hand-maintained union; a new bit is off for `owner` by default (`:20-24`) | `roles.ts:16-17`, `effectiveRoles` `:64-72` ✓ |
| `sales_operator` is NOT the sales agent; its label is `'Operador de gestores'` (`:26-34`) | `roles.ts:28`; seed user `'Operador de Gestores'` at `infra-db/src/users/seed.ts:51` ✓ |
| `JwtStrategy` resolves the ACTIVE `CompanyUser` and 403s `MISSING_COMPANY_USER` (`:8-12`) | `jwt.strategy.ts:95-107` ✓ |
| Backend `Order` has zero gestor/seller/commission fields (`:68-71`) | `order.ts:39-58`; `schema.prisma:239-264` ✓ |
| `OrderStatus` is 4 states, `delivered` terminal (`:80-85`) | `order.ts:28`; no transition out of `delivered` (`:175-205`) ✓ |
| MVP `Gestor = {id, name, phone?}`, seeded static list, `Order.gestorId` order-level (`:48-52`) | `app/domain/types.ts:14-18`, `seed/constants.ts:22-28`, `types.ts:61-67` ✓ |
| Commission resolved by keyword/category/catch-all dictionary, summed to the order (`:53-57`) | `seed/commission-map.ts:135-147`, `enrich-products.ts:32-34` ✓ |
| Commission payable at `entregado`, paid via the 5th state `comision_pagada` (`:58-61`) | `gestor-order-card.tsx:97-109`; `seed-store.ts:199-208`; `types.ts:59` ✓ |
| Commission-liability framing is owner→gestor, never a customer receivable (`:63-66`) | `salesops-12-commission-liability/spec.md:134-152` ✓ |
| `commission-seam.md` pre-names `ICommissionReferenceProvider` for this exact module (`:72-78`) | `commission-seam.md:23-38` ✓ |
| W5 sits on the same invariant `createOrder` enforces (`:110-118`) | `order.ts:137-145` (the doc's cited `:133-141` has drifted by 4 lines) ✓ |

### REFUTED or materially wrong

1. **"`Gestor` is explicitly NOT a login-based actor" is an invalid inference.**
   `explore.md:48-49` and `:156-158` treat the MVP's login-less `Gestor` as a *modelling decision*.
   It is not: the MVP had **no authentication at all**, by requirement —
   `docs/plans/reference/06-mvp-requirements.md:7` *"Sin autenticación ni autorización"*, and
   `pedidos-nuevo.tsx:25` *"MVP has no auth"*. Nothing in the MVP has a login. The absence of one for
   `Gestor` is therefore **zero evidence** either way. Open Question 1 of `explore.md` — the question
   it said "picks between Approaches 1/2/3" — was built on this false inference.

2. **"a gestor is an external/field salesperson tied 1:1 to specific orders" (`:38-40`) — passive
   framing, contradicted by the code.** In the MVP the gestor is the **persona operating the
   order-creation wizard** (`pedidos-nuevo.tsx:25-26, 105, 158`) — there is no gestor selector
   anywhere. The gestor is the actor, not a field. `02-sales-process.md:25-29` lists gestores first
   among *"actores que pueden insertar una venta"*. This is the owner's C1, and it was already in the
   code the exploration read.

3. **"the choice hinges entirely on Open Question 1" (`:174`) is wrong.** Whether the gestor writes
   through the API is decided by `JwtStrategy`, not by preference: there is no unauthenticated write
   path (`jwt.strategy.ts:95-107`). The exploration's three "approaches" are not three; they collapse
   once C1 is taken seriously.

4. **The MVP-vs-backend state machine comparison is incomplete** (`:80-85`). It notes the MVP's extra
   `comision_pagada` but not that the MVP also has `transportando` and **no `cancelled` state at all**
   (`types.ts:59` vs `order.ts:28`). "The MVP's 5th state does not fit" understates it — the two
   machines differ in three ways, and the backend's `cancelled` branch is exactly where commission
   reversal will have to be reasoned about.

### MISSED ENTIRELY (the substantive gaps)

5. **Cross-warehouse availability — the whole of C3.** `explore.md` does not contain the words
   *availability*, *stock*, or *warehouse selection* in any operative sense, and never mentions
   `app/domain/availability.ts` — a tested MVP module implementing exactly "which warehouses can cover
   this basket", nor its archived spec requirement
   (`salesops-03-crear-pedido/spec.md:98-105`: *"If zero warehouses qualify, order creation MUST be
   blocked"*). This is the largest single omission.

6. **`sales_operator` cannot read stock at all.** `StockController`'s `@Roles` is
   `owner, admin, warehouse_operator` (`stock.controller.ts:55`) — the sales side gets a 403. Whatever
   the gestor is, it needs a stock read surface that does not exist today. Not mentioned.

7. **A cross-warehouse read already exists at the port and is dead code.**
   `IStockLevelRepository.list({ productId })` (`stock-level-repository.port.ts:35`) with **zero call
   sites**. The cheapest path to C3 runs through an existing port, not a new one. Not mentioned.

8. **`Customer` requires a 1:1 `userId`** (`customer/customer.ts:10-12`, `:16`) — *"a `Customer`
   cannot exist without a corresponding `User`"*. Directly relevant to C4 ("usando un cliente"): the
   customer is itself a login identity, so a gestor booking a sale for a walk-in needs a `User` to
   exist first. The MVP synthesized a fresh client per order with no lookup
   (`pedidos-nuevo.tsx:86-92`); the backend cannot. Not mentioned.

9. **Adding the role bit breaks a passing spec scenario.** `salesops-identity/spec.md:216-220` asserts
   *"no `gestor` role bit is defined"* and `:287-289` lists it as MUST-NOT. The exploration's
   "Affected Areas" (`:89-108`) lists code files only — it does not list the spec amendments this
   requires.

10. **Three commission-table entries do not fit the flat-per-line model** it endorsed as option 1
    (`:123-125`): equipment-count combos (`04-commissions.md:9-13`), `Cable | 50 por metro` (`:77`),
    and kits (`:84-96`). The MVP dodged all three by ignoring tiers
    (`salesops-mvp/spec.md:116-117`), which is a known, documented simplification, not a solved problem.

11. **`PATCH /orders/:id` can change `warehouseId`** while `created`, with no stock re-check
    (`order.service.ts:106-121`). Any availability rule added at creation has a second door.

12. **`docs/system/architecture.md:143-152` is stale** (claims no HTTP backend). Its
    **"¿Dónde va X?" table (`:58-74`) remains valid** and is the part that governs module placement —
    a distinction the exploration cited without flagging.
