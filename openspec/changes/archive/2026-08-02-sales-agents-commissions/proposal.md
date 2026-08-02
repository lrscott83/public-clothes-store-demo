# Proposal: sales-agents-commissions

> Inputs: `research.md` (authoritative) and the owner-LOCKED decisions D1–D9
> (engram `sdd/sales-agents-commissions/decisions`). `explore.md` is superseded —
> four of its claims were refuted. Decisions D1–D9 are NOT re-derived here.

## Intent

Backlog item 4. The owner's definition:

> "El gestor es alguien que usando un cliente registra una venta en un almacén según
> la disponibilidad de los productos. El gestor no está atado a ningún almacén."

The backend has none of that. Three concrete gaps:

1. **No sales-agent actor.** `USER_ROLES` (`packages/domain/src/users/roles.ts:5-11`) has
   no such bit, so a sale cannot be attributed and per-agent reporting is impossible.
2. **Availability is not enforced at order creation.** `POST /orders` accepts
   `warehouseId` blind (`create-order.dto.ts:42`); `createOrder` copies it
   (`sales/order.ts:151`) and never sees stock. The first stock check is at `confirm`
   → `InsufficientStockError` → 409 (`prisma-order.repository.ts:339-360`). Worse,
   `PATCH /orders/:id` can swap `warehouseId` while `created` with no re-check
   (`order.service.ts:106-121`). So an order can exist today against a warehouse that
   cannot fulfil it. This is a REGRESSION, not a new feature: the rule was implemented
   in the MVP (`apps/salesops-mvp/app/domain/availability.ts:14-27`, unit-tested) and
   spec'd (`archive/.../salesops-03-crear-pedido/spec.md:98-105`), then lost in the
   backend rewrite.
3. **Commission does not exist.** It is a named-but-unimplemented seam
   (`packages/domain/src/product/commission-seam.md:23-38`,
   `ICommissionReferenceProvider`) that `salesops-ventas/spec.md:91-94` already
   reserved for "a future Gestores module". THIS change is that module — it fulfils
   the named seam rather than inventing a parallel one.

**Success**: a `sales_agent` `CompanyUser` can see which warehouses can fulfil a
basket, can create an order ONLY against one that can, the sale is attributed to them
from their token, and a commission accrues when the order reaches `delivered`, settled
by an independent payment record that never touches `OrderStatus`.

## Scope

Delivery mirrors the model that worked for `company-user-roles-reframe`: **one branch
(`salesops-sales-agents-commissions`, cut from `main` @ `f014296`), three sequential
slices, work-unit commits, each slice independently verified before the next starts.**

### Slice 1 — Identity and visibility (NO schema change)

The actor exists and can see stock across warehouses.

- `sales_agent = 32` added to `USER_ROLES`, plus `BUSINESS_ROLES_MASK` per **D8** and a
  neutral-Spanish label in `ROLE_LABELS_ES` — `packages/domain/src/users/roles.ts`,
  `roles.test.ts`. No migration: the bitmask is an `int` on `company_user.role`.
- Read grants: `sales_agent` added to `stock.controller.ts:55` (today
  owner/admin/warehouse_operator — the agent has **no** stock surface at all),
  `order.controller.ts:87`, and customer READ (`customer.controller.ts:41`).
- Cross-warehouse availability query, exposed on the Sales side, answering
  "which warehouses can fulfil this basket?" — served through the port method that
  ALREADY exists and is dead code repo-wide: `IStockLevelRepository.list({ productId })`
  (`inventory/stock-level-repository.port.ts:35`).
- **Spec AMENDMENT** (not an append) to `salesops-identity`: see Capabilities.

### Slice 2 — Availability as an invariant (NO schema change)

**D3 + D4.** The agent still PICKS the warehouse; the system now refuses an impossible pick.

- Pure `packages/domain/src/sales/availability.ts` — the MVP's `eligibleWarehouses`
  rule ported into the shared kernel, plus a whole-basket assertion (products AND
  quantities). Placement is FORCED by `salesops-inventory/spec.md:186-195`:
  availability-for-sale is explicitly Ventas' responsibility and MUST NOT live in
  Inventory.
- Enforced on `POST /orders` and on any `PATCH /orders/:id` that changes `warehouseId`
  — `apps/api-salesops/src/sales/order.service.ts`, `order.controller.ts` error mapping.

### Slice 3 — Commission ledger (**carries ALL the migration risk**)

- Sale attribution stamped from the authenticated actor, never client input (**D1**).
- New domain concept folder `packages/domain/src/commission/`: the
  `ICommissionReferenceProvider` port named in `commission-seam.md`, the pure
  `Σ (flat MN per product × quantity)` calculation (**D5**), the accrual entity, and
  `CommissionPayment` as an INDEPENDENT record (**D7** — `Order`'s 4-state machine is
  untouched; commission becomes payable at `delivered`).
- Adapters `packages/infra-db/src/commission/`, Prisma models + **one migration**,
  and a reference-data seed from `docs/plans/reference/04-commissions.md`.
- Delivery `apps/api-salesops/src/commission/` — settle a commission, per-agent report.

## Non-Goals (loud, explicit)

| NOT doing | Why |
|---|---|
| **Combo brackets** — "Combos de electrodomésticos" (1-2→3000, 3-5→4000, 6-7→5000) | **D6.** Order-level rule that CONFLICTS with the per-product table. The MVP ignored it deliberately. Documented as pending; NOT guessed. |
| **Credit sales / W5** | **D9.** The commission trigger MUST NOT be coupled to payment state. |
| **Any warehouse scoping for sales agents** | **D2.** The agent is the INVERSE of `warehouse_operator`. Do NOT reuse the `WarehouseOperator.userId → warehouseId` shape. |
| **A separate `SalesAgent` master-data entity** | **D1.** The agent IS a `CompanyUser` carrying the role bit. |
| **MVP dashboard parity** | No UI in this change. Backend capability only. |
| Soft-hold/TTL reservations, payout batches, GL journals, quotas, split attribution | Research classified all as ceremony for this scale. |
| `Cable \| 50 por metro` as a unit-conversion feature | Works naturally when quantity is in meters (**D5**). No new unit machinery. |

## Capabilities

### New Capabilities
- `salesops-commissions`: commission reference data per product, accrual at `delivered`,
  the independent `CommissionPayment` settlement record, and per-agent reporting.

### Modified Capabilities
- `salesops-identity`: **AMENDMENT, not an append.** Adding the bit BREAKS a currently
  passing scenario — `changes/backend-users-roles/specs/salesops-identity/spec.md:306-310`
  ("no `gestor` role bit is defined") and the MUST-NOT at `:289`. The exhaustive role
  enumeration at `:73` also changes. Note this spec is still a DELTA under
  `changes/backend-users-roles/`, never promoted to `openspec/specs/` — the amendment
  must target it there.
- `salesops-ventas`: availability becomes a creation-time INVARIANT (D4) and applies to
  `warehouseId` changes; sale attribution comes from the authenticated actor. The
  boundary note at `:91-94` ("commission is NOT an Order concern") stays TRUE and is
  now satisfied, not contradicted.

## Approach — and the D4 dependency direction

**D4 is a real architectural change, not a detail.** Sales gains a dependency on
Inventory at creation time that it deliberately does not have today. It is kept clean by
copying the pattern `OrderService` ALREADY documents for exchange rates
(`order.service.ts:43-60`, design decision #3): *the app service loads the data; the
pure domain factory receives it as an argument.*

- `OrderService` injects `STOCK_LEVEL_REPOSITORY` — **the port symbol, never
  `PrismaStockLevelRepository`** — exactly as it already injects `CURRENCY_REPOSITORY`.
- It calls the existing `list({ productId })` and passes a `StockLevel[]` snapshot into a
  **pure, synchronous** `assertFulfillable(lines, stockLevels)`. `createOrder` stays
  sync and I/O-free, mirroring its existing `rates: ExchangeRate[]` parameter.
- No new port is invented. Cross-concept imports inside the shared kernel already have
  precedent (`sales/order-line.ts:5-6` imports `product/pricing`).
- **Race, accepted explicitly**: read-then-create is not transactional, so a concurrent
  order can invalidate the snapshot. `confirm` still reserves and still 409s. Availability
  at creation is a FAST-FAIL, not a hold — no reservation/TTL machinery.

Commission fulfils the named seam: `ICommissionReferenceProvider.commissionFor(productId)
: Promise<Money | undefined>`. `undefined` means "no reference configured" and is NEVER
silently coerced to zero (`commission-seam.md:41-44`). Kits are ordinary catalog products
and resolve through the same per-product path (**D5**).

Code identifiers, comments and docs in ENGLISH; the module is `SalesAgent`/`Commission`,
never `Gestor`/`Comision`. User-facing strings in neutral Latin American Spanish.

## Affected Areas

| Area | Impact | Slice |
|---|---|---|
| `packages/domain/src/users/roles.ts` (+ `roles.test.ts`) | Modified — bit `32`, mask, label | 1 |
| `apps/api-salesops/src/stock/stock.controller.ts`, `sales/order.controller.ts`, `customer/customer.controller.ts` | Modified — `@Roles` grants | 1 |
| `apps/api-salesops/src/sales/` (availability query + DTO) | New | 1 |
| `packages/domain/src/sales/availability.ts` (+ test) | New — pure whole-basket rule | 2 |
| `apps/api-salesops/src/sales/order.service.ts`, `sales.module.ts`, `order.controller.ts` | Modified — port injection, invariant, error mapping | 2 |
| `packages/domain/src/commission/` (port, calculation, entities, errors, `index.ts`) | New concept folder | 3 |
| `packages/domain/src/index.ts`, `product/commission-seam.md` | Modified — barrel export; seam marked fulfilled | 3 |
| `packages/infra-db/prisma/schema.prisma` + **one new migration** | New tables + attribution | 3 |
| `packages/infra-db/src/commission/` (adapters + seed from `docs/plans/reference/04-commissions.md`) | New | 3 |
| `apps/api-salesops/src/commission/` (controller, service, module, DTOs) | New | 3 |
| `apps/api-salesops/src/app.module.ts` | Modified — module registration | 3 |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Regression: D4 breaks existing order tests/e2e.** Every fixture that creates an order now needs stock to exist. `api-salesops` has 181 unit + 50 e2e today. | **High** | Slice 2 is isolated and verified alone. Budget fixture work explicitly in `sdd-tasks`; run the full suite before slice 3 starts. |
| **Spec amendment, not append** — `salesops-identity` has a passing scenario asserting the bit does NOT exist. Missing it (as `explore.md` did) ships a green suite against a false spec. | **High** | Named in Capabilities. `sdd-spec` MUST write the amendment, not a new requirement. |
| **D8 consequence**: `owner` inherits `sales_agent`, so an owner who registers a sale accrues commission TO THEMSELVES and appears in per-agent reports. | Certain | Locked by the owner. Surface it in design and in the report DTO; do not silently filter. |
| **Migration risk concentrated in slice 3.** New tables are additive (low), but attribution on existing orders means legacy rows carry no agent. | Medium | Rehearse on a clone of `store_mgmt_test`, as `company-user-roles-reframe` did. **Never touch dev `store_mgmt`.** |
| **Commission reference seed is name-matched, not id-matched.** `04-commissions.md` keys on product NAME, with fuzzy rows (`Demás equipos pequeños`, `Neveras` vs `Neveras de 16 y 20 pies`). | **High** | Seed is reference data, not an invariant. Unmatched product → `undefined`, never `0`. Report unmatched rows loudly at seed time. |
| `Customer` requires a 1:1 `userId` (`customer/customer.ts:10-12`). "Usando un cliente" means the customer must ALREADY be a login identity — the MVP synthesized customers freely, this backend cannot. | Medium | Slice 1 grants customer READ only. Whether the agent may CREATE customers is a design question, flagged, not assumed. |
| Slice 3 likely exceeds the 400-line review budget on its own. | Medium | `sdd-tasks` should forecast splitting it into 3a (schema + seed + adapters) and 3b (accrual, payment, reporting). |
| Availability snapshot race (read-then-create). | Low | Accepted above: `confirm` still reserves and 409s. |

## Rollback Plan

Per slice, on one branch, all pre-push:

- **Slice 1**: revert the work-unit commits. Removing bit `32` is safe only while no
  `company_user.role` row has it set — `roles` is an int bitmask, no schema change, so a
  stale bit would simply grant nothing after revert.
- **Slice 2**: revert. Behaviour returns to today's (blind `warehouseId`, first check at
  `confirm`). No data written, nothing to unwind.
- **Slice 3**: the migration is the only irreversible step. Author a compensating
  rollback and round-trip it on a test-DB clone BEFORE applying forward, exactly as
  migration 002 was rehearsed in `company-user-roles-reframe`. New tables drop cleanly;
  the attribution column is nullable and additive.

## Dependencies

- Branch cut from `main` @ `f014296` (post `company-user-roles-reframe`): roles must
  already resolve from `CompanyUser`, not `User`.
- `docs/plans/reference/04-commissions.md` is the ONLY source for commission amounts.
- Next free role bit is `32`. If anything else claims it first, this change must re-check.

## Success Criteria

- [ ] `sales_agent = 32` exists, `owner` inherits it via `BUSINESS_ROLES_MASK` (D8), and
      the `salesops-identity` spec is AMENDED — no scenario still asserts the bit is absent.
- [ ] A `sales_agent` can query which warehouses can fulfil a given basket; a warehouse
      that cannot is never returned.
- [ ] `POST /orders` against a warehouse that cannot fulfil the basket is REJECTED at
      creation, and `PATCH /orders/:id` cannot move an order to such a warehouse (D4).
- [ ] `createOrder` remains pure and synchronous; `OrderService` depends on
      `STOCK_LEVEL_REPOSITORY` (the port), never on a concrete adapter.
- [ ] Commission = Σ (flat MN per product × quantity), resolved through
      `ICommissionReferenceProvider`; an unconfigured product yields `undefined`, never `0`.
- [ ] Commission is payable at `delivered` and settled by a `CommissionPayment` record —
      `OrderStatus` still has exactly 4 states (D7).
- [ ] No `SalesAgent` entity, no agent→warehouse scope row, no combo bracket, no credit
      coupling anywhere in the diff.
- [ ] Each slice verified independently: `pnpm -r build` clean, full suites green, lint
      `--max-warnings 0`, before the next slice starts.
