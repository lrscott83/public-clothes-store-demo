# Proposal: delivery

> Inputs: engram `sdd/delivery/explore` (thorough, owner-reviewed) and the owner
> decisions D1–D8 below, taken at proposal time. The exploration's `Carrier.zone`
> field is SUPERSEDED by D2 — do not reintroduce it. Decisions are NOT re-derived
> here; they are recorded with their reasons so later phases can cite them.

## Intent

Module 3 of the build order in `docs/plans/estrategia-backend-por-modulos.md:247`
("Delivery + Gestores/Comisiones — completan el ciclo de vida del pedido").
Commissions shipped; Delivery is the missing half.

The gap is precise, not vague. `Order.deliveryMode` is a REQUIRED field with exactly
two values, and today only one of them has a fulfillment path:

1. **`deliveryMode='delivery'` has no operational record at all.** The tenant schema
   has zero models matching carrier/delivery/shipment. `Order.deliveryMode` carries
   the comment "REQUIRED; delivery engages future Delivery module"
   (`packages/infra-db/prisma/tenant/schema.prisma:261`) against a module that does
   not exist.
2. **Sales says so itself, in a load-bearing doc comment.**
   `packages/domain/src/sales/order.ts:13-17`: *"This slice (Sales) implements only
   the `pickup` direct edge (`verified -> delivered`); `delivery` continues through a
   FUTURE Delivery module out of scope here — Sales never models
   `despachando`/`transportando`."* This change IS that module. It fulfils a named
   seam rather than inventing a parallel one — the same discipline
   `sales-agents-commissions` applied to `commission-seam.md`.
3. **No carrier catalog, so nothing can be assigned or measured.** The owner already
   runs this workflow in the mock (`apps/salesops-mvp`): assign a *transportista*,
   see who is busy, mark delivered. The backend can express none of it, so the
   operator dashboard has no real data to read and the Decisiones module (module 4)
   has nothing to query.

**Success**: a `delivery`-mode order that is `verified` can be assigned to a carrier;
that assignment is a first-class record with its own two-state lifecycle; marking it
delivered drives the `Order` to `delivered` **through a port, without Delivery owning
`Order.status`**; carrier busy/free capacity is computed from live assignments with no
stored capacity number anywhere; and `POST /orders/:id/deliver` behaves exactly as it
does today for both delivery modes.

**Vocabulary link**: the owner's *transportista* is `Carrier` in code and DB. Code
identifiers, comments, tables and columns are ENGLISH (repo convention — see
`WarehouseOperator` ← `OperadorAlmacen` in `salesops-identity/spec.md:289-291`).
User-facing strings stay neutral Latin American Spanish.

## Scope

Backend only, on one branch, delivered as three sequential slices with work-unit
commits, each independently verified before the next starts — the model that worked
for `sales-agents-commissions`.

Mapped onto the module plan's four phases (`estrategia-backend-por-modulos.md:214-219`):

### Slice A — Model & contract (**carries ALL the migration risk**)

- New domain concept folder `packages/domain/src/delivery/` — flat concept files, no
  `models/` subfolder, mirroring `packages/domain/src/commission/`: `carrier.ts`,
  `carrier-warehouse.ts`, `delivery-assignment.ts` (entity + factory), `errors.ts`,
  and the ports below (`<concept>-repository.port.ts` / `<concept>-gateway.port.ts`,
  each exporting `interface I<Name>` plus a `Symbol('I<Name>')` DI token).
- Pure `compute-carrier-capacity.ts` — the capacity derivation (D4), a pure function
  over assignment rows, mirroring `computeAccrual`.
- Prisma models + **one migration**: `carrier`, `carrier_warehouse`,
  `delivery_assignment`, plus inverse-relation-only fields on `Order` and `Warehouse`.
- Barrel export in `packages/domain/src/index.ts` (today: 8 modules, becomes 9).

### Slice B — Persistence & reads

- Adapters in `packages/infra-db/src/delivery/` implementing the ports, plus
  `seed.ts` and `.spec-helper.ts` fixtures (note the three suffix conventions:
  `infra-db` uses `.spec.ts`, `domain` uses `.test.ts`, apps use `.spec.ts`).
- `apps/api-salesops/src/delivery/` read surface: list/get carriers, list assignments
  with filters, and the computed capacity read (busy/free per carrier, plus the
  independent "orders awaiting a carrier" count, which is a count of ORDERS and is
  not derivable from the carrier rows).

### Slice C — Operations and the Sales bridge

- Carrier catalog CRUD (create / edit / soft-delete via `active=false`).
- `assign carrier` → creates the `DeliveryAssignment` in `in_transit` atomically (D3).
- `mark delivered` → transitions the assignment to `delivered` AND drives the order
  to `delivered` through `IOrderDeliveryGateway` (D6).
- `SalesModule` exports the gateway token; `DeliveryModule` imports `SalesModule`;
  `app.module.ts` registers `DeliveryModule`.

### On phase D (the plan's "Integración") — deliberately split

The plan's phase D bundles two different things (`:218-219`): "conectar con los otros
módulos (vía puentes)" and "reemplazar esa porción del seed". They are separated here:

- **IN scope**: the bridge to Sales (the plan's Delivery row says integration "mueve
  estado del pedido", `:231`). It is inseparable from "marcar entregado" and ships in
  Slice C.
- **OUT of scope**: replacing the seed — i.e. wiring `apps/salesops-mvp` to the real
  API. That is pending for EVERY module, has an auth precondition, and is a separate
  effort.

## Owner decisions (taken — recorded, not reopened)

| # | Decision | Reason |
|---|---|---|
| **D1** | Three entities: `Carrier` (catalog), `CarrierWarehouse` (coverage join), `DeliveryAssignment` (bridge, `orderId String @unique`) | `orderId @unique` mirrors `CommissionAccrual.orderId`, whose uniqueness IS the idempotency guarantee (`schema.prisma:313-316`). Cross-module links get their OWN bridge table; columns are never bolted onto `Order` for another module's concern. |
| **D2** | **`zone` is REMOVED.** Coverage is expressed ONLY by `CarrierWarehouse` with `@@unique([carrierId, warehouseId])` | A nullable `warehouseId` FK gives 0..1, never N — it cannot express the multi-warehouse case at all, and `null` would ambiguously mean both "serves all" and "not yet assigned". The join table expresses 0, 1 or N uniformly and zero rows is unambiguous. Chosen on the **asymmetry of reversal cost**: join-table→FK is trivial; FK→join-table is a migration plus rewriting every read. In-repo precedent for a named relation entity: `CompanyUser`. |
| **D3** | `DeliveryAssignment.status` has exactly two states: `in_transit → delivered` | `seed-store.ts`'s `assignTransportista` is ONE atomic write (sets carrier + state together). There is no "assigned but not yet picked up" phase in what the owner already uses. A third state is additive later. |
| **D4** | Capacity is **COMPUTED, never stored**. No `capacity`/`maxOrdersPerDay` column anywhere | `apps/salesops-mvp/app/domain/decisiones-dashboard.ts:329` `buildTransportistaCapacity` derives busy/free from live assignments; no static per-day number exists anywhere in the product. Same shape as `computeAccrual` — a pure function over current state. |
| **D5** | `POST /orders/:id/deliver` is **NOT restricted**. It keeps working exactly as today for BOTH `deliveryMode` values | Delivery must not break shipped behaviour. No change to `OrderStatus` (still exactly 4 states), no new scalar columns on `Order` (inverse relation only). |
| **D6** | **Sales remains the sole owner of `Order.status`.** Delivery DECLARES `IOrderDeliveryGateway`; the adapter implementing it lives in Sales' own app folder | Exact mirror of `ICommissionAccrualRecorder`: the port is declared by the module that NEEDS the trigger, implemented by the module that knows HOW. Import direction is the reverse of Commission (`DeliveryModule` imports `SalesModule`), consistent with the plan's stated "Delivery depends on Ventas". |
| **D7** | Carrier catalog CRUD follows the existing master-data role convention | **Verified in code**: `product.controller.ts:65,103,122`, `category.controller.ts:48,81,94` and `warehouse.controller.ts:48,81,94` all use `@Roles(USER_ROLES.owner, USER_ROLES.admin)` on `POST`/`PATCH`/`DELETE`, and carry **no `@Roles` at all** on `GET` — reads are open to any authenticated tenant user. `WarehouseController`'s doc comment states it outright (`:30-32`). Carrier mirrors this exactly. |
| **D8** | Naming is English | `Carrier` = *transportista*; `in_transit` = *transportando*; "asignar transportista" = create `DeliveryAssignment`; "marcar entregado" = the assignment transition + the gateway call. |

**Derived by precedent, not a new decision**: assigning a carrier and marking an
assignment delivered are OPERATIONS, not master-data writes, so they mirror
`POST /orders/:id/deliver` — `owner`/`admin`/`warehouse_operator`
(`order.controller.ts:248`), which is also who does it in the mock.

## Entity model

Tenant schema, additive only. Repo conventions applied: uuid `@id @default(uuid())
@db.Uuid`, snake_case via `@map`, `onDelete: Restrict` on every FK (never Cascade or
SetNull), `active` + `updatedAt` on mutable master data, `createdAt` only on
append-only rows.

```prisma
model Carrier {                                    // mutable master data
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  phone     String?
  active    Boolean  @default(true)                // soft delete, never hard DELETE
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  warehouses  CarrierWarehouse[]
  assignments DeliveryAssignment[]
  @@map("carrier")
}

model CarrierWarehouse {                           // coverage: 0, 1 or N warehouses
  id          String   @id @default(uuid()) @db.Uuid
  carrierId   String   @map("carrier_id") @db.Uuid
  warehouseId String   @map("warehouse_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at")

  carrier   Carrier   @relation(fields: [carrierId], references: [id], onDelete: Restrict)
  warehouse Warehouse @relation(fields: [warehouseId], references: [id], onDelete: Restrict)

  @@unique([carrierId, warehouseId])
  @@index([warehouseId])
  @@map("carrier_warehouse")
}

enum DeliveryAssignmentStatus { in_transit  delivered }   // exactly two — D3

model DeliveryAssignment {
  id          String                   @id @default(uuid()) @db.Uuid
  orderId     String                   @unique @map("order_id") @db.Uuid
  carrierId   String                   @map("carrier_id") @db.Uuid
  status      DeliveryAssignmentStatus @default(in_transit)
  assignedAt  DateTime                 @map("assigned_at")
  deliveredAt DateTime?                @map("delivered_at")
  createdAt   DateTime                 @default(now()) @map("created_at")
  updatedAt   DateTime                 @updatedAt @map("updated_at")

  order   Order   @relation(fields: [orderId], references: [id], onDelete: Restrict)
  carrier Carrier @relation(fields: [carrierId], references: [id], onDelete: Restrict)
  @@index([carrierId])
  @@map("delivery_assignment")
}
```

`Order` gains ONLY `deliveryAssignment DeliveryAssignment?` and `Warehouse` only
`carriers CarrierWarehouse[]` — inverse relations, no scalar columns, mirroring how
Commission added `commissionAccrual CommissionAccrual?` with a comment pinning WHICH
module added it (`schema.prisma:281-283`). Do the same here.

`orderId @unique` yields 0..1 assignments per order. **Pickup orders never get a
row** — that is the modelled meaning of the 0 case, not an accident.

**Zero `CarrierWarehouse` rows is a POLICY decision, deliberately not settled here.**
It can mean "serves every warehouse" or "not assignable yet". The join table makes
the state unambiguous to READ; what it MEANS is a product call the design phase must
pin down and write into the spec as an explicit scenario. See Open question 1.

## The boundary decision

`Order.status` stays owned by Sales. Delivery is the CALLER, never the owner.

```
Delivery.markDelivered(assignmentId)
  ├─ DeliveryAssignment: in_transit → delivered   (Delivery's own record)
  └─ IOrderDeliveryGateway.markOrderDelivered(orderId)   ← port DECLARED by Delivery
        └─ implemented in apps/api-salesops/src/sales/  ← Sales knows HOW
              └─ OrderService.deliver()  → unchanged: verified → delivered
                    └─ commission accrual fires as it already does
```

Rationale, in order of weight:

1. **Commission is shipped and hard-gates accrual on `order.status === 'delivered'`.**
   Making `Order.status` a derived/synced field (the Medusa/Shopify pattern) would
   break a frozen invariant and introduce a consistency problem, for no payoff at
   this scale.
2. **The module plan already concluded this**, with Odoo/Dolibarr/Shopify/Medusa
   evidence: *"en salesops, 'entregado' ya es un estado del Pedido → la entrega ES
   una transición de la venta"*.
3. **Odoo's own `stock_delivery` is a BRIDGE module, not an owner** — `auto_install`,
   connecting two apps without either owning the other. That is the shape adopted
   here, and the plan names it as the pattern we adopt (`:111-113`).

REJECTED: `Order.status` becomes derived/synced FROM Delivery. Rejected as
unnecessary complexity that breaks Commission's invariant and buys nothing.

**Consequence of routing through the existing `deliver()`**: an order delivered via
the Delivery path accrues commission through exactly the same code path as a pickup
order, once, guarded by `commission_accrual.order_id`'s uniqueness. No second accrual
path is introduced and none is needed.

## Ports

| Port | Declared in | Implemented in |
|---|---|---|
| `ICarrierRepository` | `packages/domain/src/delivery/` | `packages/infra-db/src/delivery/` |
| `ICarrierWarehouseRepository` (or coverage methods on `ICarrierRepository` — design call) | `packages/domain/src/delivery/` | `packages/infra-db/src/delivery/` |
| `IDeliveryAssignmentRepository` | `packages/domain/src/delivery/` | `packages/infra-db/src/delivery/` |
| **`IOrderDeliveryGateway`** | `packages/domain/src/delivery/` | **`apps/api-salesops/src/sales/`** ← the D6 mirror |

## Capabilities

### New
- **`salesops-delivery`** — the carrier catalog, warehouse coverage, the
  `DeliveryAssignment` two-state lifecycle, computed capacity, and the
  `IOrderDeliveryGateway` bridge that drives `Order` to `delivered` without owning it.

### Modified
- **`salesops-ventas` — AMENDMENT, not an append.** The shipped spec at
  `openspec/specs/salesops-ventas/spec.md:56-59` states the future Delivery module
  "inserts `verified → despachando → transportando → delivered`". **D5 makes that
  false**: `OrderStatus` keeps exactly 4 states and the in-transit lifecycle lives on
  `DeliveryAssignment`, not on `Order`. The scenario at `:73-78` ("delivery orders
  still use the direct Sales edge") stays TRUE under D5 but its premise —
  "(Delivery module not yet built)" — goes stale the moment this ships. Both must be
  amended in place. `sdd-spec` MUST NOT simply append a new requirement and leave the
  contradiction standing.

No change to `salesops-identity`: it holds no per-resource permission matrix (grep
confirmed), so the carrier role convention is specified inside `salesops-delivery`.

## Non-Goals (loud, explicit)

| NOT doing | Why |
|---|---|
| **Real carrier-rate integrations (UPS/DHL/etc.)** | Excluded by the module plan (`:171`). Carriers here are individual people with a phone. No `FulfillmentProvider` abstraction. |
| **A `zone` field of any kind** | **D2.** Coverage is the join table, full stop. |
| **Geo modelling (ServiceZone/GeoZone), shipping profiles, delivery pricing** | Medusa-scale ceremony. Nothing in the product asks for it. |
| **A stored capacity number** | **D4.** Computed only. |
| **A third assignment state** | **D3.** Additive later if the owner ever separates assignment from pickup-by-carrier. |
| **Any change to `OrderStatus`, or new scalar columns on `Order`** | **D5/D6.** Inverse relation only. |
| **Gating `POST /orders/:id/deliver` to pickup** | **D5.** It stays open for both modes. |
| **Odoo's `stock.picking` apparatus** (packages, lots, multi-step routes) | Inventory already excludes this explicitly. |
| **Wiring `apps/salesops-mvp` to the real API** | Pending for every module, has an auth precondition, separate effort. |
| **`apps/static-store`, `packages/storefront`** | LEGACY, frozen. Not read, not touched. |
| **Any UI** | Backend capability only. |

## Affected areas

| Area | Impact | Slice |
|---|---|---|
| `packages/domain/src/delivery/` (entities, capacity fn, 4 ports, errors, `index.ts`) | New concept folder | A |
| `packages/domain/src/index.ts` | Modified — barrel export (8 → 9 modules) | A |
| `packages/infra-db/prisma/tenant/schema.prisma` + **one migration** | New — 3 tables, 1 enum, 2 inverse relations | A |
| `packages/infra-db/src/delivery/` (adapters, seed, spec helpers) | New | B |
| `apps/api-salesops/src/delivery/` (module, controller, service, DTOs) | New | B, C |
| `apps/api-salesops/src/sales/order-delivery-gateway.adapter.ts` | New — the D6 adapter, in SALES' folder | C |
| `apps/api-salesops/src/sales/sales.module.ts` | Modified — export the gateway DI token | C |
| `apps/api-salesops/src/app.module.ts` | Modified — register `DeliveryModule` | C |
| `openspec/specs/salesops-ventas/spec.md` | **Amended** — `:56-59`, `:73-78` | — |
| `packages/domain/src/sales/order.ts:13-17` | Comment updated — the seam is now fulfilled, not future | C |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **`salesops-ventas` amendment missed.** The shipped spec asserts a 6-state delivery path that D5 contradicts. Appending instead of amending ships a green suite against a false spec — the exact failure `sales-agents-commissions` flagged for `salesops-identity`. | **High** | Named in Capabilities. `sdd-spec` writes an AMENDMENT. Verify phase greps `despachando`/`transportando` in `openspec/specs/`. |
| **D5's direct consequence: an operator can call `POST /orders/:id/deliver` on a `delivery`-mode order that has an OPEN assignment**, leaving `delivery_assignment.status = in_transit` forever against a `delivered` order — permanently wrong capacity readings, since capacity is computed from exactly that field. | **High** | This is the sharpest cost of D5 and it is accepted, not hidden. Design MUST choose a reconciliation rule (auto-close the assignment inside the gateway path, expose a reconcile read, or accept drift). See Open question 2. |
| **Partial-failure atomicity in Slice C.** `markDelivered` writes two records. Commission solved its analogue with try/catch (delivery must stand even if accrual fails) — but here both writes live in the SAME tenant schema, so a single Prisma transaction is available and the try/catch precedent may be the wrong one to copy. | Medium | Design decision, explicitly flagged. Whichever is chosen, name the source of truth when they diverge. |
| **Circular NestJS module dependency.** `SalesModule` already imports `CommissionModule`; now `DeliveryModule` imports `SalesModule`. If anything ever makes Sales import Delivery, DI cycles. | Medium | The direction is one-way BY DESIGN (D6). Add it to the boundary rules; consider an eslint boundary so it is enforced, not requested politely (`architecture.md:132-141`). |
| **Migration risk.** 3 new tables + 1 enum + 2 inverse relations. Additive, no backfill, no column added to an existing table. | Low | Rehearse on a clone of `store_mgmt_test`, as prior changes did. **Never touch dev `store_mgmt`.** Author the compensating down-migration and round-trip it BEFORE applying forward. |
| **Legacy `delivery`-mode orders already `delivered` have no assignment row.** | Certain | No backfill. Every read MUST tolerate a missing assignment; 0..1 is the modelled cardinality, not an anomaly. |
| **`apps/salesops-mvp` models a `transportando` ORDER state the backend deliberately does not.** The mapping (`transportando` = order `verified` + assignment `in_transit`) is real translation work. | Medium | Deferred with phase D, out of scope here. Record the mapping in the spec so the future wiring change does not rediscover it. |
| **Slice A may exceed the 400-line review budget** (domain folder + schema + migration). | Medium | `sdd-tasks` should forecast splitting A into A1 (domain concept + ports) and A2 (schema + migration). |

## Rollback plan

Per slice, on one branch, all pre-push:

- **Slice A**: the migration is the only irreversible step. New tables drop cleanly;
  the inverse relations on `Order`/`Warehouse` are relation-only and vanish with them.
  Round-trip the down-migration on a test-DB clone first.
- **Slice B**: revert. Read-only surface; nothing written.
- **Slice C**: revert. `POST /orders/:id/deliver` is untouched throughout (D5), so
  reverting Delivery returns the system to exactly today's behaviour for both
  delivery modes — no Sales functionality was ever routed exclusively through it.

## Dependencies

- Branch cut after `backend-users-roles` was archived (`d84a97e`). Roles must already
  resolve from `CompanyUser`.
- ~~`openspec/specs/salesops-identity/spec.md` currently has uncommitted local edits.
  Land or discard them before cutting, so the amendment to `salesops-ventas` does not
  land on a dirty spec tree.~~ **RETRACTED 2026-08-06 — this was never true.** Verified
  with `git status --porcelain` and `git diff HEAD -- openspec/specs/salesops-identity/spec.md`:
  the file is identical to `HEAD` and the tree is clean apart from this change's own
  untracked `openspec/changes/delivery/` folder. That spec was rebuilt and committed in
  `d755713`, which is pushed. There is **no dirty-spec-tree blocker** — do not stop apply
  on it.
- Commission is shipped and its `delivered`-gated accrual is treated as frozen.

## Success criteria

- [ ] `packages/domain/src/delivery/` exists with `Carrier`, `CarrierWarehouse`,
      `DeliveryAssignment` and 4 ports; `index.ts` exports 9 modules.
- [ ] No `zone` column anywhere in the diff (D2). No `capacity` column anywhere (D4).
- [ ] `DeliveryAssignmentStatus` has exactly two values (D3).
- [ ] `OrderStatus` still has exactly 4 values and `Order` gains no scalar column (D5/D6).
- [ ] `IOrderDeliveryGateway` is declared in `packages/domain/src/delivery/` and its
      only implementation lives under `apps/api-salesops/src/sales/`; no Delivery file
      imports a Sales implementation, and no Sales file imports `DeliveryModule`.
- [ ] `POST /orders/:id/deliver` passes its existing tests unchanged for BOTH
      `deliveryMode` values.
- [ ] Carrier capacity is served by a pure function over assignment rows; "orders
      awaiting a carrier" is reported independently as a count of ORDERS.
- [ ] Carrier writes are `owner`/`admin`; carrier reads carry no `@Roles` (D7).
      Assign/mark-delivered are `owner`/`admin`/`warehouse_operator`.
- [ ] `salesops-ventas` is AMENDED — no scenario or prose still claims Delivery
      inserts `despachando`/`transportando` into `Order`.
- [ ] Each slice verified independently: `pnpm -r build` clean, full suites green,
      lint `--max-warnings 0`, before the next slice starts.

## Open questions

Only genuinely unresolved items. Everything in the decisions table above is CLOSED.

1. **What does zero `CarrierWarehouse` rows mean?** "This carrier serves every
   warehouse" or "this carrier is not assignable anywhere yet"? The join table makes
   the state unambiguous to read (D2 bought exactly that); its MEANING is a product
   call. It changes what the carrier-list and capacity reads return for a
   freshly-created carrier. Design must pin it down and spec it as an explicit
   scenario; owner input decides which.

2. **When `POST /orders/:id/deliver` is called directly on a `delivery`-mode order
   that has an open assignment, what happens to that assignment?** D5 keeps the
   endpoint open but does not say. Options: the gateway path auto-closes the
   assignment (`in_transit → delivered`) whichever door was used; or the assignment is
   left as-is and a reconcile read surfaces the drift; or the drift is simply
   accepted. This directly determines whether computed capacity can go permanently
   stale (see Risks).

3. **Is carrier→warehouse coverage an ENFORCED invariant on assignment, or advisory?**
   I.e. must assigning a carrier to an order be REJECTED when the carrier has no
   `CarrierWarehouse` row for that order's `warehouseId`, or is coverage only used to
   filter/sort the picker? The mock enforces nothing (`transportista-picker.tsx` lists
   all carriers with no filtering), but the mock is evidence of intent, not a rule.
