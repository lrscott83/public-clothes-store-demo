# Exploration: sales-agents-commissions

Backlog item 4 — `gestor`/`sales_agent` role + Gestores+Comisiones module.
Engram twin: `sdd/sales-agents-commissions/explore` (#1599).

## Current State

**Authorization baseline (just landed, `f014296`).** `app_user.roles` is gone (migration 002).
Authorization is `CompanyUser.role` (Int bitmask) keyed on `(userId, companyId)` + `status`.
`JwtStrategy.validate` (`templates/packages/api-common/src/auth/jwt.strategy.ts:84-112`) resolves
the ACTIVE `CompanyUser` per request and puts the bitmask on `req.user.roles`; a missing/non-ACTIVE
assignment is a 403 + logged `MISSING_COMPANY_USER`. Confirmed by direct read, not assumed.

**Role bits today** (`templates/packages/domain/src/users/roles.ts:5-11`):

```
user:1, warehouse_operator:2, sales_operator:4, owner:8, admin:16
```

`BUSINESS_ROLES_MASK = user|warehouse_operator|sales_operator|owner` (line 16-17); `owner`'s
`effectiveRoles` union-expands to exactly that mask (line 68-70), `admin` to all bits. **Adding a
new bit requires deciding whether `owner` inherits it automatically** — today `BUSINESS_ROLES_MASK`
is a hand-maintained union, not "everything except admin", so a new bit is OFF by default for owner
unless explicitly added to that mask.

**`sales_operator` is NOT the sales agent.** Its Spanish label is literally `'Operador de gestores'`
(roles.ts:28) — "operator OF gestores" — i.e. the internal role that supervises gestores, matching
the MVP route `operador-gestores.tsx` ("Operador de gestores" kanban: Aceptar pedido, Pagar
Comisión). Corroborated by `openspec/changes/backend-users-roles/proposal.md:69`, which explicitly
deferred *"`gestor` role → future Gestores+Comisiones module (additive bit later)"* as something
separate from `operador_gestores` at the time roles were first designed. **The distinction is
well-evidenced, not invented**: `sales_operator` = supervisor role over gestores (a `CompanyUser`
bit, logs in today); `gestor`/`sales_agent` = the field salesperson who books the sale (identity
TBD — see Open Questions).

**What "gestor" means in this business** (`docs/plans/reference/02-sales-process.md:19-30`):
manual process step 8 is *"Entregan la comisión al gestor"*; gestores are listed among the actors
who can insert a sale (*"Los gestores de ventas… Los propios clientes… Los usuarios del mismo
almacén"*). So a gestor is an external/field salesperson tied 1:1 to specific orders, distinct from
a warehouse/store user and distinct from the customer.

**Commission model — richly specified in the ORIGINAL MVP, entirely absent from the current
backend.** The MVP (`templates/apps/salesops-mvp/app/`) is a disconnected localStorage prototype
(confirmed OUT OF SCOPE for `ventas-english-rename`,
`openspec/changes/archive/2026-07-27-ventas-english-rename/proposal.md:140-144`) but it is the
richest source of intended behavior:

- `Gestor = { id, name, phone? }` (`app/domain/types.ts:14-18`) — a **plain reference entity, not
  a User/login-based actor**. Seeded as a static list (`GESTORES`, `app/seed/constants.ts:22-28`),
  5 named individuals.
- `Order.gestorId: string` (types.ts:67) — **one gestor per order**, a simple FK-like field, no
  many-to-many, no line-level attribution.
- Commission is **per product/line**, resolved by a keyword/category-default/catch-all dictionary
  in MN (`app/seed/commission-map.ts`), NOT a percentage of sale value. The source-of-truth
  business table lives at `docs/plans/reference/04-commissions.md` (flat MN amounts per
  product/combo/kit, e.g. "Refrigeradores: 4000 MN", "Kit 3 con 7: 12000 MN").
  `OrderItem.commissionMN` is summed to `Order.commissionMN`.
- Commission becomes **payable** at `entregado` (delivered) and is marked **paid** via an explicit
  manual action ("Pagar Comisión" button, `gestor-order-card.tsx:97-109`) that transitions the
  order to a **5th, commission-specific state**: `comision_pagada` (types.ts:59). This state is
  orthogonal to delivery — a payment-tracking state layered ON TOP of the fulfillment funnel.
- Aggregation views already fully designed in the MVP: per-gestor ranking (`gestor-ranking.tsx`),
  per-gestor finance/ROI (`gestor-commission-table.tsx`), and an owner-side "commission liability"
  framing (`openspec/changes/archive/2026-07-14-salesops-12-commission-liability/spec.md:132-152`:
  *"the only liability the app MAY present is the owner's commission payable to gestores"* — i.e.
  commission is modeled as a debt the OWNER owes the gestor, never money owed BY a customer).

**Current (post-rewrite) backend Order has ZERO gestor/seller/commission fields.** Verified
directly against `templates/packages/infra-db/prisma/schema.prisma:239-264` (`model Order` — only
`customerId`, `warehouseId`, currency/totals, 4-state
`OrderStatus{created,verified,delivered,cancelled}`) and
`templates/packages/domain/src/sales/order.ts:39-58`. `docs/plans/reference/04-commissions.md`'s MN
table was never wired to `Product` — a deliberate, documented boundary decision: the **commission
seam doc** (`templates/packages/domain/src/product/commission-seam.md`, engram `#1312`) states
`Product` carries zero commission fields "by design", explicitly naming a future
`ICommissionReferenceProvider` port returning `Money | undefined` per `productId`, to be owned by
"a future Gestores/Comisiones module" — **this backlog item IS that future module, named in
advance.**

**Order status has only 4 states, no room for `comision_pagada`.** The rewritten `Order` aggregate
(`order.ts:28`) is `'created' | 'verified' | 'delivered' | 'cancelled'`, `delivered` TERMINAL, no
outgoing transition. The MVP's 5th state does not fit this state machine as-is — commission-paid
tracking must live as its OWN concept (e.g. a `CommissionPayment` record referencing the order),
not as a 5th `OrderStatus` value, unless the design deliberately re-opens `Order`'s state machine
(high-risk, touches a just-hardened invariant surface).

## Affected Areas

- `templates/packages/domain/src/users/roles.ts` — add a `sales_agent` bit (next free: `32`);
  decide `BUSINESS_ROLES_MASK` inclusion; add a `ROLE_LABELS_ES` entry.
- `templates/packages/domain/src/users/roles.test.ts` — exhaustiveness tests need the new bit.
- `templates/packages/api-common/src/auth/{jwt.strategy,roles.guard}.ts` — no structural change
  expected (the bitmask mechanism is generic), but new `@Roles()` gates will reference the bit.
- `templates/packages/domain/src/product/commission-seam.md` — the seam this change fulfills;
  `ICommissionReferenceProvider` is the named port to implement.
- `templates/packages/domain/src/sales/{order,order-line}.ts` — candidate site for a seller/agent
  reference field; currently has none.
- `templates/packages/infra-db/prisma/schema.prisma` — new `SalesAgent` table (or reuse
  `CompanyUser`), migration; possible `sales_order` column addition.
- `templates/packages/infra-db/src/sales/` — mapping + seed changes if `Order` gains an agent ref.
- `templates/apps/api-salesops/src/sales/` — new endpoint surface for assigning/reading the sales
  agent and triggering commission payment.
- New domain module mirroring `packages/domain/src/sales/` per architecture.md's "¿Dónde va X?"
  table: `packages/domain/src/commission/` (or `sales-agent/`) with models, a pure
  commission-calculation function, ports (`ICommissionRepository` + the already-named
  `ICommissionReferenceProvider`), errors, index; `packages/infra-db/src/commission/` for adapters.
- `docs/plans/reference/04-commissions.md` — the authoritative MN-per-product table; becomes the
  seed data source for the new module (the role `03-order-format.md` plays for Sales).

## Interaction with backlog item 5 (W5 — 100%-credit orders)

Direct interaction, same file. `docs/plans/ventas-follow-ups-pendientes.md` §1 (W5) targets
`templates/packages/domain/src/sales/order.ts:133-141` (`createOrder`'s payment-sum invariant,
`Σ payments === total`, unconditional even for `payments: []`) — relaxing it to allow
`SaleCredit`-covered credit-only orders. If commission becomes payable based on **payment status**,
then W5 changes what "paid" even means for an order, and the commission trigger must be decided
AFTER or IN AWARENESS OF W5. If commission triggers purely off `delivered` (matching the MVP), the
two are independent. Confirmed via file:line, not assumed: same function, adjacent invariant.

## Commission Calculation Surface — options, not a decision

1. **Flat MN amount per product** (the MVP model) — independent of sale price/currency/exchange
   rate; needs only `OrderLine.productId` + quantity. Simplest, matches the existing business table
   verbatim, but needs a manual reference table kept in sync with the product catalog.
2. **Percentage of order/line total** — would depend on `Order.currency`, `ExchangeRate`, and
   possibly `PaymentChannel`. No evidence this model was ever intended.
3. **Trigger candidates**: `verified` (earned on acceptance, pays before delivery risk resolves);
   `delivered` (matches the MVP's implemented payable/paid split exactly); `cancelled` must NEVER
   trigger commission (needs an explicit non-scenario); a payment-confirmation event (interacts
   with W5, and was never the MVP's trigger).

## Approaches for the module's shape

### 1. Mirror Sales exactly

New `commission`/`sales-agent` concept folder in the domain, own Prisma models, `Order` gains a
single nullable `salesAgentId` soft FK (mirroring `CompanyUser.userId`'s precedent), commission
computed from the `04-commissions.md` reference table + `OrderLine`s, "paid" tracked as a separate
`CommissionPayment` record (NOT an `OrderStatus` value).

- **Pros**: fits the "¿Dónde va X?" table with zero exceptions; keeps `Order`'s hardened 4-state
  machine untouched; soft FK follows an established, already-reviewed precedent; a separate
  payment record cleanly supports batching N commission items into 1 payout later.
- **Cons**: two new tables + a nullable column on a shipped, hardened `Order` table; still requires
  deciding whether `sales_agent` is a `CompanyUser` bit or a standalone entity — different FK
  targets.
- **Effort**: Medium-High.

### 2. `sales_agent` is purely a `CompanyUser` role bit

No separate entity — the agent IS a user; `Order` references the `CompanyUser`/`User` directly.

- **Pros**: reuses the identity work that just landed almost verbatim (bit `32` is free); no new
  "who is this person" entity to seed; naturally gives agents a login if the business ever wants
  them to see their own commissions.
- **Cons**: contradicts the MVP's shape, where `Gestor` is explicitly NOT a login-based actor —
  porting this is a REAL behavior change; forces every gestor through signup/CompanyUser assignment
  just to be referenceable from an order.
- **Effort**: Medium.

### 3. Both — role bit AND a lightweight reference entity

`CompanyUser.role` gets the `sales_agent` bit for people who need to log in and see their own
dashboard, but `Order` references a separate `SalesAgent` master-data entity (mirroring
`Warehouse`), decoupled from whether that agent has a login.

- **Pros**: matches the MVP's actual `Gestor` shape (name+phone, no auth) while leaving room for
  the login use case later without a redesign; `SalesAgent` becomes ordinary master data, the
  best-evidenced fit for how `Order.gestorId` behaved.
- **Cons**: two moving parts to keep conceptually straight; needs a crisp explanation of why "sales
  agent" is both a role AND an entity.
- **Effort**: Medium-High.

No approach is recommended here — the choice hinges entirely on Open Question 1.

## Open Questions (owner must answer before a proposal can be written)

1. **Does a `sales_agent` need to log in / have their own `CompanyUser` account?** The MVP models
   gestores as pure reference data (no auth). The backlog says *"`gestor` role (English
   `sales_agent`) added"* — implying a role bit, which implies login. These two signals conflict
   and are NOT reconcilable from the codebase alone. **This single answer picks between Approaches
   1/2/3.**
2. **Is commission a flat MN amount per product or a percentage of sale value?** No evidence
   anywhere supports percentage-based; flat MN-per-product is the only specified model. Needs
   explicit confirmation it is still current — `04-commissions.md` may be stale.
3. **What order-status event makes commission payable, and is "paid" a new `OrderStatus` value
   (reopens the hardened 4-state machine) or an independent `CommissionPayment` record?**
4. **Is a sales agent 1:1 per order** (matches MVP) **or could an order need split commission?**
   No evidence for split commission anywhere; assume 1:1 unless told otherwise.
5. **Does `owner` automatically gain the `sales_agent` bit** (join `BUSINESS_ROLES_MASK`), or is it
   deliberately excluded? A one-line decision that changes `effectiveRoles` semantics.
6. **Should W5 land before or in the same slice as commission-trigger logic?**

## Risks

- Reopening `Order`'s 4-state machine for a 5th commission-paid state would touch a surface just
  hardened by W4 and (in-flight) W5 — stacking three changes on the same aggregate root risks
  invariant regressions if not sequenced carefully.
- `04-commissions.md`'s flat-MN table is the ONLY concretely specified commission model found. If
  the business has since moved to percentage or tiered commission, the whole calculation surface
  needs re-confirmation before a proposal, not just before implementation.
- Adding a role bit without deciding `BUSINESS_ROLES_MASK` membership is an easy silent-default
  trap — `effectiveRoles` for `owner` would silently exclude the new bit. This is exactly the class
  of silent-permission bug `company-user-roles-reframe` was built to avoid, in the same file.
- No test coverage in the current backend touches gestor/commission concepts at all — greenfield.
  None of the MVP's tests are reusable (different stack).

## Ready for Proposal

**No.** Open Questions 1-3 are structural forks with no single well-evidenced answer in the
codebase. A proposal written before they are resolved would guess on the three decisions that most
determine the module's shape.
