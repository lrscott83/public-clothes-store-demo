# Design: sales-agents-commissions

Realizes proposal `sdd/sales-agents-commissions/proposal` (#1604) against the three delta
specs under `specs/`. D1–D9 (#1603) and **D10** (#1607) are owner-LOCKED on intent and are NOT
re-derived here. This document specifies HOW, and §0 records where code verification
**refutes or corrects** the proposal. `explore.md` is superseded and was read only to avoid
repeating its errors.

> **D10 (2026-07-28) REVERSES this design's original Q2.** The first revision recorded
> "agent-creates-customer: OUT, needs the owner". The owner answered **YES**. §0.11–§0.14,
> A14–A17, slice 3c and §14's resolved entry are that amendment. The reversal is not
> cosmetic: verification shows the grant alone delivers nothing, and the guard the coordinator
> (correctly) reached for does not currently exist in this app.

---

## 0. Adversarial verification — what the code actually says

### 0.1 The D4 dependency direction is RIGHT; the proposal's PLACEMENT is WRONG

The proposal's pattern claim is **confirmed verbatim**:

| Claim | Evidence |
|---|---|
| `OrderService` injects `CURRENCY_REPOSITORY` (the port symbol) | `order.service.ts:66` |
| It loads the snapshot itself | `:71` `const rates = await this.fetchAllRates(at)` |
| It hands the snapshot to a pure sync factory | `:101` `createOrder(buildInput, rates, at)` |
| "design decision #3" is documented in-file | class doc comment `:43-61` (proposal said `:43-60` — off by one) |
| Fan-out reads are the house style | `fetchAllRates` `:160-165` — `Promise.all` over 5 channels |

So injecting `STOCK_LEVEL_REPOSITORY` and passing a `StockLevel[]` snapshot into a pure
synchronous assertion is exactly the established pattern. **Confirmed.**

**But the proposal's `assertFulfillable(lines, stockLevels)` called from inside `createOrder`
does not work.** `OrderService.update` (`:106-121`) — the `PATCH /orders/:id` path the same
proposal requires to re-validate — **never calls `createOrder`**. It loads `existing`, checks
`status === 'created'`, and goes straight to `orderRepository.update`. An invariant living
inside the factory would leave the second door wide open.

**Correction**: the assertion is a **standalone pure function** in
`packages/domain/src/sales/availability.ts`, called by BOTH `OrderService.create` and
`OrderService.update`. `createOrder`'s signature stays 3-arg.

Load-bearing consequence the proposal did not claim: **`order.test.ts`'s 20 `createOrder`
cases keep compiling unchanged.** The D4 blast radius shrinks from "every order test" to
"every test that constructs an `OrderService`".

Residual honesty: the invariant is now enforced by an application service, not structurally
by the factory. A future third caller of `createOrder` could bypass it. Today `createOrder`
has exactly 3 production call sites (`order.service.ts`, `prisma-order.repository.ts`,
`infra-db/src/sales/seed.ts`); only the first is a delivery path. Mitigated by §12 R3.

### 0.2 The MVP rule does NOT port verbatim — `onHand` vs `available`

`eligibleWarehouses` (`apps/salesops-mvp/app/domain/availability.ts:14-27`) tests
`entry.quantity >= line.quantity` against a **single** `InventoryEntry.quantity` number.
The backend splits that into `StockLevel.onHand` and `StockLevel.reserved`
(`stock-level.ts:12-20`) with `availableStock(level) = onHand - reserved` (`:71-73`).

Porting `onHand` would accept an order against stock **already reserved by a `verified`
order**, guaranteeing the `InsufficientStockError` 409 at confirm
(`prisma-order.repository.ts:339-360`) that this invariant exists to prevent. The rule ports
against **`availableStock`, never `onHand`.**

What ports verbatim: the whole-basket, single-warehouse, `every`-line shape, and the
"missing entry ⇒ not covered" guard — `StockLevel` rows are lazily created on first movement
and a missing `(productId, warehouseId)` pair means zero stock, stated at
`stock-level-repository.port.ts:26-30`. The MVP's `entry !== undefined` check is the same
semantics.

Second change: the backend function returns **warehouse ids**, and takes the candidate id
list explicitly (the MVP took `warehouses: Warehouse[]`). Deriving candidates from the
`StockLevel` rows alone would silently include soft-deleted warehouses — `Warehouse.active`
exists (`schema.prisma:114`) and `StockLevel` carries no such flag.

### 0.3 `IStockLevelRepository.list()` — dead code CONFIRMED, and fit for purpose with one caveat

Repo-wide, the only `stockLevelRepository.*` calls are `findByProductAndWarehouse`
(7× in `prisma-order.repository.spec.ts`, 4× in `prisma-stock-movement.repository.spec.ts`,
1× in `stock.service.ts:45`). **`list()` has zero call sites.** Confirmed dead.

Caveat: `StockLevelListFilter.productId` is **singular** (`stock-level-repository.port.ts:4-7`).
A basket needs a fan-out `Promise.all` over the **deduplicated** product ids, flattened.
That is precisely `fetchAllRates`' shape (§0.1). **No port change, no new port.**

### 0.4 Granting `sales_agent` on `StockController` would be a SILENT TRAP

`StockController` is `@Roles(owner, admin, warehouse_operator)` at class level
(`stock.controller.ts:55`), and every handler calls `assertWarehouseScope`
(`:92-103`), which returns early **only** for `owner`/`admin` and otherwise requires a
`WarehouseOperator` row. D2 says a `sales_agent` never has one. Adding the bit to that
decorator produces a grant that looks applied and then **403s every request** with
`'Not scoped to this warehouse'`.

The eligibility query therefore does **not** live on `StockController`. It goes in the Sales
module — which is independently what `openspec/specs/salesops-inventory/spec.md:186-195`
mandates.

### 0.5 D8's inheritance is invisible to every existing role check

`effectiveRoles` grants `owner` the `BUSINESS_ROLES_MASK` union (`roles.ts:64-72`), and
`RolesGuard` goes through `can()` (`roles.guard.ts:48`) — so route grants inherit correctly.
**But every in-repo controller-level role check reads the RAW bitmask**:
`RoleHelpers.hasRole(user.roles, …)` at `order.controller.ts:221-224` and
`stock.controller.ts:94-95`. An `owner` does **not** `hasRole(sales_agent)`.

> **INVARIANT**: any predicate answering *"is this actor a sales agent?"* MUST use
> `can(roles, USER_ROLES.sales_agent)`. Any predicate answering *"is this actor scoped
> SOLELY as a sales agent?"* MUST use `hasRole` plus the owner/admin exclusions — the exact
> shape of `isScopedWarehouseOperator` (`:219-225`).

### 0.6 One existing test fails by construction

`roles.test.ts:50-55` hand-enumerates `businessBits = user | warehouse_operator |
sales_operator | owner` and asserts `effectiveRoles(owner) === businessBits`. Adding
`sales_agent` to `BUSINESS_ROLES_MASK` (D8) makes that **false**. The admin case at `:45-48`
auto-adapts (it reduces `Object.values(USER_ROLES)`).

### 0.7 Attribution needs a field `req.user` does not have

The spec attributes to the **`CompanyUser`**. `SanitizedUser`
(`jwt.strategy.ts:29-32`) carries `id` (the *User* id) and `companyId` — **not** the
`CompanyUser` id, even though `validate()` has `assignment` in hand at `:109` and discards
`assignment.id`. Attribution therefore requires adding `companyUserId` to `SanitizedUser`.

Attributing by the `(userId, companyId)` pair instead was **rejected**: the previous design's
A4 records that the deferred tenant extraction is "drop `companyId`, keep `id`", which would
destroy a two-column soft key. `company_user.id` is the stable identity.

### 0.8 The MVP commission dictionary is REJECTED for runtime

`apps/salesops-mvp/app/seed/commission-map.ts` ends in `CATEGORY_DEFAULTS` (`:96-108`) and
`CATCH_ALL = 1000` (`:111`). Both **fabricate an amount for a product nobody configured** —
the exact coercion `commission-seam.md:41-44` and the `salesops-commissions` spec's first
requirement forbid. Kept and reused, at **seed time only**: `normalizeName` (`:20-28`) and
the ordered most-specific-first precedence idea. See §7.

### 0.9 Placement correction (carried forward)

`docs/system/architecture.md:64` says entities go in `packages/domain/src/<concept>/models`.
**There is no `models/` convention in this repo** — already recorded in the
`company-user-roles-reframe` design §0.4. `commission/` follows the real house shape:
`<entity>.ts` + `<entity>-repository.port.ts` + `errors.ts` + `index.ts`.
`architecture.md:67` ("`packages/infra-db` (future)") and `:143-152` ("HTTP backend: does not
exist") remain STALE. Still out of scope; still logged as doc debt.

### 0.10 "Cancelled orders never accrue" is already structural

`cancelOrder` accepts only `created|verified` (`order.ts:200-205`) and `delivered` is
TERMINAL (`:27-28`). Accrual fires only at `delivered`. **An accrued order can never be
cancelled** — the spec requirement is satisfied by the existing state machine, not by a new
rule. The test proves the structure; no guard code is written for it.

---

## 0-bis. Adversarial verification of D10 (agent creates customers)

### 0.11 `POST /customers` does NOT mint a `User` today — it REQUIRES one

D10's premise is *"creating a `Customer` transitively creates a `User`"*. **That is not what
the code does.** It describes what the code must BECOME.

| Fact | Evidence |
|---|---|
| `CustomerService` injects **one** port | `customer.service.ts:23-25` — `CUSTOMER_REPOSITORY` only |
| `create` never touches identity | `:27-31` — `createCustomer(input)` then `customerRepository.create(input)` |
| `userId` is a REQUIRED request field | `dto/create-customer.dto.ts:9` `userId!: string` |
| An unknown `userId` is a **client error** | `CustomerUserNotFoundError` → **400** (`customer.controller.ts:87-89`) |
| The 1:1 link is set once, never re-pointed | `customer.service.ts:35-40` — `userId` is absent from `UpdateCustomerDto` |

**Consequence that changes the plan**: simply adding `sales_agent` to `CustomerController`'s
`@Roles` **delivers nothing**. The agent would still be handed a form demanding a `userId`
that only someone else can mint, in a different application. The grant is not the feature;
a new creation path is. D10 is a build, not a permission tweak.

### 0.12 There is NO pre-existing dead-login defect — verified, contrary to the hypothesis

The coordinator asked whether today's customer-create path already produces a `User` with no
ACTIVE `CompanyUser` (a login that `JwtStrategy` 403s at `:99-107`). **It does not**, and the
reason is that every path that mints a customer's `User` already provisions the assignment:

| Path | Provisions `CompanyUser`? | Evidence |
|---|---|---|
| `AuthService.signup` | Yes — role `user`, status `ACTIVE` | prior design §6 |
| `UsersService.create` | Yes — `dto.roles ?? USER_ROLES.user`, scoped to the caller's `companyId` | `users.service.ts:43-72`, esp. `:65-70` |
| `infra-db/src/customer/seed.ts` | **Yes** — `ensureDefaultCompanyId` + `seedCompanyUser(prisma, user.id, companyId, USER_ROLE_BIT)` | `:66`, `:76` |
| `POST /customers` | N/A — it never creates a `User` (§0.11) | — |

`customer/seed.ts`'s own doc comment (`:58-63`) states the reason verbatim: *"gives that User
an ACTIVE `CompanyUser` … without it the account has no persisted authorization at all
(migration 002 dropped `app_user.roles`) and every login is rejected."*
`UsersService.roleFor` (`:144-150`) is the loud detector for the inconsistent case.

**So this change inherits no bug — it inherits a TEMPLATE.** `customer/seed.ts:66-86` is
exactly the three-step sequence (company → user → assignment → customer) the new path
generalises to HTTP. Reuse its ordering, not a fresh invention.

The real pre-existing gap is different and worth naming plainly: **`api-salesops` cannot mint
an identity at all**, so onboarding a customer today spans two applications — `POST /users` on
`api-idp`, copy the returned id by hand, then `POST /customers` on `api-salesops`. That is the
workflow D10 is actually fixing.

### 0.13 The "DTO that structurally cannot carry a role" guard DOES NOT WORK in `api-salesops`

This is the right instinct and the correct precedent — **and it is currently an illusion in
this application.**

| Fact | Evidence |
|---|---|
| `api-idp` installs the mass-assignment guard | `api-idp/src/main-setup.ts:5-19` — `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` |
| `api-idp` DTOs are decorated allow-lists | `create-user.dto.ts:1,11-35` — `class-validator`; its comment at `:8-9` names the mechanism |
| **`api-salesops` installs NO pipe** | `apps/api-salesops/src/main.ts` is 12 lines: `NestFactory.create` + `listen`. **No `useGlobalPipes`** |
| **Zero matches app-wide** | `ValidationPipe\|whitelist\|forbidNonWhitelisted` over `apps/api-salesops` → **no matches** |
| `api-salesops` DTOs are undecorated | `create-customer.dto.ts:7-16` — a plain class, no `class-validator` import. A compile-time type, **erased at runtime** |
| Its boundary validation is hand-written | `assertCurrency`/`assertChannel` (`order.controller.ts:47-58`), `VALID_MOVEMENT_TYPES` (`stock.controller.ts:32-39`) — the house pattern here |

An extra `"roles": 8` posted to any `api-salesops` route today lands on `body` untouched: not
stripped, not rejected. **A DTO alone therefore provides zero runtime protection in this app.**

Making the DTO a real allow-list means installing `installGlobalPipes` in `api-salesops`.
**Rejected for this change** — and the reason is the hazard, not the effort: with
`whitelist: true`, an **undecorated** DTO class has an EMPTY allow-list, so switching the pipe
on without first decorating all ~8 DTO folders makes `forbidNonWhitelisted` reject
**every write request in the application**. That is a separate change with its own RED suite,
not a line smuggled into this one. Logged as a follow-up in §14.

The enforceable guard here is therefore **structural at the type and port level**, not at the
pipe — see A15. The load-bearing property is that **no expression anywhere in the new code
path reads a role from the request**; the constant is module-private and there is no parameter
to override it. §12 R21/R22 are the proof.

### 0.14 No new dependency direction — the identity ports are ALREADY bound in `api-salesops`

`apps/api-salesops/src/auth/auth.module.ts:29-30` already binds **both**
`USER_REPOSITORY → PrismaUserRepository` and `COMPANY_USER_REPOSITORY → PrismaCompanyUserRepository`.
The new service injects those same DI symbols. So:

- **No new package edge.** `apps/api-salesops → @store-mgmt/domain (ports) → @store-mgmt/infra-db (adapters)`
  is the existing direction, unchanged. `architecture.md:55-56` holds.
- **No `api-salesops → api-idp` edge**, in-process or over HTTP. The two apps stay independent
  deployables; they share the *domain ports*, which is the whole point of the shared kernel.
- What IS new: a **delivery feature** (customers) now touches identity ports, where previously
  only `JwtStrategy` did. That is a widening of the blast radius inside one app, and it is
  exactly why the role constant must be structural (§0.13) rather than a reviewed convention.
- **No logic is duplicated from `UsersService`.** The new path is strictly NARROWER — it has no
  `roles` input to forward. `UsersService.create` remains the only path that can assign an
  arbitrary bitmask, still `@Roles(admin, owner)`, still in `api-idp`, still behind
  `assertNoUnauthorizedAdminGrant`.

---

## 1. Technical approach

Four concept surfaces, no new package:

1. `packages/domain/src/users/roles.ts` — one bit, one mask entry, one label. No schema change
   (the bitmask is `company_user.role INTEGER`).
2. `packages/domain/src/sales/availability.ts` — the ported MVP rule as pure functions,
   consumed by a read query (slice 1) and then as a creation invariant (slice 2).
3. `Order` gains `attributedCompanyUserId`; `SanitizedUser` gains `companyUserId`.
4. `packages/domain/src/commission/` + `packages/infra-db/src/commission/` +
   `apps/api-salesops/src/commission/` — the module that fulfils the named seam.
5. **(D10)** `POST /customers/with-identity` in `apps/api-salesops/src/customer/` — the
   customer-plus-login creation path, generalising `infra-db/src/customer/seed.ts:66-86`
   (§0.12) to HTTP, with the role hard-wired to the `user` bit (§0.13).

**Three** hand-written migrations, one gated by a verification script, mirroring
`company-user-roles-reframe` §7.

---

## 2. Architecture decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| A1 | `sales_agent = 32`, added to `BUSINESS_ROLES_MASK` | reusing a freed bit; a separate `SalesAgent` entity | D1/D8 locked. `32` is the next free bit after `admin: 16`; `USER_ROLES` is append-only so no stored mask changes meaning |
| A2 | Availability is a **standalone pure function**, called by `create` AND `update` | inside `createOrder` (the proposal's shape) | `update` never calls `createOrder` (§0.1). Also keeps `createOrder` 3-arg → 20 domain tests survive |
| A3 | `availability.ts` lives in `domain/src/sales/` and imports `domain/src/inventory/stock-level.js` | a new `domain/src/availability/` concept; anything in `inventory/` | `salesops-inventory/spec.md:186-195` forbids Inventory owning it. Cross-concept shared-kernel imports have precedent: `sales/order-line.ts:5-6` imports `product/pricing` + `product/product` |
| A4 | Coverage is tested against `availableStock` (`onHand - reserved`) | `onHand` (the MVP's shape) | §0.2 — `onHand` guarantees the 409 the invariant exists to prevent |
| A5 | Cross-warehouse read = fan-out `Promise.all` over deduped ids through the existing `list({productId})` | widening `StockLevelListFilter` to `productIds: string[]`; a new port | §0.3. Zero port change, exact `fetchAllRates` precedent, basket cardinality is small |
| A6 | Eligibility query is a Sales-module endpoint, NOT on `StockController` | adding the bit to `StockController`'s `@Roles` | §0.4 — that grant silently 403s. Also the spec boundary |
| A7 | `SanitizedUser` gains **required** `companyUserId: string` | `(userId, companyId)` pair; an optional field | §0.7. Required means the two auth test helpers are **compile errors**, not silent `undefined` attribution |
| A8 | `Order.attributedCompanyUserId: string \| null`; `CreateOrderInput.attributedCompanyUserId: string` **required** | required on both; optional on both; backfilling legacy orders to the owner | `null` is reachable ONLY for pre-migration rows. The factory can never produce it. Backfilling would **fabricate attribution** — same sin as a commission catch-all |
| A9 | Commission accrual is triggered from `OrderService.deliver` via a **domain port** `ICommissionAccrualRecorder` | `OrderController` orchestrating two services; a domain-event bus; accrual inside the deliver transaction | Sales depends on a port the *Commission* concept declares (dependency inversion), exactly the shape `commission-seam.md:40-44` prescribes. Keeps the trigger inside the one method that owns the transition. An event bus is ceremony at this scale |
| A10 | Accrual freezes a **per-line unit-amount snapshot**; recompute is **create-if-absent**, never overwrite | recomputing on read; overwriting on re-run | Mirrors `OrderLine.rateApplied`/`lineTotalOrder` freezing. A later reference-table edit must not silently restate a settled commission |
| A11 | Name→id matching happens **once, at seed time**, into `product_commission_reference`; runtime resolution is a pure id lookup | a runtime keyword resolver (the MVP's `deriveCommission`) | §0.8 + §7. Fuzzy matching is a data-authoring problem, not a request-path problem |
| A12 | `CommissionPayment` is 1:1 with an accrual (`@@unique(accrual_id)`) | partial payments; payout batches | D7 requires independence from `OrderStatus`, not a payment schedule. Partial settlement is not in any spec requirement |
| A13 | Rejection of a non-covering warehouse is a named domain error mapped to **409** | 400; 422 | `InsufficientStockError` already maps to 409 at `order.controller.ts:235-241`. Same failure class, same code |
| **A14** | **D10 gets a SEPARATE route** `POST /customers/with-identity`; existing `POST /customers` keeps its 3 roles and its `userId` semantics | making `CreateCustomerDto.userId` optional and overloading `POST /customers` | The two operations have different privilege profiles. Overloading would hand `sales_agent` the *link-to-an-arbitrary-existing-`User`* power — an agent could attach a customer record to the **owner's** identity. Splitting also leaves the existing route's 15 controller tests untouched |
| **A15** | The `user` bit is a **module-private constant** passed to `companyUserRepository.create`; the DTO declares neither `roles` nor `userId` | a service-layer `if (dto.roles) throw`; relying on the DTO alone; reusing `UsersService.create` | §0.13 — `api-salesops` has no `ValidationPipe`, so a DTO is erased at runtime and a service-layer check is a line a future edit can delete. The constant means **no expression in the path reads a role from the request**. `UsersService.create` is unreachable (different app) and its `dto.roles ?? user` is precisely the surface we must not import |
| **A16** | Write order is **User → CompanyUser → Customer**, NOT transactional | an `IUnitOfWork`/transaction port; Customer first | Mirrors prior design A5. Ordered so the only reachable partial states are loud and harmless: fail after `User` ⇒ a login that 403s `MISSING_COMPANY_USER` (already logged, `jwt.strategy.ts:103-106`); fail after `CompanyUser` ⇒ an ordinary `user`-role account with no customer row. `DuplicateLoginError` fires on write #1, so the common failure costs nothing |
| **A17** | Attribution lives on **`company_user.created_by_company_user_id`** (nullable, self-FK) | a column on `customer`; a column on `app_user`; an audit table | D10 asks who created which **identity**; the assignment IS the privilege grant, so the audit belongs on the row that carries it. It also travels with `company_user` under the deferred tenant extraction. `NULL` = self-registered, seeded, or pre-migration — never backfilled (same rule as A8) |

---

## 3. Component placement (per `architecture.md:58-74`, with §0.9's correction)

| Component | Path | Doc row |
|---|---|---|
| `sales_agent` bit + mask + label | `packages/domain/src/users/roles.ts` | Business rule |
| Basket coverage / eligibility rules | `packages/domain/src/sales/availability.ts` | Business rule / use case |
| `WarehouseCannotFulfillOrderError` | `packages/domain/src/sales/errors.ts` | Business rule |
| `CommissionReference`, `CommissionAccrual`, `CommissionPayment` | `packages/domain/src/commission/{commission-reference,commission-accrual,commission-payment}.ts` | Business entity |
| `computeAccrual` | `packages/domain/src/commission/compute-accrual.ts` | Business rule, pure |
| `ICommissionReferenceProvider`, `ICommissionAccrualRepository`, `ICommissionPaymentRepository`, `ICommissionAccrualRecorder` | `packages/domain/src/commission/*.port.ts` | Repository/port |
| Prisma adapters | `packages/infra-db/src/commission/` | Adapter |
| Reference seed | `packages/infra-db/src/commission/seed.ts` | adapter-adjacent, mirrors `src/company/seed.ts` |
| Availability endpoint | `apps/api-salesops/src/sales/availability.controller.ts` + `availability.service.ts` | Endpoint |
| Commission endpoints | `apps/api-salesops/src/commission/` | Endpoint |
| `companyUserId` on `req.user` | `packages/api-common/src/auth/jwt.strategy.ts` | shared delivery concern |
| **(D10)** customer+identity endpoint & orchestration | `apps/api-salesops/src/customer/customer-identity.{controller,service}.ts` + `dto/` | Endpoint / app feature folder |
| **(D10)** `createdByCompanyUserId` on the assignment | `packages/domain/src/company/company-user.ts` + `company-user-repository.port.ts` | Business entity + port |

---

## 4. Domain shapes

### 4.1 Roles (`domain/src/users/roles.ts`)

```ts
export const USER_ROLES = {
  user: 1,
  warehouse_operator: 2,
  sales_operator: 4,
  owner: 8,
  admin: 16,
  sales_agent: 32, // 0b100000 — the gestor: registers sales, NOT warehouse-scoped (D1/D2)
} as const;

const BUSINESS_ROLES_MASK =
  USER_ROLES.user |
  USER_ROLES.warehouse_operator |
  USER_ROLES.sales_operator |
  USER_ROLES.owner |
  USER_ROLES.sales_agent; // D8: owner inherits. See §0.5 — inheritance is visible to
                          // `can()`/`effectiveRoles`, NEVER to a raw `hasRole` check.

const ROLE_LABELS_ES: Record<UserRoleName, string> = {
  // …
  sales_agent: 'Gestor de ventas', // distinct from sales_operator = 'Operador de gestores'
};
```

### 4.2 Availability (`domain/src/sales/availability.ts`) — NEW

```ts
import type { StockLevel } from '../inventory/stock-level.js';
import { availableStock } from '../inventory/stock-level.js';
import { WarehouseCannotFulfillOrderError } from './errors.js';

/** The (productId, quantity) projection of a basket — the only thing coverage needs. */
export interface BasketLine {
  readonly productId: string;
  readonly quantity: number;
}

/**
 * Whole-basket, single-warehouse coverage — the retired MVP rule
 * (`apps/salesops-mvp/app/domain/availability.ts:14-27`) ported to the real
 * stock model. Coverage is tested against `availableStock` (`onHand - reserved`),
 * NEVER `onHand`: stock already reserved by a `verified` order is not for sale.
 * A missing `(productId, warehouseId)` row means zero stock, never an error
 * (`stock-level-repository.port.ts:26-30`).
 * Duplicate product ids in `basket` are summed before comparison.
 */
export function warehouseCoversBasket(
  basket: readonly BasketLine[],
  warehouseId: string,
  stockLevels: readonly StockLevel[],
): boolean;

/** Subset of `warehouseIds` that fully covers `basket`. Order preserved. Empty = none can. */
export function eligibleWarehouses(
  basket: readonly BasketLine[],
  warehouseIds: readonly string[],
  stockLevels: readonly StockLevel[],
): string[];

/** Throws `WarehouseCannotFulfillOrderError` naming the first uncovered line. */
export function assertWarehouseCoversBasket(
  basket: readonly BasketLine[],
  warehouseId: string,
  stockLevels: readonly StockLevel[],
): void;
```

`errors.ts` gains:

```ts
export class WarehouseCannotFulfillOrderError extends Error {
  constructor(
    public readonly warehouseId: string,
    public readonly productId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(
      `Warehouse "${warehouseId}" cannot fulfil product "${productId}": ` +
        `requested ${requested}, available ${available}`,
    );
    this.name = 'WarehouseCannotFulfillOrderError';
  }
}
```

### 4.3 Attribution

```ts
// packages/api-common/src/auth/jwt.strategy.ts
export type SanitizedUser = Omit<User, 'passwordHash' | 'roles'> & {
  readonly roles: UserRoleValue;
  readonly companyId: string;
  /** `CompanyUser.id` — the stable attribution identity (design A7). REQUIRED. */
  readonly companyUserId: string;
};

// packages/domain/src/sales/order.ts
export interface Order {
  // …
  /**
   * `CompanyUser.id` stamped at creation from the authenticated actor, never
   * client input (D1). `null` ONLY for orders created before the attribution
   * migration — `createOrder` can never produce it (A8).
   */
  readonly attributedCompanyUserId: string | null;
}

export interface CreateOrderInput {
  // …
  readonly attributedCompanyUserId: string; // REQUIRED — non-optional on purpose
}
```

`OrderUpdateInput` is `Partial<Omit<Order,'id'|'createdAt'>>`, so attribution is technically
patchable through the port. The spec says it "never changes through verified/delivered
transitions" → `OrderService.update` MUST NOT forward it, and `UpdateOrderDto` MUST NOT
declare it. Enforced by test, not by the type (§12 RED-7).

### 4.4 Commission (`domain/src/commission/`)

```ts
// commission-reference.ts — fulfils commission-seam.md:29-33 verbatim
export interface ProductCommissionReference {
  readonly productId: string;
  readonly comisionMN: Money; // always currency 'MN' (D5)
}

// commission-reference-provider.port.ts — the ALREADY-NAMED seam
// (commission-seam.md:34-38). Signature is copied, not re-invented.
export interface ICommissionReferenceProvider {
  /** `undefined` = "no reference configured". NEVER coerced to `0`. */
  commissionFor(productId: string): Promise<Money | undefined>;
}
export const COMMISSION_REFERENCE_PROVIDER = Symbol('ICommissionReferenceProvider');

// commission-accrual.ts
export interface CommissionAccrualLine {
  readonly id: string;
  readonly orderLineId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitCommission: Money;  // FROZEN snapshot of the reference at accrual time (A10)
  readonly lineCommission: Money;  // unitCommission x quantity
}

export interface CommissionAccrual {
  readonly id: string;
  readonly orderId: string;
  readonly attributedCompanyUserId: string;
  readonly total: Money;                              // Sigma lineCommission, MN
  readonly lines: readonly CommissionAccrualLine[];   // RESOLVED lines only
  /** Lines whose product had no reference: EXCLUDED from `total`, FLAGGED here, never zeroed. */
  readonly unresolved: readonly UnresolvedCommissionLine[];
  readonly accruedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UnresolvedCommissionLine {
  readonly orderLineId: string;
  readonly productId: string;
  readonly quantity: number;
}

// compute-accrual.ts — PURE. Mirrors `createOrder(input, rates, at)`: the app
// service loads the snapshot, the factory receives it as an argument.
export function computeAccrual(
  input: ComputeAccrualInput,                 // orderId, attributedCompanyUserId, lines
  references: ReadonlyMap<string, Money>,     // productId -> MN amount; ABSENT key = unresolved
  at: Date,
): CommissionAccrual;

// commission-payment.ts
export interface CommissionPayment {
  readonly id: string;
  readonly accrualId: string;      // 1:1 (A12)
  readonly amount: Money;          // MN
  readonly paidAt: Date;
  readonly recordedByCompanyUserId: string;
  readonly note: string | null;
  readonly createdAt: Date;
}

// commission-accrual-recorder.port.ts — the seam `OrderService` depends on (A9)
export interface ICommissionAccrualRecorder {
  /** Idempotent create-if-absent for a DELIVERED order. Returns the existing accrual untouched. */
  recordForDeliveredOrder(order: Order): Promise<CommissionAccrual | null>;
}
export const COMMISSION_ACCRUAL_RECORDER = Symbol('ICommissionAccrualRecorder');
```

Errors: `OrderNotDeliveredError`, `CommissionAlreadySettledError`,
`UnattributedOrderError` in `commission/errors.ts`.

`recordForDeliveredOrder` returns `null` when `order.attributedCompanyUserId === null`
(legacy row) — logged as `UNATTRIBUTED_ORDER`, never an accrual with a fabricated agent.

### 4.5 Customer + identity creation (D10)

```ts
// packages/domain/src/company/company-user.ts — additive
export interface CompanyUser {
  // …
  /**
   * `CompanyUser.id` of whoever provisioned this assignment (D10 #3).
   * NULL for self-registered (`AuthService.signup`), seeded, and pre-migration
   * rows — never backfilled, because an invented creator is invented audit (A17).
   */
  readonly createdByCompanyUserId: string | null;
}

export interface CreateCompanyUserInput {
  // …
  readonly createdByCompanyUserId?: string | null;
}
```

```ts
// apps/api-salesops/src/customer/dto/create-customer-with-identity.dto.ts
/**
 * Body for `POST /customers/with-identity`. Deliberately declares NEITHER
 * `userId` NOR `roles`:
 *  - `userId` — this route MINTS the identity; accepting one would recreate the
 *    link-to-an-arbitrary-existing-User power that A14 keeps away from `sales_agent`.
 *  - `roles`  — the created identity is ALWAYS the `user` bit (A15). There is no
 *    parameter to override it and no code path that reads one.
 * NOTE (§0.13): `api-salesops` runs NO `ValidationPipe`, so this class is a
 * compile-time contract only. The RUNTIME guarantee is A15's constant plus the
 * hand-written boundary asserts below — the house pattern here
 * (`assertCurrency`, `VALID_MOVEMENT_TYPES`), not a decorator.
 */
export class CreateCustomerWithIdentityDto {
  fullName!: string;
  login!: string;
  password!: string;
  documentId?: string;
  cellPhone?: string;
  email?: string;
  address?: string;
  note?: string;
}
```

```ts
// apps/api-salesops/src/customer/customer-identity.service.ts
/**
 * The ONLY role an identity minted through the customer path may receive.
 * Module-private const, NOT a parameter, NOT a default, NOT DTO-derived —
 * there is no expression in this file that reads a role from the request (A15).
 * Same value and same intent as `infra-db/src/customer/seed.ts:26` USER_ROLE_BIT.
 */
const CUSTOMER_IDENTITY_ROLE: UserRoleValue = USER_ROLES.user;

@Injectable()
export class CustomerIdentityService {
  constructor(
    @Inject(USER_REPOSITORY)         private readonly userRepository: IUserRepository,
    @Inject(COMPANY_USER_REPOSITORY) private readonly companyUserRepository: ICompanyUserRepository,
    @Inject(CUSTOMER_REPOSITORY)     private readonly customerRepository: ICustomerRepository,
  ) {}

  /**
   * `actor` is the AUTHENTICATED caller (`req.user`), never request body data —
   * it supplies both the tenant scope (D10 #2) and the audit trail (D10 #3).
   * Write order and its failure analysis: design A16.
   * Generalises `infra-db/src/customer/seed.ts:66-86` to the HTTP path (§0.12).
   */
  async createWithIdentity(
    actor: Pick<SanitizedUser, 'companyId' | 'companyUserId'>,
    dto: CreateCustomerWithIdentityDto,
  ): Promise<CustomerResponseDto> {
    // 1. identity — DuplicateLoginError fires here, before anything is written
    const user = await this.userRepository.create({
      login: dto.login,
      passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
      fullName: dto.fullName,
      email: dto.email,
      cellPhone: dto.cellPhone,
    });

    // 2. authorization — WITHOUT this the login is dead (§0.12). Scoped to the
    //    CALLER's company (D10 #2), attributed to the CALLER (D10 #3).
    await this.companyUserRepository.create({
      userId: user.id,
      companyId: actor.companyId,
      role: CUSTOMER_IDENTITY_ROLE,          // ← the constant, always
      status: 'ACTIVE',
      createdByCompanyUserId: actor.companyUserId,
    });

    // 3. master data
    return this.toResponse(await this.customerRepository.create({ ...dto, userId: user.id }));
  }
}
```

`CustomerService` is **not touched** — it keeps its single `CUSTOMER_REPOSITORY` injection
and its existing `create`. A14 keeps the two paths apart.

---

## 5. Data flow

```
POST /orders/availability                      POST /orders  (D4 invariant)
  │                                              │
  ├─ RolesGuard: owner|admin|sales_operator      ├─ RolesGuard (method-level, +sales_agent)
  │              |sales_agent                    │
  ├─ AvailabilityService                         ├─ OrderService.create
  │   ├─ warehouseRepository.list({active})      │   ├─ fetchAllRates()          ← existing
  │   ├─ Promise.all(dedupedProductIds           │   ├─ fetchStockLevels(lines)  ← NEW, same shape
  │   │     .map(id => stockLevelRepo            │   │     Promise.all(list({productId}))
  │   │            .list({productId: id})))      │   ├─ assertWarehouseCoversBasket(   ← PURE
  │   └─ eligibleWarehouses(...)      ← PURE     │   │       basket, dto.warehouseId, levels)
  └─ 200 { warehouses: [{id,name}] }             │   ├─ createOrder(input, rates, at)  ← PURE, 3-arg
                                                 │   │     input.attributedCompanyUserId
                                                 │   │       = req.user.companyUserId
                                                 │   └─ orderRepository.create(order)
                                                 └─ 201 | 409 WarehouseCannotFulfillOrderError

POST /orders/:id/deliver
  └─ OrderService.deliver
       ├─ orderRepository.deliver(id)            ← existing transaction: release + sale_out
       └─ commissionAccrualRecorder.recordForDeliveredOrder(delivered)   ← A9, SEPARATE tx
            ├─ Promise.all(lines.map(l => referenceProvider.commissionFor(l.productId)))
            ├─ computeAccrual(input, referenceMap, at)     ← PURE
            └─ accrualRepository.createIfAbsent(accrual)   ← idempotent, @@unique(order_id)

POST /commissions/payments   →  CommissionPayment (independent record; Order.status UNTOUCHED)
```

---

## 6. The D4 dependency direction, concretely

`OrderService` gains a **third** injected port, alongside the two it already has:

```ts
constructor(
  @Inject(ORDER_REPOSITORY)        private readonly orderRepository: IOrderRepository,
  @Inject(CURRENCY_REPOSITORY)     private readonly currencyRepository: ICurrencyRepository,
  @Inject(STOCK_LEVEL_REPOSITORY)  private readonly stockLevelRepository: IStockLevelRepository,
  @Inject(COMMISSION_ACCRUAL_RECORDER) private readonly accrualRecorder: ICommissionAccrualRecorder,
) {}

/** Mirrors `fetchAllRates` exactly: fan out the port's per-key read, flatten. */
private async fetchStockLevels(basket: readonly BasketLine[]): Promise<StockLevel[]> {
  const productIds = [...new Set(basket.map((line) => line.productId))];
  const perProduct = await Promise.all(
    productIds.map((productId) => this.stockLevelRepository.list({ productId })),
  );
  return perProduct.flat();
}
```

Wiring in `sales.module.ts`: `{ provide: STOCK_LEVEL_REPOSITORY, useClass: PrismaStockLevelRepository }`
— the **symbol**, never the concrete class in the constructor, identical to the two existing
provider entries at `:17-18`.

**Race accepted, explicitly** (spec: "Fast-Fail Read, Not a Reservation"): read-then-create is
not transactional; `verified` remains the sole reserving transition and still 409s. No
soft-hold, no TTL, no sweeper. Pinned by a test so nobody "fixes" it later.

---

## 7. Commission reference resolution and seed

### 7.1 Runtime: id lookup only

`PrismaCommissionReferenceProvider.commissionFor(productId)` is a single
`findUnique({ where: { productId } })` → `money(minorUnits, 'MN')` or `undefined`. No string
matching, no fallback, no catch-all, ever. **This is the whole runtime rule.**

### 7.2 Seed time: how a product name resolves to an amount

`packages/infra-db/src/commission/seed.ts` holds a **hand-transcribed** TS constant of
`docs/plans/reference/04-commissions.md` (the doc's `10 000` / `12 000` thousands spaces are
resolved by the human transcribing, not by a parser), then resolves names to product ids:

| Step | Rule |
|---|---|
| 1 | Normalize both sides with the MVP's `normalizeName` — NFD, strip diacritics, lowercase, collapse non-alphanumerics (`commission-map.ts:20-28`) |
| 2 | **Exact** normalized-name match against `product.name` |
| 3 | If no exact match: **longest normalized reference key that is a substring** of the product name wins |
| 4 | Ties at equal length, or two reference rows with the same normalized key and **different** amounts → **seed FAILS LOUDLY**, listing both |
| 5 | Product matched by nothing → **no row written**. `commissionFor` returns `undefined` |
| 6 | Reference row matching no product → printed in the seed report as unused reference data |

The seed prints a report — `matched`, `unmatched products`, `unused references`, `ambiguous`
— and exits non-zero on step 4. Reference data, not an invariant.

### 7.3 The genuinely fuzzy rows, decided

| Row | Decision | Why |
|---|---|---|
| `Demás equipos pequeños \| 1000` | **NOT SEEDED.** Excluded from the constant entirely | It is a fallback RULE, not a product. Seeding it as a catch-all is precisely the coercion the spec forbids |
| `Neveras \| 3000` vs `Neveras de 16 y 20 pies \| 4000` | Both seeded. Step 3 gives the longer key priority, so `Nevera 16 pies` → 4000 and a plain `Nevera` → 3000 | Deterministic, and it reproduces the MVP's most-specific-first intent without its catch-all |
| `Calentadores de agua` / `Calentador de agua` — both 3000 | Collapse to ONE key after normalization | Identical amount ⇒ no information lost. Had they differed, step 4 would abort the seed |
| `Cable \| 50 por metro` | Seeded as flat `50`, per unit | D5: valid **iff** the product's quantity is expressed in metres. Recorded as an assumption in §14, not machinery |
| `Metro de azulejos \| 500` | Seeded as flat `500`, per unit | Same. The unit is already in the product name |
| `Combos de electrodomésticos` (`:9-13`) | **SEEDED, at product level only** (`COMBO_BRACKETS`, owner-confirmed 2026-07-30): a catalog product whose NAME joins pieces with `" + "` is priced by how many it joins — 1-2 → 3000, 3-5 → 4000, 6-7 → 5000. Nothing above 7 is extrapolated | D6 as originally written read the bracket as ORDER-level and left it out. The owner's reading is narrower: it prices a bundle SOLD AS ONE PRODUCT, which is per-product after all. The order-level rule — an order carrying N separate lines — stays **unimplemented** (R17 still holds; each line pays its own tier). `NAMED_BUNDLE_TABLE` and `KIT_TABLE` resolve BEFORE the bracket, so a bundle the doc named and priced itself (`Fogón infrarrojo + olla de presión o calderos \| 1500`) is not repriced by piece count |
| `Kits de energía` (`:84-96`) | Seeded as ordinary rows | D5 — kits are catalog products, same per-product path |

### 7.4 MVP dictionary: kept vs rejected

**Rejected**: `CATEGORY_DEFAULTS` (`:96-108`), `CATCH_ALL = 1000` (`:111`), and the runtime
`deriveCommission` (`:135-147`) — all three invent an amount for an unconfigured product,
which the spec's first requirement forbids outright, and they do it on the request path where
nobody sees it happen.
**Kept**: `normalizeName` and most-specific-first precedence, moved to seed time where a wrong
match is a report line a human reads, not a silent payout.
**Also rejected**: the bundle `" + "` split (`:136-143`). Bundle products are catalog products
with their own reference row (D5); splitting names at runtime is the same guesswork.

---

## 8. Prisma schema and migrations

### 8.1 Schema

```prisma
model Order {
  // …
  /// `CompanyUser.id`. NULL only for orders created before this column existed —
  /// deliberately NOT backfilled: attribution is evidence, never a default (design A8).
  attributedCompanyUserId String? @db.Uuid @map("attributed_company_user_id")
  attributedCompanyUser   CompanyUser? @relation(fields: [attributedCompanyUserId], references: [id])
  @@index([attributedCompanyUserId])
}

model ProductCommissionReference {
  productId String   @id @db.Uuid @map("product_id")   // PK == FK: exactly 0..1 per product
  amountMn  Decimal  @db.Decimal(18, 2) @map("amount_mn") // D5 fixes MN; multi-currency is a future change
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")
  product   Product  @relation(fields: [productId], references: [id])
  @@map("product_commission_reference")
}

model CommissionAccrual {
  id                      String   @id @default(uuid()) @db.Uuid
  orderId                 String   @unique @db.Uuid @map("order_id") // idempotency key (A10)
  attributedCompanyUserId String   @db.Uuid @map("attributed_company_user_id")
  total                   Decimal  @db.Decimal(18, 2) // MN
  accruedAt               DateTime @map("accrued_at")
  createdAt               DateTime @default(now()) @map("created_at")
  updatedAt               DateTime @updatedAt      @map("updated_at")
  order       Order       @relation(fields: [orderId], references: [id])
  companyUser CompanyUser @relation(fields: [attributedCompanyUserId], references: [id])
  lines       CommissionAccrualLine[]
  unresolved  CommissionAccrualUnresolved[]
  payment     CommissionPayment?
  @@index([attributedCompanyUserId])
  @@map("commission_accrual")
}

model CommissionAccrualLine {
  id             String  @id @default(uuid()) @db.Uuid
  accrualId      String  @db.Uuid @map("accrual_id")
  orderLineId    String  @db.Uuid @map("order_line_id")
  productId      String  @db.Uuid @map("product_id")
  quantity       Int
  unitCommission Decimal @db.Decimal(18, 2) @map("unit_commission") // FROZEN
  lineCommission Decimal @db.Decimal(18, 2) @map("line_commission")
  accrual CommissionAccrual @relation(fields: [accrualId], references: [id], onDelete: Cascade)
  @@unique([accrualId, orderLineId])
  @@map("commission_accrual_line")
}

/// Lines whose product had NO reference. Recorded, never zeroed, never summed.
model CommissionAccrualUnresolved {
  id          String @id @default(uuid()) @db.Uuid
  accrualId   String @db.Uuid @map("accrual_id")
  orderLineId String @db.Uuid @map("order_line_id")
  productId   String @db.Uuid @map("product_id")
  quantity    Int
  accrual CommissionAccrual @relation(fields: [accrualId], references: [id], onDelete: Cascade)
  @@unique([accrualId, orderLineId])
  @@map("commission_accrual_unresolved")
}

model CommissionPayment {
  id                      String   @id @default(uuid()) @db.Uuid
  accrualId               String   @unique @db.Uuid @map("accrual_id") // 1:1 (A12)
  amount                  Decimal  @db.Decimal(18, 2) // MN
  paidAt                  DateTime @map("paid_at")
  recordedByCompanyUserId String   @db.Uuid @map("recorded_by_company_user_id")
  note                    String?
  createdAt               DateTime @default(now()) @map("created_at")
  accrual CommissionAccrual @relation(fields: [accrualId], references: [id])
  @@map("commission_payment")
}
```

```prisma
model CompanyUser {
  // …
  /// D10 #3 — who provisioned this assignment. Self-referencing, NULLABLE.
  /// NULL = self-registered (`AuthService.signup`), seeded, or pre-migration.
  /// NEVER backfilled: an invented creator is invented audit (design A17).
  createdByCompanyUserId String?       @db.Uuid @map("created_by_company_user_id")
  createdBy              CompanyUser?  @relation("CompanyUserCreatedBy", fields: [createdByCompanyUserId], references: [id])
  created                CompanyUser[] @relation("CompanyUserCreatedBy")
  @@index([createdByCompanyUserId])
}
```

`Order.status` stays exactly `created|verified|delivered|cancelled` — the `OrderStatus` enum
is **not touched** (D7). Note that `commission_payment` references only `commission_accrual`;
nothing in this schema can alter an `Order`.

### 8.2 Migration A — `20260729xxxxxx_add_order_sales_attribution`

Ships **with** the attribution code (slice 3a).

```sql
ALTER TABLE "sales_order" ADD COLUMN "attributed_company_user_id" UUID;

ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_attributed_company_user_id_fkey"
  FOREIGN KEY ("attributed_company_user_id") REFERENCES "company_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "sales_order_attributed_company_user_id_idx"
  ON "sales_order"("attributed_company_user_id");

-- NO BACKFILL, deliberately. Pre-existing orders have no attributed agent and
-- inventing one would fabricate financial evidence (design A8). They stay NULL
-- and are excluded from accrual, loudly (UNATTRIBUTED_ORDER).
```

**Rollback A** — zero data loss for anything that existed before it:

```sql
DROP INDEX "sales_order_attributed_company_user_id_idx";
ALTER TABLE "sales_order" DROP CONSTRAINT "sales_order_attributed_company_user_id_fkey";
ALTER TABLE "sales_order" DROP COLUMN "attributed_company_user_id";
```

This *does* discard attribution captured after the cutover, so it is only safe while no
accrual exists — i.e. **before migration B has any rows**. That ordering is the whole reason
these are two migrations.

### 8.3 Why THREE migrations, and what gates each

| # | Migration | Touches | Risk class | Ships with |
|---|---|---|---|---|
| **A** | `..._add_order_sales_attribution` | `ALTER` on `sales_order`, the busiest existing table | Highest — mutates live rows' shape | slice 3a |
| **C** | `..._add_company_user_created_by` | `ALTER` on `company_user`, additive nullable column | Low — one nullable column, no backfill | slice 3c |
| **B** | `..._add_commission_module` | 5 brand-new empty tables | Low to create, **irreversible once settled** | slice 3b |

They are separate because their blast radii, rollback regimes and code slices differ, and
because A's rollback is only safe while no accrual exists (§8.2). Same discipline as
`company-user-roles-reframe`'s 001/002. **A must precede B** (the gate below). **C depends
only on A** (it needs `SanitizedUser.companyUserId` to have a writer) and is otherwise
independent of B.

**Gate — `packages/infra-db/scripts/verify-order-attribution.ts` MUST pass before B is run:**

```sql
SELECT
  (SELECT count(*) FROM "sales_order")                                    AS orders,
  (SELECT count(*) FROM "sales_order"
     WHERE "attributed_company_user_id" IS NULL)                          AS legacy_unattributed,
  (SELECT count(*) FROM "sales_order" o LEFT JOIN "company_user" cu
     ON cu."id" = o."attributed_company_user_id"
     WHERE o."attributed_company_user_id" IS NOT NULL AND cu."id" IS NULL) AS orphans,       -- MUST = 0
  (SELECT count(*) FROM "sales_order"
     WHERE "attributed_company_user_id" IS NULL
       AND "created_at" > :cutover_timestamp)                             AS post_cutover_nulls; -- MUST = 0
```

`post_cutover_nulls > 0` means the delivery layer is writing unattributed orders — accruing
commission on top of that would produce silently incomplete payouts. Exit non-zero.
`legacy_unattributed` is reported, not asserted: it is expected and permanent.

### 8.4 Migration C — `20260729yyyyyy_add_company_user_created_by`

Ships with slice 3c. Timestamped AFTER A and BEFORE B, matching the slice order in §13.

```sql
ALTER TABLE "company_user" ADD COLUMN "created_by_company_user_id" UUID;

-- Self-referencing FK. ON DELETE RESTRICT matches every other FK in this schema;
-- `company_user` has no hard-delete path today (prior design §0.2), so RESTRICT
-- can only ever fire as a loud signal that one was introduced.
ALTER TABLE "company_user" ADD CONSTRAINT "company_user_created_by_company_user_id_fkey"
  FOREIGN KEY ("created_by_company_user_id") REFERENCES "company_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "company_user_created_by_company_user_id_idx"
  ON "company_user"("created_by_company_user_id");

-- NO BACKFILL. Existing assignments were created by signup, by an owner through
-- api-idp, or by a seed; the DB does not record which, and guessing would
-- manufacture an audit trail (design A17 / A8's rule).
```

**Rollback C** — genuinely lossless for everything that predates it, and the *only*
rollback in this change with no caveat attached:

```sql
DROP INDEX "company_user_created_by_company_user_id_idx";
ALTER TABLE "company_user" DROP CONSTRAINT "company_user_created_by_company_user_id_fkey";
ALTER TABLE "company_user" DROP COLUMN "created_by_company_user_id";
```

It discards provenance captured after the cutover. That is audit data, not operational data:
nothing reads it to make a decision, so dropping it degrades forensics and breaks nothing.

### 8.5 Migration B — `20260729zzzzzz_add_commission_module`

Ships with slice 3b. `CREATE TABLE` × 5, FKs in dependency order
(`product_commission_reference` → `product`; `commission_accrual` → `sales_order`,
`company_user`; lines/unresolved → `commission_accrual` `ON DELETE CASCADE`;
`commission_payment` → `commission_accrual` `ON DELETE RESTRICT`), plus
`CREATE UNIQUE INDEX` on `commission_accrual(order_id)` and `commission_payment(accrual_id)`.

**No seed inside the SQL.** Product ids are `gen_random_uuid()`-minted at product-seed time, so
name→id resolution cannot be expressed in a static migration. The reference seed is
`packages/infra-db/src/commission/seed.ts`, run separately (precedent: every other
`infra-db/src/<concept>/seed.ts`).

**Rollback B**:

```sql
DROP TABLE "commission_payment";
DROP TABLE "commission_accrual_unresolved";
DROP TABLE "commission_accrual_line";
DROP TABLE "commission_accrual";
DROP TABLE "product_commission_reference";
```

Safe while the tables are empty. **Once a `commission_payment` row exists this rollback
destroys a financial record** — from that point on the only acceptable rollback is *revert
the code and leave the tables inert*, exactly as recorded for migration 001 of the previous
change. Both A and B are round-tripped on a clone of `store_mgmt_test` before either runs
forward. The dev database `store_mgmt` is never touched.

---

## 9. Endpoint surface

| Method | Route | `@Roles(...)` | Body / Query | Codes |
|---|---|---|---|---|
| `POST` | `/orders/availability` | owner, admin, sales_operator, **sales_agent** | `{ lines: [{productId, quantity}] }` | 200 `{ warehouses: [{id,name}] }`; 400 empty lines / `quantity < 1` |
| `POST` | `/orders` | owner, admin, sales_operator, **sales_agent** (method-level) | `CreateOrderDto` **unchanged** — no agent field | 201; 400 `InvalidOrderError`; **409 `WarehouseCannotFulfillOrderError`** |
| `PATCH` | `/orders/:id` | owner, admin, sales_operator, **sales_agent** (method-level) | `UpdateOrderDto` unchanged | 200; 404; 409 (`InvalidOrderStateError` \| `WarehouseCannotFulfillOrderError`) |
| `GET` | `/orders`, `/orders/:id` | + **sales_agent** | — | 200; scoped, see below |
| `POST` | `/orders/:id/{confirm,cancel}` | **unchanged** — no `sales_agent` | — | — |
| `POST` | `/orders/:id/deliver` | **unchanged** | — | 200; accrual side effect (A9) |
| `GET` | `/commissions/accruals` | owner, admin, sales_agent | `?companyUserId&orderId&from&to` | 200 |
| `POST` | `/commissions/accruals` | owner, admin | `{ orderId }` — idempotent create-if-absent | 200 (`@HttpCode(OK)`, upsert-read semantics); 404 unknown order; 409 order not `delivered`; 409 order unattributed |
| `GET` | `/commissions/report` | owner, admin | `?from&to` | 200 — grouped by attributed `CompanyUser`, **owner included** (D8) |
| `POST` | `/commissions/payments` | owner, admin | `{ accrualId, amount: MoneyAmountDto, note? }` | 201; 404 unknown accrual; 409 already settled; 400 currency ≠ MN |
| `GET` | `/customers`, `/customers/:id` | + **sales_agent** (method-level) | — | 200 — READ grant per the identity spec |
| **`POST`** | **`/customers/with-identity`** (D10) | owner, admin, sales_operator, **sales_agent** | `CreateCustomerWithIdentityDto` — **no `userId`, no `roles`** | 201; 400 blank `fullName`/`login` or `password` < 8; **409 `DuplicateLoginError`**; 409 `DuplicateCustomerDocumentError` |
| `POST` | `/customers` (existing) | **unchanged** — owner, admin, sales_operator. **NOT `sales_agent`** | `CreateCustomerDto` with an existing `userId` | unchanged (A14) |
| `PATCH`/`DELETE` | `/customers/:id` | **unchanged** — no `sales_agent` | — | — |

Notes that are load-bearing:

- **Method-level `@Roles` overrides class-level** — `roles.guard.ts:32-35` uses
  `getAllAndOverride`. So each granting handler must re-list `owner, admin, sales_operator`
  alongside `sales_agent`. Class-level stays untouched so `confirm`/`cancel` do **not** widen.
- **`sales_agent` is deliberately NOT granted `confirm`/`cancel`/`deliver`.** `confirm`
  reserves stock and `deliver` consumes it; no spec requirement grants an agent either, and
  `deliver` is documented as a warehouse-floor action (`order.controller.ts:80-83`).
- **Route collision**: `POST /orders/availability` cannot be swallowed by `OrderController` —
  its POST routes are `''`, `':id/confirm'`, `':id/deliver'`, `':id/cancel'`. There is no
  `@Post(':id')`. A dedicated `@Controller('orders/availability')` also means the new route
  does **not** inherit `OrderController`'s class-level `@Roles`.
- **Order read scoping** — a caller whose access comes SOLELY from `sales_agent` sees only
  orders they are attributed on, via `isScopedSalesAgent(user)` mirroring
  `isScopedWarehouseOperator` (`:219-225`) and using `hasRole` per §0.5. Same predicate scopes
  `GET /commissions/accruals`. **This is a grant narrower than any spec requirement states**;
  see §14 Q1.
- **Empty `warehouses` array is a 200**, not a 404 — "no warehouse can fulfil this basket" is
  a valid, actionable answer. The client then never gets to attempt a doomed `POST /orders`.
- **`sales_agent` is granted the MINT route but NOT the existing `POST /customers`** (A14).
  The existing route accepts an arbitrary `userId`; granting it would let an agent attach a
  customer record to any identity in the system, the owner's included. The split is the guard.
- **`PATCH`/`DELETE /customers/:id` stay closed to `sales_agent`.** D10 grants onboarding, not
  master-data custody. `@Roles` stays class-level for those two, so nothing widens by default.
- **Boundary validation is hand-written** (§0.13): `assertNonBlank(fullName)`,
  `assertNonBlank(login)`, `assertMinLength(password, 8)` in the controller, mirroring
  `assertCurrency` (`order.controller.ts:47-51`). The 8-character floor matches
  `CreateUserDto.password`'s `@MinLength(8)` so the two identity-minting paths cannot drift.

---

## 10. `PATCH /orders/:id` re-validation

`OrderService.update` (`order.service.ts:106-121`) today: load, assert `status === 'created'`,
forward the patch. It changes `warehouseId` with **no stock check at all**. New shape:

```ts
async update(id, patch) {
  const existing = await this.orderRepository.findById(id);
  if (!existing) return null;
  if (existing.status !== 'created') throw new InvalidOrderStateError(id, 'created', existing.status);

  // Re-validate ONLY when the warehouse actually moves. A patch that touches
  // customerName/deliveryMode performs ZERO extra reads — which is also what
  // keeps the existing order.service.spec.ts cases from needing stock fixtures.
  if (patch.warehouseId !== undefined && patch.warehouseId !== existing.warehouseId) {
    const basket = existing.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
    const levels = await this.fetchStockLevels(basket);
    assertWarehouseCoversBasket(basket, patch.warehouseId, levels);   // throws -> 409
  }
  // …unchanged
}
```

`OrderController.withDomainErrorMapping` (`:228-245`) gains
`WarehouseCannotFulfillOrderError` to its 409 branch, next to `InsufficientStockError`. On
rejection nothing is written — `warehouseId` is unchanged, per spec scenario.

---

## 11. File changes

| File | Action |
|---|---|
| `packages/domain/src/users/roles.ts` (+ `roles.test.ts`) | Modify — bit 32, mask, label; fix the hand-enumerated `businessBits` (§0.6) |
| `packages/domain/src/sales/availability.ts` (+ `.test.ts`) | **Create** |
| `packages/domain/src/sales/errors.ts` | Modify — `WarehouseCannotFulfillOrderError` |
| `packages/domain/src/sales/order.ts` (+ `order.test.ts`) | Modify — `attributedCompanyUserId` on `Order` + `CreateOrderInput` |
| `packages/domain/src/sales/index.ts` | Modify — export availability + error |
| `packages/domain/src/commission/{commission-reference,commission-accrual,commission-payment,compute-accrual,errors,index}.ts` (+ tests) | **Create** |
| `packages/domain/src/commission/{commission-reference-provider,commission-accrual-repository,commission-payment-repository,commission-accrual-recorder}.port.ts` | **Create** |
| `packages/domain/src/index.ts` | Modify — export `commission/` |
| `packages/api-common/src/auth/jwt.strategy.ts` (+ spec) | Modify — `companyUserId` on `SanitizedUser` |
| `packages/infra-db/prisma/schema.prisma` | Modify — +5 models, +1 column/FK/index on `Order` |
| `packages/infra-db/prisma/migrations/…_add_order_sales_attribution/migration.sql` | **Create** |
| `packages/infra-db/prisma/migrations/…_add_commission_module/migration.sql` | **Create** |
| `packages/infra-db/scripts/verify-order-attribution.ts` | **Create** |
| `packages/infra-db/src/commission/{prisma-commission-reference.provider,prisma-commission-accrual.repository,prisma-commission-payment.repository,seed}.ts` (+ specs) | **Create** |
| `packages/infra-db/src/sales/prisma-order.repository.ts` (+ spec) | Modify — map the attribution column in `toDomain`/`create` |
| `packages/infra-db/src/sales/seed.ts` (+ spec) | Modify — 5 `createOrder` call sites need attribution |
| `packages/infra-db/src/index.ts` | Modify — export commission adapters |
| `apps/api-salesops/src/sales/availability.{controller,service}.ts` + `dto/` (+ specs) | **Create** |
| `apps/api-salesops/src/sales/order.service.ts` (+ spec) | Modify — 2 new ports, D4 assertion in `create`+`update`, accrual call in `deliver` |
| `apps/api-salesops/src/sales/order.controller.ts` (+ spec) | Modify — method-level `@Roles`, 409 mapping, `isScopedSalesAgent`, attribution from `req.user` |
| `apps/api-salesops/src/sales/sales.module.ts` | Modify — bind `STOCK_LEVEL_REPOSITORY`, `WAREHOUSE_REPOSITORY`, `COMMISSION_ACCRUAL_RECORDER` |
| `apps/api-salesops/src/commission/{commission.controller,commission.service,commission-accrual.recorder,commission.module}.ts` + `dto/` (+ specs) | **Create** |
| `apps/api-salesops/src/customer/customer.controller.ts` (+ spec) | Modify — `sales_agent` on the two READ handlers only; `POST`/`PATCH`/`DELETE` untouched (A14) |
| `apps/api-salesops/src/customer/customer-identity.{controller,service}.ts` + `dto/create-customer-with-identity.dto.ts` (+ specs) | **Create** — D10 |
| `apps/api-salesops/src/customer/customer.module.ts` | Modify — register the new controller/service; `USER_REPOSITORY`+`COMPANY_USER_REPOSITORY` bindings (already bound in `auth.module.ts:29-30`, §0.14) |
| `apps/api-salesops/src/customer/customer.service.ts` | **Unchanged** — A14 keeps the two paths apart |
| `packages/domain/src/company/company-user.ts` (+ test) | Modify — `createdByCompanyUserId` on entity + input (D10 #3) |
| `packages/domain/src/company/company-user-repository.port.ts` | Modify — `create` accepts `createdByCompanyUserId` |
| `packages/infra-db/src/company/prisma-company-user.repository.ts` (+ spec) | Modify — map the new column |
| `packages/infra-db/prisma/migrations/…_add_company_user_created_by/migration.sql` | **Create** — migration C |
| `apps/api-idp/src/**` | **Unchanged** — no `api-salesops → api-idp` edge (§0.14) |
| `apps/api-salesops/src/app.module.ts` | Modify — register `CommissionModule` |
| `apps/api-salesops/src/test-support/auth-test-helpers.ts` | Modify — `companyUserId` on `SAMPLE_AUTH_USER` |
| `apps/api-salesops/test/support/auth-e2e-helper.ts` | Modify — return/stamp `companyUserId` |
| `apps/api-salesops/src/stock/stock.controller.ts` | **Unchanged** — §0.4 |
| `packages/domain/src/inventory/**` | **Unchanged** — no port change (§0.3), no rule moves in (§0.2) |
| `openspec/changes/backend-users-roles/specs/salesops-identity/spec.md` | Modify — the AMENDMENT (never an append) |
| `openspec/changes/sales-agents-commissions/specs/salesops-identity/spec.md` | **Modify — MANDATORY.** Its `sales_agent Role Grants and Non-Goals` requirement currently states *"MUST NOT grant Customer CREATE (deferred to design)"* and carries a scenario asserting the denial. **D10 makes both FALSE.** Replace with the mint-route grant + the `user`-bit-only and no-`POST /customers` constraints (A14/A15). Same amendment discipline the identity delta itself used: quote the superseded text verbatim |
| `openspec/specs/salesops-ventas/spec.md` | Modify — merge the ADDED requirements |

---

## 12. Testing strategy — STRICT TDD

Test DB `store_mgmt_test`. **GOTCHA (blocking, carried from the last change)**: `api-salesops`
resolves `@store-mgmt/domain` via `dist/` — rebuild `domain`, `infra-db` and `api-common`
before any `api-salesops` run or the specs test stale types.

### RED → GREEN (write the failing test first)

| # | Behavior | Layer | Home | Slice |
|---|---|---|---|---|
| R1 | `sales_agent = 32` exists, is distinct, and `effectiveRoles(owner)` INCLUDES it while `hasRole(owner_raw, sales_agent)` is `false` (§0.5) | Unit, pure | `domain/src/users/roles.test.ts` | 1 |
| R2 | `warehouseCoversBasket`: covers; short on one line ⇒ false; **`onHand` sufficient but `available` short ⇒ false** (§0.2); missing row ⇒ false; duplicate product ids summed | Unit, pure | `domain/src/sales/availability.test.ts` | 1 |
| R3 | `eligibleWarehouses`: returns only fully-covering ids; zero eligible ⇒ `[]`; result independent of any warehouse scope | Unit, pure | same | 1 |
| R4 | `POST /orders/availability` admits `sales_agent`, returns only covering warehouses, 200 with `[]` when none, 400 on empty basket | Unit + e2e | `sales/availability.controller.spec.ts`, `test/order.e2e-spec.ts` | 1 |
| R5 | `POST /orders` against a non-covering warehouse ⇒ 409 and **no order row written**; covering ⇒ 201 | Unit + e2e | `order.service.spec.ts`, `order.controller.spec.ts`, e2e | 2 |
| R6 | Creation performs **zero** stock mutation (`onHand`/`reserved` unchanged); a competing order between create and verify still 409s at verify — the race is PINNED, not fixed | Integration | `test/order.e2e-spec.ts` | 2 |
| R7 | `PATCH` to a non-covering warehouse ⇒ 409, `warehouseId` unchanged; to a covering one ⇒ 200; a patch **not** touching `warehouseId` issues no stock read | Unit + e2e | `order.service.spec.ts` | 2 |
| R8 | Attribution comes from `req.user.companyUserId`; a client-supplied agent field in the payload is **ignored**; attribution unchanged across verify/deliver | Unit + e2e | `order.controller.spec.ts`, e2e | 3a |
| R9 | A non-ACTIVE `CompanyUser` never attributes a sale — denied before creation (already 403 at `jwt.strategy.ts:99-107`; this asserts it, no new code) | Unit | `api-common/.../jwt.strategy.spec.ts` | 3a |
| R10 | `commissionFor`: configured ⇒ `Money` MN; unconfigured ⇒ `undefined`, **never `money(0n,'MN')`** | Integration | `infra-db/src/commission/*.spec.ts` | 3b |
| R11 | `computeAccrual`: `300×2 + 200×1 = 800`; one unresolved line ⇒ total `600`, line in `unresolved`, **not** zeroed | Unit, pure | `domain/src/commission/compute-accrual.test.ts` | 3b |
| R12 | Order creation succeeds for a product with **no** commission reference (resolvability is not a creation invariant) | Unit + e2e | `order.service.spec.ts` | 3b |
| R13 | Delivering creates exactly one accrual; delivering is idempotent w.r.t. accrual (`@@unique(order_id)`); an unattributed legacy order ⇒ **no** accrual + logged | Unit + integration | `commission-accrual.recorder.spec.ts` | 3b |
| R14 | `POST /commissions/payments` leaves `Order.status` byte-for-byte unchanged; a second payment on the same accrual ⇒ 409 | Integration + e2e | `commission.controller.spec.ts`, e2e | 3b |
| R15 | An accrual cannot exist for a non-`delivered` order; cancelling a `created`/`verified` order leaves no accrual (proves §0.10's structural claim) | Unit + integration | same | 3b |
| R16 | `GET /commissions/report` includes an **owner** who registered and delivered a sale — the owner is never filtered out (D8) | Integration | same | 3b |
| R17 | No combo-bracket computation exists in the capability's public surface (D6) | Unit | `domain/src/commission/index.test.ts` or a `rg` assertion in the spec | 3b |
| R18 | Fully-paid and credit-pending orders accrue identically at `delivered` (D9 — trigger never reads payment state) | Integration | `commission-accrual.recorder.spec.ts` | 3b |
| R19 | Seed resolution: exact match wins; longest-substring breaks `Neveras` vs `Neveras de 16 y 20 pies`; **ambiguous same-key different-amount ⇒ seed throws**; unmatched product ⇒ no row | Unit | `infra-db/src/commission/seed.spec.ts` | 3b |
| **R20** | `POST /customers/with-identity` as `sales_agent` ⇒ 201, and the created `User` has an **ACTIVE `CompanyUser`** — i.e. the new account can actually authenticate (the §0.12 property, asserted rather than assumed) | Integration + e2e | `customer-identity.service.spec.ts`, `test/customer.e2e-spec.ts` | 3c |
| **R21** | **Privilege escalation, the load-bearing test.** `POST /customers/with-identity` with `"roles": 8` (owner) / `"roles": 16` (admin) in the body ⇒ the created assignment's role is **exactly `1`**. Repeated for `"role"`, and for `"userId": <the owner's id>` | Unit + **e2e against the real HTTP stack** | `customer-identity.controller.spec.ts` + e2e | 3c |
| **R22** | No code path reads a role from the request: `CUSTOMER_IDENTITY_ROLE` is module-private and `createWithIdentity` has no role parameter — asserted structurally (`rg`-style source assertion, mirroring R17) | Unit | `customer-identity.service.spec.ts` | 3c |
| **R23** | The assignment is scoped to the **caller's** `companyId` and attributed to the caller's `companyUserId` (D10 #2/#3); a second caller from another company never widens it | Integration | `customer-identity.service.spec.ts` | 3c |
| **R24** | Partial-failure ordering (A16): a `DuplicateLoginError` on write #1 ⇒ **nothing** written (no orphan `Customer`, no assignment) ⇒ 409; a failure after write #1 leaves a login that 403s `MISSING_COMPANY_USER` rather than a silently permissionless account | Unit + integration | same | 3c |
| **R25** | `sales_agent` is **denied** `POST /customers` (the link-to-existing-`userId` route), `PATCH /customers/:id` and `DELETE /customers/:id` ⇒ 403 (A14) | Unit | `customer.controller.spec.ts` | 3c |

**R21 is the one that must be written first and must be seen to fail.** Because
`api-salesops` runs no `ValidationPipe` (§0.13), it is the *only* evidence that the guard is
real; there is no framework layer behind it to catch a regression.

### Mechanical (the compiler and existing suites are the gate)

- `SanitizedUser.companyUserId` **required** ⇒ compile errors in exactly two fixtures
  (`src/test-support/auth-test-helpers.ts`, `test/support/auth-e2e-helper.ts`). Required, not
  optional, precisely so this is a compile error rather than silent `undefined` attribution.
- `CreateOrderInput.attributedCompanyUserId` **required** ⇒ compile errors at every
  `createOrder(...)` construction site.
- Method-level `@Roles` additions — the existing role suites in `order.controller.spec.ts` /
  `customer.controller.spec.ts` passing unchanged IS the non-regression proof.
- `409` mapping addition to `withDomainErrorMapping`.

### Blast radius on the existing `api-salesops` suite (181 unit + 50 e2e, verified by count)

| Suite | Today | Breaks | Cause / fixture work |
|---|---|---|---|
| `src/sales/order.service.spec.ts` | 14 | **14 (all)** | Two new constructor `@Inject`s ⇒ every `Test.createTestingModule` provider list fails DI. Add two mocks; `create` cases additionally need a `StockLevel[]` stub covering the basket |
| `src/sales/order.controller.spec.ts` | 31 | ~2 + 1 helper | Only via `auth-test-helpers.ts` (`companyUserId`) plus the new 409-mapping case. `OrderService` is mocked, so DI is unaffected |
| `test/order.e2e-spec.ts` | 16 | **16 (all)** | Every order-creating fixture must seed stock in the target warehouse before `POST /orders`. Extract one `seedStockForBasket(...)` helper — do NOT inline it 16 times |
| `test/customer.e2e-spec.ts` + other e2e | 34 | 0 behaviorally, all via the shared helper | `auth-e2e-helper.ts` one-file change (same single-file leverage the last change relied on) |
| `src/stock/*.spec.ts` | 17 | **0** | `StockController` untouched (§0.4) |
| `src/customer/customer.controller.spec.ts` | 15 | **0 broken**, +~5 new | READ-handler `@Roles` widen only; `POST`/`PATCH`/`DELETE` untouched by A14. New: R25 denials |
| `src/customer/customer.service.spec.ts` | 11 | **0** | `CustomerService` is not touched (A14) |
| `test/customer.e2e-spec.ts` | 14 | 0 broken, +~4 new | Additive: R20/R21 e2e. Existing cases keep passing an explicit `userId` to the old route |
| **Outside `api-salesops`** | | | |
| `infra-db/src/company/prisma-company-user.repository.spec.ts` | — | +1 column round-trip | `createdByCompanyUserId` maps and defaults to `null` |
| `domain/src/company/company-user.test.ts` | — | +1 | `createdByCompanyUserId` defaults to `null`, never invented |
| `domain/src/sales/order.test.ts` | 20 | **20 (all, compile)** | `attributedCompanyUserId` required on `CreateOrderInput` (slice 3a only — slice 2 leaves this suite green) |
| `domain/src/users/roles.test.ts` | 8 | **1** | `:50-55` hand-enumerated `businessBits` (§0.6) |
| `infra-db/src/sales/prisma-order.repository.spec.ts` | 16 | ~1 + fixtures | Attribution column round-trip; `seed.ts` has 5 `createOrder` call sites |
| `infra-db/src/sales/seed.spec.ts` | 3 | up to 3 | Same |

Total realistically **broken**: **≈57 of the 231 `api-salesops` tests**, plus ≈24 domain and
≈19 infra-db — unchanged by D10, because A14's separate route makes the customer work
**purely additive** (≈9 new `api-salesops` tests, ≈2 elsewhere). The 14 + 16 concentrated in
`OrderService`/order-e2e are slice 2; the 20 domain compile breaks are slice 3a.
**Never both in the same commit.**

That D10 breaks nothing is a *consequence* of A14, not luck: overloading `POST /customers`
(the rejected alternative) would have put the 15 controller + 11 service + 14 e2e customer
tests into the broken column and coupled an identity-minting change to master-data tests.

---

## 13. Rollout slices — one branch `salesops-sales-agents-commissions` from `main`

| # | Content | Schema | Verified by | Rollback |
|---|---|---|---|---|
| **1** | `sales_agent` bit + mask + label; `availability.ts` pure functions; `POST /orders/availability`; customer READ grant; `salesops-identity` **amendment** | **None** | R1–R4 green, full suites green, `pnpm -r build`, lint `--max-warnings 0` | `git revert`. Removing bit `32` is safe while no `company_user.role` row holds it |
| **2** | D4 as an invariant on `POST /orders` and `PATCH /orders/:id`; 409 mapping; the order/e2e fixture migration | **None** | R5–R7 green; the 14 + 16 broken suites restored | `git revert` — behaviour returns to today's; **nothing was written** |
| **3a** | `SanitizedUser.companyUserId`; `Order.attributedCompanyUserId`; migration A; the verification script | **Migration A** | R8–R9 green; `verify-order-attribution.ts` exits 0 | Rollback A (§8.2) — safe **only** while no accrual exists, which is why 3b is separate |
| **3c** | **(D10)** `POST /customers/with-identity`; `createdByCompanyUserId` on `CompanyUser` + adapter; migration C; customer READ grants; `salesops-identity` spec re-amendment | **Migration C** | R20–R25 green, **R21 written and seen to fail first** | Rollback C (§8.4) — lossless; plus code revert. The only unqualified rollback in this change |
| **3b** | `domain/src/commission/`, adapters, migration B, reference seed, `apps/api-salesops/src/commission/`, accrual trigger, reporting | **Migration B** | R10–R19 green; seed report reviewed by the owner | Code revert + Rollback B **only while `commission_payment` is empty**; after the first payment, revert code and leave tables inert |

**Slice order changed for D10, and the reason is rollback, not scope.** 3c depends only on
3a (it needs `SanitizedUser.companyUserId` to have a writer) and is independent of 3b, so it
slots between them. Putting it there keeps **migration B last** — B is the only step whose
rollback destroys financial records once a `commission_payment` exists, and an irreversible
step belongs at the end of the sequence, not in the middle of it.

**Where the migration risk actually is**: slice 3a's `ALTER TABLE sales_order`, then 3b's
irreversibility-after-settlement. Migration C is the cheap one — a nullable audit column with
a lossless rollback. The proposal put all migration risk "in slice 3" — true but not precise
enough to plan a rollback around, hence the split into 3a / 3c / 3b.

**D10's own risk is not a migration risk, it is a privilege risk**, and it lives entirely in
slice 3c's application code: §0.13 established that no framework layer will catch a
regression here. R21 is the whole safety net.

Both migrations are round-tripped forward-and-back on a clone of `store_mgmt_test` before
either runs forward anywhere. **The dev database `store_mgmt` is never touched.**

Review budget: slice 2 and slice 3b will each approach or exceed 400 changed lines
(slice 2 is fixture-heavy, slice 3b is a whole module). `sdd-tasks` must forecast this; the
four-slice split above is the deliverable-work-unit boundary.

---

## 14. Open questions and follow-ups

- [ ] **Q1 — agent order visibility (design-introduced, needs a spec line).** §9 scopes
      `GET /orders` for a caller who is solely `sales_agent` to their own attributions,
      mirroring `isScopedWarehouseOperator`. **No spec requirement states this.** The
      alternative — an agent reads every customer's orders unfiltered, like `sales_operator`
      — is the literal reading of the current grants. Scoping is the safer default and has an
      in-repo pattern; it still needs a `salesops-ventas` requirement added during
      `sdd-tasks`, or it is undocumented behavior.
- [x] **Q2 — RESOLVED 2026-07-28 by D10 (#1607). REVERSED: the agent MAY create customers.**
      The first revision of this design recorded it OUT and escalated the consequence. The
      owner accepted the cost rather than the limitation: the gestor "usando un cliente
      registra una venta", so an agent who cannot onboard a new customer cannot sell, which
      defeats the field-sales workflow the role exists for.
      **Realized by**: A14 (a separate `POST /customers/with-identity`, so the agent never
      gains the link-to-an-arbitrary-existing-`User` power), A15 (the `user` bit as a
      module-private constant, because §0.13 proved a DTO is not a runtime guard in this app),
      A16 (write order User → CompanyUser → Customer, non-transactional, with only loud
      partial states), A17 + migration C (`company_user.created_by_company_user_id`),
      slice 3c, and tests R20–R25 — **R21 first and seen to fail.**
      **What verification changed about the answer**: the escalation said "granting
      `POST /customers` transitively grants creating a `User`". §0.11 shows that is not true
      today — that route *requires* a `User` and never mints one — so the grant alone would
      have delivered a dead end. D10 is a build, not a permission tweak.
- [ ] **Q2-a — REJECTED ALTERNATIVE, recorded so it is not re-litigated.** Customers without
      a login: relax `Customer.userId` to nullable (the MVP's model, where clients were
      synthesized freely). The owner did **not** pick this. It would remove the identity
      surface entirely — no `User`, no `CompanyUser`, no escalation vector, no migration C —
      but it changes the `Customer` model itself, contradicts
      `domain/src/customer/customer.ts:9-12` and the `backend-users-roles` 1:1 requirement it
      cites, and would have to be **its own change, sequenced BEFORE this one**. Anyone
      tempted to reopen it should note the cost is not "make a column nullable": it is
      re-deciding whether a customer is an identity, which `Order.customerId`, `SaleCredit`
      and every existing customer row already assume.
- [ ] **Q2-b — follow-up, NOT in this change: install the mass-assignment pipe in
      `api-salesops`.** §0.13 established that this app has no `ValidationPipe` at all, so
      every DTO in it is a compile-time fiction at runtime. Mirroring
      `api-idp/src/main-setup.ts` requires decorating all ~8 DTO folders **first** — with
      `whitelist: true`, an undecorated class has an empty allow-list and
      `forbidNonWhitelisted: true` would reject every write request in the application. Its
      own change, its own RED suite. Until then, A15's constant and R21 are the guard, and
      that fact should be stated in the PR description rather than assumed.
- [x] **Q3 — combo brackets (D6). ANSWERED by the owner, 2026-07-30/31.** The bracket prices a
      bundle sold as ONE catalog product (name joined with `" + "`), not an order carrying N
      separate lines. Seeded on that reading (§7.3); the order-level rule stays unimplemented and
      R17 still pins its absence from the capability's surface. The owner also confirmed the two
      kits at 8000, the small-kitchen rows at 1000 and `Exhibidor 20P` at 5000, and stated the
      seed is example data meant to be edited rather than a gate: "no vamos a bloquearnos por eso".
      **Open consequence, not blocking:** there is no endpoint to edit a
      `product_commission_reference` — the only write path is the seed, so "editable" today means
      editable in the database, not in the product.
- [ ] **Q4 — per-unit-of-measure rows.** `Cable | 50 por metro` and `Metro de azulejos | 500`
      are seeded as flat per-unit amounts (§7.3). This is correct **only if** those products'
      `quantity` is expressed in metres. Confirm against the real catalog at seed time; the
      seed report makes both rows visible.
- [ ] **Q5 — D8 consequence, surfaced not filtered.** An `owner` who registers a sale accrues
      commission to themselves and appears in `GET /commissions/report` (R16 pins this).
      Locked by D8; flagged here as agreed.
- [ ] **Q6 — accrual is a second transaction.** If `recordForDeliveredOrder` fails after
      `orderRepository.deliver` commits, the order is delivered with no accrual and `deliver`
      cannot be retried (`delivered` is terminal ⇒ 409). Mitigated by the idempotent
      `POST /commissions/accruals` reconcile endpoint (§9) and the `UNATTRIBUTED_ORDER` /
      accrual-failure log lines. A "delivered orders with no accrual" query would close it
      fully — deliberately not built now; ceremony at this scale.
- [ ] **Q7 — spec debt created by D10, must be closed in `sdd-tasks`.** This change's own
      `specs/salesops-identity/spec.md` says the agent **MUST NOT** get Customer CREATE and
      has a passing-style scenario asserting the denial. D10 makes that requirement false —
      the same "amend, never append" trap the proposal already flagged for the `gestor`-bit
      scenario, hit a second time. A spec that ships asserting a denial the code now grants is
      worse than no spec.
- [ ] **Doc debt (carried).** `docs/system/architecture.md:64` (`models/`), `:67`
      (`infra-db` "future"), `:143-152` ("HTTP backend does not exist") are all STALE. Third
      change in a row to record this. Still out of scope; it now warrants its own change.
