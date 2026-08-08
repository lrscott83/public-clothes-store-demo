# Verification Report — sales-agents-commissions

**Mode**: Strict TDD
**Verified**: 2026-08-02, fresh re-run of the full suite (all 6 packages/apps), not a re-read of prior claims.
**Verdict**: **PASS** — 0 CRITICAL, 0 net-new WARNING, 2 SUGGESTION carried forward. The prior CRITICAL and both prior open items are now closed. 4 new commits landed since the last verify (adversarial dual review); all inspected, all correct, all covered by real tests.

Supersedes the previous report body below `## Resolution` in the prior revision — this file now reflects the state at HEAD `ab7b135`, pushed, working tree clean.

---

## What changed since the last verify (this run's delta)

Prior verify (2026-07-31) returned PASS WITH WARNINGS: 1 CRITICAL (shared-test-DB RESTRICT-FK leak reproducible via ~10 unaudited infra-db specs), 2 WARNING (TDD evidence narrative-not-tabular; `commission_payment.recorded_by_company_user_id` had no FK), 2 SUGGESTION.

Closed since then (all re-verified in this session, not taken on faith):

1. **CRITICAL (FK leak) → CLOSED, `157a705`**: centralized teardown in `db-cleanup.spec-helper.ts` (`wipeCommissionTables` + new `wipeCompanyUserDependents`), 10 specs repointed.
2. **WARNING (`recorded_by_company_user_id` no FK) → CLOSED, `425e212`**: migration `20260731220000_add_commission_payment_recorder_fk` adds a `RESTRICT` FK to `company_user`; `design.md` §8.1 amended in `6f56bac`.
3. **SUGGESTION (single global teardown) → CLOSED differently, `1c88692`**: not a per-test teardown (would break `beforeAll`-fixture specs) — a `globalSetup` hook truncates all tables once before the run, refuses to run unless `TEST_URL` names `store_mgmt_test`.
4. Task 6.3 (push, no PR) ticked in `ab7b135` — **tasks now 87/87**, 0 incomplete.

New since the last verify, inspected fresh this session:

- **`a75e084`** — `OrderService.deliver()` (`templates/apps/api-salesops/src/sales/order.service.ts:301-334`) now wraps `commissionAccrualRecorder.recordForDeliveredOrder(delivered)` in try/catch. On throw: logs `COMMISSION_ACCRUAL_FAILED` via `Logger` with the order id and `delivered.attributedCompanyUserId` (stringifies `null` explicitly, verified by its own test), and still returns the delivered order. 3 new/changed tests in `order.service.spec.ts` — real assertions against a `service['logger'].error` spy, not tautologies.
- **`64ddf79`** — `CommissionController.recordPayment` (`commission.controller.ts:71-77`) adds a hand-rolled guard: `note` must be `undefined | null | string`, else 400. Guard runs BEFORE the try/catch that maps service errors, so it correctly short-circuits to `BadRequestException` (confirmed by reading the method body — not converted to 500 downstream). `RecordCommissionPaymentDto.note` widened to `string | null`. 5 new e2e assertions in `commission.controller.spec.ts`.
- **`cb59146`** — repaired two stale DTO literals failing `tsc --noEmit` (fields the snapshot refactor removed) and rewrote the `RateNotFoundError` test so the EUR line is structurally the only possible throw source. `pnpm --filter api-salesops typecheck` is now **fully clean** — the 2 pre-existing `TS2353` errors noted in the prior verify report are gone.
- **`ab7b135`** — docs only, ticks 6.3.

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 87 |
| Tasks complete | 87 |
| Tasks incomplete | 0 |

`rg '\[ \]' tasks.md` returns zero matches; `rg -c '\[x\]' tasks.md` = 87.

## Build & Tests Execution (all re-run fresh this session, from `templates/`)

**Build**: `pnpm -r build` — clean, all packages/apps.

| Package | Unit | E2E |
|---|---|---|
| `@store-mgmt/domain` | 272/272 ✅ | — |
| `@store-mgmt/api-common` | 34/34 ✅ | — |
| `@store-mgmt/infra-db` | 215/215 ✅ (26 suites, incl. new payment-recorder-FK test + `globalSetup` truncate) | — |
| `api-idp` | 54/54 ✅ | 11/11 ✅ |
| `api-salesops` | 315/315 ✅ (up from 308 — +7 from `a75e084`/`64ddf79`) | 73/73 ✅ |

**Lint**: `--max-warnings 0` clean on `api-salesops` and `infra-db` (the two touched by the delta commits); `eslint --fix` produced zero diffs (`git status --short` empty after).

**Typecheck**: `pnpm --filter api-salesops typecheck` — **clean, zero errors** (previously 2 pre-existing `TS2353` errors, now fixed by `cb59146`).

**Coverage**: Not run — no coverage script wired into the standard test commands (unchanged from prior verify; informational only, not gating under Strict TDD rules).

---

## TDD Compliance (delta commits)

| Task/commit | RED | GREEN | Triangulate | Notes |
|---|---|---|---|---|
| `a75e084` (deliver try/catch) | ✅ new tests written alongside fix | ✅ 315/315 pass incl. these 3 | ✅ 3 cases: success, throw, null-attribution | Real `Logger.error` spy assertions, no tautologies |
| `64ddf79` (note guard) | ✅ 5 new e2e cases via `supertest` | ✅ 73/73 e2e pass incl. these | ✅ 3 negative (number/object/array) + 2 positive (string, null) | Real HTTP roundtrip, asserts status AND `service.recordPayment` call/no-call |
| `cb59146` (test repair) | N/A — test-only correctness fix | ✅ | N/A | Assertion is behaviorally specific (`caught.message` contains `'EUR'`), not a tautology |

Commits are squashed per work-unit (repo convention) — consistent with WARNING 1 below (narrative, not tabular, TDD evidence), unchanged in nature for these 3 commits.

## Assertion Quality Audit (delta test files)

Scanned `order.service.spec.ts` and `commission.controller.spec.ts` diffs. No tautologies, no ghost loops, no assertion-free tests, no mock/assertion-ratio red flags. `errorSpy.mockRestore()` present in both new logger-spy tests. **Assertion quality: ✅ all new/changed assertions verify real behavior.**

---

## Behavioral change vs spec/design — `deliver()` no longer propagates accrual failure

Checked explicitly, not assumed.

- **spec.md** (`specs/salesops-commissions/spec.md:33-41`, "Order Creation Is Never Blocked by Missing Commission Data") states this invariant for **creation**, not delivery — the fix generalizes the same philosophy to delivery, but there is no explicit spec requirement/scenario for delivery-side decoupling yet. Not a violation; see SUGGESTION 2 below.
- **design.md A9** ("accrual triggered from `OrderService.deliver` via a domain port, separate transaction") — unaffected; the try/catch sits around the same port call, transaction boundary unchanged.
- **design.md Q6** ("...mitigated by the idempotent `POST /commissions/accruals` reconcile endpoint (§9) and the `UNATTRIBUTED_ORDER`/accrual-failure log lines") — the fix delivers the **log-line half** of Q6's mitigation. It does **not** deliver the reconcile-endpoint half: confirmed via the controller's routes — only `GET /commissions/accruals`, `GET /commissions/report`, `POST /commissions/payments` exist; **`POST /commissions/accruals` was never built**. This is the KNOWN, OWNER-DEFERRED gap — reported as an **open item, not a new CRITICAL**.
- **Order controller** — just returns whatever `orderService.deliver()` resolves to; no additional error-swallowing or status-code change.

**Verdict**: consistent with design's own stated risk analysis (Q6); correctly implements the log-line mitigation Q6 anticipated; honestly documents that the reconcile-endpoint mitigation remains unbuilt. Not a spec/design violation.

## Endpoint review notes (relevant dimensions)

`POST /orders/:id/deliver` — **Error handling**: previously a single unhandled exception could report an order as "not delivered" when it in fact was (silent DB/caller divergence); now correctly isolated per failure-domain. **Design**: response contract unchanged (200 + delivered order) — correct, since delivery itself did not fail.

`POST /commissions/payments` — **Error handling / Design**: closes a real robustness gap (unhandled exception → 500 on a bad `note`) with a boundary check consistent with the app's existing hand-rolled-validation convention (no global `ValidationPipe`, confirmed absent from `main.ts`). Guard correctly placed before the try/catch. No completeness gap found — `typeof body.note !== 'string'` already rejects booleans too.

---

## Spec Compliance Matrix (spot-checked with runtime evidence)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Delivery must not be blocked by an accrual failure (Q6 mitigation) | Recorder throws → order still delivered, failure logged with order+agent id | `order.service.spec.ts` (2 new cases) | ✅ COMPLIANT |
| `POST /commissions/payments` note validation | Non-string note → 400, nothing recorded; string/null note → 201 | `commission.controller.spec.ts` (5 new cases) | ✅ COMPLIANT |
| R21 — privilege escalation impossible | (re-confirmed) | `customer-identity.controller.spec.ts` | ✅ COMPLIANT |
| R9 — non-ACTIVE CompanyUser denied | (re-confirmed) | `jwt.strategy.spec.ts` | ✅ COMPLIANT |
| R6 — race pinned, not fixed | (re-confirmed) | `order.e2e-spec.ts` | ✅ COMPLIANT |
| R11 — unresolved line excluded, never zeroed | (re-confirmed) | `compute-accrual.test.ts` | ✅ COMPLIANT |
| R14 — double payment 409 | (re-confirmed) | `commission.controller.spec.ts` | ✅ COMPLIANT |
| `commission_payment.recorded_by_company_user_id` FK | Orphan UUID rejected | `prisma-commission-payment.repository.spec.ts` (new) | ✅ COMPLIANT |

**Compliance summary**: all spot-checked scenarios compliant with real, runtime-executed evidence; full suite (272+34+215+315+73+54+11 = 974 tests) green.

## Coherence (Design) — delta only, prior rows unchanged and still hold

| Decision | Followed? | Notes |
|---|---|---|
| A9 — accrual via port, separate transaction from `deliver` | ✅ Yes | try/catch added around the same port call; transaction boundary untouched |
| Q6 mitigation (log lines) | ✅ Yes, partially | Log-line half delivered; reconcile-endpoint half still unbuilt — known, owner-deferred |
| §0.13 — no global ValidationPipe, hand-rolled DTO guards | ✅ Yes | `note` guard follows the same pattern as `accrualId`/`paidAt` |

---

## Known, owner-deferred items (not raised as CRITICAL)

1. **No company-level isolation in `api-salesops`** — app-wide, predates this branch. Spec does not claim otherwise; no drift found.
2. **Commission reconcile endpoint (`POST /commissions/accruals`, design.md §9/Q6) was never built.** The log-line half of Q6's mitigation now exists (`a75e084`); the endpoint half does not. Flagging as an open item for a future change, not a defect in this one.

## Issues Found

**CRITICAL**: None.

**WARNING**:
1. TDD evidence for this change lives in `tasks.md`/`apply-progress` narrative form, not a dedicated structured RED/GREEN/TRIANGULATE table. Spot-checks (including of the 3 new delta commits) continue to show real, non-vacuous assertions. Documentation-format gap, not a substance gap. (Carried forward from the prior report, unchanged.)

**SUGGESTION**:
1. Consider a full-stack integration test creating a real owner-attributed accrual and asserting it via `GET /commissions/report` end-to-end (current coverage is controller pass-through + structural absence of a role filter).
2. Consider adding an explicit spec requirement/scenario stating delivery MUST NOT be blocked by a commission-accrual failure, mirroring the existing creation-side requirement — the behavior is now implemented and tested, but not yet spec'd in words.

---

## Delivery state

Branch `salesops-sales-agents-commissions`, HEAD `ab7b135`, pushed, up to date with `origin/salesops-sales-agents-commissions`. Working tree clean. Tasks 87/87.

## Verdict

**PASS.** All functional spec requirements, design decisions, and tasks hold against real, freshly-executed evidence across the full matrix (974 tests, all green; build/lint/typecheck clean). The prior CRITICAL and both prior open items are closed and independently re-verified in this session. The 4 new commits since the last verify are all correct, tested, and — for the one behavioral change (`deliver()` no longer propagating accrual failures) — explicitly consistent with design.md's own anticipated risk (Q6), with the remaining half of that mitigation (the reconcile endpoint) correctly left as a known, owner-deferred gap. Ready for `sdd-archive`.
