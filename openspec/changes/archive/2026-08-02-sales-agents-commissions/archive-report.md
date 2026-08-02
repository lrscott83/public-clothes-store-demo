# Archive Report: sales-agents-commissions

**Change**: sales-agents-commissions
**Date**: 2026-08-02
**Mode**: Hybrid (files + engram)
**Status**: ARCHIVED

## Summary

Archived the completed and verified SDD change `sales-agents-commissions` — a capability
delivering sales-agent role, cross-warehouse availability validation, and per-agent
commission accrual tied to order attribution. Change passed verification with a PASS
verdict (0 CRITICAL / 0 WARNING net new; 2 WARNING carried forward as
documentation-format only; 2 SUGGESTION carried forward; 87/87 tasks complete, 974 tests
green across the full monorepo, build/lint/typecheck clean). All SDD artifacts migrated
to this archive folder and the delta specs merged into the main project specs or their
designated parent deltas (backend-users-roles).

The implementation underwent 4 rounds of adversarial dual review (`judgment-day`),
producing commits `a75e084`, `64ddf79`, `cb59146`, resulting in real TDD enhancements
(deliver-side accrual robustness, note validation, test repair) before the final push.

## Scope

**3 sequential verified slices, 1 branch** (`salesops-sales-agents-commissions` from
`main @ f014296`):

### Slice 1 — Identity and Visibility (No schema change)
- `sales_agent = 32` bit in `USER_ROLES` + `BUSINESS_ROLES_MASK` (D8)
- Neutral Spanish label "Gestor de ventas"
- Cross-warehouse "which warehouses can fulfil this basket" query via existing stock port
- `salesops-identity` spec amendment to the backend-users-roles delta

### Slice 2 — Availability as Invariant (No schema change)
- Whole-basket single-warehouse availability check (D3+D4)
- Pure `domain/src/sales/availability.ts` (MVP rule ported + whole-basket products+quantities assertion)
- Enforced on `POST /orders` and `PATCH` warehouse changes
- 14 order.service.spec.ts stock stubs + 16 order.e2e-spec.ts fixture repairs

### Slice 3 — Commission Ledger (Carries all migration risk; split into 3a, 3c, 3b for rollback safety)
- **3a**: Attribution stamped from authenticated actor (never client input, D1)
  - `SanitizedUser.companyUserId` (A7)
  - `Order.attributedCompanyUserId` + FK + index (A8)
  - Migration A: `add_order_sales_attribution` (alter busiest table, NO BACKFILL)
  - Verify script: `verify-order-attribution.ts` (orphans=0, post-cutover nulls=0)

- **3c** (D10 amendment): Customer+Identity creation capability for sales_agent
  - `POST /customers/with-identity` — new route, isolated from existing `POST /customers`
  - Module-private `CUSTOMER_IDENTITY_ROLE = USER_ROLES.user` constant (A15)
  - `createdByCompanyUserId` audit self-FK (A17)
  - Migration C: `add_company_user_created_by` (nullable, NO BACKFILL, lossless rollback)
  - Tests R20-R25: R21 (privilege-escalation guard) written first, confirmed to FAIL before implementation
  - `salesops-identity` and `salesops-customers` spec amendments to backend-users-roles delta

- **3b**: Commission module (migration B is irreversible once settlement occurs)
  - Domain entities: `CommissionAccrual`, `CommissionPayment`, `ICommissionAccrualRecorder` port
  - Pure `computeAccrual(input, references, at)` mirroring `createOrder(input, rates, at)` pattern
  - Migration B: `add_commission_module` (5 new tables, irreversible after payment)
  - Accrual trigger on `OrderService.deliver()` via port call (A9)
  - Reference seed: name-matched with longest-substring precedence, D6 exclusions, owner sign-off
  - Endpoints: `GET /commissions/accruals`, `POST /commissions/payments`, `GET /commissions/report`
  - Per-agent reporting includes owner (D8)

## Verification Result

- **Verdict**: PASS (Strict TDD, fresh re-run 2026-08-02)
- **Completeness**: 87/87 tasks done
- **Tests**: 974/974 passing (@store-mgmt/domain 272, @store-mgmt/api-common 34,
  @store-mgmt/infra-db 215 incl. new migration FK test + globalSetup, api-idp 54 unit + 11 e2e,
  api-salesops 315 unit + 73 e2e)
- **Build/Lint/Typecheck**: All clean; typecheck fixed 2 pre-existing `TS2353` errors via `cb59146`
- **Spec compliance**: all NEW requirements (19 across salesops-commissions + salesops-ventas delta)
  verified against real, runtime-executed evidence across the full matrix

## Spec Merge Details

**New spec created**: `openspec/specs/salesops-commissions/spec.md`
- Full 9-requirement capability spec (Commission Reference Resolution, Order Creation Never
  Blocked, Accrual Sums Resolved Lines Only, Cancelled Never Accrue, Attribution, Independent
  Settlement, Combo Brackets Not Implemented, Trigger Independent of Payment, Per-Agent Reporting)
- 22 scenarios

**Main spec updated**: `openspec/specs/salesops-ventas/spec.md`
- Appended 8 ADDED requirements (28 scenarios): Whole-Basket Availability, Snapshot from Catalog,
  Real Active Warehouse, Warehouse Re-Validation, Fast-Fail Read, Cross-Warehouse Query,
  Attribution to Authenticated Actor, Sales Agent Scoping

**Delta specs (not promoted; remain as amendments to backend-users-roles delta)**:
- `salesops-identity`: amendment to `backend-users-roles/specs/salesops-identity/spec.md`
  - D10 reversal: sales_agent MAY create customers (with new 3-constraint surface: user bit only,
    company-scoped, attributable)
- `salesops-customers`: new delta amending `backend-users-roles/specs/salesops-customers/spec.md`
  - D10 fulfillment: 4 ADDED requirements (sales_agent customer-creation path, role guard,
    company-scoping, attribution, rejected-alternative)

## Archive Folder Contents

Location: `openspec/changes/archive/2026-08-02-sales-agents-commissions/`

- `proposal.md` (Engram #1604, describes 3 gaps, scope, risks, success criteria)
- `specs/` subdirectory with 4 delta specs:
  - `salesops-commissions/spec.md` (NEW capability, 9 requirements)
  - `salesops-ventas/spec.md` (delta, 8 ADDED requirements)
  - `salesops-identity/spec.md` (amendment to backend-users-roles delta)
  - `salesops-customers/spec.md` (amendment to backend-users-roles delta)
- `design.md` (Engram #1606, rev 2 amended for D10; 25 design decisions A1-A17, domain shapes,
  migrations, endpoints, 4 rounds of adversarial verification)
- `tasks.md` (Engram #1608; 87 total tasks, 7 phases, review workload forecast)
- `verify-report.md` (Engram #1727; verification matrix, TDD compliance, behavioral coherence)
- `archive-report.md` (this file)
- Supporting files:
  - `explore.md` (exploration phase, superseded by research + locked decisions)
  - `research.md` (owner decision inputs D1-D10)
  - `commission-seed-report.md` (seed resolution order, coverage tracking)

## Engram Traceability

All SDD artifacts live in both engram and openspec/ (hybrid mode). The authoritative
reference copies are:

- Proposal: Engram #1604, file twin `openspec/changes/sales-agents-commissions/proposal.md`
- Spec: Engram #1605, file twins `openspec/changes/sales-agents-commissions/specs/{domain}/spec.md`
- Design: Engram #1606, file twin `openspec/changes/sales-agents-commissions/design.md`
- Tasks: Engram #1608, file twin `openspec/changes/sales-agents-commissions/tasks.md`
- Verify-Report: Engram #1727, file twin `openspec/changes/sales-agents-commissions/verify-report.md`
- Archive-Report: Engram #1759 (this archive report), file twin this file

## Known Deferred Items (Intentionally Left as Open Work)

The following items were explicitly flagged by the owner as OUT OF SCOPE for this change
and MUST survive the archive as known follow-up work:

### 1. No Company-Level Isolation in `api-salesops`

**Status**: App-wide, predates this branch. Not a this-change defect.

`companyId` appears in exactly one non-spec place in the whole app:
`customer/customer-identity.service.ts` and `customer/customer-identity.controller.ts`.

**Risk**: `CommissionController.scopeFor()` returns `undefined` for owner/admin/sales_operator,
and `PrismaCommissionAccrualRepository.list()` runs with no company `where` clause. A
supervisor of one company can read and settle another company's accruals via `recordPayment`.
This is the FIRST module where commission moves money and the isolation gap surfaces as a real
risk, but isolation itself is an app-wide concern, not a this-change scope.

**Recommendation**: Sequence as a dedicated `api-salesops-company-isolation` change across all
endpoints after this change closes.

### 2. Commission Reconcile Endpoint (`POST /commissions/accruals`) Not Built

**Status**: Half of Q6's mitigation shipped; half deferred per design.md risk analysis.

The `deliver()` fix (`a75e084`) now wraps accrual recording in try/catch and logs
`COMMISSION_ACCRUAL_FAILED` with order id + agent (the log-line half of Q6). The system
correctly documents that a recorder failure means reconciliation must be manual, directly
against the DB.

**What was NOT built**: the in-app replay endpoint `POST /commissions/accruals` for
operator-facing reconciliation (the endpoint half). The accrual recorder IS idempotent
(`findByOrderId` first), so the endpoint is purely an operator convenience, not a data-
recovery mechanism. After a failure, the log line tells an operator "accrual failed for
order X attributed to agent Y"; the fix is a DB hand-reconciliation or a future replay
endpoint.

**Recommendation**: Sequence as a dedicated `commissions-reconcile-endpoint` change once
production observes whether accrual failures are frequent enough to warrant the operator UX.

## Adversarial Review Summary

This change underwent 4 rounds of `judgment-day` (dual adversarial review) before final push:

- **Round 1** (`a75e084`): `OrderService.deliver()` — identified silent data divergence risk when
  accrual recording fails. Added try/catch, explicit log line, test coverage. Verdict: real
  robustness improvement.

- **Round 2** (`64ddf79`): `CommissionController.recordPayment()` — identified unvalidated `note`
  field could raise 500 on bad input. Added hand-rolled boundary check (per app's
  existing DTO guard convention, no global ValidationPipe yet per §0.13). Verdict: closes
  a real security/robustness gap.

- **Round 3** (`cb59146`): Test repair — identified 2 stale DTO literals failing `tsc --noEmit`
  and rewrote `RateNotFoundError` test for structural specificity. Verdict: typecheck now
  fully clean (fixes 2 pre-existing errors).

- **Round 4** (`ab7b135`): Documentation only — tasks ticked 6.3 (push, no PR).

All 4 commits are covered by real tests, correct, and ready for production.

## SDD Cycle Status

**SALES-AGENTS-COMMISSIONS CLOSED.** The change is fully architected, implemented, tested,
verified, and archived. All 87 tasks complete. Branch `salesops-sales-agents-commissions`
HEAD `39864b3` (amended to `ab7b135` during post-verify review, per git log), pushed, no
pull request (owner-locked delivery model).

**Next recommended**: Either of the two deferred items above, or a new capability advancing
the sales/commission domain:
- `sdd-new api-salesops-company-isolation` (risk-driven)
- `sdd-new commissions-reconcile-endpoint` (feature-driven)
