# Tasks: sales-agents-commissions

> Realizes design (`sdd/sales-agents-commissions/design`, engram #1606) against specs
> `salesops-commissions` (new), `salesops-identity` (amendment delta),
> `salesops-ventas` (modified delta), `salesops-customers` (new delta). D1-D10 locked, not
> re-derived. Size budget intentionally exceeded (migration/rollback/gate detail is the point
> of this artifact) — consistent with this change's spec/design revisions.

**Delivery model (owner-locked)**: sequential verified slices on ONE branch
`salesops-sales-agents-commissions` (cut from `main` @ `f014296`), work-unit commits, push at
the end, **NO pull request**. Because there is no PR mechanism, "Chained PRs recommended"
below is answered `No` by owner override — the review-load risk that would justify chaining is
instead addressed by keeping each work-unit its own gated, revertible commit.

**Stale item dropped, not propagated**: design's Q7 ("this change's own `salesops-identity`
spec still says the agent MUST NOT get Customer CREATE") is STALE — verified against the
current file twin (`specs/salesops-identity/spec.md:111-163`): the `sales_agent Role Grants`
requirement already grants create-with-new-identity and explicitly denies only the
attach-to-existing-identity path. No task created for Q7.

**Q1 addressed here** (design flagged it as needing a spec line from `sdd-tasks`): task 3.16
adds the missing `salesops-ventas` scoping requirement.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,900-3,900 total across 7 work units (see per-unit table) |
| 400-line budget risk | High — several units at/over budget individually |
| Chained PRs recommended | No — owner-locked no-PR single-branch model overrides chaining |
| Suggested split | 7 work-unit commits: 1 -> 2a -> 2b -> 3a -> 3c -> 3b-i -> 3b-ii |
| Delivery strategy | owner-locked (sequential slices, one branch, no PR) |
| Chain strategy | N/A — no chaining; sequential verified commits instead |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: N/A (owner-locked single-branch, no-PR)
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Schema | Est. lines | Risk | Notes |
|------|------|--------|-----------|------|-------|
| 1 | Identity bit + availability read path + customer READ grant + identity spec amendment | None | ~450-650 | Medium-High | Design didn't flag this, but file/test count says it's close; commit alone |
| 2a | D4 invariant wiring in `OrderService`/`OrderController` | None | ~200-300 | Low-Medium | Behavior only, no fixture repair |
| 2b | Order/e2e blast-radius fixture repair (14 unit + 16 e2e) | None | ~250-400 | Medium-High | Design explicitly flags slice 2 as approaching/exceeding 400 total (2a+2b) |
| 3a | Attribution (`companyUserId`, `attributedCompanyUserId`) + migration A + verify script + Q1 scoping | **Migration A** | ~400-550 | High | Highest-risk migration (busiest table) |
| 3c | Customer+identity creation + migration C | **Migration C** | ~450-600 | High | New module, 6 behavioral tests incl. the load-bearing R21 |
| 3b-i | Commission domain + adapters + migration B + reference seed | **Migration B** | ~450-650 | High | Seed constant table alone is long; irreversible-after-settlement |
| 3b-ii | Commission delivery/endpoints/reporting + accrual trigger wiring | None | ~350-500 | Medium-High | Design flags slice 3b (i+ii combined) as approaching/exceeding 400 |

**Verification note on design's own blast-radius numbers** (user asked to verify, not copy):
design's summary sentence claims "≈57 of 231 api-salesops tests break," but its own per-suite
table sums to **≈32** (`order.service.spec.ts` 14 + `order.controller.spec.ts` ~2 +
`order.e2e-spec.ts` 16) — the "customer.e2e-spec.ts + other e2e (34)" row and the standalone
"customer.e2e-spec.ts (14)" row appear to double-count the same suite. Domain compile breaks
sum to ~21 (`order.test.ts` 20 + `roles.test.ts` 1), not design's stated ≈24. Phase exit
criteria below use the recomputed per-suite numbers (≈32 api-salesops, ≈21 domain, handful in
infra-db); `sdd-apply` MUST verify actual failing counts at each gate rather than trust either
estimate.

**Second DI-mock wave (design-confirmed, not a phase-deferral bug)**: `order.service.spec.ts`'s
14 cases get **two separate** new `@Inject` mocks across the whole change, not one:
`STOCK_LEVEL_REPOSITORY` in Phase 2 (task 2.2) and `COMMISSION_ACCRUAL_RECORDER` in Phase 5
(task 5.14, `deliver()`). Phase 5 will transiently re-break these 14 tests until the second
mock is added in the same commit — expected, gated by that phase's own exit criteria, not a
sequencing bug.

---

## Phase 0: Branch + Environment Setup

- [ ] 0.1 Cut branch `salesops-sales-agents-commissions` from `main` @ `f014296`.
- [ ] 0.2 Resolve `store_mgmt_test` URL: `node -e "process.loadEnvFile('<abs>/packages/infra-db/.env'); process.stdout.write(process.env.TEST_URL ?? '')"`. ALWAYS guard destructive DB commands with a check that the resolved URL contains `store_mgmt_test`. NEVER run migrate/reset against `store_mgmt`.
- [ ] 0.3 Baseline gate: `pnpm -r build` clean; record current suite counts (domain, infra-db, api-common, api-idp unit+e2e, api-salesops unit+e2e) as the reference every later phase's exit criteria diffs against.

## Phase 1: Identity + Availability Read Path (Slice 1 — no schema)

- [ ] 1.1 RED: `domain/src/users/roles.test.ts` — `sales_agent=32` distinct; `effectiveRoles(owner)` includes it; raw `hasRole(owner_raw, sales_agent)` is `false` (R1). Fix `:50-55` hand-enumerated `businessBits` (§0.6) to include `sales_agent`.
- [ ] 1.2 GREEN: `domain/src/users/roles.ts` — add `sales_agent: 32`, extend `BUSINESS_ROLES_MASK` (D8), add `'Gestor de ventas'` label.
- [ ] 1.3 RED: `domain/src/sales/availability.test.ts` — `warehouseCoversBasket`: covers; short line -> false; `onHand` sufficient but `available` short -> false (A4); missing `StockLevel` row -> false; duplicate product ids summed (R2).
- [ ] 1.4 RED: same file — `eligibleWarehouses`: only fully-covering ids; zero eligible -> `[]`; unaffected by warehouse scope (R3).
- [ ] 1.5 GREEN: create `domain/src/sales/availability.ts` — `BasketLine`, `warehouseCoversBasket`, `eligibleWarehouses`, `assertWarehouseCoversBasket` (A2/A3/A4).
- [ ] 1.6 GREEN: `domain/src/sales/errors.ts` — add `WarehouseCannotFulfillOrderError`.
- [ ] 1.7 Update `domain/src/sales/index.ts` barrel exports.
- [ ] 1.8 RED: `apps/api-salesops/src/sales/availability.{controller,service}.spec.ts` — `sales_agent` admitted; only covering warehouses returned; empty basket -> 400; zero eligible -> 200 `{warehouses:[]}` (R4).
- [ ] 1.9 GREEN: create `apps/api-salesops/src/sales/availability.{controller,service}.ts` + `dto/` — own `@Controller('orders/availability')` (no route collision with `OrderController`, §9); fan-out `Promise.all(list({productId}))` per A5.
- [ ] 1.10 Wire `sales.module.ts`: bind `STOCK_LEVEL_REPOSITORY`, `WAREHOUSE_REPOSITORY` (port symbols, A6).
- [ ] 1.11 RED: `customer.controller.spec.ts` — `sales_agent` admitted on the two READ handlers only.
- [ ] 1.12 GREEN: `customer.controller.ts` — add `sales_agent` to `@Roles` on `GET /customers`, `GET /customers/:id` only (method-level; A14 keeps `POST`/`PATCH`/`DELETE` closed).
- [ ] 1.13 Amend `openspec/changes/backend-users-roles/specs/salesops-identity/spec.md` (merge target, never archived) — apply the 3 superseded passages (role enumeration, MUST-NOT list, "no gestor bit" scenario) per the already-drafted delta at `specs/salesops-identity/spec.md`, quoting superseded text verbatim. Do NOT touch/archive `backend-users-roles`.

**Exit criteria**: R1-R4 green. Full matrix green vs Phase 0 baseline (no regressions expected — slice is additive). `pnpm -r build` clean. `pnpm --filter api-salesops lint --max-warnings 0` clean. Commit.

## Phase 2a: D4 Invariant Wiring (Slice 2, part 1 — no schema)

- [ ] 2.1 RED: `order.service.spec.ts` — `create` against non-covering warehouse -> 409 `WarehouseCannotFulfillOrderError`, no order row written; covering -> succeeds (R5). Add `STOCK_LEVEL_REPOSITORY` mock to the test module's provider list — this is DI-wave 1 of 2 (see forecast note).
- [ ] 2.2 GREEN: `order.service.ts` — inject `STOCK_LEVEL_REPOSITORY`, add `fetchStockLevels(basket)` fan-out (mirrors `fetchAllRates`), call `assertWarehouseCoversBasket` in `create`.
- [ ] 2.3 RED: same spec — `PATCH` re-validation: non-covering -> 409, `warehouseId` unchanged; covering -> 200; a patch not touching `warehouseId` issues zero stock reads (R7).
- [ ] 2.4 GREEN: `OrderService.update` — re-validate ONLY when `warehouseId` actually changes (design §10 shape).
- [ ] 2.5 GREEN: `order.controller.ts` `withDomainErrorMapping` — add `WarehouseCannotFulfillOrderError` -> 409 branch.
- [ ] 2.6 RED: `test/order.e2e-spec.ts` — creation performs zero stock mutation; a competing order between create and verify still 409s at verify — race PINNED, not fixed (R6).

**Exit criteria**: R5-R7 green for the newly-written cases. `pnpm -r build` clean.

## Phase 2b: Blast-Radius Fixture Repair (Slice 2, part 2)

- [ ] 2.7 Fix the remaining ~13 of 14 `order.service.spec.ts` cases: add a `StockLevel[]` stub covering the basket to each `create`-path test's setup (mechanical, gate = suite green).
- [ ] 2.8 Fix `order.controller.spec.ts`'s ~2 broken cases via the (already-existing) `auth-test-helpers.ts` — no new `companyUserId` requirement yet (that's Phase 3); confirm these break only for unrelated reasons if any, else this task is a no-op verification.
- [ ] 2.9 Create ONE `test/support/seedStockForBasket(...)` e2e helper — do NOT inline stock-seeding across all 16 `order.e2e-spec.ts` fixtures individually.
- [ ] 2.10 Apply the helper to all 16 `test/order.e2e-spec.ts` order-creating fixtures (mechanical once the helper exists; gate = suite green).
- [ ] 2.11 Confirm zero unintended breakage: `src/stock/*.spec.ts` (17 tests, §0.4 — `StockController` unchanged) and both customer suites remain untouched by this phase.

**Exit criteria (Phase 2 overall)**: `order.service.spec.ts` 14/14 restored. `order.controller.spec.ts` back to its baseline +1 new 409 case. `test/order.e2e-spec.ts` 16/16 restored. Full matrix green vs baseline, `pnpm -r build` clean, lint clean. Commit (2a and 2b may be one or two commits; either way this is ONE verified slice before Phase 3 starts).

## Phase 3: Attribution + Migration A (Slice 3a)

**Gate to enter**: Phase 2 exit criteria met. This is the first schema-touching phase in this
change — no prior verification script is required before authoring/applying migration A (it's
the first schema change here); the required gate is the standard round-trip-on-a-clone
rehearsal (task 3.11), not an automated script.

- [ ] 3.1 RED: `packages/api-common/src/auth/jwt.strategy.spec.ts` — `companyUserId` populated from `assignment.id` (currently discarded at `:109`).
- [ ] 3.2 GREEN: `jwt.strategy.ts` — add required `companyUserId: string` to `SanitizedUser` (A7).
- [ ] 3.3 Mechanical: fix the 2 compile-error fixtures — `apps/api-salesops/src/test-support/auth-test-helpers.ts`, `apps/api-salesops/test/support/auth-e2e-helper.ts` — add `companyUserId`.
- [ ] 3.4 GREEN: `domain/src/sales/order.ts` — add `attributedCompanyUserId: string | null` to `Order`; **required** on `CreateOrderInput` (A8). Fix all 20 `order.test.ts` call sites (mechanical compile-break repair, R-independent).
- [ ] 3.5 RED: `order.controller.spec.ts` + e2e — attribution sourced from `req.user.companyUserId`; a client-supplied agent field in the payload is ignored; unchanged across verify/deliver transitions (R8).
- [ ] 3.6 GREEN: `order.controller.ts` — stamp `attributedCompanyUserId` from `req.user`, never from the DTO; confirm `UpdateOrderDto` does NOT declare it.
- [ ] 3.7 Pin: `jwt.strategy.spec.ts` — a non-ACTIVE `CompanyUser` is denied before order creation runs (asserts the existing 403, no new code) (R9).
- [ ] 3.8 Author Prisma schema: `Order.attributedCompanyUserId String?` + FK + index.
- [ ] 3.9 Author migration A `..._add_order_sales_attribution` per design §8.2 (`ADD COLUMN`, FK `ON DELETE RESTRICT`, index; **NO BACKFILL**).
- [ ] 3.10 **GATE before applying A**: round-trip migration A forward + Rollback A (§8.2 SQL) on a throwaway clone of `store_mgmt_test`; confirm clean revert. Only then apply forward for real via `prisma migrate deploy`, using the guarded URL check from 0.2. **Rollback A is safe only while `commission_accrual` has zero rows** — true throughout this phase since migration B has not shipped yet; this stops being true the moment Phase 5 writes its first accrual.
- [ ] 3.11 Update `packages/infra-db/src/sales/prisma-order.repository.ts` (+spec) — map `attributedCompanyUserId` in `toDomain`/`create`.
- [ ] 3.12 Update `packages/infra-db/src/sales/seed.ts` (+spec) — attribute all 5 `createOrder` call sites.
- [ ] 3.13 Create `packages/infra-db/scripts/verify-order-attribution.ts` per design §8.3 (`orphans=0`, `post_cutover_nulls=0` assertions; `legacy_unattributed` reported, not asserted). **Authored here; its PASS is the entry gate for Phase 5 (migration B), not required to pass to close this phase.**
- [ ] 3.14 Closes design's Q1 (open question, explicitly assigned to `sdd-tasks`): add a `salesops-ventas` requirement to `specs/salesops-ventas/spec.md` (file twin) — "a caller whose only role is `sales_agent` sees `GET /orders`/`GET /orders/:id` scoped to their own attributions."
- [ ] 3.15 RED: `order.controller.spec.ts` — `isScopedSalesAgent(user)` (mirrors `isScopedWarehouseOperator`, uses `hasRole` per §0.5) scopes list/read to own attributions for a caller solely `sales_agent`.
- [ ] 3.16 GREEN: implement `isScopedSalesAgent` in `order.controller.ts`; grant `sales_agent` on `GET /orders`, `GET /orders/:id` at method level. **This predicate is built here, ready for Phase 5's `GET /commissions/accruals` to reuse without any forward reference** — the exact class of deferral bug the precedent change hit four times, avoided by building the shared predicate where its data dependency (attribution) actually lives.

**Exit criteria**: R8-R9 green. `order.test.ts` 20/20 restored. `order.service.spec.ts`/`order.controller.spec.ts` no new breaks. `prisma-order.repository.spec.ts` and `sales/seed.spec.ts` green post-fixture-fix. `pnpm -r build` clean, lint clean. Migration A applied to `store_mgmt_test`, structurally verified (column/FK/index present). Commit.

## Phase 4: Customer + Identity Creation + Migration C (Slice 3c)

**Gate to enter**: Phase 3 exit criteria met (3c depends only on 3a, for `companyUserId` —
design §13; independent of 3b).

- [ ] 4.1 RED, write first, MUST be seen to fail — the load-bearing test (R21): `customer-identity.controller.spec.ts` + e2e `test/customer.e2e-spec.ts` — a payload carrying `"roles":8`/`"roles":16`/`"role"`/`"userId":<owner id>` ⇒ resulting assignment role is exactly `1`, regardless of body content. Confirm this test FAILS before any implementation exists (§0.13: `api-salesops` runs no `ValidationPipe` — this is the only guard, not a framework default).
- [ ] 4.2 RED: `customer-identity.service.spec.ts` — created `User` has an ACTIVE `CompanyUser` (can actually authenticate) (R20).
- [ ] 4.3 RED: same file — structural assertion: no code path reads a role from the request; the role constant is module-private with no parameter to override it (R22).
- [ ] 4.4 RED: same file — assignment scoped to caller's `companyId`, attributed to caller's `companyUserId`; a second caller from another company never widens it (R23).
- [ ] 4.5 RED: same file — partial-failure ordering (A16): `DuplicateLoginError` on write #1 ⇒ nothing written, 409; a failure after write #1 leaves a login that 403s `MISSING_COMPANY_USER` (R24).
- [ ] 4.6 RED: `customer.controller.spec.ts` — `sales_agent` denied `POST /customers` (existing route), `PATCH /customers/:id`, `DELETE /customers/:id` ⇒ 403 (R25).
- [ ] 4.7 GREEN: `domain/src/company/company-user.ts` (+test) — add `createdByCompanyUserId: string | null` to `CompanyUser` + `CreateCompanyUserInput` (D10 #3, A17).
- [ ] 4.8 GREEN: `domain/src/company/company-user-repository.port.ts` — `create` accepts `createdByCompanyUserId`.
- [ ] 4.9 GREEN: `infra-db/src/company/prisma-company-user.repository.ts` (+spec) — map the new column, default `null`, never backfilled.
- [ ] 4.10 Author Prisma schema: `CompanyUser.createdByCompanyUserId` self-referencing nullable FK + index.
- [ ] 4.11 Author migration C `..._add_company_user_created_by` per design §8.4 (`ADD COLUMN`, self-FK `ON DELETE RESTRICT`, index; **NO BACKFILL**). Timestamp AFTER migration A, BEFORE migration B.
- [ ] 4.12 **GATE before applying C**: round-trip forward + Rollback C on a throwaway clone (§8.4 — the only genuinely lossless, unqualified rollback in this change: it discards only post-cutover audit provenance, nothing operational). Then apply forward via `prisma migrate deploy` (guarded URL check).
- [ ] 4.13 GREEN: create `apps/api-salesops/src/customer/dto/create-customer-with-identity.dto.ts` — declares NEITHER `userId` NOR `roles` (design §4.5).
- [ ] 4.14 GREEN: create `apps/api-salesops/src/customer/customer-identity.service.ts` — module-private `CUSTOMER_IDENTITY_ROLE = USER_ROLES.user` constant (A15); `createWithIdentity(actor, dto)` writes User -> CompanyUser -> Customer in that order, NOT transactional (A16); hand-written `assertNonBlank(fullName)`, `assertNonBlank(login)`, `assertMinLength(password, 8)` matching `CreateUserDto`'s floor.
- [ ] 4.15 GREEN: create `apps/api-salesops/src/customer/customer-identity.controller.ts` — `POST /customers/with-identity`, roles owner/admin/sales_operator/sales_agent (A14); 201 / 400 / 409 `DuplicateLoginError` / 409 `DuplicateCustomerDocumentError`.
- [ ] 4.16 Wire `customer.module.ts` — register the new controller/service (`USER_REPOSITORY`/`COMPANY_USER_REPOSITORY` already bound in `auth.module.ts:29-30`, §0.14 — confirm only, no new binding).
- [ ] 4.17 Non-regression confirmation (not an edit): the existing `POST /customers`, `customer.service.ts`, and its 15 controller + 11 service tests remain byte-for-byte unchanged (A14).

**Exit criteria**: R20-R25 green, with R21 confirmed to have failed before 4.13-4.15 existed (note in commit message). `customer.controller.spec.ts` baseline + new R25 cases green. `customer.service.spec.ts` unchanged. New e2e cases (~4) green, existing 14 e2e cases unaffected. `company-user.test.ts` +1, `prisma-company-user.repository.spec.ts` +1 (both additive, not broken). `pnpm -r build` clean, lint clean. Migration C applied and structurally verified. Commit.

## Phase 5: Commission Ledger + Migration B (Slice 3b — LAST, irreversible-after-settlement)

**Gate to enter**: Phase 4 exit criteria met, **AND** `verify-order-attribution.ts` (authored
in 3.13) MUST be run against `store_mgmt_test` NOW and PASS (`orphans=0`, `post_cutover_nulls=0`)
— this is design §8.3's explicit precondition for migration B, only meaningfully exercisable
once Phases 3-4 have had real test traffic attribute orders. **If it fails, stop — do not
author or apply migration B until the cause is fixed.**

### Phase 5a: Domain, Adapters, Migration B, Seed

- [ ] 5.1 RED: `domain/src/commission/compute-accrual.test.ts` — `300×2 + 200×1 = 800`; one unresolved line ⇒ total `600`, flagged in `unresolved`, never zeroed (R11).
- [ ] 5.2 GREEN: create `domain/src/commission/{commission-reference,commission-accrual,commission-payment,compute-accrual,errors,index}.ts` per design §4.4 (A9-A13).
- [ ] 5.3 GREEN: create the 4 ports `{commission-reference-provider,commission-accrual-repository,commission-payment-repository,commission-accrual-recorder}.port.ts`.
- [ ] 5.4 Update `domain/src/index.ts` barrel — export `commission/`.
- [ ] 5.5 RED: `infra-db/src/commission/*.spec.ts` — `commissionFor`: configured ⇒ `Money`; unconfigured ⇒ `undefined`, **never** `money(0n,'MN')` (R10).
- [ ] 5.6 GREEN: create `infra-db/src/commission/{prisma-commission-reference.provider,prisma-commission-accrual.repository,prisma-commission-payment.repository}.ts` (+specs).
- [ ] 5.7 Author Prisma schema: 5 new models exactly per design §8.1 (`ProductCommissionReference`, `CommissionAccrual`, `CommissionAccrualLine`, `CommissionAccrualUnresolved`, `CommissionPayment`). Confirm `OrderStatus` enum untouched (D7).
- [ ] 5.8 Author migration B `..._add_commission_module` per design §8.5 — 5 `CREATE TABLE`s in FK-dependency order, 2 unique indexes (`commission_accrual(order_id)`, `commission_payment(accrual_id)`).
- [ ] 5.9 **GATE before applying B** (both conditions, not either): (a) `verify-order-attribution.ts` passed (Phase 5 preamble above); (b) round-trip migration B forward + Rollback B (§8.5, `DROP TABLE` ×5) on a throwaway clone — safe only while the tables are empty, true pre-forward-apply. **Record explicitly and permanently: once any `commission_payment` row exists, Rollback B destroys a financial record; from that point the only acceptable rollback is a code revert with the tables left inert — this constraint governs every future hotfix to this module, not just today's apply.** Apply forward via `prisma migrate deploy` (guarded URL check) only after both conditions hold.
- [ ] 5.10 RED: `infra-db/src/commission/seed.spec.ts` — exact match wins; longest-substring breaks `Neveras` vs `Neveras de 16 y 20 pies`; ambiguous same-key different-amount ⇒ seed throws; unmatched product ⇒ no row (R19).
- [ ] 5.11 GREEN: create `infra-db/src/commission/seed.ts` — hand-transcribed constant from `docs/plans/reference/04-commissions.md`, `normalizeName` + longest-substring precedence (§7.2-7.4); exclude `Demás equipos pequeños` and `Combos de electrodomésticos` (D6, §7.3).
- [ ] 5.12 Run `pnpm -r build` (required before any seed run), then run the commission seed against `store_mgmt_test`; review the matched/unmatched/unused report — **owner sign-off required** before this task is done (design §13).

### Phase 5b: Delivery, Trigger, Reporting

- [ ] 5.13 RED: `commission-accrual.recorder.spec.ts` — delivering creates exactly one accrual (idempotent, `@@unique(order_id)`); an unattributed legacy order ⇒ no accrual, logged `UNATTRIBUTED_ORDER` (R13).
- [ ] 5.14 GREEN: `order.service.ts` `deliver()` — inject `COMMISSION_ACCRUAL_RECORDER` (A9), call `recordForDeliveredOrder` as a SEPARATE transaction after `orderRepository.deliver`. **Add the second `order.service.spec.ts` DI mock here** (DI-wave 2 of 2 — see forecast note; the 14 cases were already fixed once in Phase 2).
- [ ] 5.15 Pin: same spec — no accrual possible for a non-`delivered` order; cancelling `created`/`verified` leaves no accrual, proving §0.10's structural claim (no new guard code) (R15).
- [ ] 5.16 RED: same spec — fully-paid and credit-pending orders accrue identically at `delivered` (D9) (R18).
- [ ] 5.17 RED: `order.service.spec.ts` — order creation succeeds for a product with no commission reference; resolvability is not a creation invariant (R12).
- [ ] 5.18 GREEN: create `apps/api-salesops/src/commission/{commission.controller,commission.service,commission-accrual.recorder,commission.module}.ts` + `dto/`.
- [ ] 5.19 RED: `commission.controller.spec.ts` + e2e — `POST /commissions/payments` leaves `Order.status` byte-for-byte unchanged; a second payment on the same accrual ⇒ 409 (R14).
- [ ] 5.20 RED: same — `GET /commissions/report` includes an `owner` who registered and delivered a sale, never filtered (D8) (R16).
- [ ] 5.21 RED: same — no combo-bracket computation exists anywhere in the capability's public surface (D6), structural `rg`-style assertion (R17).
- [ ] 5.22 `GET /commissions/accruals`: reuse `isScopedSalesAgent` built in task 3.16 — no new predicate.
- [ ] 5.23 Wire `apps/api-salesops/src/app.module.ts` — register `CommissionModule`. Wire `sales.module.ts` — bind `COMMISSION_ACCRUAL_RECORDER`.

**Exit criteria**: R10-R19 green (5a) and R12-R18 green (5b) — full R10-R19 set confirmed together. Seed report reviewed and accepted. `pnpm -r build` clean. Full matrix green across every package (domain, infra-db, api-common, api-idp, api-salesops unit+e2e), lint `--max-warnings 0` on every touched package. This is the final content phase.

## Phase 6: Final Verification + Push

- [ ] 6.1 Full-repo re-run from `templates/`: `pnpm -r build`; `pnpm --filter @store-mgmt/domain test`; **before** `pnpm --filter @store-mgmt/infra-db test`, run `prisma migrate reset --force --skip-seed` against the guarded `store_mgmt_test` URL if the 5.12 seed run left non-empty state (infra-db suite needs an EMPTY test DB); `pnpm --filter @store-mgmt/api-common test`; `pnpm --filter api-idp test` / `test:e2e`; `pnpm --filter api-salesops test` / `test:e2e`; lint `--max-warnings 0` on every touched package.
- [ ] 6.2 Reconcile final suite counts against the Phase 0 baseline plus every phase's recorded deltas — no unexplained pass/fail drift.
- [ ] 6.3 Push branch `salesops-sales-agents-commissions`. **No pull request** (owner-locked delivery model).
