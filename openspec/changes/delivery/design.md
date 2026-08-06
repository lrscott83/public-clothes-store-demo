# Design: delivery

> Input: `openspec/changes/delivery/proposal.md` (D1–D8 CLOSED) and engram
> `sdd/delivery/explore`. This document answers only what the proposal left open:
> the two-way port relationship, atomicity, where capacity lives, coverage
> semantics, the read surface, and the tenant migration mechanism. It does not
> re-open D1–D8.

## 1. Technical approach

Delivery is a **bridge module** in Odoo's `stock_delivery` sense: it owns the
`Carrier` catalog, `CarrierWarehouse` coverage and the `DeliveryAssignment`
lifecycle, and it *drives* `Order.status` without owning it.

The load-bearing insight of this design is that the relationship between Sales
and Delivery is **two-way but asymmetric**, and the two directions are
implemented by **two different mechanisms on purpose** (§2). That asymmetry is
what makes the NestJS module graph stay a DAG and what makes `markDelivered`
atomic — one decision solves both of the flagged risks.

Everything else follows the Commission precedent verbatim: flat concept files in
`packages/domain/src/delivery/`, `interface I<Name>` + `Symbol('I<Name>')` per
port, Prisma adapters in `packages/infra-db/src/delivery/`, thin NestJS delivery
in `apps/api-salesops/src/delivery/`, pure computation as a function over rows
the repository supplies.

## 2. ADR-1 — The two directions use two different mechanisms

### Direction A · Delivery → Sales (drive the order to `delivered`)

Domain port + NestJS DI. Exact mirror of `ICommissionAccrualRecorder`, with the
import direction reversed as D6 states.

| | |
|---|---|
| Port declared | `packages/domain/src/delivery/order-delivery-gateway.port.ts` — `IOrderDeliveryGateway`, token `ORDER_DELIVERY_GATEWAY` |
| Adapter implemented | `apps/api-salesops/src/sales/order-delivery-gateway.adapter.ts` — **Sales' own app folder**, because Sales knows HOW (D6, mirroring where `CommissionAccrualRecorder` lives) |
| Wiring | `SalesModule` adds the provider and `exports: [ORDER_DELIVERY_GATEWAY]`; `DeliveryModule` imports `SalesModule` |
| Body | Delegates to the existing `OrderService.deliver(orderId)` — **not** to `IOrderRepository` directly, so commission accrual keeps firing through the one existing path and no second accrual trigger is introduced |

### Direction B · Sales → Delivery (close the open assignment)

**NOT** a NestJS port. An infra-db transactional helper invoked inside
`PrismaOrderRepository.deliver`'s **already-open** `$transaction`.

```
packages/infra-db/src/delivery/close-assignment-on-delivery.ts
  export async function closeAssignmentOnDeliveryTx(
    tx: Prisma.TransactionClient, orderId: string): Promise<void>
```

The precedent is exact and already in this file: `PrismaOrderRepository.deliver`
(`prisma-order.repository.ts:372-405`) **already writes another concept's tables**
— `stock_level` and `stock_movement` — inside its own transaction, via
`applyReservationTx` / `applyStockMovementTx` imported from
`packages/infra-db/src/inventory/`. Closing an assignment is the same shape:
a write that must be atomic with the order transition, expressed as a shared
`*Tx` helper in the owning concept's infra folder.

**This is what kills the cycle.** No NestJS edge `SalesModule → DeliveryModule`
is created at all, so there is no `forwardRef`, no event bus, no lazy `ModuleRef`.
The module graph stays a DAG:

```
AppModule ─→ DeliveryModule ─→ SalesModule ─→ CommissionModule
                                    │
                             (InfraDbModule)
```

### Rejected alternatives for Direction B

| Option | Cycle? | Atomic? | Verdict |
|---|---|---|---|
| Domain port `IDeliveryAssignmentCloser` injected into `OrderService.deliver` | **Yes** — needs `forwardRef` on both sides | No (two transactions) | Rejected: worse on both axes, and `forwardRef` hides a real design smell rather than resolving it |
| `@nestjs/event-emitter` `order.delivered` event | No | No (fire-and-forget) | Rejected: new dependency, and the accrual port's own doc comment already argues that at this scale "a bus is ceremony" |
| Delivery closes its own assignment; no Sales callback | No | No | Rejected: leaves the `POST /orders/:id/deliver` door stranding assignments in `in_transit` forever — the exact High risk the proposal flags |
| **infra-db `*Tx` helper (chosen)** | No | **Yes** | — |

### Cost of the choice, stated plainly

The Sales→Delivery direction is **not visible as a DI token**. A reader of
`OrderService.deliver` cannot see that an assignment gets closed. Three
mitigations, all required:

1. Extend the doc comment on `IOrderRepository.deliver`
   (`packages/domain/src/sales/order-repository.port.ts:41`) with the new
   postcondition: *"also closes any open `DeliveryAssignment` for the order, in
   the same transaction"*.
2. Add `packages/domain/src/delivery/delivery-assignment-seam.md` documenting
   the two-way relationship — repo convention, mirroring
   `domain/src/inventory/stock-reservation-seam.md` and `commission-seam.md`.
3. Add an eslint boundary in `packages/eslint-config` forbidding
   `apps/api-salesops/src/sales/**` from importing `../delivery/**`
   (`architecture.md:132-141` — a boundary that lives only in a doc breaks on its
   own).

### Consequence: `markDelivered` is thin

Because Sales' `deliver()` closes the assignment for **every** door, Delivery's
own `markDelivered` does **not** write the assignment itself:

```ts
// apps/api-salesops/src/delivery/delivery.service.ts
async markDelivered(assignmentId: string) {
  const a = await this.assignments.findById(assignmentId);   // 404 if absent
  if (a.status !== 'in_transit') throw new InvalidAssignmentStateError(...);
  await this.orderDeliveryGateway.markOrderDelivered(a.orderId); // closes it
  return this.assignments.findById(assignmentId);            // re-read
}
```

One write path, one place, identical outcome whichever endpoint was used.

## 3. ADR-2 — A transaction, not Commission's try/catch

**Choice: single transaction.** Commission's try/catch is right *for Commission*,
for reasons that do not transfer.

| | Commission accrual | Delivery assignment |
|---|---|---|
| Nature of the second write | A **financial** record about an agent — independently true from the goods movement | A **projection of the same physical event**. "Order delivered but the carrier still has it" is not a meaningful state |
| Recovery if it fails | Manual DB reconciliation exists (ugly, but exists) | **None.** `delivered` is terminal so `deliver()` can never be retried; `markDelivered` guards `in_transit`. Permanently stranded |
| Blast radius of drift | One missing accrual row | **Every capacity read, forever** — capacity is computed from exactly this field (D4) |
| Technical obstacle to a tx | Cross-concept reads, a pure computation, an idempotency lookup, and a `null`-returning refusal path | **None.** One guarded `UPDATE` on a table in the SAME tenant schema, inside a transaction that is already open |

`apps/api-salesops/src/sales/order.service.ts:304-313` confesses in its own doc
comment that the try/catch left a case with "no in-app recovery path at all".
Copying that here, where a transaction is genuinely available, would knowingly
reproduce a documented mistake in the case that is *worse* — because the damaged
value is read on every dashboard load.

**Failure semantics**: if the assignment close fails, the whole `deliver()`
transaction rolls back — order stays `verified`, stock untouched, assignment
still `in_transit`, caller gets a 5xx **and can retry**. Strictly better than any
partial state. Commission's accrual still runs *after* the transaction returns,
in its existing try/catch, entirely unchanged.

**Idempotency / the 0-row case**: the helper is a guarded conditional update,
mirroring `applyReservationTx`'s style:

```sql
UPDATE delivery_assignment SET status='delivered', delivered_at=now(), updated_at=now()
WHERE order_id = $1 AND status = 'in_transit'
```

Zero rows affected is **not** an error — pickup orders never have a row, and
legacy `delivery`-mode orders delivered before this change have none either.
0..1 is the modelled cardinality (D1). Never `findUniqueOrThrow` here.

## 4. ADR-3 — Capacity: a pure function, a repository that supplies rows

No query in the domain. Same shape as `computeAccrual(input, references, at)`:
the application service loads the snapshot, the pure function only decides.

```ts
// packages/domain/src/delivery/compute-carrier-capacity.ts  — PURE
export interface CarrierCapacityRow {
  readonly carrierId: string; readonly carrierName: string;
  readonly busy: boolean; readonly inTransitCount: number;
}
export interface CarrierCapacity {
  readonly carriers: readonly CarrierCapacityRow[];
  readonly busyCount: number; readonly freeCount: number;
}
export function computeCarrierCapacity(
  carriers: readonly Carrier[],
  openAssignments: readonly DeliveryAssignment[],  // status === 'in_transit'
): CarrierCapacity
```

What the ports must expose:

- `ICarrierRepository.list(filter?: { activeOnly?: boolean }): Promise<Carrier[]>`
- `IDeliveryAssignmentRepository.list(filter?: { carrierId?, status?, orderId? })`

`ordersAwaitingCarrier` is a **count of ORDERS** and is not derivable from the
carrier rows (explore: `sinChofer`). It goes on
`IDeliveryAssignmentRepository.countOrdersAwaitingCarrier()`, **not** on
`IOrderRepository` — the question is about the *absence of a Delivery row*, a
concept Sales must not learn. Putting it on `OrderListFilter` would make Sales'
port name `deliveryAssignment`, which is precisely the dependency direction D6
forbids. The Delivery adapter performs the anti-join (a read, never a write)
against `sales_order`; **`IOrderRepository` and `OrderListFilter` are not
touched by this change.**

## 5. ADR-4 — Coverage is advisory, surfaced on READS only

| Option | Verdict |
|---|---|
| Silent (coverage never leaves the DB) | Rejected — the join table then buys nothing operationally |
| `warning` field on the assign response | **Rejected.** A warning nobody reads is dead weight, and it is the first step to a `409`: the moment a client asserts on it, it becomes a de-facto block |
| **Expose coverage on the carrier read; write stays clean (chosen)** | The picker can sort/flag; the write path stays a pure operational fact |

Concretely: `GET /delivery/carriers?warehouseId=<uuid>` returns every active
carrier with an added `coversWarehouse: boolean`, **unfiltered** — the client
decides how to present it. `POST /delivery/assignments` accepts any
active carrier for any order, returns `201`, and carries **no** warning field.

**Pinned as a stated non-behaviour**: the spec MUST contain a scenario asserting
that assigning a carrier with no `CarrierWarehouse` row for the order's warehouse
**succeeds**. Turning this into a hard block later requires an explicit spec
change, not a quiet service-layer `if`.

**Open question 1 resolved (owner to confirm)**: zero `CarrierWarehouse` rows
means **"no declared coverage"**, not "serves everywhere". It is the only reading
consistent with advisory coverage — "serves everywhere" would make a
freshly-created carrier look maximally covered, a claim the data does not
support. Effect: `coversWarehouse: false` for every warehouse; the carrier is
still listed, still counted in capacity, still assignable.

## 6. The read surface

| Read | Endpoint | Domain-pure computation | Repository query |
|---|---|---|---|
| Carrier catalog (+ coverage flag) | `GET /delivery/carriers[?warehouseId]` | — | `ICarrierRepository.list` + `ICarrierWarehouseRepository.listByCarrier` |
| One carrier | `GET /delivery/carriers/:id` | — | `ICarrierRepository.findById` |
| Who has what right now | `GET /delivery/assignments?status=&carrierId=` | — | `IDeliveryAssignmentRepository.list` |
| One order's assignment | `GET /delivery/assignments/by-order/:orderId` | — | `findByOrderId` (nullable — 0..1) |
| Who is free / busy | `GET /delivery/capacity` | **`computeCarrierCapacity`** | `ICarrierRepository.list` + `list({status:'in_transit'})` |
| Orders awaiting a carrier | same payload, field `ordersAwaitingCarrier` | — | `countOrdersAwaitingCarrier()` (anti-join) |
| How much each carrier delivered | `GET /delivery/capacity` field `deliveredCount`, or `?from=&to=` | **pure fold over rows** (`computeCarrierThroughput`) | `list({status:'delivered'})` |

Every read MUST tolerate a missing assignment. `null` is the modelled meaning of
"pickup, or delivered before this module existed" — never a 404, never an error.

## 7. Component / layer map

| Path (under `templates/`) | Action | Contents |
|---|---|---|
| `packages/domain/src/delivery/carrier.ts` | Create | `Carrier` entity + factory + validation |
| `packages/domain/src/delivery/carrier-warehouse.ts` | Create | `CarrierWarehouse` entity |
| `packages/domain/src/delivery/delivery-assignment.ts` | Create | Entity, `DeliveryAssignmentStatus`, `assignCarrier()` factory, `markAssignmentDelivered()` pure guard (mirrors `deliverOrder()`) |
| `packages/domain/src/delivery/compute-carrier-capacity.ts` | Create | PURE (§4) |
| `packages/domain/src/delivery/compute-carrier-throughput.ts` | Create | PURE fold over delivered rows |
| `packages/domain/src/delivery/errors.ts` | Create | `InvalidAssignmentStateError`, `CarrierNotFoundError`, `OrderAlreadyAssignedError` |
| `packages/domain/src/delivery/carrier-repository.port.ts` | Create | `ICarrierRepository` + `CARRIER_REPOSITORY` |
| `packages/domain/src/delivery/carrier-warehouse-repository.port.ts` | Create | Separate port — coverage is written independently of the catalog (`PATCH /carriers/:id/warehouses`) and a merged port would force every carrier read to know about warehouses |
| `packages/domain/src/delivery/delivery-assignment-repository.port.ts` | Create | `IDeliveryAssignmentRepository` |
| `packages/domain/src/delivery/order-delivery-gateway.port.ts` | Create | `IOrderDeliveryGateway` + `ORDER_DELIVERY_GATEWAY` (§2A) |
| `packages/domain/src/delivery/delivery-assignment-seam.md` | Create | The two-way relationship, written down |
| `packages/domain/src/delivery/index.ts` | Create | Wildcard re-exports |
| `packages/domain/src/index.ts` | Modify | 8 → 9 concept exports |
| `packages/domain/src/sales/order-repository.port.ts` | Modify | Doc comment only — `deliver`'s new postcondition |
| `packages/domain/src/sales/order.ts:13-17` | Modify | Comment: the seam is fulfilled, not future |
| `packages/infra-db/prisma/tenant/schema.prisma` | Modify | 3 models, 1 enum, 2 inverse relations (§9) |
| `packages/infra-db/prisma/tenant-schema.sql` | Regenerate | Artifact, never hand-edited (§10) |
| `packages/infra-db/src/delivery/prisma-carrier.repository.ts` | Create | |
| `packages/infra-db/src/delivery/prisma-carrier-warehouse.repository.ts` | Create | |
| `packages/infra-db/src/delivery/prisma-delivery-assignment.repository.ts` | Create | Incl. the `countOrdersAwaitingCarrier` anti-join |
| `packages/infra-db/src/delivery/close-assignment-on-delivery.ts` | Create | `closeAssignmentOnDeliveryTx` (§2B) — the ONLY writer of `status` on the delivered edge |
| `packages/infra-db/src/sales/prisma-order.repository.ts` | Modify | One call added inside `deliver`'s existing `$transaction` |
| `packages/infra-db/src/delivery/seed.ts` + `delivery-fixtures.spec-helper.ts` | Create | |
| `packages/infra-db/src/index.ts` | Modify | Export the three adapters |
| `apps/api-salesops/src/delivery/delivery.module.ts` | Create | `imports: [InfraDbModule, SalesModule]` |
| `apps/api-salesops/src/delivery/carrier.controller.ts` | Create | Writes `@Roles(owner, admin)`; reads no `@Roles` (D7) |
| `apps/api-salesops/src/delivery/delivery-assignment.controller.ts` | Create | Assign / mark-delivered: `@Roles(owner, admin, warehouse_operator)` |
| `apps/api-salesops/src/delivery/delivery.service.ts` + `dto/index.ts` | Create | |
| `apps/api-salesops/src/sales/order-delivery-gateway.adapter.ts` | Create | The D6 adapter, in SALES' folder |
| `apps/api-salesops/src/sales/sales.module.ts` | Modify | Provide + `exports: [ORDER_DELIVERY_GATEWAY]` |
| `apps/api-salesops/src/app.module.ts` | Modify | Register `DeliveryModule` |
| `packages/eslint-config/` | Modify | Sales must not import Delivery |

## 8. Interfaces

```ts
// packages/domain/src/delivery/order-delivery-gateway.port.ts
/**
 * Declared by DELIVERY because Delivery is the one that NEEDS the transition —
 * dependency inversion, mirroring `ICommissionAccrualRecorder`. Sales remains
 * the sole owner of `Order.status` (D6); this port only asks.
 */
export interface IOrderDeliveryGateway {
  /** `verified -> delivered` via Sales' existing path (commission accrual included). */
  markOrderDelivered(orderId: string): Promise<Order>;
}
export const ORDER_DELIVERY_GATEWAY = Symbol('IOrderDeliveryGateway');

// packages/domain/src/delivery/delivery-assignment-repository.port.ts
export interface DeliveryAssignmentFilter {
  readonly carrierId?: string;
  readonly status?: DeliveryAssignmentStatus;
  readonly deliveredFrom?: Date;
  readonly deliveredTo?: Date;
}
export interface IDeliveryAssignmentRepository {
  /** Fails on a duplicate `orderId` — the UNIQUE index IS the guarantee (D1). */
  create(assignment: DeliveryAssignment): Promise<DeliveryAssignment>;
  findById(id: string): Promise<DeliveryAssignment | null>;
  /** `null` = pickup order, or delivered before this module existed. Not an error. */
  findByOrderId(orderId: string): Promise<DeliveryAssignment | null>;
  list(filter?: DeliveryAssignmentFilter): Promise<DeliveryAssignment[]>;
  /** Anti-join: verified + deliveryMode='delivery' + no assignment row. */
  countOrdersAwaitingCarrier(): Promise<number>;
}
```

There is **no** `markDelivered` on this port. The delivered edge has exactly one
writer — `closeAssignmentOnDeliveryTx`, inside Sales' transaction (§2B, §3).
That absence is the design; do not add it back for convenience.

## 9. Data model

Exactly as `proposal.md:124-168` (D1/D2/D3/D4). Two notes for implementation:

- `Order` maps to table **`sales_order`** (`"order"` is a SQL reserved word), so
  the anti-join and any raw SQL must use `sales_order`, not `order`.
- `Order` gains only `deliveryAssignment DeliveryAssignment?` and `Warehouse`
  only `carriers CarrierWarehouse[]`, each with a comment pinning WHICH module
  added it — mirroring `commissionAccrual` at `schema.prisma:281-283`.

## 10. Data flow

**(a) Assign a carrier** — one write, no cross-module call:

```
POST /delivery/assignments {orderId, carrierId}
  └─ DeliveryService.assign
       ├─ ICarrierRepository.findById       → 404 / must be active
       ├─ IDeliveryAssignmentRepository.findByOrderId → 409 if present
       └─ assignCarrier() [pure] → create()  status=in_transit, assignedAt=now
             (coverage NOT checked — advisory, §5)
```

**(b) Mark delivered via Delivery** — Delivery asks, Sales acts:

```
POST /delivery/assignments/:id/deliver
  └─ DeliveryService.markDelivered      guard: status === 'in_transit'
       └─ IOrderDeliveryGateway.markOrderDelivered(orderId)     [port]
            └─ apps/.../sales/order-delivery-gateway.adapter.ts
                 └─ OrderService.deliver(orderId)
                      ├─ IOrderRepository.deliver(id)  ── ONE $transaction ──┐
                      │    · guard verified                                  │
                      │    · applyReservationTx(release) per line            │
                      │    · applyStockMovementTx(sale_out) per line         │
                      │    · order.status = delivered                        │
                      │    · closeAssignmentOnDeliveryTx(tx, orderId) ◄──────┘  §2B
                      └─ commissionAccrualRecorder (try/catch, UNCHANGED)
```

**(c) Mark delivered via Sales' existing endpoint (D5)** — identical tail, so the
assignment cannot strand:

```
POST /orders/:id/deliver  →  OrderService.deliver(id)  →  (same box as above)
```

For a `pickup` order, `closeAssignmentOnDeliveryTx` affects 0 rows and returns.
Behaviour is byte-identical to today.

## 11. Migration / rollout

The tenant side has **no `prisma/migrations/` folder** — that mechanism exists
only for the master schema. Tenant DDL flows through two artifacts:

1. **`packages/infra-db/prisma/tenant/schema.prisma`** — edited by hand.
2. **`packages/infra-db/prisma/tenant-schema.sql`** — regenerated, never
   hand-edited, by `node scripts/generate-tenant-schema-sql.ts`
   (`prisma migrate diff --from-empty --to-schema`). It opens **no** DB
   connection. This is the DDL `TenantDatabaseService` applies when
   **provisioning a NEW tenant**, so fresh tenants get the three tables for free.

**Already-provisioned tenants** are handled by the fleet migration tool,
`packages/infra-db/scripts/tenant-migrate.ts` → `src/tenant/tenant-migrate.ts`
(`salesops-tenancy/spec.md`: "Single Migration Tool With Loud Drift Detection").
It computes `prisma migrate diff` from each *live* tenant schema to
`tenant/schema.prisma`, applies it with a per-tenant timeout, and continues past
a failed tenant rather than aborting the batch.

Sequence, gated:

1. `tenant-migrate` in **`check`** mode — must report every tenant in-sync
   *before* the schema edit lands. A pre-existing drift must not be attributed to
   this change.
2. Edit `schema.prisma`; regenerate `tenant-schema.sql`; `prisma:generate`.
3. Rehearse `migrate` mode on a clone of **`store_mgmt_test`**. Never dev
   `store_mgmt`.
4. `migrate`, then `check` again — all tenants in-sync.

The diff is purely additive (3 `CREATE TABLE`, 1 `CREATE TYPE`, FKs, indexes;
no column added to an existing table), so it contains **no destructive
statement** and the destructive-override flag is **not** required. If it ever
asks for one, stop — something is wrong with the diff.

**Rollback**: there is no down-migration file to author. Revert
`schema.prisma` + regenerate `tenant-schema.sql`, then per tenant schema
`DROP TABLE delivery_assignment, carrier_warehouse, carrier;` and
`DROP TYPE "DeliveryAssignmentStatus";`. Round-trip that on the test clone
*before* applying forward. **No backfill** — legacy `delivery`-mode orders
already `delivered` keep zero assignment rows, which is the modelled 0 case.

## 12. Testing strategy (conventions only — no tests written here)

| Layer | Suffix / runner | What |
|---|---|---|
| `packages/domain` | vitest, `*.test.ts` | `computeCarrierCapacity`, `computeCarrierThroughput`, `assignCarrier`, `markAssignmentDelivered` guard — pure, zero DB |
| `packages/infra-db` | jest + **real Postgres**, `*.spec.ts`, `pnpm test` | Adapters; `countOrdersAwaitingCarrier` anti-join; **the rollback case for `closeAssignmentOnDeliveryTx`** (force a failure inside `deliver`'s tx, assert order still `verified` AND assignment still `in_transit`); the 0-row pickup case |
| `apps/api-salesops` | jest unit + e2e, `*.spec.ts` | Controllers/roles; gateway adapter; **e2e: `POST /orders/:id/deliver` on a `delivery` order with an open assignment closes it** (the D5 door); existing order e2e must pass unchanged for BOTH `deliveryMode` values |

Strict TDD is active: RED before GREEN on every pure function, on the gateway
adapter, and on the rollback case.

## 13. Risks

| Risk | Mitigation |
|---|---|
| **Direction B is invisible in the Sales app layer.** Someone refactors `PrismaOrderRepository.deliver` and drops the call. | The infra-db rollback spec + the e2e D5-door test both fail loudly. Plus the seam file and the port doc comment. |
| **`closeAssignmentOnDeliveryTx` widens `deliver`'s transaction.** | One indexed `UPDATE` on `order_id` (UNIQUE). Negligible next to the per-line stock work already inside. |
| **eslint boundary not added** → nothing stops a future `SalesModule → DeliveryModule` import, and then the cycle is real. | Ship the lint rule in the same slice as the gateway, not "later". |
| **`salesops-ventas` amendment missed** (proposal's High risk). | Unchanged: `sdd-spec` amends `:56-59` and `:73-78`; verify greps `despachando`/`transportando`. |
| **Advisory coverage hardens by accident.** | Spec scenario asserts out-of-coverage assignment SUCCEEDS. |
| **A tenant is mid-flight during fleet migration.** | Additive DDL only; no existing table is locked for rewrite. `check` gates both ends. |
| **`countOrdersAwaitingCarrier` reads `sales_order` from Delivery's adapter.** | Read-only, and the alternative (teaching `IOrderRepository` about assignments) inverts D6's dependency direction. Documented at the call site. |

## 14. Non-goals

Everything in `proposal.md:248-263` stands unchanged. Added by this design:

- **No `markDelivered` on `IDeliveryAssignmentRepository`** — one writer only.
- **No `warning` field on the assign response** (§5).
- **No change to `IOrderRepository` / `OrderListFilter`** (§4).
- **No `forwardRef`, no event emitter, no `ModuleRef`** anywhere (§2).
- **No third assignment state, no `zone`, no stored capacity** (D2/D3/D4).

## 15. Open questions

- [ ] **Owner confirmation only**: zero `CarrierWarehouse` rows = "no declared
      coverage" (§5). Design recommends it; the spec should state it as a
      scenario either way.
- [ ] Should `deliveredCount` be all-time or windowed by default on
      `GET /delivery/capacity`? Design assumes all-time with optional
      `?from=&to=`; cheap to change, spec should pin it.
