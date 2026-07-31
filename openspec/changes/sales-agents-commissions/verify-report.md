# Verification Report — sales-agents-commissions

**Mode**: Strict TDD
**Verified**: 2026-07-31, fresh re-run of the full suite + independent reproduction work, not a re-read of prior claims.
**Verdict**: **PASS WITH WARNINGS** — 1 CRITICAL (a shared-test-DB FK-leak gap, empirically reproduced, not yet observed in CI but real and live), 2 WARNING, 2 SUGGESTION. Every functional spec/design/task requirement checked holds.

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 87 |
| Tasks complete | 86 |
| Tasks incomplete | 1 — `6.3` (push branch, no PR, owner-locked delivery model) |

`6.3` is a delivery/administrative task, not a functional one. Not a verify blocker.

## Build & Tests Execution (all re-run fresh this session)

**Build**: ✅ `pnpm -r build` clean.

**Tests** (from `templates/`):

| Package | Unit | E2E |
|---|---|---|
| `@store-mgmt/domain` | 272/272 ✅ | — |
| `@store-mgmt/api-common` | 34/34 ✅ | — |
| `@store-mgmt/infra-db` | 213/213 ✅ (26 suites) | — |
| `api-idp` | 54/54 ✅ | 11/11 ✅ |
| `api-salesops` | 308/308 ✅ | 73/73 ✅ |

Matches the counts recorded in `tasks.md` Phase 6.2 exactly.

**Lint**: `--max-warnings 0` clean on all 5 touched packages. `eslint --fix` was run as part of the lint script; `git status` after was clean (zero diffs), confirming the codebase was already lint-clean, not just auto-fixable.

**Typecheck**: `pnpm --filter api-salesops typecheck` reproduces exactly the 2 pre-existing `TS2353` errors in `order.service.spec.ts` (`productName`, `customerName`) claimed as pre-existing/out-of-scope. Confirmed unrelated to this change (`pnpm -r build` unaffected, `tsconfig.build.json` excludes specs). No new typecheck regressions found.

**Coverage**: Not run — no coverage script is wired into the standard test commands for these packages; `@vitest/coverage-v8` is a devDependency of `domain` but not invoked by `pnpm test`. Not a blocker per Strict TDD rules (informational, not gating).

---

## CRITICAL: shared-test-DB RESTRICT-FK leak is not fully closed by `911e882`/`30c957d`

The task explicitly asked to verify whether the two leak fixes are complete, or whether other fixtures/specs share the same exposure. They do not, and I reproduced it rather than reasoning about it in the abstract.

**Reproduction**: left one stray `sales_order` + `commission_accrual` row attributed to a freshly created `company_user` in `store_mgmt_test` (via a throwaway script using the same `PrismaPg` adapter path production code uses), then ran:

```
pnpm --filter @store-mgmt/infra-db test -- users/seed.spec.ts customer/seed.spec.ts company/prisma-company.repository.spec.ts
```

Result: **3 suites / 14 tests failed**, all on `Foreign key constraint violated on the constraint: sales_order_attributed_company_user_id_fkey`, all at each spec's own unscoped `prisma.companyUser.deleteMany({})`. Cleaned the stray rows up afterward and reran the full `infra-db` suite: back to 213/213 green — confirming the failure was caused by the stray data, not a real regression, and that the DB is now clean again.

**Root cause**: this change adds *two* new `ON DELETE RESTRICT` edges into `company_user` that did not exist before:

- `sales_order.attributed_company_user_id` → `company_user.id` (migration A)
- `commission_accrual.attributed_company_user_id` → `company_user.id` (migration B)

`911e882` and `30c957d` added `wipeCommissionTables()` calls to exactly the 9 specs that themselves bulk-delete products/orders (`apply-reservation.spec.ts`, `prisma-stock-level.repository.spec.ts`, `prisma-stock-movement.repository.spec.ts`, `prisma-category.repository.spec.ts`, `prisma-product.repository.spec.ts`, `product/seed.spec.ts`, `prisma-order.repository.spec.ts`, `sales/seed.spec.ts`, `verify-order-attribution.spec.ts`), plus fixed the commission fixture's own leftover `company` row. That is real and verified working.

What it does **not** cover: roughly 10 other specs across `users/`, `customer/`, `company/` still do an **unscoped** `companyUser.deleteMany({})` / `company.deleteMany({})` with no cleanup of orders or accruals first:

- `users/seed.spec.ts`, `users/prisma-warehouse-operator.repository.spec.ts`, `users/prisma-password-reset-token.repository.spec.ts`, `users/prisma-refresh-token.repository.spec.ts`, `users/prisma-user.repository.spec.ts`
- `customer/seed.spec.ts`, `customer/prisma-customer.repository.spec.ts`
- `company/seed.spec.ts`, `company/prisma-company.repository.spec.ts`, `company/prisma-company-user.repository.spec.ts`

This is the same defect class the team already found and fixed twice — "It looks like flakiness. It is contamination." (911e882's own commit message) — at a third, unaudited set of call sites. It does not fail *today* only because no currently-committed fixture happens to leave that exact combination behind at the moment one of these 10 specs runs. It is a live landmine for: (a) any future commission or attributed-order fixture that dies before its own teardown, or (b) a developer re-running `infra-db` tests twice against the same `store_mgmt_test` without a full reset (exactly the scenario `tasks.md` Phase 6.1/6.2 already documents happening twice this same week).

**Suggested fix shape** (not applied — verify does not fix):
1. Either extend `wipeCommissionTables()` (or a new `wipeAttributionBlastRadius()`) to also delete any orders/accruals attributed to company_user rows before every unscoped `companyUser`/`company` bulk-delete in the ~10 files above, or
2. Centralize teardown ordering in one global Jest setup/teardown hook so no individual spec author has to remember the full RESTRICT chain that migrations A and B introduced.

**Severity rationale**: CRITICAL because it is reproducible, it is the literal scenario the task instructions asked to check for, and it is the same failure class that has already cost two rounds of "looks like flakiness, is actually contamination" investigation on this same change. It is not a functional/spec defect — the commission and attribution features themselves work correctly — but it is a real gap in the guarantee Phase 6.1/6.2 claims ("infra-db suite now passes against a dirty database on purpose").

---

## WARNING: TDD evidence is narrative, not a dedicated structured table

`apply-progress` (engram `sdd/sales-agents-commissions/apply-progress`, id #1643) and `tasks.md` document RED→GREEN per task inline in prose (e.g. "R21 confirmed to have failed before 4.13-4.15 existed (note in commit message)"; roles.test.ts "fails by construction" §0.6) rather than as a separate structured TDD Cycle Evidence table with RED/GREEN/TRIANGULATE/SAFETY-NET columns. Commits are squashed one-per-work-unit (tests + implementation together, per this repo's own `work-unit-commits` convention), so RED-phase failures are not independently re-derivable from git history alone.

Mitigated by spot-checking 8 of the highest-risk requirements directly in source (R21, R9, R14, R16, R11, R6, R17, R24) — every one inspected has real, non-vacuous, production-code-exercising assertions: no tautologies, no ghost loops over possibly-empty collections, no smoke-test-only patterns. Treated as a documentation-format gap, not a substance gap — WARNING, not CRITICAL.

## WARNING: `commission_payment.recorded_by_company_user_id` has no FK constraint

Confirmed in both `schema.prisma:360-373` and design.md's own schema fragment (§8.1) — neither declares a `@relation` for that field, so it's a plain UUID column with zero DB-level referential guarantee. This matches the design exactly (not a deviation from what was planned), so it is not a verify failure, but it is worth flagging: a payment can point at a `company_user` id that no longer exists (or never did) with nothing to catch it.

---

## R17 / D6 combo-bracket claim — explicitly re-verified, holds

The task instructions specifically asked not to assume this and to check it. Verified:

- `COMBO_BRACKETS` in `packages/infra-db/src/commission/seed.ts:99-103` prices a **catalog product** whose name joins pieces with `" + "` — this is seed-time, per-product resolution, not an order-level (multi-line) rule.
- R17's structural test (`apps/api-salesops/src/commission/commission.controller.spec.ts:218-234`) scans only the 3 runtime app-layer commission files — `commission.controller.ts`, `commission.service.ts`, `commission-accrual.recorder.ts` — for bracket-computation regex patterns. It correctly does **not** scan `seed.ts`, because seed-time authoring is not request-path computation.
- `specs/salesops-commissions/spec.md`'s "Combo Brackets Are Not Implemented" requirement text already reads "**Order-level** combo-bracket commission rules MUST NOT be implemented" (not a bare "combo brackets") — already correctly narrowed for the D6 reversal, and still accurate as written. No spec/implementation drift found.

## Spec Compliance Matrix (spot-checked with runtime evidence)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| R21 — privilege escalation impossible | Every escalation shape (`roles`, `role`, string, combined, `userId` hijack) → role is exactly `user` bit | `customer-identity.controller.spec.ts` (real RolesGuard + real service, mocked repos only) | ✅ COMPLIANT |
| R9 — non-ACTIVE CompanyUser denied | REVOKED/SUSPENDED treated exactly like missing | `jwt.strategy.spec.ts` `it.each(['REVOKED','SUSPENDED'])` | ✅ COMPLIANT |
| R24 — partial-failure ordering (A16) | Write order User→CompanyUser→Customer; failure after write #1 leaves a dangling, 403-ing login | `customer-identity.service.spec.ts` | ✅ COMPLIANT |
| R6 — race accepted, pinned | Two orders created against same stock; winner reserves at confirm, loser 409s, order untouched | `order.e2e-spec.ts`, real HTTP + real DB | ✅ COMPLIANT |
| R11 — unresolved line excluded, never zeroed | `300×2 + 200×1 = 800`; one unresolved excludes it from total | `compute-accrual.test.ts` | ✅ COMPLIANT |
| R14 — double payment 409 | Second payment on same accrual → 409 | `commission.controller.spec.ts` | ✅ COMPLIANT |
| R16 — owner not filtered from report | Owner accrual included, unfiltered | `commission.controller.spec.ts` (mocked service response) + structural: `commission.service.ts#report` groups strictly by `attributedCompanyUserId`, no role branch anywhere | ✅ COMPLIANT (structural + controller pass-through) |
| R17 — no order-level combo-bracket computation | `rg`-style structural scan of 3 app-layer files | `commission.controller.spec.ts:218-234` | ✅ COMPLIANT, scope-verified against D6 reversal |

**Compliance summary**: 8/8 spot-checked scenarios compliant with real, runtime-executed evidence. The remaining R1-R25 rows were checked for presence and narrative RED/GREEN discipline in `tasks.md`/`apply-progress` but not individually re-executed line-by-line in this pass, given the full suite (all containing them) ran green.

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| A9 — accrual via port, separate transaction from `deliver` | ✅ Yes | `commission-accrual.recorder.ts` injected via `COMMISSION_ACCRUAL_RECORDER` |
| A14 — separate `/customers/with-identity` route | ✅ Yes | Existing `POST /customers` byte-for-byte unchanged, confirmed by lint/test parity |
| A15 — module-private role constant, no DTO field | ✅ Yes | Confirmed via R21/R22 |
| A17 — `createdByCompanyUserId` self-FK, never backfilled | ✅ Yes | Migration C additive, nullable |
| D6/Q3 — order-level bracket unimplemented, product-level bracket seeded | ✅ Yes | See R17 section above |
| §8.3 verify-order-attribution gate before migration B | ✅ Yes, per tasks.md 5.9 | Not independently re-run this session (would require a fresh migration cycle) |

---

## Issues Found

**CRITICAL**:
1. Shared-test-DB RESTRICT-FK leak from migrations A/B into `company_user` is only closed for 9 of ~19 specs that bulk-delete `companyUser`/`company`. Empirically reproduced (3 suites / 14 tests failing), then cleaned up and reverified green. See full section above.

**WARNING**:
1. TDD evidence is narrative (in `tasks.md`/`apply-progress`), not a dedicated structured table — spot-checks confirm substance is real, but the format doesn't match the strict-TDD verify module's expected artifact shape.
2. `commission_payment.recorded_by_company_user_id` has no FK constraint (matches design as written, not a code deviation, but a referential-integrity gap worth a follow-up).

**SUGGESTION**:
1. Consider a dedicated integration test that creates a real owner-attributed accrual and asserts it via `GET /commissions/report` end-to-end (current R16 coverage is controller pass-through + structural absence of a role filter, not a full-stack behavioral proof).
2. Given the CRITICAL finding above has now bitten this shared-DB pattern three times, consider a single global Jest teardown hook for `infra-db` that always clears the full RESTRICT chain (commission → order → company_user → company) in one place, rather than per-spec opt-in.

---

## Verdict

**PASS WITH WARNINGS.** Every functional spec requirement, design decision, and task spot-checked holds against real, freshly-executed test evidence (build, lint, typecheck, full suite: 272+34+213+308+73+54+11 all green, matching claimed counts exactly). The one CRITICAL finding is a test-infrastructure integrity gap, not a product defect — it does not block the feature from working correctly, but it is real, reproducible, and belongs to a defect class that has already required two rounds of "flakiness" investigation on this exact change. Recommend the owner either fix it before push (task 6.3) or explicitly accept it as logged debt.

---

## Resolution (2026-07-31, after the report was written)

### CRITICAL — CLOSED in `157a705`

The finding was **independently reproduced before being acted on**, rather than
taken on the verifier's word: a stray attributed order left in `store_mgmt_test`,
then `users/seed.spec.ts` and `users/prisma-user.repository.spec.ts` run against
it — failures on `sales_order_attributed_company_user_id_fkey`, exactly as
reported.

Fixed at the cause rather than the ten call sites' symptom. The recurring defect
was that **every spec kept its own hand-written list of tables to clear**, so each
migration adding a `RESTRICT` edge silently invalidated every list that did not
mention the new table. `src/db-cleanup.spec-helper.ts` now holds that knowledge in
one place:

- `wipeCommissionTables` MOVED there (it was about to be duplicated), with the
  nine specs that used it repointed at the shared module.
- `wipeCompanyUserDependents` added — commission tables, then order payments,
  sale credits, order lines, orders, then migration C's self-referencing
  assignments — and called by the ten specs that bulk-delete company users.

Written test-first: the RED assertion (`prisma-commission-accrual.repository.spec.ts`)
seeds a fixture, runs the *existing* helper, and asserts `companyUser.deleteMany({})`
resolves — which failed on the FK before the new helper existed.

Verified by leaving an attributed order in the database on purpose and running the
specs that used to fail: 5 suites / 26 tests green. Full infra-db suite 214 (213 + 1
new), build, lint and typecheck clean.

### SUGGESTION 2 — partially addressed

The shared module removes the duplication, but clearing is still per-spec opt-in
rather than a global Jest teardown hook. Left as written: a global hook would change
the teardown semantics of all 26 suites at once, which is its own change and not one
to make while closing a verification.

### WARNING 2 — open, owner-facing

`commission_payment.recorded_by_company_user_id` still has no FK constraint. It
matches the design as written, so it is not a deviation, but a payment can point at
a `company_user` that never existed with nothing to catch it. Closing it means a new
migration; deliberately NOT bundled into this change.

### WARNING 1 and SUGGESTION 1 — accepted as written

A documentation-format gap and a test-depth suggestion. Neither changes behaviour.
